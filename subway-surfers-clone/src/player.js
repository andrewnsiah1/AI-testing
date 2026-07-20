import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LANE_WIDTH = 3;
// From the camera's POV (behind player looking at +Z):
// Screen-left = +X, Screen-right = -X
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH]; // left, center, right (from camera's perspective)
const JUMP_FORCE = 0.25;
const GRAVITY = 0.012;
const SLIDE_DURATION_FALLBACK = 600; // only used if no animation clip loaded
const SLIDE_COOLDOWN = 200; // ms after slide ends before you can slide again

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.currentLane = 1;
    this.targetX = 0;
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideCooldownUntil = 0;

    // Animation
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    this.clock = new THREE.Clock();

    // Model container — player is at origin, world moves toward them
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);

    this.modelLoaded = false;
    this.createPlaceholder();
    this.loadModels();

    this.collider = new THREE.Box3();
  }

  async loadModels() {
    const loader = new GLTFLoader();

    try {
      console.log('Loading Idle.glb...');
      const idleGltf = await loader.loadAsync('/models/Idle.glb');
      const model = idleGltf.scene;

      // Auto-scale to ~2.4 units tall
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 2.4;
      const scale = targetHeight / size.y;
      model.scale.set(scale, scale, scale);

      // Feet on ground
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y = -scaledBox.min.y;

      // Character faces +Z (forward, same direction as camera looks)
      model.rotation.y = 0;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.clearMesh();
      this.mesh.add(model);
      this.modelLoaded = true;

      // Animation mixer
      this.mixer = new THREE.AnimationMixer(model);

      if (idleGltf.animations.length > 0) {
        const idleAction = this.mixer.clipAction(idleGltf.animations[0]);
        this.animations.idle = idleAction;
        this.animations.run = idleAction; // fallback until Running.glb loads
        idleAction.play();
        this.currentAction = idleAction;
      }

      console.log('Character model loaded');

      // Load jump animation
      try {
        const jumpGltf = await loader.loadAsync('/models/Jumping.glb');
        if (jumpGltf.animations.length > 0) {
          const jumpAction = this.mixer.clipAction(jumpGltf.animations[0]);
          jumpAction.setLoop(THREE.LoopOnce);
          jumpAction.clampWhenFinished = true;
          this.animations.jump = jumpAction;
          console.log('Jump animation loaded');
        }
      } catch (e) {
        console.log('Jump animation not found');
      }

      // Load running animation
      try {
        const runGltf = await loader.loadAsync('/models/Running.glb');
        if (runGltf.animations.length > 0) {
          const runAction = this.mixer.clipAction(runGltf.animations[0]);
          this.animations.run = runAction;
          // Switch to run immediately
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          runAction.reset().fadeIn(0.2).play();
          this.currentAction = runAction;
          console.log('Run animation loaded');
        }
      } catch (e) {
        console.log('No Running.glb found');
      }

      // Load slide animation
      try {
        const slideGltf = await loader.loadAsync('/models/Running%20Slide.glb');
        if (slideGltf.animations.length > 0) {
          const clip = slideGltf.animations[0];
          // Strip root motion (position/quaternion tracks on the root bone)
          // so the slide animation doesn't push the character forward in
          // world space, which would cause a teleport-back when it ends.
          clip.tracks = clip.tracks.filter((track) => {
            const isRoot = track.name.endsWith('.position') && !track.name.includes('/');
            return !isRoot;
          });
          const slideAction = this.mixer.clipAction(clip);
          slideAction.setLoop(THREE.LoopOnce);
          slideAction.clampWhenFinished = true;
          this.animations.slide = slideAction;
          console.log('Slide animation loaded');
        }
      } catch (e) {
        console.log('No slide animation found');
      }

      // Load electrocution animation (played on wrong lane-quiz answer)
      try {
        const shockGltf = await loader.loadAsync('/models/Being%20Electrocuted.glb');
        if (shockGltf.animations.length > 0) {
          const shockAction = this.mixer.clipAction(shockGltf.animations[0]);
          shockAction.setLoop(THREE.LoopOnce);
          shockAction.clampWhenFinished = true;
          this.animations.shock = shockAction;
          console.log('Electrocution animation loaded');
        }
      } catch (e) {
        console.log('No electrocution animation found');
      }

      // Load stumble animation (played on hitting a jump/slide obstacle)
      try {
        const stumbleGltf = await loader.loadAsync('/models/Jogging%20Stumble.glb');
        if (stumbleGltf.animations.length > 0) {
          const stumbleAction = this.mixer.clipAction(stumbleGltf.animations[0]);
          stumbleAction.setLoop(THREE.LoopOnce);
          stumbleAction.clampWhenFinished = true;
          this.animations.stumble = stumbleAction;
          console.log('Stumble animation loaded');
        }
      } catch (e) {
        console.log('No stumble animation found');
      }

      // Load fall-back death animation (played on a second stumble - the
      // strike that actually ends the run from a jump/slide obstacle)
      try {
        const deathGltf = await loader.loadAsync('/models/Falling%20Back%20Death.glb');
        if (deathGltf.animations.length > 0) {
          const deathAction = this.mixer.clipAction(deathGltf.animations[0]);
          deathAction.setLoop(THREE.LoopOnce);
          deathAction.clampWhenFinished = true;
          this.animations.fallBackDeath = deathAction;
          console.log('Fall-back death animation loaded');
        }
      } catch (e) {
        console.log('No fall-back death animation found');
      }

    } catch (e) {
      console.warn('Could not load character:', e.message);
    }
  }

  playAnimation(name) {
    let action = this.animations[name];
    if (!action) {
      if (name === 'slide') action = this.animations.run || this.animations.idle;
      if (name === 'run') action = this.animations.idle;
    }
    if (!action || action === this.currentAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }
    action.reset().fadeIn(0.2).play();
    this.currentAction = action;
  }

  clearMesh() {
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
  }

  createPlaceholder() {
    const bodyGeo = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4ecdc4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5;
    body.castShadow = true;
    this.mesh.add(body);

    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd5c8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.5;
    head.castShadow = true;
    this.mesh.add(head);

    const hatGeo = new THREE.CylinderGeometry(0.15, 0.4, 0.3, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.85;
    hat.castShadow = true;
    this.mesh.add(hat);
  }

  moveLeft() {
    if (this.currentLane > 0) {
      this.currentLane--;
      this.targetX = LANES[this.currentLane];
    }
  }

  moveRight() {
    if (this.currentLane < 2) {
      this.currentLane++;
      this.targetX = LANES[this.currentLane];
    }
  }

  jump() {
    if (!this.isJumping && !this.isStumbling) {
      this.isJumping = true;
      this.velocityY = JUMP_FORCE;
      this.playAnimation('jump');

      if (this.isSliding) {
        this.isSliding = false;
        if (!this.modelLoaded) this.mesh.scale.y = 1;
      }
    }
  }

  slide() {
    const now = Date.now();
    if (!this.isJumping && !this.isSliding && now >= this.slideCooldownUntil) {
      this.isSliding = true;
      // Cap slide duration at 800ms — long enough to feel responsive and
      // clear overheads, short enough to not overstay. The animation clip
      // may be longer but we cut it short.
      this.slideDuration = 800;
      this.slideTimer = now;
      if (!this.isStumbling) this.playAnimation('slide');
      if (!this.modelLoaded) this.mesh.scale.y = 0.4;
    }
  }

  // Plays the electrocution animation for a wrong lane-quiz answer.
  // Resolves once the clip finishes (or after a fallback delay if no clip loaded).
  playShock() {
    return new Promise((resolve) => {
      this.isShocked = true;
      this.playAnimation('shock');

      const action = this.animations.shock;
      const durationMs = action ? action.getClip().duration * 1000 : 1200;

      setTimeout(() => {
        this.isShocked = false;
        this.playAnimation('run');
        resolve();
      }, durationMs);
    });
  }

  // Plays the stumble animation for grazing a jump/slide obstacle (the
  // player's first "strike" instead of an instant game over). Resolves once
  // the clip finishes (or after a fallback delay if no clip loaded).
  playStumble() {
    return new Promise((resolve) => {
      this.isStumbling = true;
      this.playAnimation('stumble');

      const action = this.animations.stumble;
      const durationMs = action ? action.getClip().duration * 1000 : 1000;

      setTimeout(() => {
        this.isStumbling = false;
        this.playAnimation('run');
        resolve();
      }, durationMs);
    });
  }

  // Plays the fall-back death animation for a SECOND jump/slide obstacle
  // graze — the strike that actually ends the run (as opposed to the first
  // stumble, which just clips and continues). Does not resolve back to
  // 'run' since the run is over; caller shows the game-over screen once
  // this resolves.
  playFallBackDeath() {
    return new Promise((resolve) => {
      this.isStumbling = true;
      this.playAnimation('fallBackDeath');

      const action = this.animations.fallBackDeath;
      const durationMs = action ? action.getClip().duration * 1000 : 1400;

      setTimeout(resolve, durationMs);
    });
  }

  reset() {
    this.currentLane = 1;
    this.targetX = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.isShocked = false;
    this.isStumbling = false;
    this.slideCooldownUntil = 0;
    this.playAnimation('run');
  }

  update() {
    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);

    // Smooth lane switching
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * 0.15;

    // Jump
    if (this.isJumping) {
      this.mesh.position.y += this.velocityY;
      this.velocityY -= GRAVITY;
      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.isJumping = false;
        this.velocityY = 0;
        this.playAnimation('run');
      }
    }

    // Slide
    if (this.isSliding) {
      if (Date.now() - this.slideTimer > (this.slideDuration || SLIDE_DURATION_FALLBACK)) {
        this.isSliding = false;
        this.slideCooldownUntil = Date.now() + SLIDE_COOLDOWN;
        if (!this.modelLoaded) this.mesh.scale.y = 1;
        this.playAnimation('run');
      }
    }

    // Placeholder bob
    if (!this.modelLoaded && !this.isJumping && !this.isSliding) {
      this.mesh.position.y = Math.sin(Date.now() * 0.01) * 0.05;
    }
  }

  getCollider() {
    const height = this.isSliding ? 0.7 : 2.4;
    const yCenter = this.mesh.position.y + (this.isSliding ? 0.35 : 1.2);

    this.collider.setFromCenterAndSize(
      new THREE.Vector3(this.mesh.position.x, yCenter, this.mesh.position.z),
      new THREE.Vector3(0.8, height, 0.8)
    );
    return this.collider;
  }
}

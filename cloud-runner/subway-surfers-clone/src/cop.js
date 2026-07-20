import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;

const LANE_WIDTH = 3;
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH]; // matches player.js lane positions
const CHASE_Z = -2.2; // behind the player, between the camera and the runner
const ENTRY_Z = -8; // starts behind the camera, out of view (closer so it shows up quicker)
const RUN_UP_SPEED = 0.04; // slower approach — cop jogs in rather than sprinting
const FADE_OUT_DURATION_MS = 500;

// A chasing NPC that appears the moment the player takes their first strike
// (a stumble or a wrong quiz answer) — the classic "guard chase" endless
// runner mechanic. While active, it mirrors the player's lane and jump/slide
// moves in lockstep, visually reinforcing that one more mistake ends the run.
// It only fades away once the player answers two lane quizzes correctly in
// a row, which also restores their strikes back to zero.
export class Cop {
  constructor(scene) {
    this.scene = scene;

    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, CHASE_Z);
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    this.clock = new THREE.Clock();
    this.modelLoaded = false;
    this.lastMirroredState = null; // 'run' | 'jump' | 'slide'

    // active = should be chasing (visible or mid entry/exit);
    // state tracks the transition phase.
    this.active = false;
    this.state = 'hidden'; // 'hidden' | 'entering' | 'chasing' | 'fadingOut'
    this.fadeStart = 0;

    this.createPlaceholder();
    this.loadModels();
  }

  createPlaceholder() {
    const bodyGeo = new THREE.CapsuleGeometry(0.42, 1, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e6b });
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

    const hatGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x0d1b3d });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.8;
    hat.castShadow = true;
    this.mesh.add(hat);
  }

  clearMesh() {
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
  }

  async loadModels() {
    const loader = new GLTFLoader();

    try {
      console.log('Loading Cop Run.glb...');
      const runGltf = await loader.loadAsync(`${BASE}models/cop/Cop%20Run.glb`);
      const model = runGltf.scene;

      // Auto-scale to ~2.4 units tall, same as the player
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 2.4;
      const scale = targetHeight / size.y;
      model.scale.set(scale, scale, scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y = -scaledBox.min.y;
      model.rotation.y = 0; // faces +Z, same forward direction as the player

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.clearMesh();
      this.mesh.add(model);
      this.modelLoaded = true;

      this.mixer = new THREE.AnimationMixer(model);

      if (runGltf.animations.length > 0) {
        const runAction = this.mixer.clipAction(runGltf.animations[0]);
        this.animations.run = runAction;
        runAction.play();
        this.currentAction = runAction;
        this.lastMirroredState = 'run';
      }

      console.log('Cop model loaded');

      // Load jump animation (mirrors the player jumping)
      try {
        const jumpGltf = await loader.loadAsync(`${BASE}models/cop/Cop%20Jump.glb`);
        if (jumpGltf.animations.length > 0) {
          const jumpAction = this.mixer.clipAction(jumpGltf.animations[0]);
          jumpAction.setLoop(THREE.LoopOnce);
          jumpAction.clampWhenFinished = true;
          this.animations.jump = jumpAction;
          console.log('Cop jump animation loaded');
        }
      } catch (e) {
        console.log('No cop jump animation found');
      }

      // Load slide/roll animation (mirrors the player sliding)
      try {
        const tackleGltf = await loader.loadAsync(`${BASE}models/cop/Cop%20Tackle.glb`);
        if (tackleGltf.animations.length > 0) {
          const slideAction = this.mixer.clipAction(tackleGltf.animations[0]);
          slideAction.setLoop(THREE.LoopOnce);
          slideAction.clampWhenFinished = true;
          this.animations.slide = slideAction;
          console.log('Cop slide animation loaded');
        }
      } catch (e) {
        console.log('No cop slide animation found');
      }

      // Load idle animation (played when the player dies — cop stops and stands)
      try {
        const idleGltf = await loader.loadAsync(`${BASE}models/cop/Cop%20Idle.glb`);
        if (idleGltf.animations.length > 0) {
          const idleAction = this.mixer.clipAction(idleGltf.animations[0]);
          this.animations.idle = idleAction;
          console.log('Cop idle animation loaded');
        }
      } catch (e) {
        console.log('No cop idle animation found');
      }
    } catch (e) {
      console.warn('Could not load cop model, using placeholder:', e.message);
    }
  }

  playAnimation(name) {
    let action = this.animations[name];
    if (!action) action = this.animations.run;
    if (!action || action === this.currentAction) return;

    if (this.currentAction) this.currentAction.fadeOut(0.15);
    action.reset().fadeIn(0.15).play();
    this.currentAction = action;
  }

  // Makes the cop run up from behind the camera to the chase position.
  // No-op if already active.
  activate() {
    if (this.active) return;
    this.active = true;
    this.mesh.visible = true;
    this.mesh.position.z = ENTRY_Z;
    this.setOpacity(1);
    this.state = 'entering';
  }

  // Starts the fade-out retreat. `active` flips off once the fade finishes.
  deactivate() {
    if (!this.active || this.state === 'fadingOut') return;
    this.state = 'fadingOut';
    this.fadeStart = performance.now();
  }

  // Switches the cop to idle (standing still) — called when the player
  // dies so the cop stops running and just stands over them. If the cop is
  // mid-air (mirroring a player jump), it waits until y reaches ground
  // before switching to idle so it doesn't freeze in the air.
  goIdle() {
    if (!this.active) return;
    this.state = 'landingToIdle';
  }

  setOpacity(opacity) {
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          mat.transparent = true;
          mat.opacity = opacity;
        }
      }
    });
  }

  // Mirrors the player's lane, jump, and slide state every frame — same
  // lane-switch smoothing as the player, and the same vertical position so
  // a jump/slide reads as perfectly in sync, just like a classic chase NPC.
  update(player) {
    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);

    if (!this.active) return;

    // Run up from behind during entry
    if (this.state === 'entering') {
      this.mesh.position.z += RUN_UP_SPEED;
      if (this.mesh.position.z >= CHASE_Z) {
        this.mesh.position.z = CHASE_Z;
        this.state = 'chasing';
      }
    }

    // Fade out when dismissed
    if (this.state === 'fadingOut') {
      const elapsed = performance.now() - this.fadeStart;
      const t = Math.min(elapsed / FADE_OUT_DURATION_MS, 1);
      this.setOpacity(1 - t);
      // Also retreat backward while fading
      this.mesh.position.z = CHASE_Z - t * (CHASE_Z - ENTRY_Z);
      if (t >= 1) {
        this.state = 'hidden';
        this.mesh.visible = false;
        this.active = false;
      }
    }

    // Mirror player's lane and vertical position
    // (skip mirroring when idle — cop just stands still over the player)
    if (this.state === 'idle') return;

    // Landing before idle: let gravity bring the cop down, then switch
    if (this.state === 'landingToIdle') {
      if (this.mesh.position.y > 0.01) {
        this.mesh.position.y = Math.max(0, this.mesh.position.y - 0.15);
      } else {
        this.mesh.position.y = 0;
        this.state = 'idle';
        if (this.currentAction) this.currentAction.stop();
        const idleAction = this.animations.idle || this.animations.run;
        if (idleAction) {
          idleAction.reset().play();
          this.currentAction = idleAction;
        }
      }
      return;
    }

    const targetX = LANES[player.currentLane];
    this.mesh.position.x += (targetX - this.mesh.position.x) * 0.15;
    this.mesh.position.y = player.mesh.position.y;

    let animState = 'run';
    if (player.isJumping) animState = 'jump';
    else if (player.isSliding) animState = 'slide';

    if (animState !== this.lastMirroredState) {
      this.playAnimation(animState);
      this.lastMirroredState = animState;
      if (!this.modelLoaded) {
        this.mesh.scale.y = animState === 'slide' ? 0.4 : 1;
      }
    }
  }

  reset() {
    this.active = false;
    this.state = 'hidden';
    this.mesh.visible = false;
    this.mesh.position.set(0, 0, ENTRY_Z);
    this.mesh.scale.set(1, 1, 1);
    this.lastMirroredState = 'run';
    this.playAnimation('run');
  }
}

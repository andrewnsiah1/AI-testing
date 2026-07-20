import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LANE_WIDTH = 3;
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH];
const SPAWN_DISTANCE = 80;
const DESPAWN_DISTANCE = -15;

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.lastSpawnScore = 0;
    this.spawnInterval = 30;
    this.lastOverheadZ = null; // track the z of the last overhead (slide) obstacle spawned

    this.models = { trains: [], barrier: null };
    this.loadModels();
  }

  async loadModels() {
    const loader = new GLTFLoader();

    const trainFiles = [
      'train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c',
      'train-diesel-a', 'train-diesel-b', 'train-locomotive-a',
    ];

    for (const name of trainFiles) {
      try {
        const gltf = await loader.loadAsync(`/models/trains/${name}.glb`);
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        this.models.trains.push(model);
      } catch (e) { /* skip missing */ }
    }

    if (this.models.trains.length > 0) {
      console.log(`Loaded ${this.models.trains.length} train models`);
    }

    try {
      const gltf = await loader.loadAsync('/models/barrier.glb');
      this.models.barrier = gltf.scene;
      this.models.barrier.traverse((child) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      console.log('Barrier model loaded');
    } catch (e) { /* use placeholder */ }
  }

  createBarrier(lane, z) {
    let mesh;
    if (this.models.barrier) {
      mesh = this.models.barrier.clone();
      mesh.position.set(LANES[lane], 0, z);
    } else {
      const geo = new THREE.BoxGeometry(2.5, 1.2, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(LANES[lane], 0.6, z);
      mesh.castShadow = true;
    }
    this.scene.add(mesh);
    return { mesh, type: 'barrier' };
  }

  createTallObstacle(lane, z) {
    const group = new THREE.Group();

    for (const x of [-1, 1]) {
      const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x * 1.2, 1.5, 0);
      post.castShadow = true;
      group.add(post);
    }

    const barGeo = new THREE.BoxGeometry(2.8, 0.3, 0.3);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 1.5;
    bar.castShadow = true;
    group.add(bar);

    group.position.set(LANES[lane], 0, z);
    this.scene.add(group);
    return { mesh: group, type: 'overhead' };
  }

  createTrain(lane, z) {
    let mesh;

    if (this.models.trains.length > 0) {
      const modelIndex = Math.floor(Math.random() * this.models.trains.length);
      mesh = this.models.trains[modelIndex].clone();

      // These models are already built lengthwise along Z (direction of travel)
      // with width along X — no rotation needed. Scale to fit within the lane.
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const targetWidth = 2.4; // fits within a single lane
      const scale = targetWidth / size.x;
      mesh.scale.set(scale, scale, scale);

      // Recompute box after scaling to place feet on ground
      const scaledBox = new THREE.Box3().setFromObject(mesh);
      mesh.position.set(LANES[lane], -scaledBox.min.y, z);
    } else {
      const length = 8 + Math.random() * 6;
      const geo = new THREE.BoxGeometry(2.2, 3, length);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2d3436 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(LANES[lane], 1.5, z + length / 2);
      mesh.castShadow = true;

      const stripeGeo = new THREE.BoxGeometry(2.25, 0.5, length);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe17055 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.5;
      mesh.add(stripe);
    }

    this.scene.add(mesh);
    return { mesh, type: 'train' };
  }

  spawn(score) {
    // FAIRNESS RULES:
    // 1. Never block all 3 lanes with impassable obstacles at the same Z
    // 2. If 2 lanes are blocked, one MUST be an overhead (slideable)
    // 3. Obstacles must spawn far enough apart in Z for the player to react
    // 4. Never place a train directly next to another obstacle at same Z (can't switch in time)

    const z = SPAWN_DISTANCE + Math.random() * 10;

    // Check what's already near this Z to avoid stacking
    const MIN_Z_GAP = 15; // minimum distance between obstacle groups
    const nearbyObs = this.obstacles.filter(
      o => Math.abs(o.mesh.position.z - z) < MIN_Z_GAP
    );

    if (nearbyObs.length > 0) {
      // Too close to existing obstacles — skip this spawn
      return;
    }

    // Extra spacing rule: overhead (slide) obstacles need a bigger gap so the
    // player's slide + cooldown window always finishes before the next one arrives
    const MIN_OVERHEAD_GAP = 35;
    const tooCloseToLastOverhead =
      this.lastOverheadZ !== null && Math.abs(z - this.lastOverheadZ) < MIN_OVERHEAD_GAP;

    // Difficulty ramp: as score increases, 2-lane blocks and trains become
    // more common so the road gets progressively harder to navigate.
    const twoLaneChance = Math.min(0.45, 0.15 + score * 0.0004);
    const trainChance = Math.min(0.5, 0.35 + score * 0.0002);

    // Decide how many lanes to block
    const numLanes = Math.random() < twoLaneChance ? 2 : 1;

    if (numLanes === 1) {
      // Single obstacle — any lane, any type
      const lane = Math.floor(Math.random() * 3);
      let type = Math.random();

      // Avoid overhead type if too close to the previous overhead obstacle
      if (type >= (1 - trainChance) && type < (1 - trainChance + 0.15) && tooCloseToLastOverhead) {
        type = 0.1; // force barrier instead
      }

      let obstacle;
      if (type < (1 - trainChance) * 0.7) {
        obstacle = this.createBarrier(lane, z);
      } else if (type < (1 - trainChance)) {
        obstacle = this.createTallObstacle(lane, z);
        this.lastOverheadZ = z;
      } else {
        obstacle = this.createTrain(lane, z);
      }

      this.obstacles.push(obstacle);
    } else {
      // Two lanes blocked — ensure at least one escape route:
      // Option A: One lane is completely free
      // Option B: One of the blocked lanes is an overhead (can slide under)

      const lanes = [0, 1, 2];
      const shuffled = lanes.sort(() => Math.random() - 0.5);
      const lane1 = shuffled[0];
      const lane2 = shuffled[1];
      // shuffled[2] is always free

      // At least one of the two obstacles must be passable (overhead = slide under)
      // Skip overhead option entirely if it would be too close to the last one
      const makeOneOverhead = !tooCloseToLastOverhead && Math.random() < 0.5;

      let obs1, obs2;

      if (makeOneOverhead) {
        // First obstacle is overhead (slideable), second is a barrier or short train
        obs1 = this.createTallObstacle(lane1, z);
        this.lastOverheadZ = z;
        const type2 = Math.random();
        if (type2 < 0.6) {
          obs2 = this.createBarrier(lane2, z);
        } else {
          obs2 = this.createTrain(lane2, z);
        }
      } else {
        // Both are jumpable barriers (no trains — trains are too long to be fair in pairs)
        obs1 = this.createBarrier(lane1, z);
        obs2 = this.createBarrier(lane2, z);
      }

      this.obstacles.push(obs1);
      this.obstacles.push(obs2);
    }
  }

  reset() {
    for (const obs of this.obstacles) {
      this.scene.remove(obs.mesh);
    }
    this.obstacles = [];
    this.lastSpawnScore = 0;
    this.lastOverheadZ = null;
  }



  update(speed, score, allowSpawn = true) {
    if (allowSpawn && score - this.lastSpawnScore > this.spawnInterval) {
      this.spawn(score);
      this.lastSpawnScore = score;
      // Spawn interval shrinks as score rises: starts at 30, floors at 10
      this.spawnInterval = Math.max(10, 30 - score * 0.025);
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.mesh.position.z -= speed;

      if (obs.mesh.position.z < DESPAWN_DISTANCE) {
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }
  }

  // Returns true if no obstacle's actual bounding box overlaps the zone
  // between minZ and maxZ. Uses real bounding boxes (not just mesh.position.z)
  // since long models like trains can have an off-center origin — the
  // position alone can read as "clear" while the model's body still
  // physically extends into that zone.
  isClearAhead(maxZ, minZ = -2) {
    const box = new THREE.Box3();
    return !this.obstacles.some((o) => {
      box.setFromObject(o.mesh);
      return box.max.z > minZ && box.min.z < maxZ;
    });
  }

  // Removes any obstacle whose bounding box overlaps at or behind the given
  // z (default: already at/passed the player). Called right before freezing
  // for a lane quiz so nothing stale is left sitting on top of the player
  // while updates are paused — this only cleans up what's already behind,
  // never anything still ahead.
  removeAtOrBehind(z = 2) {
    const box = new THREE.Box3();
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      box.setFromObject(this.obstacles[i].mesh);
      if (box.min.z < z) {
        this.scene.remove(this.obstacles[i].mesh);
        this.obstacles.splice(i, 1);
      }
    }
  }

  // Returns { box, type, obstacle } for each obstacle — `type` lets callers
  // tell a train (instant game over, matches the "unless it runs into a
  // train" rule) apart from a barrier/overhead obstacle (a jump/slide miss,
  // which only costs a stumble/strike rather than ending the run outright).
  // `obstacle` is the underlying entry in `this.obstacles`, so a caller that
  // triggers a stumble can remove that exact one via `remove()` below.
  getColliders() {
    const colliders = [];

    for (const obs of this.obstacles) {
      const box = new THREE.Box3();
      box.setFromObject(obs.mesh);
      box.min.x += 0.2;
      box.max.x -= 0.2;
      box.min.z += 0.1;
      box.max.z -= 0.1;

      // For overhead obstacles, only collide with the upper portion
      // so the player can slide underneath — generous gap so an early slide
      // still clears it without feeling unfair.
      if (obs.type === 'overhead') {
        box.min.y = 1.3;
      }

      colliders.push({ box, type: obs.type, obstacle: obs });
    }

    return colliders;
  }

  // Removes one specific obstacle (by reference, as returned in
  // getColliders()'s `obstacle` field). Used right after a jump/slide
  // obstacle triggers a stumble, so the same obstacle can't immediately
  // retrigger a collision on the next frame.
  remove(obstacle) {
    const index = this.obstacles.indexOf(obstacle);
    if (index !== -1) {
      this.scene.remove(obstacle.mesh);
      this.obstacles.splice(index, 1);
    }
  }
}

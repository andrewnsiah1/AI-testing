import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Plain currency pickups — no AWS service or lesson content attached.
// (Service-linked collectibles are handled separately by orbs.js, which
// power the in-run quiz/lesson mechanic.)

const LANE_WIDTH = 3;
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH];
const SPAWN_DISTANCE = 60;
const DESPAWN_DISTANCE = -15;
const COIN_HEIGHT_NORMAL = 1.5;
const COIN_HEIGHT_SLIDE = 0.5; // low coins under overhead obstacles
const COIN_SPACING = 2.5; // space between coins in a line
const COIN_COLOR = 0xffd700;

export class CoinManager {
  constructor(scene, obstacleManager) {
    this.scene = scene;
    this.obstacleManager = obstacleManager;
    this.coins = [];
    this.lastSpawnScore = 0;
    this.spawnInterval = 20; // score units between spawns (less frequent = less congested)
    this.lastSpawnLane = -1; // track last lane to avoid repetition

    this.coinModel = null;
    this.coinGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
    this.coinMat = new THREE.MeshStandardMaterial({
      color: COIN_COLOR,
      emissive: COIN_COLOR,
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.3,
    });

    this.loadModel();
  }

  async loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/models/coin.glb');
      this.coinModel = gltf.scene;
      this.coinModel.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      console.log('Coin model loaded');
    } catch (e) { /* use placeholder */ }
  }

  createCoinMesh() {
    let mesh;
    if (this.coinModel) {
      mesh = this.coinModel.clone();
      mesh.traverse((child) => {
        if (child.isMesh) child.material = this.coinMat;
      });
    } else {
      mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = true;
    }
    return mesh;
  }

  // Check if a specific lane+z range has an obstacle
  getObstacleAt(lane, zStart, zEnd) {
    for (const obs of this.obstacleManager.obstacles) {
      const obsLane = this.getLaneIndex(obs.mesh.position.x);
      if (obsLane !== lane) continue;

      const obsZ = obs.mesh.position.z;
      // Check if obstacle overlaps with the coin zone
      if (obsZ > zStart - 5 && obsZ < zEnd + 5) {
        return obs;
      }
    }
    return null;
  }

  getLaneIndex(x) {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < LANES.length; i++) {
      const dist = Math.abs(x - LANES[i]);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  spawn() {
    const pattern = Math.random();

    if (pattern < 0.5) {
      // Single lane line of coins
      this.spawnSingleLine();
    } else if (pattern < 0.75) {
      // Two lanes — player picks one path
      this.spawnTwoLanes();
    } else {
      // Coins under an overhead obstacle (reward for sliding)
      this.spawnSlideReward();
    }
  }

  spawnSingleLine() {
    // Pick a lane that's different from last time if possible
    let lane;
    do {
      lane = Math.floor(Math.random() * 3);
    } while (lane === this.lastSpawnLane && Math.random() > 0.3);
    this.lastSpawnLane = lane;

    const numCoins = 3 + Math.floor(Math.random() * 3); // 3-5 coins
    const startZ = SPAWN_DISTANCE;

    // Check if there's an obstacle in this lane at this position
    const obs = this.getObstacleAt(lane, startZ, startZ + numCoins * COIN_SPACING);
    if (obs && obs.type !== 'overhead') {
      // Obstacle in the way that's not overhead — try a different lane
      const alternatives = [0, 1, 2].filter(l => l !== lane);
      lane = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    for (let i = 0; i < numCoins; i++) {
      const mesh = this.createCoinMesh();
      mesh.position.set(LANES[lane], COIN_HEIGHT_NORMAL, startZ + i * COIN_SPACING);
      this.scene.add(mesh);
      this.coins.push({ mesh, collected: false });
    }
  }

  spawnTwoLanes() {
    // Two lanes get short coin lines — player picks one path
    const lanes = [0, 1, 2];
    const shuffled = lanes.sort(() => Math.random() - 0.5);
    const lane1 = shuffled[0];
    const lane2 = shuffled[1];

    const numCoins = 3;
    const startZ = SPAWN_DISTANCE;

    for (const lane of [lane1, lane2]) {
      // Skip if obstacle blocks this lane
      const obs = this.getObstacleAt(lane, startZ, startZ + numCoins * COIN_SPACING);
      if (obs && obs.type !== 'overhead') continue;

      for (let i = 0; i < numCoins; i++) {
        const mesh = this.createCoinMesh();
        mesh.position.set(LANES[lane], COIN_HEIGHT_NORMAL, startZ + i * COIN_SPACING);
        this.scene.add(mesh);
        this.coins.push({ mesh, collected: false });
      }
    }

    this.lastSpawnLane = lane1;
  }

  spawnSlideReward() {
    // Find an overhead obstacle ahead and place low coins under it
    let foundOverhead = false;

    for (const obs of this.obstacleManager.obstacles) {
      if (obs.type === 'overhead' && obs.mesh.position.z > 30) {
        const lane = this.getLaneIndex(obs.mesh.position.x);
        const obsZ = obs.mesh.position.z;

        // Place coins at slide height under the obstacle
        const numCoins = 3;
        for (let i = 0; i < numCoins; i++) {
          const mesh = this.createCoinMesh();
          mesh.position.set(LANES[lane], COIN_HEIGHT_SLIDE, obsZ - 2 + i * COIN_SPACING);
          this.scene.add(mesh);
          this.coins.push({ mesh, collected: false });
        }

        foundOverhead = true;
        this.lastSpawnLane = lane;
        break;
      }
    }

    // If no overhead obstacle found, just do a normal line
    if (!foundOverhead) {
      this.spawnSingleLine();
    }
  }

  collect(index) {
    const coin = this.coins[index];
    if (coin && !coin.collected) {
      coin.collected = true;
      this.scene.remove(coin.mesh);
    }
  }

  reset() {
    for (const coin of this.coins) {
      this.scene.remove(coin.mesh);
    }
    this.coins = [];
    this.lastSpawnScore = 0;
    this.lastSpawnLane = -1;
  }

  update(speed, score, allowSpawn = true) {
    if (allowSpawn && score - this.lastSpawnScore > this.spawnInterval) {
      this.spawn();
      this.lastSpawnScore = score;
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      if (coin.collected) continue;

      coin.mesh.position.z -= speed;
      coin.mesh.rotation.x += 0.05;

      if (coin.mesh.position.z < DESPAWN_DISTANCE) {
        this.scene.remove(coin.mesh);
        this.coins.splice(i, 1);
      }
    }
  }

  getColliders() {
    const colliders = [];

    for (let i = 0; i < this.coins.length; i++) {
      const coin = this.coins[i];
      if (coin.collected) continue;
      const box = new THREE.Box3().setFromObject(coin.mesh);
      // Extend coin collider down to ground level so sliding through still collects
      box.min.y = 0;
      colliders.push({ box, index: i });
    }

    return colliders;
  }

  // Removes any coin whose bounding box overlaps at or behind the given z.
  // Called right before freezing for a lane quiz so nothing stale lingers
  // near the player while updates are paused.
  removeAtOrBehind(z = 2) {
    const box = new THREE.Box3();
    for (let i = this.coins.length - 1; i >= 0; i--) {
      box.setFromObject(this.coins[i].mesh);
      if (box.min.z < z) {
        this.scene.remove(this.coins[i].mesh);
        this.coins.splice(i, 1);
      }
    }
  }
}

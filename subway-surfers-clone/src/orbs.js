import * as THREE from 'three';
import { CATEGORIES } from './services.js';

// A single service-linked "powerup" orb, spawned ahead of an in-run lane
// quiz. Collecting it unlocks that service's lesson notes for reference
// during the quiz (and for the rest of the run's notebook). Skipping it
// doesn't skip the question — the quiz still asks about that service, the
// player just answers without notes. Only one orb is ever in play at a time.

const LANE_WIDTH = 3;
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH];
const SPAWN_DISTANCE = 70;
const DESPAWN_DISTANCE = -15;
const ORB_HEIGHT = 1.6;

export class OrbManager {
  constructor(scene, obstacleManager) {
    this.scene = scene;
    this.obstacleManager = obstacleManager;
    this.orb = null; // { mesh, service, lane, collected, missed }
    this._age = 0;
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

  // Only treats hard-to-avoid (non-overhead) obstacles as blocking, matching
  // how coins.js reasons about lane availability.
  isLaneClearAt(lane, zStart, zEnd) {
    for (const obs of this.obstacleManager.obstacles) {
      const obsLane = this.getLaneIndex(obs.mesh.position.x);
      if (obsLane !== lane) continue;
      const obsZ = obs.mesh.position.z;
      if (obsZ > zStart - 6 && obsZ < zEnd + 6 && obs.type !== 'overhead') {
        return false;
      }
    }
    return true;
  }

  createOrbMesh(service) {
    const color = CATEGORIES[service.category].color;
    const group = new THREE.Group();

    const coreGeo = new THREE.IcosahedronGeometry(0.45, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      metalness: 0.3,
      roughness: 0.2,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.castShadow = true;
    group.add(core);

    // Two crossed rings so the orb reads as a "powerup" rather than a coin,
    // regardless of viewing angle.
    const ringGeo = new THREE.TorusGeometry(0.75, 0.06, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.85,
    });
    const ringA = new THREE.Mesh(ringGeo, ringMat);
    ringA.rotation.x = Math.PI / 2;
    group.add(ringA);

    const ringB = new THREE.Mesh(ringGeo, ringMat.clone());
    ringB.rotation.y = Math.PI / 2;
    group.add(ringB);

    group.userData.core = core;
    group.userData.rings = [ringA, ringB];
    return group;
  }

  // Spawns a single orb for `service` in a lane that's reasonably clear of
  // hard obstacles. Clears any prior orb first.
  spawn(service) {
    this.clear();

    let lane = Math.floor(Math.random() * 3);
    const startZ = SPAWN_DISTANCE;
    if (!this.isLaneClearAt(lane, startZ - 10, startZ + 10)) {
      const alternatives = [0, 1, 2].filter((l) => l !== lane);
      const clearAlt = alternatives.find((l) => this.isLaneClearAt(l, startZ - 10, startZ + 10));
      if (clearAlt !== undefined) lane = clearAlt;
    }

    const mesh = this.createOrbMesh(service);
    mesh.position.set(LANES[lane], ORB_HEIGHT, startZ);
    this.scene.add(mesh);

    this.orb = { mesh, service, lane, collected: false, missed: false };
    this._age = 0;
  }

  update(speed) {
    if (!this.orb || this.orb.collected || this.orb.missed) return;

    this._age += 1;
    const { mesh } = this.orb;
    mesh.position.z -= speed;
    mesh.rotation.y += 0.03;

    const pulse = 1 + Math.sin(this._age * 0.08) * 0.08;
    mesh.userData.core.scale.setScalar(pulse);
    for (const ring of mesh.userData.rings) {
      ring.rotation.z += 0.02;
    }

    if (mesh.position.z < DESPAWN_DISTANCE) {
      this.orb.missed = true;
      this.scene.remove(mesh);
    }
  }

  // Returns the orb's Box3 collider, or null if there's nothing collectible.
  getCollider() {
    if (!this.orb || this.orb.collected || this.orb.missed) return null;
    const box = new THREE.Box3().setFromObject(this.orb.mesh);
    box.min.y = 0; // extend to ground so sliding through still collects
    return box;
  }

  // Marks the current orb collected and returns its service, or null if
  // there was nothing pending to collect.
  collect() {
    if (!this.orb || this.orb.collected || this.orb.missed) return null;
    this.orb.collected = true;
    this.scene.remove(this.orb.mesh);
    return this.orb.service;
  }

  clear() {
    if (this.orb && !this.orb.collected && !this.orb.missed) {
      this.scene.remove(this.orb.mesh);
    }
    this.orb = null;
  }

  reset() {
    this.clear();
  }
}

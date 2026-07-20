import * as THREE from 'three';

const LANE_WIDTH = 3;
const LANES = [LANE_WIDTH, 0, -LANE_WIDTH]; // left, center, right (matches player.js)
const GATE_SPAWN_Z = 10; // distance ahead when gates are spawned (kept short so the run to answer feels snappy)
const RESOLVE_Z = 1.5; // when a gate's z falls below this, it has reached the player

export class QuizGateManager {
  constructor(scene) {
    this.scene = scene;
    this.gates = []; // { mesh, lane, isCorrect, resolved }
    this.active = false;
  }

  // Spawns one gate per lane, each an arch you run through.
  // correctIndex is 0/1/2 (left/center/right) matching the quiz choices order.
  spawnGates(correctIndex) {
    this.clear();
    this.active = true;

    for (let lane = 0; lane < 3; lane++) {
      const isCorrect = lane === correctIndex;
      const mesh = this.createGateMesh();
      mesh.position.set(LANES[lane], 0, GATE_SPAWN_Z);
      this.scene.add(mesh);
      this.gates.push({ mesh, lane, isCorrect, resolved: false, flashed: false });
    }
  }

  createGateMesh() {
    const group = new THREE.Group();

    // Two posts + a top arch bar, wide enough to run through without colliding
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x4ecdc4,
      emissive: 0x4ecdc4,
      emissiveIntensity: 0.5,
    });

    for (const x of [-1.3, 1.3]) {
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.75, 0);
      group.add(post);
    }

    const barGeo = new THREE.BoxGeometry(2.9, 0.25, 0.25);
    const bar = new THREE.Mesh(barGeo, postMat.clone());
    bar.position.y = 3.4;
    group.add(bar);

    // Ground marker so the lane is visibly highlighted
    const markerGeo = new THREE.PlaneGeometry(2.6, 3);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0x4ecdc4,
      transparent: true,
      opacity: 0.25,
      emissive: 0x4ecdc4,
      emissiveIntensity: 0.3,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.2;
    group.add(marker);

    // Store references so we can flash colors later
    group.userData.postMat = postMat;
    group.userData.markerMat = markerMat;

    return group;
  }

  flashGreen(gate) {
    const group = gate.mesh;
    const postMat = group.userData.postMat;
    const markerMat = group.userData.markerMat;
    postMat.color.set(0x2ecc71);
    postMat.emissive.set(0x2ecc71);
    postMat.emissiveIntensity = 1;
    markerMat.color.set(0x2ecc71);
    markerMat.emissive.set(0x2ecc71);
    markerMat.opacity = 0.5;
  }

  flashRed(gate) {
    const group = gate.mesh;
    const postMat = group.userData.postMat;
    const markerMat = group.userData.markerMat;
    postMat.color.set(0xff6b6b);
    postMat.emissive.set(0xff6b6b);
    postMat.emissiveIntensity = 1;
    markerMat.color.set(0xff6b6b);
    markerMat.emissive.set(0xff6b6b);
    markerMat.opacity = 0.5;
  }

  clear() {
    for (const gate of this.gates) {
      this.scene.remove(gate.mesh);
    }
    this.gates = [];
    this.active = false;
  }

  // Advances gates toward the player. Returns a list of resolution events
  // that just occurred this frame: { lane, isCorrect }
  update(speed, playerLane) {
    if (!this.active) return [];

    const events = [];

    for (const gate of this.gates) {
      gate.mesh.position.z -= speed;

      if (!gate.resolved && gate.mesh.position.z <= RESOLVE_Z) {
        gate.resolved = true;

        // Always reveal the correct gate in green
        if (gate.isCorrect) {
          this.flashGreen(gate);
        } else if (gate.lane === playerLane) {
          // Player ran into a wrong-answer gate
          this.flashRed(gate);
        }

        // Only fire a player-facing event for the gate in the player's lane
        if (gate.lane === playerLane) {
          events.push({ lane: gate.lane, isCorrect: gate.isCorrect });
        }
      }
    }

    // Once all gates have resolved, clean them up shortly after
    if (this.gates.length > 0 && this.gates.every((g) => g.resolved)) {
      // Let them sit briefly (flashed) then remove
      if (!this._cleanupScheduled) {
        this._cleanupScheduled = true;
        setTimeout(() => {
          this.clear();
          this._cleanupScheduled = false;
        }, 500);
      }
    }

    return events;
  }
}

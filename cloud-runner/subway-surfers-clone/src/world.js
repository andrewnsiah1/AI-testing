import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const LANE_WIDTH = 3;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.buildingModels = [];
    this.lineGroups = [];
    this.placeholders = [];
    this.colorVariations = [];

    this.createGround();
    this.createLaneMarkings();
    this.createPlaceholderBuildings();
    this.loadColorVariations();
    this.loadBuildingModels();
  }

  loadColorVariations() {
    const texLoader = new THREE.TextureLoader();
    const files = ['variation-a.png', 'variation-b.png', 'variation-c.png'];
    for (const file of files) {
      const tex = texLoader.load(`${BASE}models/Textures/${file}`);
      tex.flipY = false; // glTF textures are not flipped
      tex.colorSpace = THREE.SRGBColorSpace;
      this.colorVariations.push(tex);
    }
  }

  createGround() {
    // Wide ground plane that extends under the buildings on both sides
    const groundGeo = new THREE.PlaneGeometry(60, 500);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x888899 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.14, 200);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road surface on top (raised above the ground plane)
    const roadGeo = new THREE.PlaneGeometry(10, 500);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333344 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.15, 200);
    road.receiveShadow = true;
    this.scene.add(road);

    // Sidewalks
    for (const side of [-1, 1]) {
      const sidewalkGeo = new THREE.BoxGeometry(3, 0.3, 500);
      const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x888899 });
      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sidewalk.position.set(side * 6.5, 0.14, 200);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    }
  }

  createLaneMarkings() {
    // Create dashed lane markings that will scroll
    const NUM_LINES = 30;
    const SPACING = 8;

    for (let lane = -1; lane <= 1; lane += 2) {
      const x = lane * (LANE_WIDTH / 2);
      for (let i = 0; i < NUM_LINES; i++) {
        const lineGeo = new THREE.PlaneGeometry(0.15, 3);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(x, 0.16, i * SPACING);
        this.scene.add(line);
        this.lineGroups.push(line);
      }
    }
  }

  async loadBuildingModels() {
    const loader = new GLTFLoader();
    const buildingFiles = [
      'building-a', 'building-b', 'building-c', 'building-d', 'building-e',
      'building-f', 'building-g', 'building-h', 'building-i', 'building-j',
      'building-k', 'building-l', 'building-m', 'building-n', 'building-o',
      'building-p', 'building-q', 'building-r', 'building-s', 'building-t',
    ];

    let loadedCount = 0;
    for (const name of buildingFiles) {
      try {
        const gltf = await loader.loadAsync(`${BASE}models/${name}.glb`);
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.buildingModels.push(model);
        loadedCount++;
      } catch (e) {
        // Skip missing files
      }
    }

    if (this.buildingModels.length > 0) {
      console.log(`Loaded ${loadedCount} building models`);
      this.replaceBuildings();
    }
  }

  replaceBuildings() {
    // Remove ALL placeholder buildings from the scene
    for (const p of this.placeholders) {
      this.scene.remove(p.mesh);
    }
    this.placeholders = [];

    // Also clear any buildings already in the array
    for (const b of this.buildings) {
      this.scene.remove(b.mesh);
    }
    this.buildings = [];

    const BUILDING_SCALE = 6;
    const X_OFFSET = 12;

    for (const side of [-1, 1]) {
      let zPos = -20;
      for (let i = 0; i < 40; i++) {
        const modelIndex = Math.floor(Math.random() * this.buildingModels.length);
        const building = this.buildingModels[modelIndex].clone();

        // Assign a random color variation texture to this building instance
        if (this.colorVariations.length > 0) {
          const tex = this.colorVariations[Math.floor(Math.random() * this.colorVariations.length)];
          building.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material = child.material.clone();
              child.material.map = tex;
              child.material.needsUpdate = true;
            }
          });
        }

        building.scale.set(BUILDING_SCALE, BUILDING_SCALE, BUILDING_SCALE);

        // Measure the actual depth of this building model at scale
        const box = new THREE.Box3().setFromObject(building);
        const depth = box.max.z - box.min.z;

        // Position flush — offset so the model's min.z starts at zPos
        building.position.set(
          side * X_OFFSET,
          0,
          zPos - box.min.z // align the front edge to zPos
        );

        building.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;

        this.scene.add(building);
        this.buildings.push({ mesh: building, depth });

        zPos += depth; // next building starts exactly where this one ends
      }
    }
  }

  createPlaceholderBuildings() {
    const colors = [0x6c5ce7, 0xa29bfe, 0x74b9ff, 0x00b894, 0xfdcb6e, 0xe17055];
    const X_OFFSET = 12;
    const depth = 5;

    for (const side of [-1, 1]) {
      let zPos = -20;
      for (let i = 0; i < 40; i++) {
        const height = 8 + Math.random() * 20;

        const geo = new THREE.BoxGeometry(4, height, depth);
        const mat = new THREE.MeshStandardMaterial({
          color: colors[Math.floor(Math.random() * colors.length)],
        });
        const building = new THREE.Mesh(geo, mat);
        building.position.set(
          side * X_OFFSET,
          height / 2,
          zPos + depth / 2
        );
        building.castShadow = true;
        building.receiveShadow = true;
        this.scene.add(building);
        this.placeholders.push({ mesh: building, depth });
        this.buildings.push({ mesh: building, depth });

        zPos += depth;
      }
    }
  }

  update(speed) {
    // Scroll lane markings
    const SPACING = 8;
    const TOTAL_LENGTH = 30 * SPACING;

    for (const line of this.lineGroups) {
      line.position.z -= speed;
      if (line.position.z < -20) {
        line.position.z += TOTAL_LENGTH;
      }
    }

    // Scroll buildings — move all together to avoid drift/gaps
    for (const b of this.buildings) {
      b.mesh.position.z -= speed;
    }

    // Recycle buildings that pass behind camera — snap to end of row
    // Process left side and right side separately
    const leftBuildings = this.buildings.filter((_, i) => i < this.buildings.length / 2);
    const rightBuildings = this.buildings.filter((_, i) => i >= this.buildings.length / 2);

    for (const group of [leftBuildings, rightBuildings]) {
      for (const b of group) {
        if (b.mesh.position.z < -40) {
          // Find the furthest building in this group
          let maxZ = -Infinity;
          let maxDepth = 0;
          for (const other of group) {
            if (other.mesh.position.z > maxZ) {
              maxZ = other.mesh.position.z;
              maxDepth = other.depth;
            }
          }
          b.mesh.position.z = maxZ + maxDepth;
        }
      }
    }
  }
}

/**
 * PARA SF: FOREST ACCURACY - 3D Forest Environment
 * Optimized procedural woodland with terrain, trees, rocks, sandbags, and atmospheric lighting
 */

import * as THREE from '/lib/three/three.module.js';
import { GAME_CONFIG } from './config.js';

export class ForestEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];
    this.rocks = [];
    this.covers = [];
  }

  build() {
    this.setupLighting();
    this.setupFog();
    this.createTerrain();
    this.createTrees();
    this.createRocks();
    this.createTacticalCovers();
    this.createBoundaryMarkers();
  }

  setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0xcfe6c9, 0x1f2d1d, 1.05);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff2d6, 1.7);
    sunLight.position.set(24, 38, -16);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = GAME_CONFIG.GRAPHICS.SHADOW_MAP_SIZE;
    sunLight.shadow.mapSize.height = GAME_CONFIG.GRAPHICS.SHADOW_MAP_SIZE;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 180;

    const d = 70;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);
  }

  setupFog() {
    this.scene.fog = new THREE.FogExp2(
      GAME_CONFIG.GRAPHICS.FOG_COLOR,
      GAME_CONFIG.GRAPHICS.FOG_DENSITY
    );
  }

  createTerrain() {
    const terrainGeo = new THREE.PlaneGeometry(200, 200, 60, 60);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = 0;
      if (z < -15 || z > 10 || Math.abs(x) > 18) {
        y = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.1 + Math.sin(x * 0.03 + z * 0.04) * 1.4;
      }
      pos.setY(i, y);
    }
    terrainGeo.computeVertexNormals();

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#243421';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 500; i++) {
      const rx = Math.random() * 512, ry = Math.random() * 512;
      const rad = 8 + Math.random() * 36;
      const shadeRoll = Math.random();
      ctx.fillStyle = shadeRoll > 0.72 ? '#402f1d' : (shadeRoll > 0.45 ? '#2c3c26' : '#1b2a1a');
      ctx.beginPath(); ctx.arc(rx, ry, rad, 0, Math.PI * 2); ctx.fill();
    }
    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(14, 14);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: groundTex, roughness: 0.9, metalness: 0.06, color: 0x7a8765
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);
  }

  createTrees() {
    const trunkMat1  = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const trunkMat2  = new THREE.MeshStandardMaterial({ color: 0x4a321c, roughness: 0.9 });
    const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x1b351c, roughness: 0.8 });
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x2a4928, roughness: 0.82 });
    const foliageMat3 = new THREE.MeshStandardMaterial({ color: 0x163017, roughness: 0.8 });
    const foliageMat4 = new THREE.MeshStandardMaterial({ color: 0x3b5d35, roughness: 0.84 });

    // Trees spread wider apart — matching server TREE_BLOCKERS in config.js
    // Each cluster is set back at least ~6 m from target spawn positions
    // to create clear central firing lanes with natural flanking forest feel.
    const treePositions = [
      // --- Left flank —— pushed outward vs old positions ---------------------
      { x: -22, z: -28 }, { x: -30, z: -36 }, { x: -16, z: -46 },
      { x: -32, z: -54 }, { x: -24, z: -64 },
      { x: -36, z: -24 }, { x: -18, z: -22 }, { x: -40, z: -45 },
      { x: -14, z: -56 }, { x: -30, z: -68 },
      // --- Right flank -------------------------------------------------------
      { x: 22, z: -28 },  { x: 30, z: -34 },  { x: 18, z: -44 },
      { x: 32, z: -50 },  { x: 26, z: -60 },
      { x: 36, z: -26 },  { x: 16, z: -20 },  { x: 40, z: -42 },
      { x: 14, z: -54 },  { x: 30, z: -70 },
      // --- Central/background (deep forest behind far targets) ---------------
      { x: -8,  z: -38 }, { x: 10, z: -36 }, { x: -3, z: -52 },
      { x: 5,   z: -62 }, { x: -10, z: -66 },
      { x: 18,  z: -74 }, { x: -18, z: -76 }, { x: 0,  z: -78 },
      { x: 22,  z: -80 }, { x: -24, z: -84 },
      // --- Player firing line perimeter (rear) --------------------------------
      { x: -20, z: 4 },  { x: 20, z: 4 },
      { x: -26, z: 8 },  { x: 26, z: 8 },
      { x: -22, z: 12 }, { x: 22, z: 12 }
    ];

    const foliageMats = [foliageMat1, foliageMat2, foliageMat3, foliageMat4];

    treePositions.forEach((pos, idx) => {
      const treeGroup = new THREE.Group();
      const scale  = 0.85 + Math.random() * 0.45;
      const height = 7 + Math.random() * 3;
      const trunkMat = idx % 2 === 0 ? trunkMat1 : trunkMat2;

      const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.45 * scale, height, 7);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = height / 2;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      const mat = foliageMats[idx % foliageMats.length];
      for (let l = 0; l < 3; l++) {
        const coneRadius = (2.6 - l * 0.6) * scale;
        const coneHeight = (3.2 - l * 0.4) * scale;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneHeight, 7), mat);
        cone.position.y = height * 0.45 + (l * 1.8 * scale);
        cone.castShadow = true;
        cone.receiveShadow = true;
        treeGroup.add(cone);
      }

      treeGroup.position.set(pos.x, 0, pos.z);
      this.scene.add(treeGroup);
      this.trees.push(treeGroup);
    });
  }

  createRocks() {
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x545b54, roughness: 0.95, metalness: 0.1 });

    const rockCoords = [
      { x: -9, z: -27, s: 1.4 }, { x: 11, z: -29, s: 1.6 },
      { x: -15, z: -45, s: 2.2 }, { x: 18, z: -48, s: 1.9 },
      { x: 2,  z: -38, s: 1.3 }, { x: -22, z: -36, s: 1.8 },
      { x: 24, z: -38, s: 2.0 }, { x: 0,  z: -56, s: 2.4 }
    ];

    rockCoords.forEach(rc => {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rc.x, rc.s * 0.6, rc.z);
      rock.scale.set(rc.s, rc.s * 0.8, rc.s * 1.2);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      this.rocks.push(rock);
    });
  }

  createTacticalCovers() {
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x7a7155, roughness: 0.9 });
    const woodMat    = new THREE.MeshStandardMaterial({ color: 0x42311c, roughness: 0.85 });

    const bunkerPositions = [
      { x: -16, z: -28, rot: 0.2 },
      { x: 12,  z: -32, rot: -0.3 },
      { x: 20,  z: -42, rot: 0.4 },
      { x: -22, z: -36, rot: -0.2 }
    ];

    bunkerPositions.forEach(bp => {
      const bunker = new THREE.Group();
      for (let r = 0; r < 3; r++) {
        for (let c = -2; c <= 2; c++) {
          const bag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.45), sandbagMat);
          bag.position.set(c * 0.82 + (r % 2 === 1 ? 0.4 : 0), 0.18 + r * 0.32, 0);
          bag.castShadow = true; bag.receiveShadow = true;
          bunker.add(bag);
        }
      }
      const stakeGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6);
      const stake1 = new THREE.Mesh(stakeGeo, woodMat);
      stake1.position.set(-1.8, 0.8, 0.3); stake1.castShadow = true;
      bunker.add(stake1);
      const stake2 = new THREE.Mesh(stakeGeo, woodMat);
      stake2.position.set(1.8, 0.8, 0.3); stake2.castShadow = true;
      bunker.add(stake2);
      bunker.position.set(bp.x, 0, bp.z);
      bunker.rotation.y = bp.rot;
      this.scene.add(bunker);
      this.covers.push(bunker);
    });

    // ── MILITARY FIRING BAY (Two Enclosed Stalls) ────────────────────────────
    // Inspired by real outdoor military range design:
    //  - Each player (slot 1 at x=-4, slot 2 at x=4) gets their own firing stall.
    //  - A low front parapet (3-row sandbags ~0.9m high) runs the full front width.
    //  - Tall timber partition walls on L/R sides of each stall (~2.1m) frame the view.
    //  - A horizontal top rail and overhead beam tie the stall together.
    //  - A shared center divider separates the two positions.
    //  - Player eye height = 1.7m, so parapet top at 0.92m → 0.78m clear view over it.
    //  - Side partitions are tall enough to be clearly visible in first-person peripheral.

    const bayGroup = new THREE.Group();

    const weatheredWood = new THREE.MeshStandardMaterial({ color: 0x3b2a15, roughness: 0.91, metalness: 0.04 });
    const plywoodMat    = new THREE.MeshStandardMaterial({ color: 0x5c4226, roughness: 0.85 });
    const darkMetal     = new THREE.MeshStandardMaterial({ color: 0x252520, roughness: 0.8,  metalness: 0.35 });
    const concreteMat   = new THREE.MeshStandardMaterial({ color: 0x58574f, roughness: 0.96, metalness: 0.03 });

    // ── Geometry constants ──────────────────────────────────────────────────
    const frontZ    = -0.6;      // Z position of the front parapet face
    const stallW    = 2.8;       // each stall is ~2.8m wide
    const stallD    = 2.2;       // depth of stall behind parapet (into player zone)
    const wallH     = 2.15;      // side partition height (tall enough to frame view)
    const wallThick = 0.12;      // partition thickness
    const parapetTopY = 0.92;    // top of front parapet

    // Stall centers for both players
    const stallCenters = [-4, 4];

    // ── Front parapet — 3 staggered sandbag rows, full combined width ───────
    const bagW = 1.5, bagH = 0.30, bagD = 0.50;
    const fullHalf = stallW + Math.abs(stallCenters[0]) + 0.4; // half of full parapet
    const rowOffsets = [
      { z: 0,    shift: 0    },
      { z: 0.05, shift: 0.75 },
      { z: 0.04, shift: 0.37 }
    ];
    for (let row = 0; row < 3; row++) {
      const yBase = bagH * row + bagH / 2;
      const zPos  = frontZ + rowOffsets[row].z;
      const shift = rowOffsets[row].shift;
      for (let c = -fullHalf; c <= fullHalf; c += bagW) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(bagW - 0.03, bagH - 0.02, bagD), sandbagMat);
        bag.position.set(c + shift, yBase, zPos);
        bag.castShadow = true; bag.receiveShadow = true;
        bayGroup.add(bag);
      }
    }

    // Concrete base slab under parapet
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(fullHalf * 2 + 0.6, 0.06, bagD + 0.15),
      concreteMat
    );
    slab.position.set(0, 0.03, frontZ);
    slab.receiveShadow = true;
    bayGroup.add(slab);

    // ── Per-stall structure: side partitions, columns, top rail ─────────────
    for (const cx of stallCenters) {
      const leftX  = cx - stallW / 2;
      const rightX = cx + stallW / 2;

      // LEFT side partition (plywood panel)
      const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, wallH, stallD + bagD),
        plywoodMat
      );
      leftWall.position.set(leftX, wallH / 2, frontZ + (stallD + bagD) / 2 - bagD / 2);
      leftWall.castShadow = true; leftWall.receiveShadow = true;
      bayGroup.add(leftWall);

      // RIGHT side partition (plywood panel)
      const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, wallH, stallD + bagD),
        plywoodMat
      );
      rightWall.position.set(rightX, wallH / 2, frontZ + (stallD + bagD) / 2 - bagD / 2);
      rightWall.castShadow = true; rightWall.receiveShadow = true;
      bayGroup.add(rightWall);

      // Front columns (timber posts at each front corner of the stall)
      for (const px of [leftX, rightX]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH + 0.1, 0.14), weatheredWood);
        col.position.set(px, (wallH + 0.1) / 2, frontZ);
        col.castShadow = true;
        bayGroup.add(col);
        // Rear column
        const rCol = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH + 0.1, 0.14), weatheredWood);
        rCol.position.set(px, (wallH + 0.1) / 2, frontZ + stallD + bagD);
        rCol.castShadow = true;
        bayGroup.add(rCol);
      }

      // Horizontal top rail across front of stall
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(stallW + wallThick * 2, 0.10, 0.10),
        weatheredWood
      );
      topRail.position.set(cx, wallH + 0.05, frontZ);
      topRail.castShadow = true;
      bayGroup.add(topRail);

      // Overhead longitudinal beam (runs front-to-back along stall centre)
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.12, stallD + bagD),
        weatheredWood
      );
      beam.position.set(cx, wallH, frontZ + (stallD + bagD) / 2 - bagD / 2);
      beam.castShadow = true;
      bayGroup.add(beam);

      // Firing shelf on top of parapet (narrow plywood ledge for weapon rest)
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(stallW - wallThick * 2, 0.05, bagD * 0.6),
        plywoodMat
      );
      shelf.position.set(cx, parapetTopY + 0.025, frontZ - bagD * 0.2);
      shelf.castShadow = true; shelf.receiveShadow = true;
      bayGroup.add(shelf);
    }

    // ── Center divider between the two stalls ───────────────────────────────
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(wallThick * 1.5, wallH, stallD + bagD),
      plywoodMat
    );
    divider.position.set(0, wallH / 2, frontZ + (stallD + bagD) / 2 - bagD / 2);
    divider.castShadow = true; divider.receiveShadow = true;
    bayGroup.add(divider);

    // ── Metal angle brackets on partition tops (detail) ──────────────────────
    for (const cx of stallCenters) {
      for (const px of [cx - stallW / 2, cx + stallW / 2]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), darkMetal);
        bracket.position.set(px, wallH + 0.02, frontZ);
        bayGroup.add(bracket);
      }
    }

    // ── Range front berm: additional low sandbag row at far left/right ───────
    // Extends the parapet visually to the tree line on both flanks
    for (const side of [-1, 1]) {
      const bermX = side * (fullHalf + 1.5);
      for (let r = 0; r < 2; r++) {
        for (let b2 = 0; b2 < 3; b2++) {
          const bb = new THREE.Mesh(new THREE.BoxGeometry(bagW - 0.03, bagH - 0.02, bagD), sandbagMat);
          bb.position.set(bermX + side * b2 * bagW * 0.9, bagH * r + bagH / 2, frontZ);
          bb.castShadow = true; bb.receiveShadow = true;
          bayGroup.add(bb);
        }
      }
    }

    this.scene.add(bayGroup);
    this.covers.push(bayGroup);
  }

  createBoundaryMarkers() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f });

    const corners = [
      { x: -30, z: -20 }, { x: 30, z: -20 },
      { x: -30, z: -72 }, { x: 30, z: -72 }
    ];
    corners.forEach(cp => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), postMat);
      post.position.set(cp.x, 1.5, cp.z);
      post.castShadow = true;
      this.scene.add(post);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), flagMat);
      flag.position.set(cp.x + 0.4, 2.7, cp.z);
      this.scene.add(flag);
    });
  }
}

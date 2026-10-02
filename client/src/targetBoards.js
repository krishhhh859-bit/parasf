/**
 * Server-synchronized physical target boards for the shooting range.
 * Boards display terrorist-reference.png, move throughout the full 4-minute match,
 * fall backward on hit, go invisible during 6-second cooldown, and respawn at new positions.
 */

import * as THREE from '/lib/three/three.module.js';

const BOARD_WIDTH  = 2.8;
const BOARD_HEIGHT = 4.2;

// ~10% darker than the original gold/cream palette
const DARK_FRAME    = 0x1c231b;  // slightly darker charcoal frame
const DARK_FACE     = 0xd9d8d0;  // 10% darker off-white face (was 0xf2f1e9)
const DARK_OUTLINE  = 0xe5b423;  // 10% darker gold outline (was 0xffc928)

export class TargetBoardSystem {
  constructor(scene) {
    this.scene = scene;
    this.targets = new Map();
    this.raycaster = new THREE.Raycaster();

    // Shared materials — boards are 10% darker per spec
    this.frameMaterial = new THREE.MeshStandardMaterial({ color: DARK_FRAME, roughness: 0.82 });
    this.faceMaterial  = new THREE.MeshBasicMaterial({ color: DARK_FACE });
    this.outlineMaterial = new THREE.MeshStandardMaterial({
      color: DARK_OUTLINE,
      emissive: 0x8b5a00,
      emissiveIntensity: 0.72,
      roughness: 0.35
    });
    this.standMaterial = new THREE.MeshStandardMaterial({ color: 0x373b35, metalness: 0.45, roughness: 0.7 });
    this.hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide
    });

    // Load terrorist-reference texture
    this.imageTexture = new THREE.TextureLoader().load('/assets/logos/terrorist-reference.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        // Refresh image geometry on all existing boards once loaded
        for (const board of this.targets.values()) {
          this._refreshImagePlane(board);
        }
      }
    );
    this.imageTexture.colorSpace = THREE.SRGBColorSpace;
    this.imageMaterial = new THREE.MeshBasicMaterial({
      map: this.imageTexture,
      side: THREE.DoubleSide
    });
  }

  // ── BOARD CREATION ────────────────────────────────────────────────────────

  createBoard(target) {
    const group = new THREE.Group();
    group.name = 'range-target-' + target.id;

    // Backing board
    const backer = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.16),
      this.frameMaterial
    );
    backer.position.y = BOARD_HEIGHT / 2;
    backer.castShadow = true;
    backer.receiveShadow = true;
    group.add(backer);

    // White/cream face
    const whiteFace = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_WIDTH - 0.14, BOARD_HEIGHT - 0.14),
      this.faceMaterial
    );
    whiteFace.position.set(0, BOARD_HEIGHT / 2, 0.084);
    group.add(whiteFace);

    // Terrorist-reference image print
    const imgPlane = this._createImagePlane();
    imgPlane.name = 'terrorist-reference-print';
    group.add(imgPlane);

    // Gold outline strips (sides + top/bottom)
    const outlineDepth = 0.05;
    const sideBar = new THREE.BoxGeometry(0.075, BOARD_HEIGHT + 0.08, outlineDepth);
    const topBar  = new THREE.BoxGeometry(BOARD_WIDTH + 0.08, 0.075, outlineDepth);
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(sideBar, this.outlineMaterial);
      bar.position.set(side * (BOARD_WIDTH / 2 - 0.025), BOARD_HEIGHT / 2, 0.13);
      group.add(bar);
    }
    for (const edge of [0, BOARD_HEIGHT]) {
      const bar = new THREE.Mesh(topBar, this.outlineMaterial);
      bar.position.set(0, edge, 0.13);
      group.add(bar);
    }

    // Stand posts
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.07, 1.4, 8),
        this.standMaterial
      );
      post.position.set(side * 0.78, -0.52, -0.04);
      post.castShadow = true;
      group.add(post);
    }
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), this.standMaterial);
    foot.position.set(0, -1.2, -0.04);
    group.add(foot);

    // Invisible hitbox (positioned at face centre, full board area including frame)
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_WIDTH + 0.1, BOARD_HEIGHT + 0.1, 0.35),
      this.hitboxMaterial
    );
    hitbox.name = 'target-hitbox-' + target.id;
    hitbox.position.set(0, BOARD_HEIGHT / 2, 0.015);
    hitbox.userData.targetId = target.id;
    group.add(hitbox);

    const board = {
      id: target.id,
      group,
      hitbox,
      active: !!target.active,
      // State: 'ACTIVE' | 'FALLING' | 'INACTIVE'
      state: target.active ? 'ACTIVE' : 'INACTIVE',
      // Fall animation
      fallAngle: 0,        // current tilt angle (radians)
      fallProgress: 0,     // 0 → 1
      // Smooth position interpolation target
      targetPosition: new THREE.Vector3(target.x, target.y, target.z)
    };

    // Set initial world position
    group.position.set(target.x, target.y, target.z);
    group.rotation.y = target.yaw || 0;
    hitbox.visible = board.active;

    this.scene.add(group);
    return board;
  }

  _createImagePlane() {
    const imgH = BOARD_HEIGHT - 0.22;
    const nw = this.imageTexture.image ? this.imageTexture.image.naturalWidth  : 240;
    const nh = this.imageTexture.image ? this.imageTexture.image.naturalHeight : 488;
    const aspect = (nw && nh) ? nw / nh : 240 / 488;
    const imgW = imgH * aspect;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(imgW, imgH),
      this.imageMaterial
    );
    plane.position.set(0, BOARD_HEIGHT / 2, 0.092);
    return plane;
  }

  _refreshImagePlane(board) {
    const old = board.group.getObjectByName('terrorist-reference-print');
    if (old) board.group.remove(old);
    const fresh = this._createImagePlane();
    fresh.name = 'terrorist-reference-print';
    board.group.add(fresh);
  }

  // ── STATE SYNC (from server) ──────────────────────────────────────────────

  setState(state) {
    if (!state || !Array.isArray(state.targets)) return;

    const receivedIds = new Set();
    for (const target of state.targets) {
      receivedIds.add(target.id);
      let board = this.targets.get(target.id);
      if (!board) {
        board = this.createBoard(target);
        this.targets.set(target.id, board);
      }
      // Update target smoothly
      board.targetPosition.set(target.x, target.y, target.z);
      board.group.rotation.y = target.yaw || 0;

      // Only restore to ACTIVE if we weren't mid-fall
      if (board.state !== 'FALLING') {
        board.active = !!target.active;
        board.state  = target.active ? 'ACTIVE' : 'INACTIVE';
        board.hitbox.visible = board.active;
        board.hitbox.userData.targetId = target.id;
        board.fallAngle    = 0;
        board.fallProgress = 0;
        board.group.rotation.x = 0;
        board.group.visible = true;
      }
    }

    // Boards not in the latest state packet = retired
    for (const [id, board] of this.targets) {
      if (!receivedIds.has(id) && board.state === 'ACTIVE') {
        board.active = false;
        board.state  = 'INACTIVE';
        board.hitbox.visible = false;
        board.group.visible  = false;
      }
    }
  }

  // ── HIT (client-side visual trigger) ─────────────────────────────────────

  markHit(targetId) {
    const board = this.targets.get(targetId);
    if (!board || board.state !== 'ACTIVE') return;
    board.active = false;
    board.state  = 'FALLING';
    board.hitbox.visible = false;
    board.fallProgress = 0;
    board.fallAngle    = 0;
  }

  // ── RAYCASTING ────────────────────────────────────────────────────────────

  getActiveHitboxes() {
    return [...this.targets.values()]
      .filter(b => b.state === 'ACTIVE')
      .map(b => b.hitbox);
  }

  findHitTarget(origin, direction, environment) {
    const hitboxes = this.getActiveHitboxes();
    if (!hitboxes.length) return null;

    // Ensure all active targets have up-to-date world matrices
    for (const b of this.targets.values()) {
      if (b.state === 'ACTIVE' && b.group) {
        b.group.updateMatrixWorld(true);
      }
    }

    this.raycaster.set(origin, direction);
    this.raycaster.near = 0;
    this.raycaster.far  = 250; // generous long-range distance

    // Collect blocking geometry (trees, rocks, covers) for occlusion check
    const blockers = [];
    if (environment) {
      if (environment.trees)  blockers.push(...environment.trees);
      if (environment.rocks)  blockers.push(...environment.rocks);
      if (environment.covers) blockers.push(...environment.covers);
    }
    // Also include terrain
    const terrainMeshes = this.scene.children.filter(o =>
      o.isMesh &&
      o.geometry && o.geometry.type === 'PlaneGeometry' &&
      o.geometry.parameters && o.geometry.parameters.width >= 100
    );

    // Test hitboxes first (they are very thin and must be checked with DoubleSide)
    const hitResults = this.raycaster.intersectObjects(hitboxes, false);
    if (!hitResults.length) return null;

    // Find nearest hitbox hit
    hitResults.sort((a, b) => a.distance - b.distance);
    for (const hit of hitResults) {
      // Resolve the targetId — may come from the hitbox itself or a parent group
      let targetId = hit.object.userData && hit.object.userData.targetId;
      if (!targetId) {
        // Walk up to find parent with targetId
        let obj = hit.object.parent;
        while (obj) {
          if (obj.userData && obj.userData.targetId) { targetId = obj.userData.targetId; break; }
          obj = obj.parent;
        }
      }
      if (!targetId) continue;
      const board = this.targets.get(targetId);
      if (!board || board.state !== 'ACTIVE') continue;

      // Occlusion: check if any blocker is closer than this hit
      const occluderHits = this.raycaster.intersectObjects([...blockers, ...terrainMeshes], true);
      const blocked = occluderHits.some(oh => {
        if (oh.distance >= hit.distance - 0.1) return false;
        // Bullets pass through tree foliage cones (only trunks block)
        if (oh.object.geometry && oh.object.geometry.type === 'ConeGeometry') return false;
        // Ignore local player commando model meshes in third person
        if (oh.object.name && (oh.object.name.includes('commando') || oh.object.name.includes('glove'))) return false;
        return true;
      });
      if (blocked) continue;

      return targetId;
    }
    return null;
  }

  // ── ANIMATION LOOP ────────────────────────────────────────────────────────

  update(dt) {
    const FALL_DURATION = 0.45; // seconds to complete backward fall
    const LERP_SPEED    = 12;   // position lerp factor

    for (const [id, board] of this.targets) {
      // --- Smooth position interpolation for active/moving boards ---
      if (board.state === 'ACTIVE') {
        board.group.position.x += (board.targetPosition.x - board.group.position.x) * Math.min(1, dt * LERP_SPEED);
        board.group.position.z += (board.targetPosition.z - board.group.position.z) * Math.min(1, dt * LERP_SPEED);
        board.group.position.y += (board.targetPosition.y - board.group.position.y) * Math.min(1, dt * LERP_SPEED);
        // Keep hitbox targetId synced (in case board was reassigned)
        board.hitbox.userData.targetId = id;
      }

      // --- Fall-backward animation ---
      if (board.state === 'FALLING') {
        board.fallProgress = Math.min(1, board.fallProgress + dt / FALL_DURATION);
        // Ease-in cubic for a natural topple
        const eased = board.fallProgress * board.fallProgress * (3 - 2 * board.fallProgress);
        board.fallAngle = eased * (Math.PI / 2 + 0.1); // tilt ~100° backward
        board.group.rotation.x = board.fallAngle;

        if (board.fallProgress >= 1) {
          // Fully fallen — hide board
          board.state = 'INACTIVE';
          board.group.visible = false;
          board.group.rotation.x = 0; // reset for reuse
        }
      }
    }
  }

  // ── DISPOSE ───────────────────────────────────────────────────────────────

  dispose() {
    for (const [, board] of this.targets) {
      this.scene.remove(board.group);
      board.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    }
    this.targets.clear();
    this.imageTexture.dispose();
    this.imageMaterial.dispose();
    this.frameMaterial.dispose();
    this.faceMaterial.dispose();
    this.outlineMaterial.dispose();
    this.standMaterial.dispose();
    this.hitboxMaterial.dispose();
  }
}

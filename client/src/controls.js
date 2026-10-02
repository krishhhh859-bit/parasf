/**
 * PARA SF: FOREST ACCURACY - PC Controls System
 * PointerLock FPS Controls: WASD, Mouse Look, LMB Shoot, RMB Scope, Q Aim, R Reload
 */

import * as THREE from '/lib/three/three.module.js';
import { GAME_CONFIG } from './config.js';

export class PCControls {
  constructor(camera, domElement, onShoot, onScope, onAim, onReload, onToggleCamera) {
    this.camera = camera;
    this.domElement = domElement || document.body;
    this.onShoot = onShoot;
    this.onScope = onScope;
    this.onAim = onAim;
    this.onReload = onReload;
    this.onToggleCamera = onToggleCamera;

    this.isLocked = false;
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.mouseDelta = { x: 0, y: 0 };
    this.sensitivity = GAME_CONFIG.PLAYER.MOUSE_SENSITIVITY;

    this.pitch = 0; // X rotation (vertical look)
    this.yaw = 0;   // Y rotation (horizontal look, 0 = forward -Z)

    this.isScoped = false;
    this.isAiming = false;
    this.isFiring = false;
    this.fireCooldown = 0;
    this.fireInterval = GAME_CONFIG.WEAPON.FIRE_RATE_MS / 1000;
    this.enabled = true;

    this.initEventListeners();
  }

  initEventListeners() {
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement || document.pointerLockElement === document.body;
      if (!this.isLocked) {
        this.stopFiring();
      }
    });

    // Mouse movement
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || !this.enabled) return;
      const factor = (this.isScoped ? 0.4 : (this.isAiming ? 0.65 : 1.0));
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      this.yaw -= movementX * this.sensitivity * factor;
      this.pitch -= movementY * this.sensitivity * factor;

      // Clamp vertical pitch (-85 to +85 deg)
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

      this.mouseDelta.x = movementX;
      this.mouseDelta.y = movementY;
    });

    // Keyboard bindings
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'KeyR':
          if (this.onReload) this.onReload();
          break;
        case 'KeyQ':
          this.isAiming = !this.isAiming;
          if (this.onAim) this.onAim(this.isAiming);
          break;
        case 'KeyI':
          if (this.onToggleCamera) this.onToggleCamera();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
      }
    });

    // Mouse Buttons (LMB = held fire, RMB = Scope)
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;

      if (e.button === 0) {
        if (!this.isFiring) {
          console.log('[COMBAT DEBUG] player LMB DOWN');
          this.isFiring = true;
          this.fireCooldown = 0;
          this.tryFire();
        }
      } else if (e.button === 2) {
        // RMB Scope
        console.log('[SCOPE DEBUG] scope activated from controls');
        this.isScoped = true;
        if (this.onScope) this.onScope(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.stopFiring();
      if (e.button === 2) {
        // RMB Release Scope
        this.isScoped = false;
        if (this.onScope) this.onScope(false);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.stopFiring();
    });
    window.addEventListener('blur', () => this.stopFiring());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopFiring();
    });
    this.domElement.addEventListener('mouseleave', () => {
      if (!this.isLocked) this.stopFiring();
    });

    // Prevent context menu on RMB
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  tryFire() {
    if (!this.isFiring || this.fireCooldown > 0) return;
    if (!this.onShoot) {
      this.stopFiring();
      return;
    }

    console.log('[COMBAT DEBUG] player firing');
    if (this.onShoot() === false) {
      this.stopFiring();
      return;
    }
    this.fireCooldown = this.fireInterval;
  }

  stopFiring() {
    if (!this.isFiring) return;
    this.isFiring = false;
    console.log('[COMBAT DEBUG] player LMB UP');
  }

  requestLock() {
    try {
      this.domElement.requestPointerLock();
    } catch(e) {
      document.body.requestPointerLock();
    }
  }

  unlock() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  update(dt, playerPosition) {
    if (!this.enabled) return { isMoving: false, delta: { x: 0, y: 0 } };

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.isFiring && this.fireCooldown <= 0) this.tryFire();

    // Apply pitch & yaw to camera rotation (Order: YXZ) — look still works
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // MOVEMENT LOCKED: This is a fixed firing-position game.
    // WASD / arrow keys are intentionally ignored for translation.
    // playerPosition is always the designated firing position — never modified here.
    // The locked position is set by GameMatch and passed in each frame.
    playerPosition.y = GAME_CONFIG.PLAYER.HEIGHT;
    this.camera.position.copy(playerPosition);

    // Zero out any residual velocity so keys pressed have no effect if lock is bypassed.
    this.velocity.set(0, 0, 0);

    const currentMouseDelta = { ...this.mouseDelta };
    this.mouseDelta = { x: 0, y: 0 };

    return { isMoving: false, delta: currentMouseDelta };
  }
}

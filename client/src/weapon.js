/**
 * PARA SF: FOREST ACCURACY - First-Person Weapon System
 * TAR-21-inspired bullpup rifle viewmodel with recoil, muzzle flash, and reload handling.
 */

import * as THREE from '/lib/three/three.module.js';
import { GAME_CONFIG } from './config.js';

export class WeaponSystem {
  constructor(camera) {
    this.camera = camera;
    this.viewmodel = new THREE.Group();
    this.muzzleFlash = null;
    this.muzzleLight = null;

    this.normalWeaponPosition = new THREE.Vector3(0.22, -0.20, -0.42);
    this.aimingWeaponPosition = new THREE.Vector3(0.10, -0.16, -0.34);
    this.scopedWeaponPosition = new THREE.Vector3(0.0, -0.13, -0.62);
    this.normalWeaponRotation = new THREE.Euler(0, 0, 0);
    this.aimingWeaponRotation = new THREE.Euler(-0.02, 0, 0);
    this.scopedWeaponRotation = new THREE.Euler(0, 0, 0);
    this.scopeOccluder = null;

    this.currentPos = this.normalWeaponPosition.clone();
    this.currentRot = new THREE.Euler(0, 0, 0);

    this.recoilOffset = new THREE.Vector3(0, 0, 0);
    this.recoilRotation = new THREE.Euler(0, 0, 0);

    this.isScoped = false;
    this.isAiming = false;
    this.isReloading = false;
    this.reloadProgress = 0;
    this.reloadDuration = GAME_CONFIG.WEAPON.RELOAD_TIME_MS;

    this.swayX = 0;
    this.swayY = 0;
    this.walkBob = 0;

    this.build();
    this.camera.add(this.viewmodel);
  }

  build() {
    const receiverMat = new THREE.MeshStandardMaterial({ color: 0x1a1d1a, roughness: 0.4, metalness: 0.75 });
    const polymerMat = new THREE.MeshStandardMaterial({ color: 0x2a3529, roughness: 0.82 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9 });
    const opticMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.5, metalness: 0.6 });
    const handMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.88 });
    const trimMat = receiverMat;

    this.gunBody = new THREE.Group();
    this.gunBody.name = 'rifle-body';
    this.opticGroup = new THREE.Group();
    this.opticGroup.name = 'optic-assembly';
    this.handGroup = new THREE.Group();
    this.handGroup.name = 'weapon-hands';

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.56), polymerMat);
    chassis.name = 'rifle-chassis';
    chassis.position.set(0, 0, 0.02);
    this.gunBody.add(chassis);

    const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.46), receiverMat);
    upperRail.name = 'upper-rail';
    upperRail.position.set(0, 0.09, 0.04);
    this.gunBody.add(upperRail);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.2), polymerMat);
    stock.name = 'stock';
    stock.position.set(0, 0.02, 0.22);
    this.gunBody.add(stock);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 12), barrelMat);
    barrel.name = 'barrel';
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.39);
    this.gunBody.add(barrel);

    const muzzleHider = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), receiverMat);
    muzzleHider.name = 'muzzle-hider';
    muzzleHider.rotation.x = Math.PI / 2;
    muzzleHider.position.set(0, 0.03, -0.57);
    this.gunBody.add(muzzleHider);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.17), polymerMat);
    handguard.name = 'handguard';
    handguard.position.set(0, -0.03, -0.18);
    this.gunBody.add(handguard);

    const frontSights = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.07), trimMat);
    frontSights.name = 'front-sight';
    frontSights.position.set(0, 0.12, -0.18);
    this.gunBody.add(frontSights);

    this.magazine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), polymerMat);
    this.magazine.name = 'magazine';
    this.magazine.position.set(0, -0.15, 0.18);
    this.magazine.rotation.x = -0.2;
    this.gunBody.add(this.magazine);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.17, 0.07), polymerMat);
    grip.name = 'rifle-grip';
    grip.position.set(0, -0.15, -0.08);
    grip.rotation.x = 0.35;
    this.gunBody.add(grip);

    const rearOpticRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.005, 8, 24), opticMat);
    rearOpticRing.name = 'optic-rear-rim';
    rearOpticRing.position.set(0, 0.12, 0.01);
    this.opticGroup.add(rearOpticRing);

    const frontOpticRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.005, 8, 24), opticMat);
    frontOpticRing.name = 'optic-front-rim';
    frontOpticRing.position.set(0, 0.12, -0.025);
    this.opticGroup.add(frontOpticRing);
    this.scopeOccluder = frontOpticRing;

    const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.12), handMat);
    rightGlove.name = 'right-glove';
    rightGlove.position.set(0.02, -0.1, -0.08);
    this.handGroup.add(rightGlove);

    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), handMat);
    leftGlove.name = 'left-glove';
    leftGlove.position.set(-0.04, -0.04, -0.25);
    leftGlove.rotation.z = 0.35;
    this.handGroup.add(leftGlove);

    const flashGeo = new THREE.ConeGeometry(0.09, 0.22, 6);
    flashGeo.rotateX(Math.PI / 2);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.name = 'muzzle-flash';
    this.muzzleFlash.position.set(0, 0.03, -0.66);
    this.gunBody.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffa726, 0, 15);
    this.muzzleLight.name = 'muzzle-light';
    this.muzzleLight.position.set(0, 0.03, -0.66);
    this.gunBody.add(this.muzzleLight);

    this.viewmodel.add(this.gunBody);
    this.viewmodel.add(this.opticGroup);
    this.viewmodel.add(this.handGroup);
    this.viewmodel.position.copy(this.normalWeaponPosition);
  }

  fireVisual() {
    this.recoilOffset.z = 0.06;
    this.recoilOffset.y = 0.02;
    this.recoilRotation.x = 0.08;
    this.recoilRotation.y = (Math.random() - 0.5) * 0.03;

    if (this.muzzleFlash && this.muzzleLight) {
      this.muzzleFlash.material.opacity = 1.0;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      this.muzzleFlash.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, 1);
      this.muzzleLight.intensity = 2.5;

      setTimeout(() => {
        if (this.muzzleFlash) this.muzzleFlash.material.opacity = 0;
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
      }, 45);
    }
  }

  setScope(enabled) {
    this.isScoped = enabled;
    if (!enabled) return;

    console.log('[WEAPON DEBUG] scope active');
    console.log('[WEAPON DEBUG] first-person weapon position =', this.scopedWeaponPosition.toArray());
    console.log('[WEAPON DEBUG] first-person weapon scale =', this.viewmodel.scale.toArray());
    console.log('[WEAPON DEBUG] optic position =', this.scopeOccluder.position.toArray());
    console.log('[WEAPON DEBUG] optic scale =', this.scopeOccluder.scale.toArray());
    const visibleMeshes = [];
    this.viewmodel.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const hasVisibleMaterial = materials.some((material) => material && (material.opacity === undefined || material.opacity > 0));
      if (object.isMesh && object.visible && hasVisibleMaterial) visibleMeshes.push(object.name || object.type);
    });
    console.log('[WEAPON DEBUG] visible weapon meshes =', visibleMeshes);
  }
  setAim(enabled) { this.isAiming = enabled; }

  startReload() {
    this.isReloading = true;
    this.reloadProgress = 0;
  }

  finishReload() {
    this.isReloading = false;
    this.reloadProgress = 0;
    if (this.magazine) {
      this.magazine.position.set(0, -0.15, 0.18);
      this.magazine.rotation.set(-0.2, 0, 0);
    }
  }

  update(dt, mouseDelta, isMoving) {
    let targetPos = this.normalWeaponPosition;
    let targetRotation = this.normalWeaponRotation;
    let targetFOV = GAME_CONFIG.WEAPON.NORMAL_FOV;

    if (this.isScoped) {
      targetPos = this.scopedWeaponPosition;
      targetRotation = this.scopedWeaponRotation;
      targetFOV = GAME_CONFIG.WEAPON.SCOPE_FOV;
    } else if (this.isAiming) {
      targetPos = this.aimingWeaponPosition;
      targetRotation = this.aimingWeaponRotation;
      targetFOV = GAME_CONFIG.WEAPON.AIM_FOV;
    }

    this.camera.fov += (targetFOV - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    if (mouseDelta) {
      const swayFactor = this.isScoped ? 0.0003 : 0.0012;
      this.swayX += (-mouseDelta.x * swayFactor - this.swayX) * dt * 12;
      this.swayY += (-mouseDelta.y * swayFactor - this.swayY) * dt * 12;
    }

    if (isMoving && !this.isScoped) {
      this.walkBob += dt * 9;
      const bobX = Math.sin(this.walkBob) * 0.008;
      const bobY = Math.abs(Math.cos(this.walkBob)) * 0.009;
      this.currentPos.x = targetPos.x + bobX + this.swayX;
      this.currentPos.y = targetPos.y + bobY + this.swayY;
    } else {
      this.currentPos.lerp(targetPos, dt * 12);
      this.currentPos.x += this.swayX;
      this.currentPos.y += this.swayY;
    }

    this.recoilOffset.lerp(new THREE.Vector3(0, 0, 0), dt * 18);
    this.recoilRotation.x += (0 - this.recoilRotation.x) * dt * 20;
    this.recoilRotation.y += (0 - this.recoilRotation.y) * dt * 20;

    const scopeBodyOffset = this.isScoped ? -0.42 : 0;
    this.gunBody.position.y += (scopeBodyOffset - this.gunBody.position.y) * Math.min(1, dt * 12);
    this.handGroup.position.y += (scopeBodyOffset - this.handGroup.position.y) * Math.min(1, dt * 12);

    let reloadAnimRot = 0;
    let reloadAnimY = 0;

    if (this.isReloading) {
      this.reloadProgress += (dt * 1000) / this.reloadDuration;
      const p = Math.min(1, this.reloadProgress);

      if (p < 0.25) {
        reloadAnimRot = (p / 0.25) * 0.4;
        reloadAnimY = -(p / 0.25) * 0.12;
      } else if (p < 0.65) {
        reloadAnimRot = 0.4;
        reloadAnimY = -0.12;
        const magDrop = ((p - 0.25) / 0.4);
        if (this.magazine) {
          this.magazine.position.y = -0.15 - Math.sin(magDrop * Math.PI) * 0.18;
        }
      } else if (p < 0.85) {
        reloadAnimRot = 0.25;
        reloadAnimY = -0.06;
      } else {
        const returnP = (p - 0.85) / 0.15;
        reloadAnimRot = (1 - returnP) * 0.25;
        reloadAnimY = -(1 - returnP) * 0.06;
      }
    }

    this.viewmodel.position.set(
      this.currentPos.x + this.recoilOffset.x,
      this.currentPos.y + this.recoilOffset.y + reloadAnimY,
      this.currentPos.z + this.recoilOffset.z
    );

    this.viewmodel.rotation.set(
      targetRotation.x + this.recoilRotation.x + reloadAnimRot,
      targetRotation.y + this.recoilRotation.y + this.swayX * 0.5,
      targetRotation.z + this.swayX * 0.8
    );
  }
}

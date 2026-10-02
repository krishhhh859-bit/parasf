/**
 * PARA SF: FOREST ACCURACY - Humanoid Soldier Model
 * Low-poly battlefield soldier with a hierarchical body rig for movement and aiming.
 */

import * as THREE from '/lib/three/three.module.js';

export class CommandoModel {
  constructor(isThirdPerson = false, theme = 'commando') {
    this.isThirdPerson = isThirdPerson;
    this.theme = theme;
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.limbs = {};
    this.animTime = 0;
    this.build();
  }

  build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2a07d, roughness: 0.7 });
    const armor = new THREE.MeshStandardMaterial({ color: this.theme === 'terrorist' ? 0x463322 : 0x3f5144, roughness: 0.8 });
    const darkArmor = new THREE.MeshStandardMaterial({ color: 0x1b201a, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: this.theme === 'terrorist' ? 0x2f2924 : 0x3f4f3c, roughness: 0.8 });
    const pouches = new THREE.MeshStandardMaterial({ color: 0x1f211d, roughness: 0.86 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x131613, roughness: 0.7, metalness: 0.5 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 });
    const accent = new THREE.MeshStandardMaterial({ color: this.theme === 'terrorist' ? 0xb93a2f : 0xf2d37b, roughness: 0.3, metalness: 0.8 });
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x171b17, roughness: 0.4, metalness: 0.75 });

    this.root.position.y = 0;

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    this.root.add(hips);
    this.limbs.hips = hips;

    const pelvis = new THREE.Group();
    pelvis.position.y = 0.04;
    hips.add(pelvis);
    this.limbs.pelvis = pelvis;

    const pelvisBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.22, 10), cloth);
    pelvisBody.castShadow = true;
    pelvisBody.position.y = 0.08;
    pelvis.add(pelvisBody);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.24), darkArmor);
    belt.position.y = 0.16;
    pelvis.add(belt);

    const leftHip = new THREE.Group();
    leftHip.position.set(-0.14, 0.08, 0);
    hips.add(leftHip);
    this.limbs.leftHip = leftHip;

    const rightHip = new THREE.Group();
    rightHip.position.set(0.14, 0.08, 0);
    hips.add(rightHip);
    this.limbs.rightHip = rightHip;

    const spine = new THREE.Group();
    spine.position.y = 0.16;
    hips.add(spine);
    this.limbs.spine = spine;

    const chest = new THREE.Group();
    chest.position.y = 0.34;
    spine.add(chest);
    this.limbs.chest = chest;

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.52, 10), armor);
    torso.position.y = 0.22;
    torso.scale.set(1.2, 1.0, 0.9);
    torso.castShadow = true;
    chest.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.30, 0.18), darkArmor);
    vest.position.set(0, 0.27, 0.02);
    chest.add(vest);

    const leftChestPouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.08), pouches);
    leftChestPouch.position.set(-0.18, 0.22, 0.15);
    chest.add(leftChestPouch);

    const rightChestPouch = leftChestPouch.clone();
    rightChestPouch.position.x = 0.18;
    chest.add(rightChestPouch);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.16), darkArmor);
    backpack.position.set(0, 0.26, -0.19);
    backpack.castShadow = true;
    chest.add(backpack);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.12, 8), skin);
    neck.position.y = 0.68;
    chest.add(neck);
    this.limbs.neck = neck;

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.87;
    chest.add(headPivot);
    this.limbs.headPivot = headPivot;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), skin);
    head.scale.set(1.0, 1.18, 0.96);
    head.position.y = 0.18;
    head.castShadow = true;
    headPivot.add(head);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), skin);
    jaw.position.set(0, -0.08, 0.03);
    headPivot.add(jaw);

    const forehead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), skin);
    forehead.position.set(0, 0.11, 0.08);
    headPivot.add(forehead);

    const earLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), skin);
    earLeft.position.set(-0.16, 0.1, 0.02);
    headPivot.add(earLeft);

    const earRight = earLeft.clone();
    earRight.position.x = 0.16;
    headPivot.add(earRight);

    const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.2, 12), this.theme === 'terrorist' ? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: 0x5d1f1c, roughness: 0.72 }));
    helmet.position.y = 0.28;
    helmet.scale.set(1.0, 0.9, 1.0);
    headPivot.add(helmet);

    const faceCover = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.07), gear);
    faceCover.position.set(0, -0.02, 0.14);
    headPivot.add(faceCover);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.07), darkArmor);
    goggles.position.set(0, 0.10, 0.15);
    headPivot.add(goggles);

    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-0.35, 0.72, 0.02);
    chest.add(leftShoulder);
    this.limbs.leftShoulder = leftShoulder;

    const leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.28, 10), armor);
    leftUpperArm.position.y = -0.17;
    leftUpperArm.rotation.z = 0.1;
    leftShoulder.add(leftUpperArm);

    const leftElbow = new THREE.Group();
    leftElbow.position.y = -0.34;
    leftShoulder.add(leftElbow);
    this.limbs.leftElbow = leftElbow;

    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.27, 10), armor);
    leftForearm.position.y = -0.16;
    leftElbow.add(leftForearm);

    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    leftHand.position.set(0, -0.33, 0.05);
    leftElbow.add(leftHand);
    this.limbs.leftHand = leftHand;

    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(0.35, 0.72, 0.02);
    chest.add(rightShoulder);
    this.limbs.rightShoulder = rightShoulder;

    const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.28, 10), armor);
    rightUpperArm.position.y = -0.17;
    rightUpperArm.rotation.z = -0.1;
    rightShoulder.add(rightUpperArm);

    const rightElbow = new THREE.Group();
    rightElbow.position.y = -0.34;
    rightShoulder.add(rightElbow);
    this.limbs.rightElbow = rightElbow;

    const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.27, 10), armor);
    rightForearm.position.y = -0.16;
    rightElbow.add(rightForearm);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), skin);
    rightHand.position.set(0, -0.33, 0.05);
    rightElbow.add(rightHand);
    this.limbs.rightHand = rightHand;

    const rifle = new THREE.Group();
    rifle.position.set(0.10, -0.20, 0.18);
    rifle.rotation.set(-0.12, 0.18, 0.12);
    rightElbow.add(rifle);
    this.limbs.weapon = rifle;

    const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.58), rifleMat);
    rifleBody.position.set(0, 0, 0.02);
    rifle.add(rifleBody);

    const rifleTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.42), gear);
    rifleTop.position.set(0, 0.08, 0.06);
    rifle.add(rifleTop);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 10), rifleMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.42);
    rifle.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), pouches);
    mag.position.set(0, -0.12, 0.18);
    mag.rotation.x = -0.15;
    rifle.add(mag);

    const leftLegRoot = new THREE.Group();
    leftLegRoot.position.set(-0.16, 0.05, 0);
    hips.add(leftLegRoot);
    this.limbs.leftLegRoot = leftLegRoot;

    const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 10), cloth);
    leftThigh.position.y = -0.22;
    leftLegRoot.add(leftThigh);

    const leftKnee = new THREE.Group();
    leftKnee.position.y = -0.42;
    leftLegRoot.add(leftKnee);
    this.limbs.leftKnee = leftKnee;

    const leftCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.30, 10), cloth);
    leftCalf.position.y = -0.18;
    leftKnee.add(leftCalf);

    const leftBoot = new THREE.Group();
    leftBoot.position.set(0.02, -0.38, 0.06);
    leftKnee.add(leftBoot);
    this.limbs.leftBoot = leftBoot;

    const leftBootBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), boot);
    leftBootBody.position.y = -0.02;
    leftBootBody.rotation.x = 0.02;
    leftBoot.add(leftBootBody);

    const leftToe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.14), boot);
    leftToe.position.set(0, 0.02, 0.13);
    leftBoot.add(leftToe);

    const rightLegRoot = new THREE.Group();
    rightLegRoot.position.set(0.16, 0.05, 0);
    hips.add(rightLegRoot);
    this.limbs.rightLegRoot = rightLegRoot;

    const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 10), cloth);
    rightThigh.position.y = -0.22;
    rightLegRoot.add(rightThigh);

    const rightKnee = new THREE.Group();
    rightKnee.position.y = -0.42;
    rightLegRoot.add(rightKnee);
    this.limbs.rightKnee = rightKnee;

    const rightCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.30, 10), cloth);
    rightCalf.position.y = -0.18;
    rightKnee.add(rightCalf);

    const rightBoot = new THREE.Group();
    rightBoot.position.set(-0.02, -0.38, 0.06);
    rightKnee.add(rightBoot);
    this.limbs.rightBoot = rightBoot;

    const rightBootBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), boot);
    rightBootBody.position.y = -0.02;
    rightBootBody.rotation.x = 0.02;
    rightBoot.add(rightBootBody);

    const rightToe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.14), boot);
    rightToe.position.set(0, 0.02, 0.13);
    rightBoot.add(rightToe);

    this.group.rotation.y = 0;
    this.group.position.y = 0;
  }

  update(dt, isMoving = false, aimYaw = 0) {
    this.animTime += dt;

    const stride = Math.sin(this.animTime * (isMoving ? 9 : 2.4));
    const bob = isMoving ? Math.abs(Math.sin(this.animTime * 9)) * 0.08 : Math.sin(this.animTime * 2.4) * 0.025;

    if (this.limbs.hips) {
      this.limbs.hips.position.y = 0.92 + bob;
      this.limbs.hips.rotation.z = isMoving ? stride * 0.04 : 0;
    }

    if (this.limbs.leftLegRoot) this.limbs.leftLegRoot.rotation.x = isMoving ? -stride * 0.9 : 0;
    if (this.limbs.rightLegRoot) this.limbs.rightLegRoot.rotation.x = isMoving ? stride * 0.9 : 0;

    if (this.limbs.leftKnee) this.limbs.leftKnee.rotation.x = isMoving ? 0.45 + stride * 0.25 : 0.06;
    if (this.limbs.rightKnee) this.limbs.rightKnee.rotation.x = isMoving ? -0.45 - stride * 0.25 : -0.06;

    if (this.limbs.leftBoot) this.limbs.leftBoot.rotation.x = isMoving ? 0.26 + stride * 0.14 : 0.08;
    if (this.limbs.rightBoot) this.limbs.rightBoot.rotation.x = isMoving ? -0.26 - stride * 0.14 : -0.08;

    if (this.limbs.leftShoulder) this.limbs.leftShoulder.rotation.x = isMoving ? -stride * 0.8 : 0;
    if (this.limbs.rightShoulder) this.limbs.rightShoulder.rotation.x = isMoving ? stride * 0.8 : 0;

    if (this.limbs.leftElbow) this.limbs.leftElbow.rotation.x = isMoving ? 0.35 - stride * 0.2 : 0.1;
    if (this.limbs.rightElbow) this.limbs.rightElbow.rotation.x = isMoving ? -0.35 + stride * 0.2 : -0.1;

    if (this.limbs.spine) {
      this.limbs.spine.rotation.z = isMoving ? stride * 0.05 : 0;
      this.limbs.spine.rotation.x = isMoving ? Math.sin(this.animTime * 9) * 0.05 : 0.02;
    }

    if (this.limbs.headPivot) {
      this.limbs.headPivot.rotation.y = aimYaw * 0.22;
      this.limbs.headPivot.rotation.x = Math.sin(this.animTime * 3.6) * 0.04;
    }

    if (this.limbs.weapon) {
      this.limbs.weapon.rotation.z = isMoving ? Math.sin(this.animTime * 9) * 0.05 : 0.12;
      this.limbs.weapon.rotation.x = isMoving ? -0.12 + stride * 0.08 : -0.08;
    }
  }
}

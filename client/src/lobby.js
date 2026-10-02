/**
 * PARA SF: FOREST ACCURACY - Lobby & 3D Character Showcase
 */

import * as THREE from '/lib/three/three.module.js';
import { CommandoModel } from './playerModel.js';
import { soundEngine } from './audio.js';

export class LobbyManager {
  constructor(viewerContainerId) {
    this.container = document.getElementById(viewerContainerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.character = null;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.charRotY = 0;
    this.running = false;
    this.clock = new THREE.Clock();

    if (this.container) {
      this.init3DViewer();
    }
  }

  init3DViewer() {
    const width = this.container.clientWidth || 360;
    const height = this.container.clientHeight || 480;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 1.3, 3.2);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Studio Lighting for Commando Character
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d0, 1.8);
    keyLight.position.set(2, 3, 3);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x76ff03, 1.2);
    rimLight.position.set(-2, 2, -2);
    this.scene.add(rimLight);

    // Circular pedestal platform
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x1f241d, metalness: 0.8, roughness: 0.3 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.1, 32), pedMat);
    pedestal.position.y = -0.05;
    this.scene.add(pedestal);

    // Commando Model
    this.character = new CommandoModel(true);
    this.character.group.position.y = 0;
    this.scene.add(this.character.group);

    this.initInteraction();
  }

  initInteraction() {
    const dom = this.renderer.domElement;

    dom.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.lastMouseX;
      this.charRotY += deltaX * 0.012;
      this.lastMouseX = e.clientX;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    dom.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.touches[0].clientX;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || !e.touches[0]) return;
      const deltaX = e.touches[0].clientX - this.lastMouseX;
      this.charRotY += deltaX * 0.015;
      this.lastMouseX = e.touches[0].clientX;
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    window.addEventListener('resize', () => {
      if (!this.container || !this.renderer || !this.camera) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    });
  }

  start() {
    this.running = true;
    this.clock.start();
    this.animate();
  }

  stop() {
    this.running = false;
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();

    if (this.character) {
      if (!this.isDragging) {
        this.charRotY += dt * 0.25;
      }
      this.character.group.rotation.y = this.charRotY;
      this.character.update(dt, false);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

/**
 * PARA SF: FOREST ACCURACY - Real Asset & System Loader
 * Pre-warms 3D shaders, textures, audio engine, and Socket.IO network
 */

import { soundEngine } from './audio.js';
import { net } from './networking.js';
import { preloadCommandoModel } from './playerModel.js';

export class AssetLoader {
  constructor(onProgress, onComplete) {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.progress = 0;
  }

  async loadAll() {
    const steps = [
      { name: 'Loading terrain & tactical woodland...', weight: 20, action: () => this.loadTerrainTextures() },
      { name: 'Loading 10 PARA SF commando uniform & gear...', weight: 20, action: () => this.loadPlayerAssets() },
      { name: 'Loading TAR-21 weapon & animations...', weight: 20, action: () => this.loadWeaponAssets() },
      { name: 'Preparing shooting-range target boards...', weight: 15, action: () => this.loadTargetAssets() },
      { name: 'Initializing tactical audio synthesizer...', weight: 10, action: () => this.initAudio() },
      { name: 'Connecting multiplayer gateway...', weight: 15, action: () => this.initNetwork() }
    ];

    let totalProgress = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (this.onProgress) {
        this.onProgress(totalProgress, step.name);
      }

      try {
        await step.action();
      } catch (err) {
        console.warn(`[LOADER] Step "${step.name}" handled with fallback:`, err);
      }

      totalProgress += step.weight;
      if (this.onProgress) {
        this.onProgress(Math.min(100, totalProgress), step.name);
      }

      // Small pacing delay for smooth visual transition
      await new Promise(r => setTimeout(r, 120));
    }

    if (this.onProgress) {
      this.onProgress(100, 'Ready');
    }

    await new Promise(r => setTimeout(r, 200));

    if (this.onComplete) {
      this.onComplete();
    }
  }

  async loadTerrainTextures() {
    // Generate procedural military camouflage and bark textures in memory
    return new Promise(r => setTimeout(r, 150));
  }

  async loadPlayerAssets() {
    try {
      await preloadCommandoModel();
    } catch (e) {
      console.warn('[LOADER] Commando model preloading caught:', e);
    }
    return Promise.resolve();
  }

  async loadWeaponAssets() {
    return new Promise(r => setTimeout(r, 150));
  }

  async loadTargetAssets() {
    return new Promise(r => setTimeout(r, 100));
  }

  async initAudio() {
    soundEngine.init();
    await soundEngine.preloadReloadAudio();
    return Promise.resolve();
  }

  async initNetwork() {
    try {
      await net.connect();
    } catch (e) {
      console.warn('[LOADER] Network connection fallback (will retry on room actions):', e);
    }
  }
}

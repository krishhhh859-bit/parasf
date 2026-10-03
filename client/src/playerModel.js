/**
 * PARA SF: FOREST ACCURACY - Real 3D Humanoid Commando Model System
 * Loads, normalizes, rigs, and animates realistic .glb humanoid character models.
 */

import * as THREE from '/lib/three/three.module.js';
import { GLTFLoader } from '/lib/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '/lib/three/examples/jsm/utils/SkeletonUtils.js';

export const COMMANDO_MODEL_PATH = '/assets/models/player/a_solider_poin_weapon.glb';
export const CANDIDATE_MODEL_PATHS = [
  '/assets/models/player/a_solider_poin_weapon.glb',
  '/assets/models/player/commando.glb',
  '/assets/models/player/player/a_solider_poin_weapon.glb'
];

/**
 * Centralized Humanoid Asset Manager
 * Loads and caches the humanoid .glb template so local, remote, and lobby players
 * share memory and clone hierarchies efficiently via SkeletonUtils.
 */
class HumanoidAssetManager {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.loader = new GLTFLoader();
    this.listeners = new Set();

    // Register PBR specular-glossiness compatibility plugin
    try {
      this.loader.register((parser) => ({
        name: 'KHR_materials_pbrSpecularGlossiness',
        extendMaterialParams: (materialIndex, materialParams) => {
          const materialDef = parser.json.materials[materialIndex];
          if (!materialDef.extensions || !materialDef.extensions.KHR_materials_pbrSpecularGlossiness) {
            return Promise.resolve();
          }
          const ext = materialDef.extensions.KHR_materials_pbrSpecularGlossiness;
          const pending = [];
          if (ext.diffuseTexture) {
            pending.push(parser.assignTexture(materialParams, 'map', ext.diffuseTexture));
          }
          if (ext.diffuseFactor) {
            materialParams.color = new THREE.Color().fromArray(ext.diffuseFactor);
          }
          materialParams.roughness = 0.7;
          materialParams.metalness = 0.1;
          return Promise.all(pending);
        }
      }));
    } catch (e) {
      // Ignored if already registered
    }
  }

  async loadModel(url = COMMANDO_MODEL_PATH) {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url);
    }

    const tryLoad = (targetUrl) => {
      return new Promise((resolve, reject) => {
        this.loader.load(
          targetUrl,
          (gltf) => {
            console.log(`[HUMANOID LOADER] Successfully loaded humanoid GLTF model from ${targetUrl}`);

            // 1. Traverse and configure materials & shadows
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                  child.material.side = THREE.DoubleSide;
                  if (child.material.map) {
                    child.material.map.colorSpace = THREE.SRGBColorSpace;
                  }
                }
              }
            });

            // 2. Compute exact bounding box of the unscaled model
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = new THREE.Vector3();
            box.getSize(size);
            const rawHeight = size.y || 1.8;

            // Target height: standard realistic human height ~1.80m (matching GAME_CONFIG.PLAYER.HEIGHT = 1.7-1.8)
            const TARGET_HEIGHT = 1.80;
            const scaleFactor = rawHeight > 0.001 ? (TARGET_HEIGHT / rawHeight) : 1.0;

            // Ground offset: align soles of boots to y = 0
            const minY = box.min.y;

            const modelData = {
              gltf,
              scene: gltf.scene,
              animations: gltf.animations || [],
              scaleFactor,
              groundOffsetY: -minY * scaleFactor,
              isLoaded: true
            };

            this.cache.set(url, modelData);
            if (targetUrl !== url) {
              this.cache.set(targetUrl, modelData);
            }
            this.notifyListeners(url, modelData);
            resolve(modelData);
          },
          undefined,
          (err) => reject(err)
        );
      });
    };

    const p = (async () => {
      // Try primary url first
      try {
        return await tryLoad(url);
      } catch (err) {
        console.warn(`[HUMANOID LOADER] Failed to load "${url}". Trying candidate fallbacks...`);
      }

      // Try candidates
      for (const fallbackUrl of CANDIDATE_MODEL_PATHS) {
        if (fallbackUrl === url) continue;
        try {
          return await tryLoad(fallbackUrl);
        } catch (e) {
          // Continue to next candidate
        }
      }

      console.warn(`[HUMANOID LOADER] Notice: No humanoid GLB found across candidate paths.`);
      return null;
    })();

    this.loadingPromises.set(url, p);
    return p;
  }

  addListener(fn) {
    this.listeners.add(fn);
  }

  removeListener(fn) {
    this.listeners.delete(fn);
  }

  notifyListeners(url, modelData) {
    for (const fn of this.listeners) {
      try {
        fn(url, modelData);
      } catch (e) {
        console.error('[HUMANOID LOADER] Listener notification error:', e);
      }
    }
  }
}

export const humanoidAssetManager = new HumanoidAssetManager();

export async function preloadCommandoModel(url = COMMANDO_MODEL_PATH) {
  return humanoidAssetManager.loadModel(url);
}

/**
 * CommandoModel
 * Represents a full humanoid character instance (local player, remote opponent, or lobby showcase).
 * Automatically instantiates the loaded .glb model via SkeletonUtils cloning.
 */
export class CommandoModel {
  constructor(isThirdPerson = false, theme = 'commando', modelUrl = COMMANDO_MODEL_PATH) {
    this.isThirdPerson = isThirdPerson;
    this.theme = theme;
    this.modelUrl = modelUrl;

    this.group = new THREE.Group();
    this.group.name = `humanoid-character-${theme}`;

    // Avatar hierarchy container for the humanoid skinned mesh
    this.avatar = new THREE.Group();
    this.avatar.name = 'humanoid-avatar-root';
    this.group.add(this.avatar);

    this.isLoaded = false;
    this.mixer = null;
    this.actions = {};
    this.currentActionName = null;
    this.bones = {};
    this.animTime = 0;

    // Tactical loading presence marker (clean ground stance circle & heading arrow, NO primitive body shapes)
    this.placeholder = this._createLoadingIndicator();
    this.group.add(this.placeholder);

    this._onAssetLoaded = (url, data) => {
      if (url === this.modelUrl && !this.isLoaded && data) {
        this._instantiateModel(data);
      }
    };
    humanoidAssetManager.addListener(this._onAssetLoaded);

    // Initial check in case model is already cached
    const cached = humanoidAssetManager.cache.get(this.modelUrl);
    if (cached) {
      this._instantiateModel(cached);
    } else {
      humanoidAssetManager.loadModel(this.modelUrl);
    }
  }

  _createLoadingIndicator() {
    const group = new THREE.Group();
    group.name = 'tactical-presence-marker';

    // Thin tactical ground stance circle (diameter ~0.7m)
    const ringGeo = new THREE.RingGeometry(0.32, 0.36, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.theme === 'terrorist' ? 0xff4444 : 0x76ff03,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02;
    group.add(ring);

    // Direction arrow on ground showing look direction
    const arrowGeo = new THREE.ConeGeometry(0.08, 0.2, 16);
    arrowGeo.rotateX(-Math.PI / 2);
    const arrow = new THREE.Mesh(arrowGeo, ringMat);
    arrow.position.set(0, 0.02, -0.42);
    group.add(arrow);

    return group;
  }

  _instantiateModel(modelData) {
    if (this.isLoaded || !modelData || !modelData.scene) return;

    // 1. Remove loading indicator
    if (this.placeholder) {
      this.group.remove(this.placeholder);
      this.placeholder.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.placeholder = null;
    }

    // 2. Clone skinned hierarchy using SkeletonUtils to ensure unique bones & animations
    const clonedScene = SkeletonUtils.clone(modelData.scene);
    clonedScene.name = 'humanoid-model-instance';

    // 3. Apply normalized scaling and ground alignment
    const scale = modelData.scaleFactor || 1.0;
    clonedScene.scale.set(scale, scale, scale);
    clonedScene.position.y = modelData.groundOffsetY || 0;

    // Face forward (-Z) matching player look direction.
    // The raw soldier model faces +Z natively, so rotate 180 deg (Math.PI)
    clonedScene.rotation.y = Math.PI;

    // 4. Discover bones and skinned meshes
    this.bones = {};
    clonedScene.traverse((child) => {
      if (child.isBone) {
        const name = child.name.toLowerCase();
        if (name.includes('head')) this.bones.head = child;
        else if (name.includes('neck')) this.bones.neck = child;
        else if (name.includes('spine')) this.bones.spine = child;
        else if (name.includes('hips') || name.includes('pelvis')) this.bones.hips = child;
      }
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // 5. Setup AnimationMixer
    if (modelData.animations && modelData.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(clonedScene);
      this.actions = {};

      modelData.animations.forEach((clip) => {
        const action = this.mixer.clipAction(clip);
        this.actions[clip.name.toLowerCase()] = action;
      });

      // Find idle action or default to first animation
      const idleKey = Object.keys(this.actions).find(k => k.includes('idle')) || Object.keys(this.actions)[0];
      if (idleKey && this.actions[idleKey]) {
        this.currentActionName = idleKey;
        this.actions[idleKey].play();
      }
    }

    // 6. Attach to avatar container
    this.avatar.add(clonedScene);
    this.isLoaded = true;

    console.log(`[PLAYER MODEL] Humanoid model successfully attached to ${this.group.name}. Animations available: ${Object.keys(this.actions).length}`);
  }

  update(dt, isMoving = false, aimYaw = 0) {
    this.animTime += dt;

    if (this.mixer) {
      this.mixer.update(dt);

      // Animation transition between idle and move if actions exist
      const moveKey = Object.keys(this.actions).find(k => k.includes('walk') || k.includes('run') || k.includes('move'));
      const idleKey = Object.keys(this.actions).find(k => k.includes('idle')) || Object.keys(this.actions)[0];

      if (isMoving && moveKey && this.actions[moveKey] && this.currentActionName !== moveKey) {
        if (this.currentActionName && this.actions[this.currentActionName]) {
          this.actions[this.currentActionName].fadeOut(0.2);
        }
        this.actions[moveKey].reset().fadeIn(0.2).play();
        this.currentActionName = moveKey;
      } else if (!isMoving && idleKey && this.actions[idleKey] && this.currentActionName !== idleKey) {
        if (this.currentActionName && this.actions[this.currentActionName]) {
          this.actions[this.currentActionName].fadeOut(0.2);
        }
        this.actions[idleKey].reset().fadeIn(0.2).play();
        this.currentActionName = idleKey;
      }
    } else if (this.avatar) {
      // Subtle tactical breathing idle sway to make the humanoid character feel alive
      const breath = Math.sin(this.animTime * 2.0) * 0.0025;
      this.avatar.position.y = breath;
    }

    // Subtly align head/spine if bones are available
    if (this.bones.head && Number.isFinite(aimYaw)) {
      this.bones.head.rotation.y = aimYaw * 0.15;
    }
  }

  dispose() {
    humanoidAssetManager.removeListener(this._onAssetLoaded);
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.avatar);
      this.mixer = null;
    }
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}

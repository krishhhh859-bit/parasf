/**
 * PARA SF: FOREST ACCURACY - High-Performance Camera & Finger-Gun Aim System
 * 
 * Architecture:
 * 1. GAME RENDER LOOP (Full 60+ FPS):
 *    - Reads latest decoupled hand tracking snapshot
 *    - Applies delta-time-aware exponential smoothing & deadzone
 *    - Updates Three.js camera rotation (Order: YXZ)
 *    - Manages hold-to-fire trigger respecting weapon cooldown and ammo state
 *    - Execution cost: < 0.05ms per frame (zero GPU/CPU stalling)
 * 
 * 2. SEPARATE HAND TRACKING PIPELINE (Worker or Throttled Asynchronous Loop):
 *    - Runs MediaPipe Tasks Vision HandLandmarker entirely in a dedicated Web Worker
 *      (or throttled fallback), completely off the Three.js main thread.
 *    - Controlled inference frequency: ~30 updates/sec.
 *    - Strict non-overlapping mutex guard (never queues or backlogs frames).
 *    - Lightweight 320x240 frame processing.
 *    - 3D perspective-invariant multi-landmark hand geometry.
 *    - Dual-threshold hysteresis trigger (HOLD-TO-FIRE) with temporal confirmation.
 *    - Stable palm-knuckle center of mass aiming anchor.
 *    - DOM cache guard (Zero layout recalculations on steady frames).
 */

import { GAME_CONFIG } from './config.js';

export const CameraAimState = {
  OFF: 'OFF',
  INITIALIZING: 'INITIALIZING',
  WAITING_FOR_HAND: 'WAITING_FOR_HAND',
  AIMING: 'AIMING',
  FIRING: 'FIRING',
  LOST: 'LOST'
};

export class CameraAimController {
  constructor(camera, getControls, onShoot) {
    this.camera = camera;
    this.getControls = getControls; // Returns active PCControls or MobileControls
    this.onShoot = onShoot;         // Calls game.handleShoot(), returns boolean

    // Explicit state machine
    this.state = CameraAimState.OFF;
    this.isActive = false;
    this.isSupported = !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );

    // Media & Hardware streams
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.canvasCtx = null;

    // Worker & Landmarker
    this.worker = null;
    this.useWorker = false;
    this.directLandmarker = null;

    // Decoupled Tracking Loop Management
    this.trackingActive = false;
    this.isInferring = false;
    this.lastInferenceTime = 0;
    this.lastVideoTime = -1;
    this.videoCallbackId = null;
    this.videoTimerId = null;
    this.inferenceTargetInterval = 33; // ~30 FPS throttled inference

    // Latest thread-safe tracking snapshot (read by Game Render Loop)
    this.latestSnapshot = {
      hasHand: false,
      isFingerGun: false,
      thumbDown: false,
      aimX: 0.5,
      aimY: 0.5,
      timestamp: 0
    };

    // Temporal Confirmation Filters (Section 15, 20)
    this.temporal = {
      poseValidStreak: 0,
      poseInvalidStreak: 0,
      thumbDownStreak: 0,
      thumbUpStreak: 0,
      confirmedFingerGun: false,
      confirmedThumbDown: false
    };

    // Weapon Fire Rate & Ammo Safety (Section 12, 16, 17, 18)
    this.fireInterval = (GAME_CONFIG?.WEAPON?.FIRE_RATE_MS || 110) / 1000; // 0.11s
    this.fireCooldown = 0;
    this.emptyAmmoTriggered = false; // When ammo is 0 or reloading, halt firing attempts until re-arm

    // Calibration & Coordinate Reference (Section 8, 9, 10, 11)
    this.hasNeutralReference = false;
    this.calibratedX = 0.5;
    this.calibratedY = 0.5;
    this.baseYaw = 0;
    this.basePitch = 0;
    this.currentYawOffset = 0;
    this.currentPitchOffset = 0;
    this.yaw = 0;
    this.pitch = 0;

    // Tuning Parameters
    this.sensitivity = 2.4;       // Angular deflection multiplier
    this.deadzone = 0.022;        // Neutral center deadzone radius
    this.smoothingSpeed = 22;     // Exponential smoothing rate per second (frame-independent)

    // System coordination
    this.wasGyroActive = false;

    // Performance Diagnostics (Section 23)
    this.diagnostics = {
      gameFps: 60,
      handFps: 30,
      inferenceMs: 0,
      skippedInferences: 0,
      renderFrameCount: 0,
      inferenceFrameCount: 0,
      lastFpsLogTime: performance.now()
    };

    // DOM Caching (Section 5 - Zero per-frame DOM work)
    this.domCache = {
      badgeText: '',
      badgeState: '',
      toggleLabelText: '',
      diagText: ''
    };

    // UI Element Cache
    this.dom = {
      toggleBtn: document.getElementById('btn-camera-aim-toggle'),
      toggleLabel: document.getElementById('camera-aim-toggle-label'),
      mobileToggleBtn: document.getElementById('btn-mobile-camera-aim-toggle'),
      mobileToggleLabel: document.getElementById('mobile-camera-aim-toggle-label'),
      previewBox: document.getElementById('camera-aim-preview-box'),
      video: document.getElementById('camera-aim-video'),
      canvas: document.getElementById('camera-aim-canvas'),
      poseBadge: document.getElementById('camera-aim-pose-badge'),
      diag: document.getElementById('camera-aim-diag'),
      calibrateBtn: document.getElementById('btn-camera-aim-calibrate'),
      calibrateLabel: document.getElementById('camera-calib-label'),
      stopBtn: document.getElementById('btn-camera-aim-stop'),
      alert: document.getElementById('camera-aim-alert')
    };

    this._calibTimer = null;
    this._alertTimer = null;

    this.initUIListeners();
  }

  initUIListeners() {
    const handleToggle = async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      await this.toggle();
    };

    if (this.dom.toggleBtn) {
      this.dom.toggleBtn.addEventListener('click', handleToggle);
      this.dom.toggleBtn.addEventListener('touchstart', handleToggle, { passive: false });
    }

    if (this.dom.mobileToggleBtn) {
      this.dom.mobileToggleBtn.addEventListener('click', handleToggle);
      this.dom.mobileToggleBtn.addEventListener('touchstart', handleToggle, { passive: false });
    }

    if (this.dom.stopBtn) {
      const handleStop = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.stop();
      };
      this.dom.stopBtn.addEventListener('click', handleStop);
      this.dom.stopBtn.addEventListener('touchstart', handleStop, { passive: false });
    }

    if (this.dom.calibrateBtn) {
      const handleCalib = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.calibrate();
      };
      this.dom.calibrateBtn.addEventListener('click', handleCalib);
      this.dom.calibrateBtn.addEventListener('touchstart', handleCalib, { passive: false });
    }
  }

  async toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      await this.start();
    }
  }

  async start() {
    if (this.isActive) return;

    if (!this.isSupported) {
      this.showAlert('CAMERA AIM NOT SUPPORTED');
      console.warn('[CAMERA AIM] getUserMedia API not supported in this browser.');
      return;
    }

    this.state = CameraAimState.INITIALIZING;
    this.updateToggleUI(true, 'STARTING CAMERA...');

    // 1. Request Webcam Permission & Lightweight Video Stream (Section 4)
    try {
      const constraints = {
        video: {
          facingMode: 'user', // Selfie on mobile, default on PC
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('[CAMERA AIM] Webcam permission denied or device busy:', err);
      this.showAlert('CAMERA ACCESS DENIED');
      this.stop();
      return;
    }

    // 2. Connect Video Stream & Canvas
    this.video = this.dom.video;
    this.canvas = this.dom.canvas;
    if (this.canvas) {
      this.canvasCtx = this.canvas.getContext('2d', { alpha: true });
    }

    if (this.video) {
      this.video.srcObject = this.stream;
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve).catch(resolve);
        };
      });
    }

    // 3. Initialize Tracking Pipeline (Web Worker with fallback to Direct)
    this.updateToggleUI(true, 'INITIALIZING TRACKER...');
    const workerSuccess = await this.initWorkerPipeline();
    if (!workerSuccess) {
      console.log('[CAMERA AIM] Falling back to direct main-thread landmarker.');
      await this.initDirectPipeline();
    }

    // 4. Coordinate camera controls priority (Section 26)
    const controls = this.getControls ? this.getControls() : null;
    if (controls) {
      if (controls.gyroActive && typeof controls.disableGyro === 'function') {
        this.wasGyroActive = true;
        controls.disableGyro();
        console.log('[CAMERA AIM] Temporarily paused mobile gyro aiming.');
      } else {
        this.wasGyroActive = false;
      }
      controls.isCameraAimActive = true;

      this.baseYaw = controls.yaw || 0;
      this.basePitch = controls.pitch || 0;
      this.yaw = this.baseYaw;
      this.pitch = this.basePitch;
    } else if (this.camera) {
      this.baseYaw = this.camera.rotation.y || 0;
      this.basePitch = this.camera.rotation.x || 0;
      this.yaw = this.baseYaw;
      this.pitch = this.basePitch;
    }

    // Reset runtime state
    this.currentYawOffset = 0;
    this.currentPitchOffset = 0;
    this.hasNeutralReference = false;
    this.fireCooldown = 0;
    this.emptyAmmoTriggered = false;
    this.state = CameraAimState.WAITING_FOR_HAND;

    // Reset temporal filters
    this.temporal.poseValidStreak = 0;
    this.temporal.poseInvalidStreak = 0;
    this.temporal.thumbDownStreak = 0;
    this.temporal.thumbUpStreak = 0;
    this.temporal.confirmedFingerGun = false;
    this.temporal.confirmedThumbDown = false;

    // 5. Activate state and show UI
    this.isActive = true;
    this.updateToggleUI(true, 'CAMERA AIM: ON');
    if (this.dom.previewBox) {
      this.dom.previewBox.classList.remove('hidden');
    }
    this.updatePoseBadge('PLACE HAND IN FINGER-GUN POSE', 'tracking');

    // 6. Launch Throttled Asynchronous Tracking Loop (Section 1, 3)
    this.startTrackingLoop();
    console.log(`[CAMERA AIM] Active using ${this.useWorker ? 'Web Worker (Zero Main-Thread Load)' : 'Direct Fallback'}.`);
  }

  /**
   * Initializes the Web Worker to run MediaPipe entirely off the main thread.
   */
  async initWorkerPipeline() {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      return false;
    }

    return new Promise((resolve) => {
      try {
        const worker = new Worker('/src/cameraAimWorker.js', { type: 'module' });
        let resolved = false;

        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.warn('[CAMERA AIM] Web Worker initialization timed out, using fallback.');
            try { worker.terminate(); } catch (_) {}
            resolve(false);
          }
        }, 5000);

        worker.onmessage = (e) => {
          const msg = e.data;
          if (!msg) return;

          if (msg.type === 'INIT_OK') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              this.worker = worker;
              this.useWorker = true;
              resolve(true);
            }
          } else if (msg.type === 'INIT_ERROR') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              try { worker.terminate(); } catch (_) {}
              resolve(false);
            }
          } else if (msg.type === 'RESULT') {
            this.isInferring = false;
            this.handleInferenceResult(msg.landmarks, msg.worldLandmarks, msg.inferenceMs);
          }
        };

        worker.onerror = (err) => {
          console.warn('[CAMERA AIM] Web Worker error:', err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            try { worker.terminate(); } catch (_) {}
            resolve(false);
          }
        };

        worker.postMessage({
          type: 'INIT',
          wasmPath: '/lib/mediapipe/wasm',
          modelPath: '/assets/models/hand_landmarker.task'
        });
      } catch (err) {
        console.warn('[CAMERA AIM] Failed to create Web Worker:', err);
        resolve(false);
      }
    });
  }

  /**
   * Fallback: Initializes MediaPipe directly on main thread if Worker is unavailable.
   */
  async initDirectPipeline() {
    this.useWorker = false;
    if (this.directLandmarker) return;

    let FilesetResolver, HandLandmarker;
    try {
      const vision = await import('@mediapipe/tasks-vision');
      FilesetResolver = vision.FilesetResolver;
      HandLandmarker = vision.HandLandmarker;
    } catch (_) {
      const vision = await import('/lib/mediapipe/vision_bundle.mjs');
      FilesetResolver = vision.FilesetResolver;
      HandLandmarker = vision.HandLandmarker;
    }

    let visionFileset;
    try {
      visionFileset = await FilesetResolver.forVisionTasks('/lib/mediapipe/wasm');
    } catch (_) {
      visionFileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    }

    const options = {
      baseOptions: {
        modelAssetPath: '/assets/models/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.50
    };

    try {
      this.directLandmarker = await HandLandmarker.createFromOptions(visionFileset, options);
    } catch (gpuErr) {
      options.baseOptions.delegate = 'CPU';
      this.directLandmarker = await HandLandmarker.createFromOptions(visionFileset, options);
    }
  }

  stop() {
    if (!this.isActive && !this.stream) return;

    // 1. Terminate decoupled tracking loop
    this.trackingActive = false;
    this.isInferring = false;

    if (this.videoCallbackId && this.video && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.videoCallbackId);
      this.videoCallbackId = null;
    }
    if (this.videoTimerId) {
      clearTimeout(this.videoTimerId);
      this.videoTimerId = null;
    }

    // 2. Terminate Web Worker if running
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLOSE' });
        this.worker.terminate();
      } catch (_) {}
      this.worker = null;
      this.useWorker = false;
    }

    // 3. Stop and release webcam media tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }

    // 4. Restore camera controls priority
    const controls = this.getControls ? this.getControls() : null;
    if (controls) {
      controls.isCameraAimActive = false;
      controls.yaw = this.yaw;
      controls.pitch = this.pitch;

      if (this.wasGyroActive && typeof controls.enableGyro === 'function') {
        controls.enableGyro();
        console.log('[CAMERA AIM] Restored previous mobile gyro aiming.');
        this.wasGyroActive = false;
      }
    }

    this.isActive = false;
    this.state = CameraAimState.OFF;
    this.hasNeutralReference = false;
    this.latestSnapshot.hasHand = false;
    this.latestSnapshot.isFingerGun = false;
    this.latestSnapshot.thumbDown = false;
    this.fireCooldown = 0;
    this.emptyAmmoTriggered = false;

    // 5. Update UI
    this.updateToggleUI(false, 'CAMERA AIM: OFF');
    if (this.dom.previewBox) {
      this.dom.previewBox.classList.add('hidden');
    }
    this.clearCanvas();
    console.log('[CAMERA AIM] Camera Aim stopped & resources fully released.');
  }

  /**
   * Section 1 & 3: Throttled, non-blocking asynchronous Hand Tracking Loop
   * Completely independent of the Three.js render loop.
   */
  startTrackingLoop() {
    this.trackingActive = true;
    this.isInferring = false;
    this.lastInferenceTime = 0;

    const runInferenceCycle = () => {
      if (!this.trackingActive || !this.video) return;

      const now = performance.now();

      // Check throttling interval (~33ms = 30 FPS) & ensure NO overlapping inference (Section 3)
      if (!this.isInferring && (now - this.lastInferenceTime >= this.inferenceTargetInterval)) {
        if (this.video.readyState >= 2 && !this.video.paused) {
          const videoTime = this.video.currentTime;
          if (videoTime !== this.lastVideoTime) {
            this.lastVideoTime = videoTime;
            this.isInferring = true;
            this.lastInferenceTime = now;

            if (this.useWorker && this.worker) {
              // Primary path: Transfer zero-copy ImageBitmap to Web Worker
              createImageBitmap(this.video, { resizeWidth: 320, resizeHeight: 240 })
                .then((bitmap) => {
                  if (!this.trackingActive || !this.worker) {
                    bitmap.close();
                    this.isInferring = false;
                    return;
                  }
                  this.worker.postMessage({ type: 'INFER', bitmap, timestamp: now }, [bitmap]);
                })
                .catch(() => {
                  this.isInferring = false;
                });
            } else if (this.directLandmarker) {
              // Fallback path: Direct main-thread landmarker
              try {
                const t0 = performance.now();
                const results = this.directLandmarker.detectForVideo(this.video, now);
                const inferenceMs = performance.now() - t0;
                this.handleInferenceResult(results.landmarks, results.worldLandmarks, inferenceMs);
              } catch (_) {
                // Graceful frame skip
              } finally {
                this.isInferring = false;
              }
            } else {
              this.isInferring = false;
            }
          }
        }
      } else if (this.isInferring) {
        this.diagnostics.skippedInferences++;
      }

      // Schedule next check via hardware video frame callback or 16ms fallback
      if (this.trackingActive && this.video) {
        if ('requestVideoFrameCallback' in this.video) {
          this.videoCallbackId = this.video.requestVideoFrameCallback(runInferenceCycle);
        } else {
          this.videoTimerId = setTimeout(runInferenceCycle, 16);
        }
      }
    };

    if (this.video) {
      if ('requestVideoFrameCallback' in this.video) {
        this.videoCallbackId = this.video.requestVideoFrameCallback(runInferenceCycle);
      } else {
        this.videoTimerId = setTimeout(runInferenceCycle, 16);
      }
    }
  }

  /**
   * Section 6, 7, 13, 14, 15, 20: Processes landmarks and updates gesture state
   */
  handleInferenceResult(landmarks, worldLandmarks, inferenceMs) {
    this.diagnostics.inferenceMs = inferenceMs;
    this.diagnostics.inferenceFrameCount++;

    if (!landmarks || landmarks.length === 0 || !landmarks[0] || landmarks[0].length < 21) {
      // Hand lost (Section 19)
      this.temporal.poseValidStreak = 0;
      this.temporal.poseInvalidStreak++;

      if (this.temporal.poseInvalidStreak >= 3) {
        this.temporal.confirmedFingerGun = false;
        this.temporal.confirmedThumbDown = false;
        this.latestSnapshot.hasHand = false;
        this.latestSnapshot.isFingerGun = false;
        this.latestSnapshot.thumbDown = false;
        this.hasNeutralReference = false; // Reset so returning hand re-anchors cleanly
        this.state = CameraAimState.LOST;
        this.updatePoseBadge('HAND NOT DETECTED', 'not-detected');
        this.clearCanvas();
      }
      return;
    }

    const rawLm = landmarks[0];
    const metricLm = (worldLandmarks && worldLandmarks[0] && worldLandmarks[0].length >= 21)
      ? worldLandmarks[0]
      : rawLm;

    this.latestSnapshot.hasHand = true;
    this.temporal.poseInvalidStreak = 0;

    // 1. Analyze 3D perspective-invariant hand geometry
    const analysis = this.analyzeHandGeometry(metricLm, rawLm);

    // 2. Temporal Confirmation Filter for Finger-Gun Pose (Section 20)
    if (analysis.rawIsFingerGun) {
      this.temporal.poseValidStreak++;
      if (this.temporal.poseValidStreak >= 2) {
        this.temporal.confirmedFingerGun = true;
      }
    } else {
      this.temporal.poseValidStreak = 0;
      this.temporal.poseInvalidStreak++;
      if (this.temporal.poseInvalidStreak >= 4) {
        this.temporal.confirmedFingerGun = false;
      }
    }

    // 3. Temporal Confirmation Filter for Thumb Trigger with Hysteresis (Section 12, 14, 15)
    // Hysteresis: DOWN below 0.46, RELEASE above 0.58
    const THUMB_DOWN_THRESHOLD = 0.46;
    const THUMB_RELEASE_THRESHOLD = 0.58;

    if (this.temporal.confirmedFingerGun) {
      if (analysis.thumbMetric < THUMB_DOWN_THRESHOLD) {
        this.temporal.thumbDownStreak++;
        this.temporal.thumbUpStreak = 0;
        if (this.temporal.thumbDownStreak >= 2) {
          this.temporal.confirmedThumbDown = true;
        }
      } else if (analysis.thumbMetric > THUMB_RELEASE_THRESHOLD) {
        this.temporal.thumbUpStreak++;
        this.temporal.thumbDownStreak = 0;
        if (this.temporal.thumbUpStreak >= 2) {
          this.temporal.confirmedThumbDown = false;
        }
      }
    } else {
      // Finger-gun pose invalid -> immediately cancel thumb down (Section 19)
      this.temporal.confirmedThumbDown = false;
      this.temporal.thumbDownStreak = 0;
    }

    // 4. Update Thread-Safe Snapshot for Game Render Loop (Section 6)
    this.latestSnapshot.isFingerGun = this.temporal.confirmedFingerGun;
    this.latestSnapshot.thumbDown = this.temporal.confirmedThumbDown;
    this.latestSnapshot.aimX = analysis.aimX;
    this.latestSnapshot.aimY = analysis.aimY;
    this.latestSnapshot.timestamp = performance.now();

    // 5. Automatic Neutral Reference Capture upon first valid pose (Section 9)
    if (this.temporal.confirmedFingerGun && !this.hasNeutralReference) {
      this.calibrate(analysis.aimX, analysis.aimY, false);
      this.hasNeutralReference = true;
    }

    // 6. Update State Machine & Cached DOM Badges (Section 5, 21)
    if (this.temporal.confirmedFingerGun) {
      if (this.temporal.confirmedThumbDown) {
        this.state = CameraAimState.FIRING;
        this.updatePoseBadge('FINGER GUN: FIRING (HOLD)', 'fired');
      } else {
        this.state = CameraAimState.AIMING;
        this.updatePoseBadge('FINGER GUN: READY', 'ready');
      }
    } else {
      this.state = CameraAimState.WAITING_FOR_HAND;
      this.updatePoseBadge('FORM FINGER-GUN POSE', 'tracking');
    }

    // 7. Render Lightweight Preview Overlay
    this.drawPreviewOverlay(rawLm, this.temporal.confirmedFingerGun, this.temporal.confirmedThumbDown);
  }

  /**
   * Section 8, 13, 20: 3D perspective-invariant hand geometry analysis
   * @param {Array} metricLm - Landmarks for 3D metric calculations (worldLandmarks or 3D landmarks)
   * @param {Array} rawLm - Normalized 2D/3D landmarks in image space for aiming
   */
  analyzeHandGeometry(metricLm, rawLm) {
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

    // 3D palm length (Wrist 0 to Middle MCP 9) and palm width (Index MCP 5 to Pinky MCP 17)
    const palmLen = d3(metricLm[0], metricLm[9]) || 0.1;
    const palmWidth = d3(metricLm[5], metricLm[17]) || 0.08;
    const palmScale = (palmLen + palmWidth) * 0.5;

    // Section 8: Stable palm-knuckle center of mass aiming anchor
    // Uses center of Index MCP (5), Middle MCP (9), and Wrist (0)
    const rawAimX = (rawLm[5].x * 0.45 + rawLm[9].x * 0.35 + rawLm[0].x * 0.20);
    const rawAimY = (rawLm[5].y * 0.45 + rawLm[9].y * 0.35 + rawLm[0].y * 0.20);
    const aimX = 1.0 - rawAimX; // Mirrored so moving hand right turns camera right
    const aimY = rawAimY;       // Moving hand up decreases aimY (screen coords)

    // Palm longitudinal unit vector (Wrist 0 -> Middle MCP 9)
    const pLen = Math.hypot(
      metricLm[9].x - metricLm[0].x,
      metricLm[9].y - metricLm[0].y,
      (metricLm[9].z || 0) - (metricLm[0].z || 0)
    ) || 0.1;
    const uPalmX = (metricLm[9].x - metricLm[0].x) / pLen;
    const uPalmY = (metricLm[9].y - metricLm[0].y) / pLen;
    const uPalmZ = ((metricLm[9].z || 0) - (metricLm[0].z || 0)) / pLen;

    // Relative elevation of Thumb Tip (4) along palm axis relative to Index Knuckle (5)
    const relX = metricLm[4].x - metricLm[5].x;
    const relY = metricLm[4].y - metricLm[5].y;
    const relZ = (metricLm[4].z || 0) - (metricLm[5].z || 0);
    const thumbElevation = (relX * uPalmX + relY * uPalmY + relZ * uPalmZ) / palmScale;

    // 1. Index Finger Extended (Section 20):
    // Tip (8) further from wrist than PIP (6) AND extended forward past MCP (5)
    const indexDistWrist = d3(metricLm[8], metricLm[0]);
    const indexPipDistWrist = d3(metricLm[6], metricLm[0]);
    const indexLen = d3(metricLm[8], metricLm[5]);
    const indexExtended = (indexDistWrist > indexPipDistWrist * 1.08) &&
                          (indexLen > palmScale * 0.55);

    // 2. Ring Finger Curled (Section 20):
    // Tip (16) curled close to wrist or knuckle
    const ringDistWrist = d3(metricLm[16], metricLm[0]);
    const ringPipDistWrist = d3(metricLm[14], metricLm[0]);
    const ringDistMcp = d3(metricLm[16], metricLm[13]);
    const ringCurled = (ringDistWrist < ringPipDistWrist * 1.25) ||
                       (ringDistMcp < palmScale * 0.85);

    // 3. Pinky Finger Curled (Section 20):
    // Tip (20) curled close to wrist or knuckle
    const pinkyDistWrist = d3(metricLm[20], metricLm[0]);
    const pinkyPipDistWrist = d3(metricLm[18], metricLm[0]);
    const pinkyDistMcp = d3(metricLm[20], metricLm[17]);
    const pinkyCurled = (pinkyDistWrist < pinkyPipDistWrist * 1.25) ||
                        (pinkyDistMcp < palmScale * 0.85);

    // 4. Middle Finger: Tolerant (extended for 2-finger gun or curled for 1-finger gun)
    const rawIsFingerGun = indexExtended && ringCurled && pinkyCurled;

    // 5. Robust Multi-Landmark Thumb Geometry (Section 13):
    // Normalized 3D distance from Thumb Tip (4) to Index Knuckle (5) and Middle Knuckle (9)
    const distToIndexKnuckle = d3(metricLm[4], metricLm[5]) / palmScale;
    const distToMiddleKnuckle = d3(metricLm[4], metricLm[9]) / palmScale;

    // Combined metric: drops sharply when thumb presses down as a trigger
    const thumbMetric = (distToIndexKnuckle * 0.50) +
                        (distToMiddleKnuckle * 0.30) +
                        (Math.max(0, thumbElevation + 0.20) * 0.20);

    return {
      rawIsFingerGun,
      thumbMetric,
      aimX,
      aimY
    };
  }

  /**
   * Section 1, 8, 10, 11, 12, 16, 17, 18: Game Render Loop Update
   * Executed once per Three.js animation frame in game.animate().
   * Lightweight: < 0.05ms execution time.
   */
  update(dt) {
    if (!this.isActive) return;

    // 1. Performance Diagnostics Monitoring (1Hz update)
    this.diagnostics.renderFrameCount++;
    const now = performance.now();
    if (now - this.diagnostics.lastFpsLogTime >= 1000) {
      this.diagnostics.gameFps = this.diagnostics.renderFrameCount;
      this.diagnostics.handFps = this.diagnostics.inferenceFrameCount;
      this.diagnostics.renderFrameCount = 0;
      this.diagnostics.inferenceFrameCount = 0;
      this.diagnostics.lastFpsLogTime = now;
      this.updateDiagnosticsUI();
    }

    const snap = this.latestSnapshot;

    // 2. Camera Aiming: Relative hand displacement with deadzone & dt-aware smoothing
    if (this.hasNeutralReference && snap.hasHand) {
      const dx = snap.aimX - this.calibratedX;
      const dy = this.calibratedY - snap.aimY; // positive = hand moved UP

      // Deadzone around neutral calibration point (Section 11)
      let effDx = 0;
      if (Math.abs(dx) > this.deadzone) {
        effDx = Math.sign(dx) * (Math.abs(dx) - this.deadzone);
      }

      let effDy = 0;
      if (Math.abs(dy) > this.deadzone) {
        effDy = Math.sign(dy) * (Math.abs(dy) - this.deadzone);
      }

      // Directional Mapping (Section 8):
      // Hand LEFT  (effDx < 0) -> camera turns LEFT  (yaw increases)
      // Hand RIGHT (effDx > 0) -> camera turns RIGHT (yaw decreases)
      // Hand UP    (effDy > 0) -> camera looks UP    (pitch increases)
      // Hand DOWN  (effDy < 0) -> camera looks DOWN  (pitch decreases)
      const targetYawOffset = -effDx * this.sensitivity;
      const targetPitchOffset = effDy * this.sensitivity;

      // Frame-rate independent exponential smoothing (Section 10)
      const smoothFactor = Math.min(1.0, 1.0 - Math.exp(-dt * this.smoothingSpeed));
      this.currentYawOffset += (targetYawOffset - this.currentYawOffset) * smoothFactor;
      this.currentPitchOffset += (targetPitchOffset - this.currentPitchOffset) * smoothFactor;

      // Apply to Three.js camera rotation (Order: YXZ)
      this.yaw = this.baseYaw + this.currentYawOffset;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.basePitch + this.currentPitchOffset));

      if (this.camera) {
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
      }

      // Synchronize active controls
      const controls = this.getControls ? this.getControls() : null;
      if (controls) {
        controls.yaw = this.yaw;
        controls.pitch = this.pitch;
      }
    }

    // 3. PHYSICAL HOLD-TO-FIRE Weapon Trigger (Section 12, 16, 17, 18)
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (snap.isFingerGun && snap.thumbDown) {
      if (!this.emptyAmmoTriggered) {
        if (this.fireCooldown <= 0) {
          if (typeof this.onShoot === 'function') {
            const shotFired = this.onShoot();
            if (shotFired === false) {
              // Section 18: If ammo is 0 or reloading, halt firing attempts until trigger release
              this.emptyAmmoTriggered = true;
            } else {
              // Continuous fire at exact weapon fire rate (110ms)
              this.fireCooldown = this.fireInterval;
            }
          }
        }
      }
    } else {
      // Trigger released: re-arm weapon trigger
      this.emptyAmmoTriggered = false;
    }
  }

  calibrate(customX, customY, notify = true) {
    if (typeof customX === 'number' && typeof customY === 'number') {
      this.calibratedX = customX;
      this.calibratedY = customY;
    } else {
      this.calibratedX = this.latestSnapshot.aimX;
      this.calibratedY = this.latestSnapshot.aimY;
    }

    // Capture current camera angle as neutral center
    const controls = this.getControls ? this.getControls() : null;
    if (controls) {
      this.baseYaw = controls.yaw || 0;
      this.basePitch = controls.pitch || 0;
    } else if (this.camera) {
      this.baseYaw = this.camera.rotation.y || 0;
      this.basePitch = this.camera.rotation.x || 0;
    }

    this.currentYawOffset = 0;
    this.currentPitchOffset = 0;
    this.yaw = this.baseYaw;
    this.pitch = this.basePitch;
    this.hasNeutralReference = true;

    if (notify) {
      this.showAlert('HAND CALIBRATED');
      if (this.dom.calibrateLabel) {
        this.dom.calibrateLabel.textContent = '✓ CALIBRATED';
        clearTimeout(this._calibTimer);
        this._calibTimer = setTimeout(() => {
          if (this.dom.calibrateLabel) {
            this.dom.calibrateLabel.textContent = 'CALIBRATE HAND';
          }
        }, 1200);
      }
    }
  }

  /**
   * Section 4 & 5: Direct, lightweight canvas landmark rendering
   * Avoids reassigning canvas width/height on unchanged frames.
   */
  drawPreviewOverlay(lm, isFingerGun, isFiring) {
    if (!this.canvas || !this.canvasCtx || !this.video) return;

    const vw = this.video.videoWidth || 160;
    const vh = this.video.videoHeight || 120;
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.canvasCtx;

    ctx.clearRect(0, 0, w, h);

    // Save and mirror canvas drawing to match the mirrored video preview
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    const strokeColor = isFingerGun
      ? (isFiring ? '#ff1744' : '#76ff03')
      : '#00e5ff';

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = 2.0;

    // Finger-gun bones: Wrist -> Index MCP -> PIP -> DIP -> Tip
    const drawBone = (p1, p2) => {
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    };

    drawBone(lm[0], lm[5]);
    drawBone(lm[5], lm[6]);
    drawBone(lm[6], lm[7]);
    drawBone(lm[7], lm[8]);

    // Thumb bones: Wrist -> CMC -> MCP -> IP -> Tip
    drawBone(lm[0], lm[1]);
    drawBone(lm[1], lm[2]);
    drawBone(lm[2], lm[3]);
    drawBone(lm[3], lm[4]);

    // Pointing tip dot
    ctx.beginPath();
    ctx.arc(lm[8].x * w, lm[8].y * h, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Thumb trigger dot (Red when firing, Yellow when ready)
    ctx.fillStyle = isFiring ? '#ff1744' : '#ffea00';
    ctx.beginPath();
    ctx.arc(lm[4].x * w, lm[4].y * h, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  clearCanvas() {
    if (this.canvas && this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Section 5: Cached DOM updates (Zero DOM recalculation on unchanged frames)
   */
  updateToggleUI(active, text) {
    if (this.domCache.toggleLabelText !== text) {
      this.domCache.toggleLabelText = text;
      if (this.dom.toggleLabel) this.dom.toggleLabel.textContent = text;
      if (this.dom.mobileToggleLabel) this.dom.mobileToggleLabel.textContent = text;
    }
    if (this.dom.toggleBtn) this.dom.toggleBtn.classList.toggle('active', active);
    if (this.dom.mobileToggleBtn) this.dom.mobileToggleBtn.classList.toggle('active', active);
  }

  updatePoseBadge(text, state) {
    if (!this.dom.poseBadge) return;
    if (this.domCache.badgeText !== text || this.domCache.badgeState !== state) {
      this.domCache.badgeText = text;
      this.domCache.badgeState = state;
      this.dom.poseBadge.textContent = text;
      this.dom.poseBadge.className = `camera-aim-pose-badge badge-${state}`;
    }
  }

  updateDiagnosticsUI() {
    if (!this.dom.diag) return;
    const mode = this.useWorker ? 'WRK' : 'DIR';
    const text = `FPS: ${this.diagnostics.gameFps} · HAND: ${this.diagnostics.handFps} · ${Math.round(this.diagnostics.inferenceMs)}ms [${mode}]`;
    if (this.domCache.diagText !== text) {
      this.domCache.diagText = text;
      this.dom.diag.textContent = text;
    }
  }

  showAlert(message) {
    if (!this.dom.alert) return;
    this.dom.alert.textContent = message;
    this.dom.alert.classList.remove('hidden');

    clearTimeout(this._alertTimer);
    this._alertTimer = setTimeout(() => {
      if (this.dom.alert) {
        this.dom.alert.classList.add('hidden');
      }
    }, 2200);
  }

  /**
   * Section 23: Performance Diagnostics
   */
  getDiagnostics() {
    return {
      gameFps: this.diagnostics.gameFps,
      handFps: this.diagnostics.handFps,
      inferenceMs: Math.round(this.diagnostics.inferenceMs * 10) / 10,
      skippedInferences: this.diagnostics.skippedInferences,
      mode: this.useWorker ? 'worker' : 'direct'
    };
  }
}

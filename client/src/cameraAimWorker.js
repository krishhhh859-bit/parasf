/**
 * PARA SF: FOREST ACCURACY - High-Performance Camera Aim Web Worker
 * Runs MediaPipe HandLandmarker entirely off the main thread.
 * Guarantees zero stalls and full 60+ FPS for the Three.js render loop.
 */

import { FilesetResolver, HandLandmarker } from '/lib/mediapipe/vision_bundle.mjs';

let landmarker = null;
let isInitializing = false;

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg) return;

  switch (msg.type) {
    case 'INIT': {
      if (landmarker) {
        self.postMessage({ type: 'INIT_OK' });
        return;
      }
      if (isInitializing) return;
      isInitializing = true;

      try {
        const wasmPath = msg.wasmPath || '/lib/mediapipe/wasm';
        const modelPath = msg.modelPath || '/assets/models/hand_landmarker.task';

        const vision = await FilesetResolver.forVisionTasks(wasmPath);

        const options = {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.50
        };

        try {
          landmarker = await HandLandmarker.createFromOptions(vision, options);
          console.log('[WORKER] HandLandmarker initialized with GPU delegate.');
        } catch (gpuErr) {
          console.warn('[WORKER] GPU delegate failed, falling back to CPU:', gpuErr);
          options.baseOptions.delegate = 'CPU';
          landmarker = await HandLandmarker.createFromOptions(vision, options);
          console.log('[WORKER] HandLandmarker initialized with CPU delegate.');
        }

        isInitializing = false;
        self.postMessage({ type: 'INIT_OK' });
      } catch (err) {
        isInitializing = false;
        console.error('[WORKER] HandLandmarker initialization failed:', err);
        self.postMessage({ type: 'INIT_ERROR', error: String(err && err.message || err) });
      }
      break;
    }

    case 'INFER': {
      const bitmap = msg.bitmap;
      const timestamp = msg.timestamp || performance.now();

      if (!landmarker || !bitmap) {
        if (bitmap) {
          try { bitmap.close(); } catch (_) {}
        }
        self.postMessage({
          type: 'RESULT',
          landmarks: [],
          worldLandmarks: [],
          timestamp,
          inferenceMs: 0
        });
        return;
      }

      try {
        const t0 = performance.now();
        const results = landmarker.detectForVideo(bitmap, timestamp);
        const inferenceMs = performance.now() - t0;

        // Clean up the transferred ImageBitmap to prevent GPU memory leaks
        bitmap.close();

        self.postMessage({
          type: 'RESULT',
          landmarks: results.landmarks || [],
          worldLandmarks: results.worldLandmarks || [],
          timestamp,
          inferenceMs
        });
      } catch (err) {
        if (bitmap) {
          try { bitmap.close(); } catch (_) {}
        }
        self.postMessage({
          type: 'RESULT',
          landmarks: [],
          worldLandmarks: [],
          timestamp,
          inferenceMs: 0,
          error: String(err && err.message || err)
        });
      }
      break;
    }

    case 'CLOSE': {
      if (landmarker && typeof landmarker.close === 'function') {
        try { landmarker.close(); } catch (_) {}
      }
      landmarker = null;
      self.close();
      break;
    }
  }
};

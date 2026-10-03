// client/src/mobileControls.js

/**
 * MobileControls
 *
 * Handles:
 * - Touch look
 * - Touch shooting
 * - Scope
 * - Reload
 * - Mobile phone mode
 * - Fullscreen
 * - Landscape orientation
 * - Android DeviceOrientation / gyro aiming
 *
 * IMPORTANT:
 * The player remains fixed at the firing position.
 */

function isMobileDevice() {
  return (
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) ||
      (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0))
  );
}

async function enterFullscreen() {
  try {
    if (
      !document.fullscreenElement &&
      document.documentElement.requestFullscreen
    ) {
      await document.documentElement.requestFullscreen({
        navigationUI: 'hide'
      });
    }
  } catch (err) {
    console.warn('[MOBILE] Fullscreen request failed:', err);
  }
}

async function lockLandscape() {
  try {
    if (
      screen.orientation &&
      typeof screen.orientation.lock === 'function'
    ) {
      await screen.orientation.lock('landscape');
    }
  } catch (err) {
    console.warn('[MOBILE] Landscape lock unavailable:', err);
  }
}

async function enterPhoneMode() {
  document.body.classList.add('phone-mode');

  await enterFullscreen();
  await lockLandscape();

  window.dispatchEvent(
    new CustomEvent('phone-mode-enabled')
  );
}


/* ============================================================
   MOTION AIM
   ============================================================ */

class MotionAim {
  constructor() {
    this.isActive = false;
    this.permissionGranted = false;

    this.sensitivity = 1.15;
    this.smoothing = 0.2;
    this.deadzoneDeg = 0.2;

    this._alpha = 0;
    this._beta = 0;
    this._gamma = 0;

    this._calpha = 0;
    this._cbeta = 0;
    this._cgamma = 0;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    this._hasOrientation = false;
    this._needsCalibrate = true;

    this.onCalibrate = null;

    this._boundOrientation = this._onOrientation.bind(this);
  }

  async enable() {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      console.warn('[MOTION] DeviceOrientationEvent not supported on this device/browser.');
      return false;
    }

    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          console.warn('[MOTION] Permission denied');
          return false;
        }
      }

      window.removeEventListener(
        'deviceorientation',
        this._boundOrientation
      );

      this._needsCalibrate = true;
      this._hasOrientation = false;

      window.addEventListener(
        'deviceorientation',
        this._boundOrientation,
        { passive: true }
      );

      this.permissionGranted = true;
      this.isActive = true;

      return true;
    } catch (err) {
      console.error('[MOTION] Failed to enable:', err);
      return false;
    }
  }

  disable() {
    this.isActive = false;

    window.removeEventListener(
      'deviceorientation',
      this._boundOrientation
    );

    const panel = document.getElementById('gyro-debug-panel');
    if (panel) {
      panel.remove();
    }
  }

  _onOrientation(event) {
    if (event.beta == null || event.gamma == null) {
      return;
    }

    this._alpha = Number(event.alpha || 0);
    this._beta = Number(event.beta);
    this._gamma = Number(event.gamma);

    if (!this._hasOrientation || this._needsCalibrate) {
      this._calpha = this._alpha;
      this._cbeta = this._beta;
      this._cgamma = this._gamma;

      this._smoothYaw = 0;
      this._smoothPitch = 0;

      this._hasOrientation = true;
      this._needsCalibrate = false;

      if (typeof this.onCalibrate === 'function') {
        this.onCalibrate();
      }
      return;
    }

    this._updateDebug(this._alpha, this._beta, this._gamma);
  }

  calibrate() {
    if (!this._hasOrientation) {
      this._needsCalibrate = true;
      return;
    }

    this._calpha = this._alpha;
    this._cbeta = this._beta;
    this._cgamma = this._gamma;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    if (typeof this.onCalibrate === 'function') {
      this.onCalibrate();
    }
  }

  _wrapAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  getFrameOffset() {
    if (!this.isActive || !this._hasOrientation) {
      return {
        yawOffset: 0,
        pitchOffset: 0
      };
    }

    const dBeta = this._wrapAngle(this._beta - this._cbeta);
    const dGamma = this._wrapAngle(this._gamma - this._cgamma);

    let orientation = 0;
    if (
      screen.orientation &&
      Number.isFinite(screen.orientation.angle)
    ) {
      orientation = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      orientation = window.orientation;
    }

    orientation = ((orientation % 360) + 360) % 360;

    // Fallback: if browser locked into landscape but orientation.angle reports 0
    if (
      orientation === 0 &&
      typeof window !== 'undefined' &&
      window.innerWidth > window.innerHeight
    ) {
      orientation = 90;
    }

    let yawDeg = 0;
    let pitchDeg = 0;

    /*
     * Android DeviceOrientation axes:
     * - beta:  rotation around device short axis (X)
     * - gamma: rotation around device long axis (Y)
     *
     * In LANDSCAPE PRIMARY (orientation === 90, phone rotated 90 deg CCW):
     * - Long axis (Y) is horizontal across the screen. Tilting phone up/down
     *   rotates around Y -> pitch is controlled by dGamma.
     *   Tilting phone up decreases gamma, so pitchDeg = -dGamma (up = look up).
     * - Short axis (X) is vertical. Rotating phone left/right turns around X
     *   -> yaw is controlled by dBeta.
     *   Rotating right decreases beta, so yawDeg = dBeta (right = look right).
     *
     * In LANDSCAPE SECONDARY (orientation === 270, phone rotated 90 deg CW):
     * - Both physical axes are inverted 180 deg relative to landscape primary:
     *   yawDeg = -dBeta
     *   pitchDeg = dGamma
     *
     * In PORTRAIT (orientation === 0):
     * - beta is front/back tilt (pitch): pitchDeg = dBeta
     * - gamma is left/right roll (yaw): yawDeg = -dGamma
     *
     * In PORTRAIT UPSIDE DOWN (orientation === 180):
     *   yawDeg = dGamma
     *   pitchDeg = -dBeta
     */
    if (orientation === 90) {
      yawDeg = dBeta;
      pitchDeg = -dGamma;
    } else if (orientation === 270) {
      yawDeg = -dBeta;
      pitchDeg = dGamma;
    } else if (orientation === 180) {
      yawDeg = dGamma;
      pitchDeg = -dBeta;
    } else {
      yawDeg = -dGamma;
      pitchDeg = dBeta;
    }

    /*
     * Deadzone filter to suppress sensor micro-tremor when holding still
     */
    if (Math.abs(yawDeg) < this.deadzoneDeg) {
      yawDeg = 0;
    }
    if (Math.abs(pitchDeg) < this.deadzoneDeg) {
      pitchDeg = 0;
    }

    const DEG2RAD = Math.PI / 180;
    const targetYaw = yawDeg * DEG2RAD * this.sensitivity;
    const targetPitch = pitchDeg * DEG2RAD * this.sensitivity;

    /*
     * Smooth sensor movement
     */
    this._smoothYaw += (targetYaw - this._smoothYaw) * this.smoothing;
    this._smoothPitch += (targetPitch - this._smoothPitch) * this.smoothing;

    return {
      yawOffset: this._smoothYaw,
      pitchOffset: this._smoothPitch
    };
  }

  _updateDebug(alpha, beta, gamma) {
    if (
      typeof document === 'undefined' ||
      typeof document.getElementById !== 'function' ||
      typeof document.createElement !== 'function'
    ) {
      return;
    }

    let panel = document.getElementById('gyro-debug-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'gyro-debug-panel';
      panel.style.position = 'fixed';
      panel.style.left = '10px';
      panel.style.bottom = '10px';
      panel.style.zIndex = '999999';
      panel.style.padding = '6px 10px';
      panel.style.background = 'rgba(0,0,0,0.7)';
      panel.style.color = '#00ff88';
      panel.style.fontFamily = 'monospace';
      panel.style.fontSize = '11px';
      panel.style.lineHeight = '1.3';
      panel.style.borderRadius = '5px';
      panel.style.pointerEvents = 'none';
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(panel);
      }
    }

    let orientation = 0;
    if (screen.orientation && Number.isFinite(screen.orientation.angle)) {
      orientation = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      orientation = window.orientation;
    }
    if (orientation === 0 && typeof window !== 'undefined' && window.innerWidth > window.innerHeight) {
      orientation = 90;
    }

    panel.innerHTML =
      `GYRO (orient: ${orientation}°)<br>` +
      `β: ${beta.toFixed(1)}° | γ: ${gamma.toFixed(1)}°<br>` +
      `yaw: ${(this._smoothYaw * 180 / Math.PI).toFixed(1)}° | pitch: ${(this._smoothPitch * 180 / Math.PI).toFixed(1)}°`;
  }
}


/* ============================================================
   MOBILE CONTROLS
   ============================================================ */

export class MobileControls {
  constructor(camera, playerPositionOrShoot, callbacksOrScope = {}, onAim, onReload) {
    this.camera = camera;

    if (typeof playerPositionOrShoot === 'function') {
      this.playerPosition = null;
      this.callbacks = {
        onShoot: playerPositionOrShoot,
        onScope: callbacksOrScope,
        onAim: onAim,
        onReload: onReload
      };
    } else {
      this.playerPosition = playerPositionOrShoot;
      this.callbacks = callbacksOrScope || {};
    }

    this.enabled = false;

    this.yaw = 0;
    this.pitch = 0;

    this._motionBaseYaw = 0;
    this._motionBasePitch = 0;

    this.lookTouchId = null;
    this.lastTouchX = 0;
    this.lastTouchY = 0;

    this.lookSensitivity = 0.004;

    this.motionAim = new MotionAim();
    this.motionAim.onCalibrate = () => {
      this._motionBaseYaw = this.yaw;
      this._motionBasePitch = this.pitch;
    };

    this._shooting = false;
    this._scoping = false;
    this._aiming = false;

    this._setupTouchControls();
    this._setupPhoneMode();
    this._setupUIButtons();

    /*
     * First interaction activates phone mode.
     */
    if (isMobileDevice()) {
      const activate = async () => {
        await enterPhoneMode();
      };

      window.addEventListener(
        'pointerdown',
        activate,
        {
          once: true,
          passive: true
        }
      );
    }
  }


  /* ==========================================================
     PHONE MODE
     ========================================================== */

  _setupPhoneMode() {
    window.addEventListener(
      'phone-mode-enabled',
      () => {
        document.body.classList.add(
          'phone-mode'
        );
      }
    );
  }


  /* ==========================================================
     ENABLE / DISABLE
     ========================================================== */

  async enable() {
    this.enabled = true;

    document.body.classList.add(
      'mobile-controls-enabled'
    );

    const layer = document.getElementById('mobile-controls-layer');
    if (layer) {
      layer.style.display = 'block';
    }

    if (isMobileDevice()) {
      await enterPhoneMode();
    }

    return true;
  }

  disable() {
    this.enabled = false;

    document.body.classList.remove(
      'mobile-controls-enabled'
    );

    const layer = document.getElementById('mobile-controls-layer');
    if (layer) {
      layer.style.display = 'none';
    }

    this.motionAim.disable();
  }


  /* ==========================================================
     MOTION AIM
     ========================================================== */

  async enableMotionAim() {
    await enterPhoneMode();

    const success = await this.motionAim.enable();

    if (success) {
      this.motionAim.calibrate();
      this._motionBaseYaw = this.yaw;
      this._motionBasePitch = this.pitch;

      console.log('[MOBILE] Motion aim ready.');
    }

    return success;
  }


  /* ==========================================================
     UI BUTTONS SETUP
     ========================================================== */

  _setupUIButtons() {
    const btnShoot = document.getElementById('btn-mobile-shoot');
    if (btnShoot) {
      const startFiring = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startShoot();
        if (navigator.vibrate) {
          navigator.vibrate(20);
        }
      };
      const stopFiring = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.stopShoot();
      };
      btnShoot.addEventListener('touchstart', startFiring, { passive: false });
      btnShoot.addEventListener('touchend', stopFiring, { passive: false });
      btnShoot.addEventListener('touchcancel', stopFiring, { passive: false });
      btnShoot.addEventListener('mousedown', startFiring);
      btnShoot.addEventListener('mouseup', stopFiring);
    }

    const btnScope = document.getElementById('btn-mobile-scope');
    if (btnScope) {
      const toggleScope = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._scoping) {
          this.stopScope();
          btnScope.classList.remove('active');
        } else {
          this.startScope();
          btnScope.classList.add('active');
        }
      };
      btnScope.addEventListener('touchstart', toggleScope, { passive: false });
      btnScope.addEventListener('click', toggleScope);
    }

    const btnAim = document.getElementById('btn-mobile-aim');
    if (btnAim) {
      const toggleAim = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._aiming = !this._aiming;
        btnAim.classList.toggle('active', this._aiming);
        if (typeof this.callbacks.onAim === 'function') {
          this.callbacks.onAim(this._aiming);
        }
      };
      btnAim.addEventListener('touchstart', toggleAim, { passive: false });
      btnAim.addEventListener('click', toggleAim);
    }

    const btnReload = document.getElementById('btn-mobile-reload');
    if (btnReload) {
      const doReload = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.reload();
      };
      btnReload.addEventListener('touchstart', doReload, { passive: false });
      btnReload.addEventListener('click', doReload);
    }

    const btnToggle = document.getElementById('btn-motion-aim-toggle');
    const btnCalibrate = document.getElementById('btn-motion-calibrate');
    const sensRow = document.getElementById('motion-sens-row');
    const statusBadge = document.getElementById('motion-aim-status');
    const toggleLabel = document.getElementById('motion-aim-toggle-label');

    if (btnToggle) {
      const toggleMotion = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.motionAim.isActive) {
          this.motionAim.disable();
          if (btnCalibrate) btnCalibrate.style.display = 'none';
          if (sensRow) sensRow.style.display = 'none';
          if (statusBadge) statusBadge.style.display = 'none';
          btnToggle.classList.remove('active');
          if (toggleLabel) toggleLabel.textContent = '📱 MOTION AIM';
        } else {
          const success = await this.enableMotionAim();
          if (success) {
            if (btnCalibrate) btnCalibrate.style.display = 'flex';
            if (sensRow) sensRow.style.display = 'flex';
            if (statusBadge) statusBadge.style.display = 'block';
            btnToggle.classList.add('active');
            if (toggleLabel) toggleLabel.textContent = '📱 MOTION ON';
          }
        }
      };
      btnToggle.addEventListener('touchstart', toggleMotion, { passive: false });
      btnToggle.addEventListener('click', toggleMotion);
    }

    if (btnCalibrate) {
      const doCalibrate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.motionAim.calibrate();
        this._motionBaseYaw = this.yaw;
        this._motionBasePitch = this.pitch;
        if (navigator.vibrate) {
          navigator.vibrate(15);
        }
      };
      btnCalibrate.addEventListener('touchstart', doCalibrate, { passive: false });
      btnCalibrate.addEventListener('click', doCalibrate);
    }

    const sensSlider = document.getElementById('motion-sensitivity-slider');
    if (sensSlider) {
      sensSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (Number.isFinite(val)) {
          this.motionAim.sensitivity = Math.max(0.2, Math.min(4.0, val));
        }
      });
    }
  }


  /* ==========================================================
     TOUCH CONTROLS
     ========================================================== */

  _setupTouchControls() {
    window.addEventListener(
      'touchstart',
      this._onTouchStart.bind(this),
      {
        passive: false
      }
    );

    window.addEventListener(
      'touchmove',
      this._onTouchMove.bind(this),
      {
        passive: false
      }
    );

    window.addEventListener(
      'touchend',
      this._onTouchEnd.bind(this),
      {
        passive: false
      }
    );

    window.addEventListener(
      'touchcancel',
      this._onTouchEnd.bind(this),
      {
        passive: false
      }
    );
  }


  _onTouchStart(event) {
    if (!this.enabled) return;

    for (const touch of event.changedTouches) {
      /*
       * Ignore touches on UI controls.
       */
      const target =
        document.elementFromPoint(
          touch.clientX,
          touch.clientY
        );

      if (
        target &&
        target.closest &&
        target.closest(
          'button, input, select, textarea, .mobile-ui, .mobile-buttons-cluster, .motion-aim-controls'
        )
      ) {
        continue;
      }

      /*
       * Use the right side as the look area.
       */
      if (
        touch.clientX >
        window.innerWidth * 0.35
      ) {
        this.lookTouchId =
          touch.identifier;

        this.lastTouchX =
          touch.clientX;

        this.lastTouchY =
          touch.clientY;
      }
    }
  }


  _onTouchMove(event) {
    if (!this.enabled) return;

    if (this.lookTouchId === null) {
      return;
    }

    for (const touch of event.changedTouches) {
      if (
        touch.identifier !==
        this.lookTouchId
      ) {
        continue;
      }

      const dx =
        touch.clientX -
        this.lastTouchX;

      const dy =
        touch.clientY -
        this.lastTouchY;

      this.lastTouchX =
        touch.clientX;

      this.lastTouchY =
        touch.clientY;

      /*
       * Touch look still works even
       * if motion aim is enabled.
       */
      this.yaw -=
        dx *
        this.lookSensitivity;

      this.pitch -=
        dy *
        this.lookSensitivity;

      this.pitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            this.pitch
          )
        );

      // Keep motion aim base aligned with touch drag so gyro builds upon touch
      this._motionBaseYaw -=
        dx *
        this.lookSensitivity;

      this._motionBasePitch -=
        dy *
        this.lookSensitivity;

      this._motionBasePitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            this._motionBasePitch
          )
        );

      event.preventDefault();
    }
  }


  _onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      if (
        touch.identifier ===
        this.lookTouchId
      ) {
        this.lookTouchId = null;
      }
    }
  }


  /* ==========================================================
     UPDATE
     ========================================================== */

  update(dt, playerPosition) {
    if (!this.enabled) return { isMoving: false };

    /*
     * Motion aiming.
     */
    if (this.motionAim.isActive) {
      const {
        yawOffset,
        pitchOffset
      } =
        this.motionAim.getFrameOffset();

      this.yaw =
        this._motionBaseYaw +
        yawOffset;

      this.pitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            this._motionBasePitch + pitchOffset
          )
        );
    }

    /*
     * Camera rotation.
     */
    this.camera.rotation.order =
      'YXZ';

    this.camera.rotation.y =
      this.yaw;

    this.camera.rotation.x =
      this.pitch;

    /*
     * PLAYER MUST REMAIN FIXED.
     * Only the camera rotates.
     */
    const pos =
      playerPosition ||
      (this.playerPosition && typeof this.playerPosition.copy === 'function'
        ? this.playerPosition
        : null);

    if (pos) {
      this.camera.position.copy(pos);

      if (
        typeof GAME_CONFIG !== 'undefined' &&
        GAME_CONFIG.PLAYER &&
        Number.isFinite(GAME_CONFIG.PLAYER.HEIGHT)
      ) {
        this.camera.position.y =
          GAME_CONFIG.PLAYER.HEIGHT;
      }
    }

    return { isMoving: false };
  }


  /* ==========================================================
     SHOOT
     ========================================================== */

  startShoot() {
    if (this._shooting) return;

    this._shooting = true;

    if (
      typeof this.callbacks.onShoot ===
      'function'
    ) {
      this.callbacks.onShoot();
    }
  }


  stopShoot() {
    this._shooting = false;

    if (
      typeof this.callbacks.onStopShoot ===
      'function'
    ) {
      this.callbacks.onStopShoot();
    }
  }


  /* ==========================================================
     SCOPE
     ========================================================== */

  startScope() {
    if (this._scoping) return;

    this._scoping = true;

    if (
      typeof this.callbacks.onScope ===
      'function'
    ) {
      this.callbacks.onScope(true);
    }
  }


  stopScope() {
    this._scoping = false;

    if (
      typeof this.callbacks.onScope ===
      'function'
    ) {
      this.callbacks.onScope(false);
    }
  }


  /* ==========================================================
     RELOAD
     ========================================================== */

  reload() {
    if (
      typeof this.callbacks.onReload ===
      'function'
    ) {
      this.callbacks.onReload();
    }
  }


  /* ==========================================================
     PHONE UI
     ========================================================== */

  show() {
    this.enabled = true;

    document.body.classList.add(
      'mobile-controls-visible'
    );

    document.body.classList.add(
      'phone-mode'
    );

    const layer = document.getElementById('mobile-controls-layer');
    if (layer) {
      layer.style.display = 'block';
    }
  }


  hide() {
    this.enabled = false;

    document.body.classList.remove(
      'mobile-controls-visible'
    );

    const layer = document.getElementById('mobile-controls-layer');
    if (layer) {
      layer.style.display = 'none';
    }

    this.motionAim.disable();
  }
}


/* ============================================================
   GLOBAL PHONE MODE ACTIVATION
   ============================================================ */

if (isMobileDevice()) {

  const activatePhoneMode =
    async () => {
      await enterPhoneMode();
    };

  window.addEventListener(
    'touchstart',
    activatePhoneMode,
    {
      once: true,
      passive: true
    }
  );

  window.addEventListener(
    'pointerdown',
    activatePhoneMode,
    {
      once: true,
      passive: true
    }
  );
}


/* ============================================================
   GLOBAL ACCESS
   ============================================================ */

export {
  MotionAim,
  enterPhoneMode,
  enterFullscreen,
  lockLandscape
};
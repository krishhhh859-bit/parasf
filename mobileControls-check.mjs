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
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window)
  );
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
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

  window.dispatchEvent(new CustomEvent('phone-mode-enabled'));
}


/* ============================================================
   MOTION AIM
   ============================================================ */

class MotionAim {
  constructor() {
    this.isActive = false;
    this.permissionGranted = false;

    this.sensitivity = 1.0;
    this.smoothing = 0.18;

    this._boundOrientation =
      this._onOrientation.bind(this);

    // Current device quaternion
    this._deviceQuat = {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    };

    // Reference orientation when motion aim starts
    this._referenceQuat = {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    };

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    this._hasOrientation = false;
  }

  async enable() {
    if (!isMobileDevice()) {
      return false;
    }

    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== 'granted') {
          console.warn('[MOTION] Permission denied');
          return false;
        }
      }

      window.removeEventListener(
        'deviceorientation',
        this._boundOrientation
      );

      window.addEventListener(
        'deviceorientation',
        this._boundOrientation,
        { passive: true }
      );

      this.permissionGranted = true;
      this.isActive = true;

      return true;
    } catch (err) {
      console.error(
        '[MOTION] Failed to enable:',
        err
      );

      return false;
    }
  }

  disable() {
    this.isActive = false;

    window.removeEventListener(
      'deviceorientation',
      this._boundOrientation
    );
  }

  _onOrientation(event) {
    if (
      event.alpha == null ||
      event.beta == null ||
      event.gamma == null
    ) {
      return;
    }

    const alpha =
      event.alpha * Math.PI / 180;

    const beta =
      event.beta * Math.PI / 180;

    const gamma =
      event.gamma * Math.PI / 180;

    const screenAngle =
      (
        screen.orientation &&
        Number.isFinite(screen.orientation.angle)
      )
        ? screen.orientation.angle * Math.PI / 180
        : 0;

    /*
     * DeviceOrientation → quaternion
     *
     * This follows the browser DeviceOrientation
     * coordinate system rather than treating beta/gamma
     * as independent game axes.
     */

    const cA = Math.cos(alpha / 2);
    const sA = Math.sin(alpha / 2);

    const cB = Math.cos(beta / 2);
    const sB = Math.sin(beta / 2);

    const cG = Math.cos(gamma / 2);
    const sG = Math.sin(gamma / 2);

    const cO = Math.cos(-screenAngle / 2);
    const sO = Math.sin(-screenAngle / 2);

    /*
     * Z-X'-Y'' device orientation quaternion.
     */
    let x =
      sB * cG * cA -
      cB * sG * sA;

    let y =
      cB * sG * cA +
      sB * cG * sA;

    let z =
      cB * cG * sA -
      sB * sG * cA;

    let w =
      cB * cG * cA +
      sB * sG * sA;

    /*
     * Correct for the device's screen orientation.
     */
    const qx = x;
    const qy = y;
    const qz = z;
    const qw = w;

    x =
      qx * cO -
      qy * sO;

    y =
      qx * sO +
      qy * cO;

    z = qz;
    w = qw;

    /*
     * Normalize.
     */
    const length =
      Math.hypot(x, y, z, w);

    if (length > 0) {
      x /= length;
      y /= length;
      z /= length;
      w /= length;
    }

    this._deviceQuat = {
      x,
      y,
      z,
      w
    };

    this._hasOrientation = true;
  }

  calibrate() {
    if (!this._hasOrientation) {
      return;
    }

    this._referenceQuat = {
      x: this._deviceQuat.x,
      y: this._deviceQuat.y,
      z: this._deviceQuat.z,
      w: this._deviceQuat.w
    };

    this._smoothYaw = 0;
    this._smoothPitch = 0;
  }

  _multiply(a, b) {
    return {
      x:
        a.w * b.x +
        a.x * b.w +
        a.y * b.z -
        a.z * b.y,

      y:
        a.w * b.y -
        a.x * b.z +
        a.y * b.w +
        a.z * b.x,

      z:
        a.w * b.z +
        a.x * b.y -
        a.y * b.x +
        a.z * b.w,

      w:
        a.w * b.w -
        a.x * b.x -
        a.y * b.y -
        a.z * b.z
    };
  }

  _inverse(q) {
    return {
      x: -q.x,
      y: -q.y,
      z: -q.z,
      w: q.w
    };
  }

  _clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }

  getFrameOffset() {
    if (
      !this.isActive ||
      !this._hasOrientation
    ) {
      return {
        yawOffset: 0,
        pitchOffset: 0
      };
    }

    /*
     * Relative rotation:
     *
     * reference^-1 × current
     */
    const relative =
      this._multiply(
        this._inverse(
          this._referenceQuat
        ),
        this._deviceQuat
      );

    /*
     * Convert quaternion → Euler angles.
     *
     * yaw = rotation around vertical axis
     * pitch = rotation around horizontal axis
     */

    const sinPitch =
      2 *
      (
        relative.w * relative.x -
        relative.z * relative.y
      );

    const pitch =
      Math.asin(
        this._clamp(
          sinPitch,
          -1,
          1
        )
      );

    const yaw =
      Math.atan2(
        2 *
        (
          relative.w * relative.y +
          relative.x * relative.z
        ),

        1 -
        2 *
        (
          relative.x * relative.x +
          relative.y * relative.y
        )
      );

    /*
     * Keep the direction intuitive:
     *
     * Phone right  → camera right
     * Phone left   → camera left
     * Phone up     → camera up
     * Phone down   → camera down
     */

    const targetYaw =
      yaw * this.sensitivity;

    const targetPitch =
      pitch * this.sensitivity;

    this._smoothYaw +=
      (
        targetYaw -
        this._smoothYaw
      ) * this.smoothing;

    this._smoothPitch +=
      (
        targetPitch -
        this._smoothPitch
      ) * this.smoothing;

    return {
      yawOffset: this._smoothYaw,
      pitchOffset: this._smoothPitch
    };
  }
}


/* ============================================================
   MOBILE CONTROLS
   ============================================================ */

export class MobileControls {
  constructor(camera, playerPosition, callbacks = {}) {
    this.camera = camera;
    this.playerPosition = playerPosition;

    this.callbacks = callbacks;

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

    this._shooting = false;
    this._scoping = false;

    this._setupTouchControls();
    this._setupPhoneMode();

    /*
     * First interaction activates phone mode.
     *
     * Fullscreen still requires a user gesture.
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
     ENABLE
     ========================================================== */

  async enable() {
    this.enabled = true;

    document.body.classList.add(
      'mobile-controls-enabled'
    );

    if (isMobileDevice()) {
      await enterPhoneMode();
    }

    return true;
  }


  disable() {
    this.enabled = false;

    this.motionAim.disable();
  }


  /* ==========================================================
     MOTION AIM BUTTON
     ========================================================== */

  async enableMotionAim() {
    await enterPhoneMode();

    const success =
      await this.motionAim.enable();

    if (success) {
      this.motionAim.calibrate();

      this._motionBaseYaw =
        this.yaw;

      this._motionBasePitch =
        this.pitch;

      console.log(
        '[MOBILE] Motion aim ready.'
      );
    }

    return success;
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
          'button, input, select, textarea, .mobile-ui'
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
       * Touch look still works even if
       * motion aim is enabled.
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

  update() {
    if (!this.enabled) return;

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
        this._motionBasePitch +
        pitchOffset;

      this.pitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            this.pitch
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
     *
     * Only the camera rotates.
     */
    if (this.playerPosition) {
      this.camera.position.copy(
        this.playerPosition
      );

      if (
        typeof GAME_CONFIG !==
        'undefined' &&
        GAME_CONFIG.PLAYER &&
        Number.isFinite(
          GAME_CONFIG.PLAYER.HEIGHT
        )
      ) {
        this.camera.position.y =
          GAME_CONFIG.PLAYER.HEIGHT;
      }
    }
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
  }


  hide() {
    this.enabled = false;

    document.body.classList.remove(
      'mobile-controls-visible'
    );
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
};// client/src/mobileControls.js

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
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window)
  );
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
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

  window.dispatchEvent(new CustomEvent('phone-mode-enabled'));
}


/* ============================================================
   MOTION AIM
   ============================================================ */

class MotionAim {
  constructor() {
    this.isActive = false;
    this.permissionGranted = false;

    this._alpha = 0;
    this._beta = 0;
    this._gamma = 0;

    this._calpha = 0;
    this._cbeta = 0;
    this._cgamma = 0;

    this._lastTime = 0;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    this.sensitivity = 1.15;
    this.smoothing = 0.18;
    this.deadzoneDeg = 0.8;

    this._boundOrientation = this._onOrientation.bind(this);
  }

  async enable() {
    if (!isMobileDevice()) {
      console.log('[MOTION] Not a mobile device.');
      return false;
    }

    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== 'granted') {
          console.warn('[MOTION] Permission denied.');
          return false;
        }
      }

      this.permissionGranted = true;

      window.removeEventListener(
        'deviceorientation',
        this._boundOrientation
      );

      window.addEventListener(
        'deviceorientation',
        this._boundOrientation,
        { passive: true }
      );

      this.isActive = true;

      console.log('[MOTION] Motion aiming enabled.');

      return true;
    } catch (err) {
      console.error('[MOTION] Enable failed:', err);
      return false;
    }
  }

  disable() {
    this.isActive = false;

    window.removeEventListener(
      'deviceorientation',
      this._boundOrientation
    );
  }

  _onOrientation(event) {
    if (event.alpha != null) {
      this._alpha = Number(event.alpha);
    }

    if (event.beta != null) {
      this._beta = Number(event.beta);
    }

    if (event.gamma != null) {
      this._gamma = Number(event.gamma);
    }

    /*
     * LIVE DIAGNOSTIC
     *
     * This is intentionally visible on the phone so we don't
     * have to use Android Chrome DevTools.
     */
    this._updateDebug(
      this._alpha,
      this._beta,
      this._gamma
    );

    if (!this._lastTime) {
      this._lastTime = performance.now();

      this._calpha = this._alpha;
      this._cbeta = this._beta;
      this._cgamma = this._gamma;

      return;
    }
  }

  calibrate() {
    this._calpha = this._alpha;
    this._cbeta = this._beta;
    this._cgamma = this._gamma;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    console.log(
      '[MOTION] Calibrated:',
      this._alpha,
      this._beta,
      this._gamma
    );
  }

  _wrapAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  /*
   * Android DeviceOrientation uses:
   *
   * beta  = front/back tilt
   * gamma = left/right tilt
   *
   * However, when the device is being used in LANDSCAPE,
   * the physical axes need to be rotated into the game's
   * camera coordinate system.
   *
   * We determine the current screen orientation and then
   * transform the sensor deltas accordingly.
   */
  getFrameOffset() {
    if (!this.isActive) {
      return {
        yawOffset: 0,
        pitchOffset: 0
      };
    }

    const dBeta = this._wrapAngle(
      this._beta - this._cbeta
    );

    const dGamma = this._wrapAngle(
      this._gamma - this._cgamma
    );

    let orientation = 0;

    if (
      screen.orientation &&
      Number.isFinite(screen.orientation.angle)
    ) {
      orientation = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      orientation = window.orientation;
    }

    orientation =
      ((orientation % 360) + 360) % 360;

    let yawDeg = 0;
    let pitchDeg = 0;

    /*
     * Portrait
     */
    if (orientation === 0) {
      yawDeg = -dGamma;
      pitchDeg = dBeta;
    }

    /*
     * Landscape rotated clockwise.
     *
     * beta and gamma effectively swap roles.
     */
    else if (orientation === 90) {
      yawDeg = dBeta;
      pitchDeg = dGamma;
    }

    /*
     * Landscape rotated counter-clockwise.
     */
    else if (orientation === 270) {
      yawDeg = -dBeta;
      pitchDeg = -dGamma;
    }

    /*
     * Fallback for unusual orientations.
     */
    else {
      yawDeg = -dGamma;
      pitchDeg = dBeta;
    }

    /*
     * Deadzone
     */
    if (Math.abs(yawDeg) < this.deadzoneDeg) {
      yawDeg = 0;
    }

    if (Math.abs(pitchDeg) < this.deadzoneDeg) {
      pitchDeg = 0;
    }

    const DEG2RAD = Math.PI / 180;

    const targetYaw =
      yawDeg *
      DEG2RAD *
      this.sensitivity;

    const targetPitch =
      pitchDeg *
      DEG2RAD *
      this.sensitivity;

    /*
     * Smooth the movement.
     */
    this._smoothYaw +=
      (targetYaw - this._smoothYaw) *
      this.smoothing;

    this._smoothPitch +=
      (targetPitch - this._smoothPitch) *
      this.smoothing;

    return {
      yawOffset: this._smoothYaw,
      pitchOffset: this._smoothPitch
    };
  }

  _updateDebug(alpha, beta, gamma) {
    let panel =
      document.getElementById('gyro-debug-panel');

    if (!panel) {
      panel = document.createElement('div');

      panel.id = 'gyro-debug-panel';

      panel.style.position = 'fixed';
      panel.style.left = '10px';
      panel.style.top = '10px';
      panel.style.zIndex = '999999';

      panel.style.padding = '8px 10px';

      panel.style.background =
        'rgba(0,0,0,0.75)';

      panel.style.color = '#00ff88';

      panel.style.fontFamily =
        'monospace';

      panel.style.fontSize =
        '12px';

      panel.style.lineHeight =
        '1.4';

      panel.style.borderRadius =
        '6px';

      panel.style.pointerEvents =
        'none';

      document.body.appendChild(panel);
    }

    let orientation = 0;

    if (
      screen.orientation &&
      Number.isFinite(screen.orientation.angle)
    ) {
      orientation =
        screen.orientation.angle;
    }

    panel.innerHTML =
      `GYRO<br>` +
      `α: ${alpha.toFixed(1)}°<br>` +
      `β: ${beta.toFixed(1)}°<br>` +
      `γ: ${gamma.toFixed(1)}°<br>` +
      `screen: ${orientation}°`;
  }
}


/* ============================================================
   MOBILE CONTROLS
   ============================================================ */

export class MobileControls {
  constructor(camera, playerPosition, callbacks = {}) {
    this.camera = camera;
    this.playerPosition = playerPosition;

    this.callbacks = callbacks;

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

    this._shooting = false;
    this._scoping = false;

    this._setupTouchControls();
    this._setupPhoneMode();

    /*
     * First interaction activates phone mode.
     *
     * Fullscreen still requires a user gesture.
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
     ENABLE
     ========================================================== */

  async enable() {
    this.enabled = true;

    document.body.classList.add(
      'mobile-controls-enabled'
    );

    if (isMobileDevice()) {
      await enterPhoneMode();
    }

    return true;
  }


  disable() {
    this.enabled = false;

    this.motionAim.disable();
  }


  /* ==========================================================
     MOTION AIM BUTTON
     ========================================================== */

  async enableMotionAim() {
    await enterPhoneMode();

    const success =
      await this.motionAim.enable();

    if (success) {
      this.motionAim.calibrate();

      this._motionBaseYaw =
        this.yaw;

      this._motionBasePitch =
        this.pitch;

      console.log(
        '[MOBILE] Motion aim ready.'
      );
    }

    return success;
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
          'button, input, select, textarea, .mobile-ui'
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
       * Touch look still works even if
       * motion aim is enabled.
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

  update() {
    if (!this.enabled) return;

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
        this._motionBasePitch +
        pitchOffset;

      this.pitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            this.pitch
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
     *
     * Only the camera rotates.
     */
    if (this.playerPosition) {
      this.camera.position.copy(
        this.playerPosition
      );

      if (
        typeof GAME_CONFIG !==
        'undefined' &&
        GAME_CONFIG.PLAYER &&
        Number.isFinite(
          GAME_CONFIG.PLAYER.HEIGHT
        )
      ) {
        this.camera.position.y =
          GAME_CONFIG.PLAYER.HEIGHT;
      }
    }
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
  }


  hide() {
    this.enabled = false;

    document.body.classList.remove(
      'mobile-controls-visible'
    );
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
/**
 * PARA SF: FOREST ACCURACY - Mobile Touch Controls System
 * Virtual Joystick (Left), Camera Look Touch Zone (Right),
 * Tactical Action Buttons
 *
 * + Optional Motion/Gyro Aim using DeviceOrientationEvent
 * + Landscape-aware device orientation mapping
 * + Phone mode / fullscreen handling
 */

import * as THREE from '/lib/three/three.module.js';
import { GAME_CONFIG } from './config.js';


// ─────────────────────────────────────────────────────────────
// Fullscreen / Phone Mode Helpers
// ─────────────────────────────────────────────────────────────

function isMobileDevice() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0)
  );
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) {
      const root =
        document.documentElement;

      if (root.requestFullscreen) {
        await root.requestFullscreen({
          navigationUI: 'hide'
        });
      }
    }
  } catch (err) {
    console.warn('[MOBILE] Fullscreen request unavailable:', err);
  }
}

async function lockLandscape() {
  try {
    if (
      screen.orientation &&
      typeof screen.orientation.lock === 'function'
    ) {
      await screen.orientation.lock('landscape');
      console.log('[MOBILE] Landscape orientation locked.');
    }
  } catch (err) {
    // Orientation locking is not supported on every browser/device.
    console.warn(
      '[MOBILE] Landscape lock unavailable:',
      err
    );
  }
}

async function enterPhoneMode() {
  if (!isMobileDevice()) return;

  document.body.classList.add('phone-mode');

  // Fullscreen requires a user gesture.
  await enterFullscreen();

  // Try to keep the FPS game in landscape.
  await lockLandscape();

  // Notify other systems if they are listening.
  window.dispatchEvent(
    new CustomEvent('phone-mode-enabled')
  );

  console.log('[MOBILE] Phone mode enabled.');
}


// ─────────────────────────────────────────────────────────────
// MotionAim — DeviceOrientation → yaw/pitch mapping
// ─────────────────────────────────────────────────────────────

class MotionAim {
  constructor() {
    this.isSupported = false;
    this.isActive = false;

    this.sensitivity = 1.5;

    // Calibration baseline
    this._calpha = 0;
    this._cbeta = 0;
    this._cgamma = 0;

    // Latest raw sensor values
    this._alpha = 0;
    this._beta = 0;
    this._gamma = 0;

    // Smoothed output
    this._smoothYaw = 0;
    this._smoothPitch = 0;

    // Smoothing
    this._smooth = 0.18;

    // Deadzone
    this._deadzoneDeg = 0.25;

    this._boundHandler =
      this._onOrientation.bind(this);

    // DOM refs
    this.btnToggle = null;
    this.btnCalibrate = null;
    this.sensSlider = null;
    this.sensRow = null;
    this.statusBadge = null;
    this.toggleLabel = null;

    this.onCalibrate = null;
  }

  initDOM() {
    this.btnToggle =
      document.getElementById(
        'btn-motion-aim-toggle'
      );

    this.btnCalibrate =
      document.getElementById(
        'btn-motion-calibrate'
      );

    this.sensSlider =
      document.getElementById(
        'motion-sensitivity-slider'
      );

    this.sensRow =
      document.getElementById(
        'motion-sens-row'
      );

    this.statusBadge =
      document.getElementById(
        'motion-aim-status'
      );

    this.toggleLabel =
      document.getElementById(
        'motion-aim-toggle-label'
      );

    this.isSupported =
      typeof DeviceOrientationEvent !== 'undefined';

    if (!this.btnToggle) return;

    if (!this.isSupported) {
      this.btnToggle.disabled = true;

      if (this.toggleLabel) {
        this.toggleLabel.textContent =
          '\uD83D\uDCF5 NO MOTION';
      }

      this.btnToggle.title =
        'Motion sensors not supported on this device/browser.';

      return;
    }

    this.btnToggle.addEventListener(
      'touchstart',
      async (e) => {
        e.preventDefault();

        await enterPhoneMode();

        this._handleToggle();
      },
      {
        passive: false
      }
    );

    if (this.btnCalibrate) {
      this.btnCalibrate.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.calibrate();
        },
        {
          passive: false
        }
      );
    }

    if (this.sensSlider) {
      this.sensSlider.addEventListener(
        'input',
        (e) => {
          const value =
            parseFloat(e.target.value);

          if (Number.isFinite(value)) {
            this.sensitivity =
              Math.max(
                0.5,
                Math.min(4.0, value)
              );
          }
        }
      );
    }
  }

  async _handleToggle() {
    if (this.isActive) {
      this.disable();
    } else {
      await this._requestAndEnable();
    }
  }

  async _requestAndEnable() {
    // iOS permission handling.
    if (
      typeof DeviceOrientationEvent.requestPermission ===
      'function'
    ) {
      try {
        const result =
          await DeviceOrientationEvent.requestPermission();

        if (result !== 'granted') {
          this._showToast(
            'Motion sensor access denied. Using touch aim.'
          );

          return;
        }
      } catch (err) {
        console.warn(
          '[MOTION] Permission request failed:',
          err
        );

        this._showToast(
          'Could not request motion permission.'
        );

        return;
      }
    }

    this.enable();
  }

  enable() {
    if (
      !this.isSupported ||
      this.isActive
    ) {
      return;
    }

    // Enter phone mode before activating motion.
    enterPhoneMode();

    window.addEventListener(
      'deviceorientation',
      this._boundHandler,
      true
    );

    this.isActive = true;

    // Let the sensor settle before calibration.
    setTimeout(() => {
      this.calibrate();
    }, 150);

    this._updateUI();

    console.log(
      '[MOTION] Device orientation aim enabled.'
    );
  }

  disable() {
    if (!this.isActive) return;

    window.removeEventListener(
      'deviceorientation',
      this._boundHandler,
      true
    );

    this.isActive = false;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    this._updateUI();

    console.log(
      '[MOTION] Device orientation aim disabled.'
    );
  }

  calibrate() {
    this._calpha = this._alpha;
    this._cbeta = this._beta;
    this._cgamma = this._gamma;

    this._smoothYaw = 0;
    this._smoothPitch = 0;

    if (this.onCalibrate) {
      this.onCalibrate();
    }

    if (this.btnCalibrate) {
      const saved =
        this.btnCalibrate.innerHTML;

      this.btnCalibrate.innerHTML =
        '<span>\u2705 CALIBRATED</span>';

      setTimeout(() => {
        if (this.btnCalibrate) {
          this.btnCalibrate.innerHTML =
            saved ||
            '<span>\uD83C\uDFAF CALIBRATE</span>';
        }
      }, 800);
    }

    console.log(
      '[MOTION] Calibration:',
      {
        alpha: this._calpha,
        beta: this._cbeta,
        gamma: this._cgamma
      }
    );
  }

  _onOrientation(e) {
    if (
      e.alpha === null ||
      e.beta === null ||
      e.gamma === null
    ) {
      return;
    }

    this._alpha =
      Number.isFinite(e.alpha)
        ? e.alpha
        : 0;

    this._beta =
      Number.isFinite(e.beta)
        ? e.beta
        : 0;

    this._gamma =
      Number.isFinite(e.gamma)
        ? e.gamma
        : 0;
  }

  /**
   * Converts DeviceOrientation values into
   * game yaw/pitch offsets.
   *
   * DeviceOrientation:
   *
   *   beta  = front/back tilt
   *   gamma = left/right tilt
   *
   * However, once the phone is held in landscape,
   * the physical device axes are rotated relative
   * to the game's screen axes.
   *
   * Therefore beta/gamma cannot simply be mapped
   * directly to yaw/pitch.
   */
  getFrameOffset() {
    if (!this.isActive) {
      return {
        yawOffset: 0,
        pitchOffset: 0
      };
    }

    const DEG2RAD =
      Math.PI / 180;

    // Get current screen orientation.
    let orientation = 0;

    if (
      screen.orientation &&
      Number.isFinite(
        screen.orientation.angle
      )
    ) {
      orientation =
        screen.orientation.angle;
    } else if (
      typeof window.orientation ===
      'number'
    ) {
      orientation =
        window.orientation;
    }

    // Normalize orientation.
    orientation =
      ((orientation % 360) + 360) % 360;

    // Sensor deltas from calibration.
    const dBeta =
      this._wrapAngle(
        this._beta - this._cbeta
      );

    const dGamma =
      this._wrapAngle(
        this._gamma - this._cgamma
      );

    let yawDeg = 0;
    let pitchDeg = 0;

    /*
     * PORTRAIT
     *
     * gamma = left/right
     * beta  = up/down
     */
    if (orientation === 0) {
      yawDeg = -dGamma;
      pitchDeg = dBeta;
    }

    /*
     * LANDSCAPE 90°
     *
     * The phone axes rotate relative
     * to the game screen.
     *
     * beta becomes horizontal.
     * gamma becomes vertical.
     */
    else if (orientation === 90) {
      yawDeg = dBeta;
      pitchDeg = dGamma;
    }

    /*
     * LANDSCAPE 270°
     *
     * Opposite landscape direction.
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

    // Deadzone.
    if (
      Math.abs(yawDeg) <
      this._deadzoneDeg
    ) {
      yawDeg = 0;
    }

    if (
      Math.abs(pitchDeg) <
      this._deadzoneDeg
    ) {
      pitchDeg = 0;
    }

    // Convert to radians.
    const targetYaw =
      yawDeg *
      DEG2RAD *
      this.sensitivity;

    const targetPitch =
      pitchDeg *
      DEG2RAD *
      this.sensitivity;

    // Exponential smoothing.
    const s = this._smooth;

    this._smoothYaw =
      this._smoothYaw * s +
      targetYaw * (1 - s);

    this._smoothPitch =
      this._smoothPitch * s +
      targetPitch * (1 - s);

    return {
      yawOffset: this._smoothYaw,
      pitchOffset: this._smoothPitch
    };
  }

  _wrapAngle(a) {
    while (a > 180) {
      a -= 360;
    }

    while (a < -180) {
      a += 360;
    }

    return a;
  }

  _updateUI() {
    if (this.btnToggle) {
      this.btnToggle.classList.toggle(
        'active',
        this.isActive
      );
    }

    if (this.toggleLabel) {
      this.toggleLabel.textContent =
        this.isActive
          ? '\uD83D\uDCF1 MOTION: ON'
          : '\uD83D\uDCF1 MOTION AIM';
    }

    if (this.btnCalibrate) {
      this.btnCalibrate.style.display =
        this.isActive
          ? 'block'
          : 'none';
    }

    if (this.sensRow) {
      this.sensRow.style.display =
        this.isActive
          ? 'flex'
          : 'none';
    }

    if (this.statusBadge) {
      this.statusBadge.style.display =
        this.isActive
          ? 'block'
          : 'none';
    }
  }

  _showToast(msg) {
    const toast =
      document.createElement('div');

    toast.className =
      'tactical-toast toast-warning';

    toast.textContent = msg;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');

      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 3200);
  }

  dispose() {
    this.disable();
  }
}


// ─────────────────────────────────────────────────────────────
// MobileControls — Main mobile input controller
// ─────────────────────────────────────────────────────────────

export class MobileControls {
  constructor(
    camera,
    onShoot,
    onScope,
    onAim,
    onReload
  ) {
    this.camera = camera;

    this.onShoot = onShoot;
    this.onScope = onScope;
    this.onAim = onAim;
    this.onReload = onReload;

    this.enabled = false;

    this.sensitivity =
      GAME_CONFIG.PLAYER.TOUCH_SENSITIVITY;

    // Authoritative aim angles.
    this.pitch = 0;
    this.yaw = 0;

    // Motion calibration base.
    this._motionBaseYaw = 0;
    this._motionBasePitch = 0;

    // Joystick.
    this.joystickVector = {
      x: 0,
      y: 0
    };

    this.velocity =
      new THREE.Vector3();

    this.joystickTouchId = null;
    this.lookTouchId = null;

    this.lastLookPos = {
      x: 0,
      y: 0
    };

    // Weapon state.
    this.isScoped = false;
    this.isAiming = false;
    this.isFiring = false;

    this.fireCooldown = 0;

    this.fireInterval =
      GAME_CONFIG.WEAPON.FIRE_RATE_MS /
      1000;

    this.shootTouchId = null;

    // Motion subsystem.
    this.motionAim =
      new MotionAim();

    // Synchronize camera base angles
    // whenever motion calibration happens.
    this.motionAim.onCalibrate =
      () => {
        this._motionBaseYaw =
          this.yaw;

        this._motionBasePitch =
          this.pitch;
      };

    this.initDOM();

    // Prepare phone mode if the device
    // is touch capable.
    this.setupPhoneModeDetection();
  }

  setupPhoneModeDetection() {
    if (!isMobileDevice()) {
      return;
    }

    /*
     * We cannot request fullscreen automatically
     * on page load because browsers require a
     * user gesture.
     *
     * Therefore the first real interaction
     * enters phone mode.
     */
    const activatePhoneMode = () => {
      enterPhoneMode();
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

  initDOM() {
    this.container =
      document.getElementById(
        'mobile-controls-layer'
      );

    if (!this.container) {
      return;
    }

    this.joystickZone =
      document.getElementById(
        'joystick-zone'
      );

    this.joystickBase =
      document.getElementById(
        'joystick-base'
      );

    this.joystickKnob =
      document.getElementById(
        'joystick-knob'
      );

    this.touchLookZone =
      document.getElementById(
        'touch-look-zone'
      );

    this.btnShoot =
      document.getElementById(
        'btn-mobile-shoot'
      );

    this.btnScope =
      document.getElementById(
        'btn-mobile-scope'
      );

    this.btnAim =
      document.getElementById(
        'btn-mobile-aim'
      );

    this.btnReload =
      document.getElementById(
        'btn-mobile-reload'
      );

    this.motionAim.initDOM();

    this.setupTouchListeners();
  }

  setupTouchListeners() {
    if (
      !this.joystickZone ||
      !this.touchLookZone
    ) {
      return;
    }

    // ─────────────────────────────────────────
    // Virtual Joystick
    // ─────────────────────────────────────────

    this.joystickZone.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;

        e.preventDefault();

        const touch =
          e.changedTouches[0];

        this.joystickTouchId =
          touch.identifier;

        const rect =
          this.joystickZone
            .getBoundingClientRect();

        const originX =
          touch.clientX -
          rect.left;

        const originY =
          touch.clientY -
          rect.top;

        this.joystickBase.style.left =
          `${originX}px`;

        this.joystickBase.style.top =
          `${originY}px`;

        this.joystickBase.style.display =
          'block';

        this.joystickCenter = {
          x: touch.clientX,
          y: touch.clientY
        };
      },
      {
        passive: false
      }
    );

    this.joystickZone.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled) return;

        e.preventDefault();

        for (
          let i = 0;
          i < e.changedTouches.length;
          i++
        ) {
          const touch =
            e.changedTouches[i];

          if (
            touch.identifier !==
            this.joystickTouchId
          ) {
            continue;
          }

          const dx =
            touch.clientX -
            this.joystickCenter.x;

          const dy =
            touch.clientY -
            this.joystickCenter.y;

          const dist =
            Math.hypot(dx, dy);

          const maxRadius = 45;

          const clamped =
            Math.min(
              dist,
              maxRadius
            );

          const angle =
            Math.atan2(
              dy,
              dx
            );

          const knobX =
            Math.cos(angle) *
            clamped;

          const knobY =
            Math.sin(angle) *
            clamped;

          this.joystickKnob.style.transform =
            `translate(${knobX}px, ${knobY}px)`;

          this.joystickVector.x =
            knobX / maxRadius;

          this.joystickVector.y =
            -knobY / maxRadius;
        }
      },
      {
        passive: false
      }
    );

    const resetJoystick =
      (e) => {
        for (
          let i = 0;
          i < e.changedTouches.length;
          i++
        ) {
          if (
            e.changedTouches[i]
              .identifier ===
            this.joystickTouchId
          ) {
            this.joystickTouchId =
              null;

            this.joystickVector = {
              x: 0,
              y: 0
            };

            this.joystickKnob.style.transform =
              'translate(0px, 0px)';

            this.joystickBase.style.display =
              'none';
          }
        }
      };

    this.joystickZone.addEventListener(
      'touchend',
      resetJoystick
    );

    this.joystickZone.addEventListener(
      'touchcancel',
      resetJoystick
    );


    // ─────────────────────────────────────────
    // Touch Look Zone
    // ─────────────────────────────────────────

    this.touchLookZone.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;

        // Motion owns camera rotation.
        if (this.motionAim.isActive) {
          return;
        }

        e.preventDefault();

        const touch =
          e.changedTouches[0];

        this.lookTouchId =
          touch.identifier;

        this.lastLookPos = {
          x: touch.clientX,
          y: touch.clientY
        };
      },
      {
        passive: false
      }
    );

    this.touchLookZone.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled) return;

        if (this.motionAim.isActive) {
          return;
        }

        e.preventDefault();

        for (
          let i = 0;
          i < e.changedTouches.length;
          i++
        ) {
          const touch =
            e.changedTouches[i];

          if (
            touch.identifier !==
            this.lookTouchId
          ) {
            continue;
          }

          const dx =
            touch.clientX -
            this.lastLookPos.x;

          const dy =
            touch.clientY -
            this.lastLookPos.y;

          const factor =
            this.isScoped
              ? 0.45
              : (
                this.isAiming
                  ? 0.7
                  : 1.0
              );

          this.yaw -=
            dx *
            this.sensitivity *
            factor;

          this.pitch -=
            dy *
            this.sensitivity *
            factor;

          this.pitch =
            Math.max(
              -1.45,
              Math.min(
                1.45,
                this.pitch
              )
            );

          this.lastLookPos = {
            x: touch.clientX,
            y: touch.clientY
          };
        }
      },
      {
        passive: false
      }
    );

    const resetLook =
      (e) => {
        for (
          let i = 0;
          i < e.changedTouches.length;
          i++
        ) {
          if (
            e.changedTouches[i]
              .identifier ===
            this.lookTouchId
          ) {
            this.lookTouchId =
              null;
          }
        }
      };

    this.touchLookZone.addEventListener(
      'touchend',
      resetLook
    );

    this.touchLookZone.addEventListener(
      'touchcancel',
      resetLook
    );


    // ─────────────────────────────────────────
    // Shoot Button
    // ─────────────────────────────────────────

    if (this.btnShoot) {
      this.btnShoot.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();

          if (
            !this.enabled ||
            this.isFiring
          ) {
            return;
          }

          if (navigator.vibrate) {
            navigator.vibrate(20);
          }

          this.shootTouchId =
            e.changedTouches[0]
              ?.identifier ?? null;

          this.isFiring = true;

          this.fireCooldown = 0;

          console.log(
            '[COMBAT DEBUG] player LMB DOWN'
          );

          this.tryFire();
        },
        {
          passive: false
        }
      );

      const stopShootTouch =
        (e) => {
          if (
            this.shootTouchId === null
          ) {
            return;
          }

          for (
            const touch of
            e.changedTouches
          ) {
            if (
              touch.identifier ===
              this.shootTouchId
            ) {
              this.shootTouchId =
                null;

              this.stopFiring();

              break;
            }
          }
        };

      window.addEventListener(
        'touchend',
        stopShootTouch
      );

      window.addEventListener(
        'touchcancel',
        stopShootTouch
      );

      window.addEventListener(
        'pointerup',
        () => this.stopFiring()
      );

      window.addEventListener(
        'blur',
        () => this.stopFiring()
      );
    }


    // ─────────────────────────────────────────
    // Scope
    // ─────────────────────────────────────────

    if (this.btnScope) {
      this.btnScope.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();

          this.isScoped =
            !this.isScoped;

          this.btnScope.classList.toggle(
            'active',
            this.isScoped
          );

          if (this.onScope) {
            this.onScope(
              this.isScoped
            );
          }
        },
        {
          passive: false
        }
      );
    }


    // ─────────────────────────────────────────
    // Aim
    // ─────────────────────────────────────────

    if (this.btnAim) {
      this.btnAim.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();

          this.isAiming =
            !this.isAiming;

          this.btnAim.classList.toggle(
            'active',
            this.isAiming
          );

          if (this.onAim) {
            this.onAim(
              this.isAiming
            );
          }
        },
        {
          passive: false
        }
      );
    }


    // ─────────────────────────────────────────
    // Reload
    // ─────────────────────────────────────────

    if (this.btnReload) {
      this.btnReload.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();

          if (this.onReload) {
            this.onReload();
          }
        },
        {
          passive: false
        }
      );
    }
  }

  show() {
    this.enabled = true;

    if (this.container) {
      this.container.style.display =
        'block';
    }

    // On supported phones, mark the page
    // as phone mode.
    if (isMobileDevice()) {
      document.body.classList.add(
        'phone-mode'
      );
    }
  }

  hide() {
    this.enabled = false;

    this.stopFiring();

    if (this.container) {
      this.container.style.display =
        'none';
    }

    this.motionAim.disable();
  }

  tryFire() {
    if (
      !this.isFiring ||
      this.fireCooldown > 0
    ) {
      return;
    }

    if (!this.onShoot) {
      this.stopFiring();
      return;
    }

    console.log(
      '[COMBAT DEBUG] player firing'
    );

    if (
      this.onShoot() === false
    ) {
      this.stopFiring();
      return;
    }

    this.fireCooldown =
      this.fireInterval;
  }

  stopFiring() {
    if (!this.isFiring) {
      return;
    }

    this.isFiring = false;

    this.shootTouchId = null;

    console.log(
      '[COMBAT DEBUG] player LMB UP'
    );
  }

  update(dt, playerPosition) {
    if (!this.enabled) {
      return {
        isMoving: false
      };
    }

    // Fire cooldown.
    this.fireCooldown =
      Math.max(
        0,
        this.fireCooldown - dt
      );

    if (
      this.isFiring &&
      this.fireCooldown <= 0
    ) {
      this.tryFire();
    }


    // ─────────────────────────────────────────
    // Apply Motion Aim
    // ─────────────────────────────────────────

    if (this.motionAim.isActive) {
      const {
        yawOffset,
        pitchOffset
      } =
        this.motionAim.getFrameOffset();

      const newYaw =
        this._motionBaseYaw +
        yawOffset;

      const newPitch =
        this._motionBasePitch +
        pitchOffset;

      this.yaw = newYaw;

      this.pitch =
        Math.max(
          -1.45,
          Math.min(
            1.45,
            newPitch
          )
        );
    }


    // ─────────────────────────────────────────
    // Apply Camera Rotation
    // ─────────────────────────────────────────

    this.camera.rotation.order =
      'YXZ';

    this.camera.rotation.y =
      this.yaw;

    this.camera.rotation.x =
      this.pitch;


    // ─────────────────────────────────────────
    // PLAYER MOVEMENT LOCKED
    // ─────────────────────────────────────────

    playerPosition.y =
      GAME_CONFIG.PLAYER.HEIGHT;

    this.camera.position.copy(
      playerPosition
    );

    return {
      isMoving: false
    };
  }

  dispose() {
    this.motionAim.dispose();
  }
}
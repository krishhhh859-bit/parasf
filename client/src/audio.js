/**
 * PARA SF: FOREST ACCURACY - Procedural Audio Engine
 * High-fidelity tactical audio synthesized via Web Audio API
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.isMuted = false;
    this.ambientPlaying = false;
    this.ambientNodes = [];
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.volume);
    return this.isMuted;
  }

  // --- Procedural Gunshot (TAR-21 Bullpup Rifle) ---
  playGunshot(isSilenced = false) {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const t = this.ctx.currentTime;

    // 1. Initial Transient Punch (Sub Bass kick)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.08);

    oscGain.gain.setValueAtTime(0.8, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.12);

    // 2. High-Impact Noise Burst (Muzzle Blast)
    const bufferSize = this.ctx.sampleRate * 0.35;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = isSilenced ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(isSilenced ? 800 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.28);
    filter.Q.setValueAtTime(2.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    whiteNoise.start(t);
    whiteNoise.stop(t + 0.35);
  }

  // --- Tactical Hitmarker Confirmation ---
  playHitmarker(isHeadshot = false) {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isHeadshot ? 2400 : 1600;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.04);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isHeadshot ? 0.09 : 0.06));

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);

    if (isHeadshot) {
      // Secondary harmonic ping
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(3200, t + 0.02);
      gain2.gain.setValueAtTime(0.5, t + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc2.connect(gain2);
      gain2.connect(this.sfxGain);
      osc2.start(t + 0.02);
      osc2.stop(t + 0.15);
    }
  }

  // --- Weapon Reload Sequence Sounds ---
  playReload() {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const t = this.ctx.currentTime;

    // Stage 1: Magazine release click (t = 0.1s)
    this.playMechanicalClick(t + 0.1, 800, 0.4);
    // Stage 2: Old mag drop / draw new mag (t = 0.7s)
    this.playMechanicalClick(t + 0.7, 500, 0.3);
    // Stage 3: New mag snap lock into bullpup receiver (t = 1.4s)
    this.playMechanicalClick(t + 1.4, 1100, 0.7);
    this.playMechanicalClick(t + 1.45, 650, 0.6);
    // Stage 4: Charging handle bolt rack / chamber round (t = 1.9s)
    this.playMechanicalClick(t + 1.85, 1400, 0.8);
    this.playMechanicalClick(t + 1.95, 950, 0.6);
  }

  playMechanicalClick(time, freq, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + 0.05);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  // --- Dry Fire Click (Empty Magazine) ---
  playDryFire() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    this.playMechanicalClick(this.ctx.currentTime, 1200, 0.5);
  }

  // --- Countdown Beeps (3, 2, 1, GO) ---
  playCountdownBeep(isGo = false) {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isGo ? 880 : 440;
    const duration = isGo ? 0.35 : 0.12;

    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration);
  }

  // --- UI Tactical Click & Hover ---
  playUIClick() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.03);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  playUIHover() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.025);
  }

  // --- Match Completed Siren / Stinger ---
  playMatchEnd(isWinner = false) {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const t = this.ctx.currentTime;
    const freqs = isWinner ? [523.25, 659.25, 783.99, 1046.50] : [440, 392, 349.23, 293.66];

    freqs.forEach((freq, idx) => {
      const startTime = t + (idx * 0.18);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isWinner ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.5, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  // --- Forest Woodland Ambience (Wind & Rustle) ---
  startForestAmbience() {
    if (!this.ctx || this.ambientPlaying) return;
    this.resume();

    try {
      // Pink/Brown noise generator for gentle woodland wind
      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.25;
      }

      const windSource = this.ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      windSource.connect(filter);
      filter.connect(this.ambientGain);
      windSource.start();

      this.ambientNodes.push(windSource);
      this.ambientPlaying = true;
    } catch (e) {
      console.warn('Could not start ambient audio:', e);
    }
  }

  stopForestAmbience() {
    this.ambientNodes.forEach(node => {
      try { node.stop(); } catch(e) {}
    });
    this.ambientNodes = [];
    this.ambientPlaying = false;
  }
}

export const soundEngine = new SoundEngine();

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engine = null;
    this.ambience = null;
    this.boostGain = null;
    this.boostFilter = null;
    this.noiseBuffer = null;
    this.ready = false;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 20;
    limiter.ratio.value = 7;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.24;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.56;
    this.master.connect(limiter);

    const seconds = 2.5;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    this.noiseBuffer = buffer;

    this.buildAmbience();
    this.buildEngine();

    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.ready = true;
  }

  buildAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.45;

    const gain = ctx.createGain();
    gain.gain.value = 0.035;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(gain.gain);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.ambience = { src, gain };
  }

  buildEngine() {
    const ctx = this.ctx;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 54;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 81;
    oscB.detune.value = -7;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2.2;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain).connect(this.master);
    oscA.start();
    oscB.start();
    this.engine = { oscA, oscB, filter, gain };

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.value = 1700;
    boostFilter.Q.value = 0.75;
    const boostGain = ctx.createGain();
    boostGain.gain.value = 0.0001;
    noise.connect(boostFilter).connect(boostGain).connect(this.master);
    noise.start();
    this.boostFilter = boostFilter;
    this.boostGain = boostGain;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.56, this.ctx.currentTime, 0.08);
  }

  updateEngine(speed, throttle, boosting, grounded, dt) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, Math.abs(speed) / 46);
    const targetFreq = 48 + s * 128 + (boosting ? 16 : 0);
    this.engine.oscA.frequency.setTargetAtTime(targetFreq, t, 0.07);
    this.engine.oscB.frequency.setTargetAtTime(targetFreq * 1.501, t, 0.07);
    this.engine.filter.frequency.setTargetAtTime(330 + s * 1150 + (boosting ? 420 : 0), t, 0.1);
    const targetGain = 0.016 + s * 0.045 + Math.abs(throttle) * 0.012;
    this.engine.gain.gain.setTargetAtTime(targetGain, t, 0.09);
    if (this.boostGain) {
      this.boostGain.gain.setTargetAtTime(boosting ? 0.075 : 0.0001, t, 0.06);
      this.boostFilter.frequency.setTargetAtTime(boosting ? 2200 : 1500, t, 0.1);
    }
  }

  noiseBurst({ duration = 0.2, freq = 900, q = 1, gain = 0.2, type = 'bandpass', attack = 0.005, when = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(start);
    src.stop(start + duration + 0.05);
  }

  tone({ freq = 220, duration = 0.2, type = 'sine', gain = 0.15, slide = 0, when = 0, filter = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      osc.connect(f);
      node = f;
    }
    node.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  playHit(strength = 1) {
    const s = Math.min(1.6, strength);
    this.noiseBurst({ duration: 0.16, freq: 520 + s * 500, q: 1.2, gain: 0.1 + s * 0.16, type: 'bandpass' });
    this.tone({ freq: 95 + s * 30, duration: 0.2, type: 'sine', gain: 0.16 + s * 0.14, slide: -55 });
    this.tone({ freq: 240 + s * 60, duration: 0.09, type: 'triangle', gain: 0.05 + s * 0.06, slide: 90 });
  }

  playWall(strength = 1) {
    this.tone({ freq: 84, duration: 0.18, type: 'sine', gain: 0.08 + Math.min(0.1, strength * 0.02), slide: -30 });
    this.noiseBurst({ duration: 0.12, freq: 320, q: 2, gain: 0.05, type: 'lowpass' });
  }

  playJump() {
    this.noiseBurst({ duration: 0.2, freq: 1100, q: 0.8, gain: 0.07, type: 'bandpass' });
    this.tone({ freq: 190, duration: 0.14, type: 'triangle', gain: 0.05, slide: 170 });
  }

  playDoubleJump() {
    this.noiseBurst({ duration: 0.26, freq: 1800, q: 0.7, gain: 0.08 });
    this.tone({ freq: 320, duration: 0.18, type: 'sawtooth', gain: 0.035, slide: 240, filter: 1400 });
  }

  playBoostStart() {
    this.noiseBurst({ duration: 0.3, freq: 2600, q: 0.6, gain: 0.09, attack: 0.01 });
  }

  playPickup(big) {
    this.tone({ freq: big ? 660 : 880, duration: 0.12, type: 'sine', gain: 0.06, slide: big ? 440 : 220 });
    this.tone({ freq: big ? 990 : 1320, duration: 0.14, type: 'triangle', gain: 0.035, when: 0.06 });
  }

  playCountdown(go) {
    this.tone({ freq: go ? 880 : 440, duration: go ? 0.5 : 0.13, type: 'square', gain: 0.045, filter: 2200 });
    if (go) this.tone({ freq: 1320, duration: 0.4, type: 'triangle', gain: 0.03, when: 0.04 });
  }

  playGoal(playerScored) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime;
    const notes = playerScored ? [130.81, 164.81, 196, 261.63] : [110, 130.81, 146.83, 110];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === notes.length - 1 ? 'sawtooth' : 'square';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const env = ctx.createGain();
      const at = start + index * 0.03;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.06, at + 0.03);
      env.gain.setValueAtTime(0.06, at + 0.5);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
      osc.connect(filter).connect(env).connect(this.master);
      osc.start(at);
      osc.stop(at + 1.5);
    });
    this.noiseBurst({ duration: 1.4, freq: 900, q: 0.4, gain: 0.12, attack: 0.25, type: 'bandpass' });
    if (playerScored) {
      this.tone({ freq: 523.25, duration: 0.5, type: 'triangle', gain: 0.05, slide: 523.25, when: 0.1 });
    }
  }

  playWhistle() {
    this.tone({ freq: 2100, duration: 0.34, type: 'sine', gain: 0.05, slide: 260 });
    this.noiseBurst({ duration: 0.28, freq: 2400, q: 3, gain: 0.04 });
  }

  playWin(won) {
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((freq, index) => {
      this.tone({ freq, duration: 0.35, type: 'triangle', gain: 0.055, when: index * 0.13, filter: 3200 });
    });
  }
}

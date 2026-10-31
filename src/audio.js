/** Tiny synthesized sound engine - no audio files needed. */
export class SoundLab {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.engine = null;
    this.boostGain = null;
    this.crowdGain = null;
    this.master = null;
    this.lastHit = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // Reusable noise buffer.
    const seconds = 2;
    this.noise = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Crowd bed.
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noise;
    crowd.loop = true;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'lowpass';
    crowdFilter.frequency.value = 480;
    crowdFilter.Q.value = 0.4;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.028;
    crowd.connect(crowdFilter).connect(this.crowdGain).connect(this.master);
    crowd.start();

    // Engine.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 48;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 96;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;
    filter.Q.value = 2.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, filter, gain };

    // Boost jet.
    const boost = ctx.createBufferSource();
    boost.buffer = this.noise;
    boost.loop = true;
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.value = 950;
    boostFilter.Q.value = 0.7;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    boost.connect(boostFilter).connect(this.boostGain).connect(this.master);
    boost.start();
    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  update(speed, boosting, throttle) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const norm = Math.min(1, speed / 38);
    this.engine.osc.frequency.setTargetAtTime(46 + norm * 92, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(92 + norm * 185, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(380 + norm * 900, t, 0.1);
    const target = 0.012 + Math.abs(throttle) * 0.02 + norm * 0.035;
    this.engine.gain.gain.setTargetAtTime(target, t, 0.09);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.11 : 0.0, t, boosting ? 0.04 : 0.14);
  }

  burst({ freq = 400, q = 1, duration = 0.2, gain = 0.2, type = 'bandpass', sweep = 0 }) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), ctx.currentTime + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(ctx.currentTime, Math.random() * 1.5);
    src.stop(ctx.currentTime + duration + 0.02);
  }

  tone(freq, duration = 0.18, gain = 0.12, type = 'sine', slide = 0, delay = 0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  hit(strength = 0.5) {
    const now = performance.now();
    if (now - this.lastHit < 45) return;
    this.lastHit = now;
    this.burst({ freq: 160 + strength * 240, q: 1.2, duration: 0.16, gain: 0.12 + strength * 0.17, sweep: -90 });
    this.tone(92, 0.13, 0.08 + strength * 0.12, 'sine', -40);
  }

  bounce(strength = 0.5) {
    this.tone(150 + strength * 90, 0.1, 0.035 + strength * 0.04, 'triangle', -50);
  }

  jump() {
    this.burst({ freq: 520, q: 0.6, duration: 0.16, gain: 0.06, type: 'bandpass', sweep: 400 });
  }

  flip() {
    this.burst({ freq: 900, q: 0.7, duration: 0.2, gain: 0.09, sweep: 900 });
    this.tone(220, 0.14, 0.06, 'sawtooth', 110);
  }

  pad(big = false) {
    this.tone(big ? 520 : 780, 0.16, 0.06, 'sine', 380);
    this.tone(big ? 780 : 1040, 0.2, 0.04, 'sine', 520, 0.03);
  }

  beep(high = false) {
    this.tone(high ? 880 : 440, high ? 0.26 : 0.12, 0.1, 'square');
  }

  goal(blue = true) {
    if (!this.ready || this.muted) return;
    const root = blue ? 220 : 174.6;
    [0, 4, 7, 12].forEach((semi, i) => {
      this.tone(root * Math.pow(2, semi / 12), 0.7, 0.06, 'sawtooth', 0, i * 0.07);
    });
    this.burst({ freq: 700, q: 0.5, duration: 1.2, gain: 0.14, type: 'lowpass', sweep: 500 });
    this.crowdGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.crowdGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    this.crowdGain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.18);
    this.crowdGain.gain.linearRampToValueAtTime(0.028, this.ctx.currentTime + 2.6);
  }

  win(blue = true) {
    if (!this.ready || this.muted) return;
    const root = blue ? 261.6 : 196;
    [0, 5, 9, 12, 7, 12].forEach((semi, i) => {
      this.tone(root * Math.pow(2, semi / 12), 0.6, 0.07, 'triangle', 0, i * 0.12);
    });
    this.crowdGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    this.crowdGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.3);
  }

  ui() {
    this.tone(620, 0.07, 0.045, 'sine', 180);
  }
}

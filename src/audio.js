export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.boostGain = null;
    this.ready = false;
    this.engineTarget = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.42;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // Reusable noise buffer.
    const length = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = last * 2.2;
    }

    // Engine.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 240;
    this.engineFilter.Q.value = 3.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 46;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 92;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.18;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(osc2Gain);
    osc2Gain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Boost hiss.
    const boostSource = ctx.createBufferSource();
    boostSource.buffer = this.noiseBuffer;
    boostSource.loop = true;
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.value = 780;
    boostFilter.Q.value = 0.85;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    boostSource.connect(boostFilter);
    boostFilter.connect(this.boostGain);
    this.boostGain.connect(this.master);
    boostSource.start();

    // Stadium ambience.
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noiseBuffer;
    crowd.loop = true;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'lowpass';
    crowdFilter.frequency.value = 420;
    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.065;
    crowd.connect(crowdFilter);
    crowdFilter.connect(crowdGain);
    crowdGain.connect(this.master);
    crowd.start();

    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  updateEngine(speed, throttle, boosting, active) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const target = active ? 0.018 + Math.min(1, speed / 42) * 0.035 : 0;
    this.engineTarget = target;
    this.engineGain.gain.setTargetAtTime(target, now, 0.08);
    const freq = 44 + Math.min(1, speed / 46) * 92 + Math.abs(throttle) * 8 + (boosting ? 14 : 0);
    this.engineOsc.frequency.setTargetAtTime(freq, now, 0.07);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2.01, now, 0.07);
    this.engineFilter.frequency.setTargetAtTime(180 + Math.min(1, speed / 45) * 520 + (boosting ? 280 : 0), now, 0.1);
    if (this.boostGain) {
      this.boostGain.gain.setTargetAtTime(boosting && active ? 0.17 : 0, now, 0.06);
    }
  }

  tone({ freq = 220, to = null, dur = 0.2, type = 'sine', gain = 0.2, delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.2, freq = 900, q = 0.8, type = 'bandpass', delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  ui() {
    this.tone({ freq: 520, to: 740, dur: 0.09, type: 'triangle', gain: 0.12 });
  }

  countdown(final = false) {
    this.tone({ freq: final ? 620 : 380, to: final ? 820 : 380, dur: final ? 0.28 : 0.12, type: 'square', gain: 0.09 });
  }

  jump() {
    this.tone({ freq: 240, to: 520, dur: 0.15, type: 'triangle', gain: 0.13 });
    this.noise({ dur: 0.12, gain: 0.08, freq: 1400 });
  }

  doubleJump() {
    this.tone({ freq: 380, to: 760, dur: 0.16, type: 'sawtooth', gain: 0.07 });
  }

  land(impact = 8) {
    const p = Math.min(1, impact / 18);
    this.tone({ freq: 100, to: 45, dur: 0.18, type: 'sine', gain: 0.12 + p * 0.12 });
    this.noise({ dur: 0.12, gain: 0.05 + p * 0.1, freq: 300, type: 'lowpass' });
  }

  footstep() {
    this.noise({ dur: 0.055, gain: 0.035, freq: 420, q: 0.7, type: 'lowpass' });
    this.tone({ freq: 90, to: 62, dur: 0.06, type: 'sine', gain: 0.035 });
  }

  hit(power = 1) {
    const p = Math.min(1.5, power);
    this.tone({ freq: 150 + p * 40, to: 48, dur: 0.16, type: 'sine', gain: 0.18 + p * 0.14 });
    this.tone({ freq: 320 + p * 90, to: 160, dur: 0.1, type: 'triangle', gain: 0.05 + p * 0.04 });
    this.noise({ dur: 0.16, gain: 0.12 + p * 0.1, freq: 900 + p * 400 });
  }

  post() {
    this.tone({ freq: 190, to: 120, dur: 0.28, type: 'square', gain: 0.1 });
    this.noise({ dur: 0.2, gain: 0.12, freq: 400, type: 'lowpass' });
  }

  wall(power = 1) {
    this.tone({ freq: 120, to: 60, dur: 0.12, type: 'sine', gain: Math.min(0.2, 0.04 + power * 0.01) });
    this.noise({ dur: 0.08, gain: Math.min(0.1, 0.01 + power * 0.004), freq: 700 });
  }

  pickup(big = false) {
    this.tone({ freq: big ? 480 : 620, to: big ? 960 : 880, dur: 0.16, type: 'triangle', gain: big ? 0.13 : 0.07 });
    if (big) this.tone({ freq: 720, to: 1440, dur: 0.22, type: 'sine', gain: 0.06, delay: 0.04 });
  }

  goal(team = 'blue', own = false) {
    if (own) {
      this.tone({ freq: 220, to: 110, dur: 0.8, type: 'sawtooth', gain: 0.12 });
      return;
    }
    const base = team === 'blue' ? 196 : 174.6;
    [1, 1.25, 1.5, 2].forEach((mult, i) => {
      this.tone({ freq: base * mult, dur: 1.35, type: 'sawtooth', gain: 0.075, delay: i * 0.02 });
    });
    this.tone({ freq: base / 2, dur: 1.5, type: 'square', gain: 0.06 });
    this.noise({ dur: 1.6, gain: 0.14, freq: 1100, q: 0.5 });
  }

  win() {
    [196, 246.9, 293.7, 392].forEach((freq, i) => {
      this.tone({ freq, dur: 0.5, type: 'triangle', gain: 0.1, delay: i * 0.1 });
    });
  }

  lose() {
    [220, 185, 146.8].forEach((freq, i) => {
      this.tone({ freq, dur: 0.55, type: 'triangle', gain: 0.09, delay: i * 0.14 });
    });
  }
}

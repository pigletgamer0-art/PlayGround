/* Small WebAudio chiptune kit: synthesized SFX plus a gentle arpeggio loop. */

export class SoundKit {
  constructor() {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.enabled = true
    this.musicTimer = null
    this.step = 0
    this.noiseBuffer = null
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.enabled ? 0.75 : 0
    this.master.connect(this.ctx.destination)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = 0.12
    this.musicGain.connect(this.master)

    const length = this.ctx.sampleRate * 0.8
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }

  setEnabled(on) {
    this.enabled = on
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.03)
    if (!on) this.stopMusic()
  }

  tone(freq, duration = 0.1, type = 'square', volume = 0.045, slide = 0, delay = 0) {
    if (!this.enabled || !this.ctx) return
    const start = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain).connect(this.master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  noise(duration = 0.25, volume = 0.12, highpass = 500) {
    if (!this.enabled || !this.ctx || !this.noiseBuffer) return
    const start = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    src.connect(filter).connect(gain).connect(this.master)
    src.start(start)
    src.stop(start + duration)
  }

  select() { this.tone(720, 0.05, 'square', 0.025) }
  swap() { this.tone(420, 0.07, 'triangle', 0.05, 220) }
  invalid() {
    this.tone(180, 0.1, 'sawtooth', 0.05, -60)
    this.tone(140, 0.13, 'square', 0.035, -40, 0.08)
  }
  match(combo = 1) {
    const base = 440 * Math.pow(2, Math.min(combo - 1, 6) / 12)
    this.tone(base, 0.09, 'square', 0.045)
    this.tone(base * 1.25, 0.08, 'square', 0.035, 0, 0.06)
    this.tone(base * 1.5, 0.11, 'triangle', 0.035, 0, 0.12)
  }
  special() {
    ;[523, 659, 784, 1047].forEach((note, i) => this.tone(note, 0.12, 'square', 0.04, 0, i * 0.045))
  }
  explode() {
    this.noise(0.4, 0.16, 250)
    this.tone(90, 0.35, 'sawtooth', 0.09, -50)
  }
  bossHit() {
    this.tone(120, 0.12, 'square', 0.06, -40)
    this.tone(70, 0.18, 'sawtooth', 0.05, -25, 0.03)
  }
  bossAttack() {
    this.noise(0.3, 0.06, 120)
    this.tone(60, 0.4, 'sawtooth', 0.06, -15)
  }
  ready() {
    this.tone(660, 0.09, 'square', 0.05)
    this.tone(880, 0.12, 'square', 0.05, 0, 0.09)
    this.tone(1175, 0.16, 'triangle', 0.04, 0, 0.19)
  }
  victory() {
    const notes = [523, 659, 784, 1047, 1319, 1568]
    notes.forEach((note, i) => this.tone(note, 0.2, 'square', 0.045, 0, i * 0.11))
    this.tone(523, 0.55, 'triangle', 0.05, 0, 0.66)
    this.tone(784, 0.55, 'triangle', 0.04, 0, 0.66)
  }
  levelUp() {
    const notes = [392, 523, 659, 784]
    notes.forEach((note, i) => this.tone(note, 0.16, 'square', 0.05, 0, i * 0.1))
  }

  startMusic() {
    if (!this.enabled || !this.ctx || this.musicTimer) return
    const scale = [261.63, 329.63, 392.0, 523.25, 659.25, 523.25, 392.0, 329.63]
    const bass = [130.81, 130.81, 174.61, 196.0]
    this.musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return
      const note = scale[this.step % scale.length]
      const when = this.step % 8
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = note * (when > 4 ? 2 : 1)
      const start = this.ctx.currentTime + 0.02
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19)
      osc.connect(gain).connect(this.musicGain)
      osc.start(start)
      osc.stop(start + 0.22)
      if (this.step % 4 === 0) {
        const b = this.ctx.createOscillator()
        const bg = this.ctx.createGain()
        b.type = 'sine'
        b.frequency.value = bass[Math.floor(this.step / 4) % bass.length]
        bg.gain.setValueAtTime(0.0001, start)
        bg.gain.exponentialRampToValueAtTime(0.05, start + 0.02)
        bg.gain.exponentialRampToValueAtTime(0.0001, start + 0.42)
        b.connect(bg).connect(this.musicGain)
        b.start(start)
        b.stop(start + 0.45)
      }
      this.step++
    }, 265)
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer)
    this.musicTimer = null
  }
}

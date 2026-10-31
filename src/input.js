const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const BOOST_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

export class InputState {
  constructor({ onPause, onMute, onReset } = {}) {
    this.keys = new Set();
    this.jumpQueued = false;
    this.resetQueued = false;
    this.touch = { active: false, x: 0, y: 0 };
    this.touchBoost = false;
    this.touchJump = false;
    this.onPause = onPause || (() => {});
    this.onMute = onMute || (() => {});
    this.onReset = onReset || (() => {});
    this.padPrevJump = false;
    this.padPrevBoost = false;
    this.debugControls = null;
    this.interactQueued = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookActive = false;
    this.lookPointer = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
    this.bindKeyboard();
    this.bindTouch();
    this.bindLook();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code.startsWith('Arrow') || event.code === 'Tab') {
        if (event.code !== 'Tab') event.preventDefault();
      }
      if (event.repeat) return;
      if (event.code === 'Space') this.jumpQueued = true;
      if (event.code === 'Escape' || event.code === 'KeyP') this.onPause();
      if (event.code === 'KeyM') this.onMute();
      if (event.code === 'KeyR') this.resetQueued = true;
      if (event.code === 'KeyF' || event.code === 'KeyE') this.interactQueued = true;
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchBoost = false;
      this.touch.active = false;
    });
  }

  bindTouch() {
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('joystickKnob');
    if (joystick && knob) {
      const update = (event) => {
        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = rect.width * 0.42;
        let dx = (event.clientX - cx) / radius;
        let dy = (event.clientY - cy) / radius;
        const length = Math.hypot(dx, dy);
        if (length > 1) {
          dx /= length;
          dy /= length;
        }
        const dead = 0.1;
        const apply = (v) => (Math.abs(v) < dead ? 0 : (v - Math.sign(v) * dead) / (1 - dead));
        this.touch.x = apply(dx);
        this.touch.y = -apply(dy);
        knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
      };
      joystick.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        joystick.setPointerCapture(event.pointerId);
        this.touch.active = true;
        joystick.classList.add('active');
        update(event);
      });
      joystick.addEventListener('pointermove', (event) => {
        if (!this.touch.active) return;
        event.preventDefault();
        update(event);
      });
      const end = () => {
        this.touch.active = false;
        this.touch.x = 0;
        this.touch.y = 0;
        joystick.classList.remove('active');
        knob.style.transform = 'translate(0px, 0px)';
      };
      joystick.addEventListener('pointerup', end);
      joystick.addEventListener('pointercancel', end);
      joystick.addEventListener('lostpointercapture', end);
    }

    const bindHold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        el.classList.add('pressed');
        onDown();
      });
      const release = () => {
        el.classList.remove('pressed');
        onUp();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    };

    bindHold('boostBtn', () => { this.touchBoost = true; }, () => { this.touchBoost = false; });
    bindHold('jumpBtn', () => { this.touchJump = true; this.jumpQueued = true; }, () => { this.touchJump = false; });
    bindHold('useBtn', () => { this.interactQueued = true; }, () => {});
  }

  bindLook() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.lookActive = true;
      this.lookPointer = event.pointerId;
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail when the pointer is already gone.
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.lookActive || event.pointerId !== this.lookPointer) return;
      this.lookDX += event.clientX - this.lastLookX;
      this.lookDY += event.clientY - this.lastLookY;
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
    });
    const end = (event) => {
      if (event.pointerId !== this.lookPointer) return;
      this.lookActive = false;
      this.lookPointer = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get gamepad() {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  sample() {
    let throttle = 0;
    let steer = 0;
    let boost = false;
    let jump = this.jumpQueued;
    this.jumpQueued = false;
    let reset = this.resetQueued;
    this.resetQueued = false;
    const interact = this.interactQueued;
    this.interactQueued = false;
    const lookX = this.lookDX;
    const lookY = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;

    if (this.debugControls) {
      return {
        throttle: Math.max(-1, Math.min(1, this.debugControls.throttle ?? 0)),
        steer: Math.max(-1, Math.min(1, this.debugControls.steer ?? 0)),
        boost: Boolean(this.debugControls.boost),
        jump: Boolean(this.debugControls.jump),
        reset: false,
        interact: Boolean(this.debugControls.interact),
        lookX,
        lookY,
      };
    }

    for (const key of this.keys) {
      if (FORWARD_KEYS.has(key)) throttle += 1;
      if (BACK_KEYS.has(key)) throttle -= 1;
      if (LEFT_KEYS.has(key)) steer -= 1;
      if (RIGHT_KEYS.has(key)) steer += 1;
      if (BOOST_KEYS.has(key)) boost = true;
    }

    if (this.touch.active || Math.abs(this.touch.y) > 0.02 || Math.abs(this.touch.x) > 0.02) {
      throttle = this.touch.y;
      steer = this.touch.x;
    }
    if (this.touchBoost) boost = true;

    const pad = this.gamepad;
    if (pad) {
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      if (Math.abs(axisX) > 0.15) steer = axisX;
      if (Math.abs(axisY) > 0.15) throttle = -axisY;
      const padJump = pad.buttons[0]?.pressed;
      const padBoost = pad.buttons[1]?.pressed || pad.buttons[7]?.pressed;
      if (padJump && !this.padPrevJump) jump = true;
      if (padBoost) boost = true;
      if (pad.buttons[3]?.pressed) reset = true;
      this.padPrevJump = padJump;
      this.padPrevBoost = padBoost;
    }

    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      boost,
      jump,
      reset,
      interact,
      lookX,
      lookY,
    };
  }
}

const DEADZONE = 0.14;

function applyDeadzone(value) {
  return Math.abs(value) < DEADZONE ? 0 : value;
}

export class InputManager {
  constructor({ onPause, onMute, onRestart }) {
    this.keys = new Set();
    this.touch = { steer: 0, throttle: 0, jump: false, boost: false };
    this.joystickPointer = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.gamepadPause = false;
    this.onPause = onPause;
    this.onMute = onMute;
    this.onRestart = onRestart;
    this.hasTouch = false;

    this.bindKeyboard();
    this.bindTouch();
    this.detectTouch();
  }

  detectTouch() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.hasTouch = coarse || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    document.body.classList.toggle('touch', this.hasTouch);
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
        return;
      }
      this.keys.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'Escape' || event.code === 'KeyP') this.onPause?.();
      if (event.code === 'KeyM') this.onMute?.();
      if (event.code === 'KeyR') this.onRestart?.();
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.jump = false;
      this.touch.boost = false;
    });
  }

  bindTouch() {
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    const jump = document.getElementById('btn-jump');
    const boost = document.getElementById('btn-boost');
    if (!joystick || !knob || !jump || !boost) return;

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const updateFromPointer = (event) => {
      let dx = event.clientX - this.joystickCenter.x;
      let dy = event.clientY - this.joystickCenter.y;
      const max = 42;
      const length = Math.hypot(dx, dy);
      if (length > max) {
        dx = dx / length * max;
        dy = dy / length * max;
      }
      setKnob(dx, dy);
      this.touch.steer = applyDeadzone(-dx / max);
      this.touch.throttle = applyDeadzone(-dy / max);
    };

    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.joystickPointer = event.pointerId;
      const rect = joystick.getBoundingClientRect();
      this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      joystick.setPointerCapture(event.pointerId);
      updateFromPointer(event);
    });

    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      updateFromPointer(event);
    });

    const release = (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.touch.steer = 0;
      this.touch.throttle = 0;
      setKnob(0, 0);
    };
    joystick.addEventListener('pointerup', release);
    joystick.addEventListener('pointercancel', release);
    joystick.addEventListener('lostpointercapture', release);

    const bindButton = (element, key) => {
      const press = (event) => {
        event.preventDefault();
        element.classList.add('pressed');
        this.touch[key] = true;
      };
      const releaseButton = (event) => {
        event.preventDefault();
        element.classList.remove('pressed');
        this.touch[key] = false;
      };
      element.addEventListener('pointerdown', press);
      element.addEventListener('pointerup', releaseButton);
      element.addEventListener('pointercancel', releaseButton);
      element.addEventListener('pointerleave', (event) => {
        if (event.buttons === 0) releaseButton(event);
      });
      element.addEventListener('contextmenu', (event) => event.preventDefault());
    };
    bindButton(jump, 'jump');
    bindButton(boost, 'boost');
  }

  snapshot() {
    let throttle = 0;
    let steer = 0;
    let jump = false;
    let boost = false;
    let handbrake = false;

    const keys = this.keys;
    if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) steer += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) steer -= 1;
    if (keys.has('Space')) jump = true;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) boost = true;
    if (keys.has('KeyX') || keys.has('ControlLeft') || keys.has('ControlRight')) handbrake = true;

    if (this.touch.steer || this.touch.throttle) {
      steer = this.touch.steer;
      throttle = this.touch.throttle;
    }
    jump = jump || this.touch.jump;
    boost = boost || this.touch.boost;

    const pads = navigator.getGamepads?.() || [];
    for (const pad of pads) {
      if (!pad) continue;
      const axisX = applyDeadzone(pad.axes[0] || 0);
      const axisY = applyDeadzone(pad.axes[1] || 0);
      if (axisX || axisY) {
        steer = -axisX;
        throttle = -axisY;
      }
      if (pad.buttons[0]?.pressed) jump = true;
      if (pad.buttons[1]?.pressed || pad.buttons[7]?.pressed) boost = true;
      if (pad.buttons[2]?.pressed) handbrake = true;
      const start = Boolean(pad.buttons[9]?.pressed);
      if (start && !this.gamepadPause) this.onPause?.();
      this.gamepadPause = start;
    }

    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      jump,
      boost,
      handbrake,
    };
  }
}

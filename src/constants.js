// Shared arena and physics tuning. Units are roughly metres / seconds.
export const FIELD = {
  halfLength: 50,
  halfWidth: 32,
  wallHeight: 22,
  ceiling: 27,
  goalHalfWidth: 10.5,
  goalHeight: 10.5,
  goalDepth: 7,
  ballRadius: 2.05,
  carGroundY: 1.32,
  gravity: 30,
};

export const TEAM = {
  blue: {
    name: 'YOU',
    color: 0x2f7bff,
    accent: 0x69e5ff,
    deep: 0x061a3d,
    css: '#4c9cff',
    glow: '#59c8ff',
  },
  orange: {
    name: 'BOT',
    color: 0xff6318,
    accent: 0xffd34e,
    deep: 0x3a1204,
    css: '#ff8a3d',
    glow: '#ffb347',
  },
};

export const CAR = {
  maxSpeed: 37,
  boostSpeed: 51,
  accel: 31,
  boostAccel: 54,
  airAccel: 13,
  airBoostAccel: 26,
  jumpSpeed: 12.6,
  doubleJumpSpeed: 10.2,
  steerRate: 2.75,
  gravity: 30,
  radius: 2.15,
  boostDrain: 32,
  boostStart: 34,
};

export const BOT_LEVELS = {
  rookie: {
    label: 'Rookie',
    maxSpeed: 23,
    boostSpeed: 31,
    accelScale: 0.7,
    reaction: 0.18,
    aimNoise: 1.9,
    boostLove: 0.35,
    jumpLove: 0.35,
    boostStart: 24,
  },
  pro: {
    label: 'Pro',
    maxSpeed: 28,
    boostSpeed: 37,
    accelScale: 0.9,
    reaction: 0.09,
    aimNoise: 0.85,
    boostLove: 0.72,
    jumpLove: 0.8,
    boostStart: 34,
  },
  allstar: {
    label: 'All-Star',
    maxSpeed: 33,
    boostSpeed: 45,
    accelScale: 1.05,
    reaction: 0.045,
    aimNoise: 0.25,
    boostLove: 1,
    jumpLove: 1,
    boostStart: 50,
  },
};

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

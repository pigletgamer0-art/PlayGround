// Opponent brain. Pure data in / input out, so it can be unit tested.
import { ARENA, clamp, forwardSpeed, predictBall, wrapAngle } from './physics.js';

export const DIFFICULTIES = {
  rookie: {
    label: 'Rookie',
    reaction: 0.3,
    aimError: 0.2,
    jumpSkill: 0.35,
    boostSkill: 0.45,
    lookahead: 0.25,
    throttle: 0.86,
  },
  pro: {
    label: 'Pro',
    reaction: 0.15,
    aimError: 0.09,
    jumpSkill: 0.78,
    boostSkill: 0.82,
    lookahead: 0.42,
    throttle: 1,
  },
  allstar: {
    label: 'All-Star',
    reaction: 0.07,
    aimError: 0.035,
    jumpSkill: 1,
    boostSkill: 1,
    lookahead: 0.6,
    throttle: 1,
  },
};

export function createBot(difficulty = 'pro', seed = 1) {
  return {
    difficulty,
    config: DIFFICULTIES[difficulty] || DIFFICULTIES.pro,
    think: 0,
    target: { x: 0, z: 0 },
    aim: { x: -1, z: 0 },
    mode: 'attack',
    jumpCooldown: 0,
    jumpLock: 0,
    spread: 0,
    seed,
    rng: mulberry32(seed),
    lastBoost: false,
    padTarget: null,
  };
}

function mulberry32(a) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * state: { self, ball, opponent, pads, time }
 * The bot defends +x and attacks -x.
 */
export function updateBot(bot, state, dt) {
  const { self, ball, opponent } = state;
  const cfg = bot.config;
  bot.jumpCooldown = Math.max(0, bot.jumpCooldown - dt);
  bot.think -= dt;
  bot.spread += dt;

  const distToBall = Math.hypot(ball.pos.x - self.pos.x, ball.pos.z - self.pos.z);
  const ballSpeed = Math.hypot(ball.vel.x, ball.vel.z);
  const ballThreat =
    ball.pos.x > 12 && Math.hypot(ball.pos.x - 42, ball.pos.z) < 30 ? 1 : 0;

  // Re-plan on a human-ish cadence.
  if (bot.think <= 0) {
    bot.think = cfg.reaction * (0.75 + bot.rng() * 0.55);
    const horizon = clamp(distToBall / 34, 0.06, cfg.lookahead) * (0.7 + bot.rng() * 0.5);
    const predicted = predictBall(ball, horizon);

    // Attack the player's goal, aiming away from its edges.
    const goalZ = (bot.rng() - 0.5) * 7;
    let aimX = -ARENA.halfLength - predicted.x;
    let aimZ = goalZ - predicted.z;
    const aimLen = Math.hypot(aimX, aimZ) || 1;
    aimX /= aimLen;
    aimZ /= aimLen;
    // Rotate the aim a little based on skill + noise.
    const wobble = (bot.rng() - 0.5) * 2 * cfg.aimError;
    const cos = Math.cos(wobble);
    const sin = Math.sin(wobble);
    bot.aim.x = aimX * cos - aimZ * sin;
    bot.aim.z = aimX * sin + aimZ * cos;

    const carToBallX = self.pos.x - predicted.x;
    const carToBallZ = self.pos.z - predicted.z;
    const wrongSide = carToBallX * bot.aim.x + carToBallZ * bot.aim.z > 1.6;

    // Stand between the ball and our own goal when it is threatening.
    if (ballThreat && ball.pos.x > 24) {
      bot.mode = 'defend';
      const gx = 42 - ball.pos.x;
      const gz = -ball.pos.z;
      const gl = Math.hypot(gx, gz) || 1;
      bot.target.x = predicted.x + (gx / gl) * 3.6;
      bot.target.z = predicted.z + (gz / gl) * 3.6;
    } else if (wrongSide && distToBall < 15) {
      // Loop around the ball instead of driving through it.
      bot.mode = 'loop';
      const perp = self.pos.z >= predicted.z ? 1 : -1;
      bot.target.x = predicted.x + bot.aim.x * 4.4 + -bot.aim.z * perp * 7.5;
      bot.target.z = predicted.z + bot.aim.z * 4.4 + bot.aim.x * perp * 7.5;
    } else if (predicted.y > 5.5 && distToBall < 13) {
      // Wait under the dropping ball, then challenge.
      bot.mode = 'aerial';
      bot.target.x = predicted.x - bot.aim.x * 2.4;
      bot.target.z = predicted.z - bot.aim.z * 2.4;
    } else {
      bot.mode = 'attack';
      bot.target.x = predicted.x - bot.aim.x * 2.7;
      bot.target.z = predicted.z - bot.aim.z * 2.7;
    }

    // Fall back toward midfield when the ball is far upfield and we have no boost.
    if (bot.mode === 'attack' && ball.pos.x < -6 && ballSpeed < 5 && self.boost < 15) {
      const big = (state.pads || [])
        .filter((p) => p.active && p.big)
        .sort(
          (a, b) =>
            Math.hypot(a.x - self.pos.x, a.z - self.pos.z) -
            Math.hypot(b.x - self.pos.x, b.z - self.pos.z),
        )[0];
      if (big) {
        bot.padTarget = big;
        bot.mode = 'boost';
        bot.target.x = big.x;
        bot.target.z = big.z;
      }
    }
  }

  const target = bot.padTarget && bot.mode === 'boost' ? bot.padTarget : bot.target;

  // Steering.
  const dx = target.x - self.pos.x;
  const dz = target.z - self.pos.z;
  const targetDist = Math.hypot(dx, dz);
  const desiredYaw = Math.atan2(dx, dz);
  const diff = wrapAngle(desiredYaw - self.yaw);
  let steer = clamp(diff * 2.35, -1, 1);

  // Throttle: brake into sharp turns, then commit.
  let throttle = cfg.throttle;
  const speed = Math.hypot(self.vel.x, self.vel.z);
  if (Math.abs(diff) > 1.75 && speed > 10) throttle = -0.5;
  else if (Math.abs(diff) > 1.15 && speed > 17) throttle = 0.1;
  if (targetDist < 1.6 && Math.abs(diff) > 2.2) throttle = 0.35;

  const towardTarget = diff > -1.05 && diff < 1.05;
  let boost = false;
  if (self.boost > 3 && towardTarget && ballSpeed < 40) {
    const passingBall = distToBall < 5 && forwardSpeed(self) > 8;
    if (bot.mode === 'boost' || passingBall || targetDist > 9) {
      boost = bot.rng() < cfg.boostSkill ? true : bot.lastBoost;
    }
  }
  if (bot.mode === 'defend' && ballThreat) boost = self.boost > 3 && towardTarget;
  bot.lastBoost = boost;

  // Jumping and flipping at the ball.
  let jumpPressed = false;
  const ballAbove = ball.pos.y > 2.5;
  const ballClose = distToBall < 7;
  if (self.onGround && ballAbove && ballClose && bot.jumpCooldown <= 0) {
    if (bot.rng() < cfg.jumpSkill * 0.9) {
      jumpPressed = true;
      bot.jumpCooldown = 0.55;
      bot.jumpLock = 0.18;
    }
  } else if (!self.onGround && self.jumps === 1 && bot.jumpLock > 0) {
    bot.jumpLock -= dt;
    if (bot.jumpLock <= 0 && distToBall < 5.5) {
      jumpPressed = true;
      bot.jumpCooldown = 0.5;
    }
  }

  // Keep the bot inside the arena target zone.
  void opponent;

  return { throttle, steer, boost, jumpPressed };
}

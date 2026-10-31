// Arcade car-soccer physics shared by the game and the unit tests.
// Everything here is plain data + math so it can run in Node without Three.js.

export const ARENA = Object.freeze({
  halfLength: 42,
  halfWidth: 28,
  wallHeight: 18,
  ceiling: 26,
  goalHalfWidth: 10,
  goalHeight: 9,
  goalDepth: 6,
  ballRadius: 1.62,
  gravity: 26,
  carHalfLength: 1.55,
  carHalfWidth: 0.78,
  carBodyHeight: 1.05,
  maxBallSpeed: 58,
});

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createBall(x = 0, y = ARENA.ballRadius, z = 0) {
  return {
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
  };
}

export function createCar({ x = 0, z = 0, yaw = 0, boost = 34, team = 'blue' } = {}) {
  return {
    team,
    pos: { x, y: 0, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    boost,
    onGround: true,
    jumps: 0,
    jumpHeld: false,
    flipTime: 0,
    flipDir: { x: 0, z: 0 },
    boosting: false,
    speed: 0,
    wheelSpin: 0,
    hitCooldown: 0,
    padCooldown: 0,
  };
}

export function resetCar(car, { x, z, yaw, boost = 34 }) {
  car.pos.x = x;
  car.pos.y = 0;
  car.pos.z = z;
  car.vel.x = 0;
  car.vel.y = 0;
  car.vel.z = 0;
  car.yaw = yaw;
  car.boost = boost;
  car.onGround = true;
  car.jumps = 0;
  car.flipTime = 0;
  car.flipDir.x = 0;
  car.flipDir.z = 0;
  car.boosting = false;
  car.speed = 0;
  car.hitCooldown = 0;
  car.padCooldown = 0;
}

export function carForward(car) {
  return { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
}

export function forwardSpeed(car) {
  const f = carForward(car);
  return car.vel.x * f.x + car.vel.z * f.z;
}

/**
 * Advance a car one step.
 * input: { throttle: -1..1, steer: -1..1, boost: boolean, jumpPressed: boolean }
 */
export function stepCar(car, input, dt) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const wantBoost = Boolean(input.boost) && car.boost > 0.01;
  const f = carForward(car);
  let along = car.vel.x * f.x + car.vel.z * f.z;

  car.hitCooldown = Math.max(0, car.hitCooldown - dt);
  car.padCooldown = Math.max(0, car.padCooldown - dt);
  car.flipTime = Math.max(0, car.flipTime - dt);

  if (car.onGround) {
    // Steering authority grows with speed but keeps a small amount for pivoting.
    const speedFactor = clamp(Math.abs(along) / 10, 0.18, 1);
    const direction = along < -0.4 ? -1 : 1;
    car.yaw = wrapAngle(car.yaw + steer * 2.55 * dt * speedFactor * direction);

    let accel = 0;
    if (throttle > 0) {
      accel = along < -0.8 ? 26 * throttle : 18.5 * throttle;
    } else if (throttle < 0) {
      accel = along > 0.8 ? 30 * throttle : 11.5 * throttle;
    }
    if (wantBoost) {
      accel += 24;
      car.boost = Math.max(0, car.boost - 31 * dt);
    }
    car.vel.x += f.x * accel * dt;
    car.vel.z += f.z * accel * dt;

    // Recompute forward speed after acceleration, then bleed lateral grip.
    const nf = carForward(car);
    along = car.vel.x * nf.x + car.vel.z * nf.z;
    const lateralX = car.vel.x - nf.x * along;
    const lateralZ = car.vel.z - nf.z * along;
    const grip = wantBoost ? 4.2 : 7.2;
    const keep = Math.exp(-grip * dt);
    car.vel.x = nf.x * along + lateralX * keep;
    car.vel.z = nf.z * along + lateralZ * keep;

    // Speed limits.
    const maxForward = wantBoost ? 39 : 23.5;
    const nf2 = carForward(car);
    along = car.vel.x * nf2.x + car.vel.z * nf2.z;
    if (along > maxForward) {
      const excess = along - maxForward;
      car.vel.x -= nf2.x * excess;
      car.vel.z -= nf2.z * excess;
    } else if (along < -13) {
      const excess = along + 13;
      car.vel.x -= nf2.x * excess;
      car.vel.z -= nf2.z * excess;
    }
    // Rolling drag.
    const drag = Math.exp(-0.24 * dt);
    car.vel.x *= drag;
    car.vel.z *= drag;
  } else {
    // Air control: steer rotates the chassis, throttle offers a nudge.
    car.yaw = wrapAngle(car.yaw + steer * 1.55 * dt);
    const af = carForward(car);
    if (throttle !== 0) {
      car.vel.x += af.x * throttle * 5.2 * dt;
      car.vel.z += af.z * throttle * 5.2 * dt;
    }
    if (wantBoost) {
      car.vel.x += af.x * 17 * dt;
      car.vel.z += af.z * 17 * dt;
      car.boost = Math.max(0, car.boost - 24 * dt);
    }
    const airDrag = Math.exp(-0.12 * dt);
    car.vel.x *= airDrag;
    car.vel.z *= airDrag;
  }
  car.boosting = wantBoost;

  // Jump / flip.
  if (input.jumpPressed) {
    if (car.onGround) {
      car.vel.y = 10.6;
      car.onGround = false;
      car.jumps = 1;
    } else if (car.jumps < 2) {
      car.jumps = 2;
      const af = carForward(car);
      let dx = af.x * Math.max(0.25, throttle);
      let dz = af.z * Math.max(0.25, throttle);
      if (Math.abs(steer) > 0.05) {
        dx += Math.cos(car.yaw) * steer * 0.9;
        dz += -Math.sin(car.yaw) * steer * 0.9;
      }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      car.vel.x += dx * 11.5;
      car.vel.z += dz * 11.5;
      car.vel.y = Math.max(car.vel.y, 1.2) + 3.4;
      car.flipTime = 0.55;
      car.flipDir.x = dx;
      car.flipDir.z = dz;
    }
  }

  // Vertical integration.
  car.vel.y -= ARENA.gravity * dt;
  car.pos.y += car.vel.y * dt;
  if (car.pos.y <= 0) {
    car.pos.y = 0;
    car.vel.y = 0;
    car.onGround = true;
    car.jumps = 0;
    car.flipTime = 0;
  } else if (car.pos.y > 0.03) {
    car.onGround = false;
  }

  // Horizontal integration.
  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;
  collideCarArena(car);
  car.speed = Math.hypot(car.vel.x, car.vel.y, car.vel.z);
  car.wheelSpin += along * dt * 1.4;
  return car;
}

export function collideCarArena(car) {
  const marginX = ARENA.carHalfLength + 0.15;
  const marginZ = ARENA.carHalfWidth + 0.2;
  if (car.pos.x > ARENA.halfLength - marginX) {
    car.pos.x = ARENA.halfLength - marginX;
    if (car.vel.x > 0) car.vel.x *= -0.35;
    car.vel.z *= 0.9;
  } else if (car.pos.x < -ARENA.halfLength + marginX) {
    car.pos.x = -ARENA.halfLength + marginX;
    if (car.vel.x < 0) car.vel.x *= -0.35;
    car.vel.z *= 0.9;
  }
  if (car.pos.z > ARENA.halfWidth - marginZ) {
    car.pos.z = ARENA.halfWidth - marginZ;
    if (car.vel.z > 0) car.vel.z *= -0.25;
    car.vel.x *= 0.94;
  } else if (car.pos.z < -ARENA.halfWidth + marginZ) {
    car.pos.z = -ARENA.halfWidth + marginZ;
    if (car.vel.z < 0) car.vel.z *= -0.25;
    car.vel.x *= 0.94;
  }
}

export function ballBounce(ball, axis, restitution = 0.78) {
  if (Math.sign(ball.vel[axis]) !== 0) ball.vel[axis] *= -restitution;
}

export function inGoalMouth(ball, side) {
  return (
    Math.abs(ball.pos.z) < ARENA.goalHalfWidth - ARENA.ballRadius * 0.22 &&
    ball.pos.y < ARENA.goalHeight - ARENA.ballRadius * 0.35
  );
}

export function stepBall(ball, dt, onBounce) {
  ball.vel.y -= ARENA.gravity * dt;
  const drag = Math.exp(-0.1 * dt);
  ball.vel.x *= drag;
  ball.vel.y *= drag;
  ball.vel.z *= drag;
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;
  ball.pos.z += ball.vel.z * dt;

  const { halfLength, halfWidth, ballRadius: r, ceiling } = ARENA;

  // Floor.
  if (ball.pos.y < r) {
    ball.pos.y = r;
    if (ball.vel.y < -1.1) {
      onBounce?.('floor', Math.abs(ball.vel.y));
      ball.vel.y = -ball.vel.y * 0.7;
    } else ball.vel.y = 0;
    const roll = Math.exp(-0.32 * dt);
    ball.vel.x *= roll;
    ball.vel.z *= roll;
  }
  // Ceiling.
  if (ball.pos.y > ceiling - r) {
    ball.pos.y = ceiling - r;
    if (ball.vel.y > 0) {
      onBounce?.('ceiling', ball.vel.y);
      ball.vel.y = -ball.vel.y * 0.62;
    }
  }
  // Side walls.
  if (ball.pos.z > halfWidth - r) {
    ball.pos.z = halfWidth - r;
    if (ball.vel.z > 0) {
      onBounce?.('wall', ball.vel.z);
      ball.vel.z *= -0.79;
    }
  } else if (ball.pos.z < -halfWidth + r) {
    ball.pos.z = -halfWidth + r;
    if (ball.vel.z < 0) {
      onBounce?.('wall', ball.vel.z);
      ball.vel.z *= -0.79;
    }
  }
  // End walls / goals / crossbars.
  for (const side of [-1, 1]) {
    const wallX = side * halfLength;
    const pastWall = side === 1 ? ball.pos.x > wallX - r : ball.pos.x < wallX + r;
    if (!pastWall) continue;
    const mouth = inGoalMouth(ball, side);
    if (!mouth) {
      ball.pos.x = wallX - side * r;
      if (Math.sign(ball.vel.x) === side) {
        onBounce?.('wall', Math.abs(ball.vel.x));
        ball.vel.x *= -0.8;
      }
      // Hitting the post / crossbar lip.
      if (Math.abs(ball.pos.z) > ARENA.goalHalfWidth - r && Math.abs(ball.pos.z) < ARENA.goalHalfWidth + r) {
        ball.vel.z += Math.sign(ball.pos.z) * Math.abs(ball.vel.x) * 0.45;
      }
    } else {
      const netX = side * (halfLength + ARENA.goalDepth - r);
      const hitNet = side === 1 ? ball.pos.x > netX : ball.pos.x < netX;
      if (hitNet) {
        ball.pos.x = netX;
        if (Math.sign(ball.vel.x) === side) {
          onBounce?.('net', Math.abs(ball.vel.x));
          ball.vel.x *= -0.32;
        }
      }
      // Goal side nets keep the ball inside the net volume.
      const netZ = ARENA.goalHalfWidth - r * 0.4;
      if (side === 1 ? ball.pos.x > halfLength : ball.pos.x < -halfLength) {
        if (ball.pos.z > netZ) {
          ball.pos.z = netZ;
          ball.vel.z *= -0.3;
        } else if (ball.pos.z < -netZ) {
          ball.pos.z = -netZ;
          ball.vel.z *= -0.3;
        }
        if (ball.pos.y > ARENA.goalHeight - r) {
          ball.pos.y = ARENA.goalHeight - r;
          if (ball.vel.y > 0) ball.vel.y *= -0.3;
        }
      }
    }
  }

  // Keep the ball at a sane speed.
  const speed = Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z);
  if (speed > ARENA.maxBallSpeed) {
    const k = ARENA.maxBallSpeed / speed;
    ball.vel.x *= k;
    ball.vel.y *= k;
    ball.vel.z *= k;
  }
  // Visual spin follows travel direction.
  ball.spin.x = ball.vel.z / r;
  ball.spin.z = -ball.vel.x / r;
  return ball;
}

export function detectGoal(ball) {
  const { halfLength, goalHalfWidth, goalHeight, ballRadius: r } = ARENA;
  if (ball.pos.x > halfLength + r * 0.85 && Math.abs(ball.pos.z) < goalHalfWidth - 0.2 && ball.pos.y < goalHeight - 0.2) {
    return 'blue';
  }
  if (ball.pos.x < -halfLength - r * 0.85 && Math.abs(ball.pos.z) < goalHalfWidth - 0.2 && ball.pos.y < goalHeight - 0.2) {
    return 'red';
  }
  return null;
}

/** Resolve a car -> ball hit with a capsule-ish car body. Returns hit strength (0 = no hit). */
export function collideCarBall(car, ball) {
  const f = carForward(car);
  const half = 0.95;
  const ax = car.pos.x - f.x * half;
  const az = car.pos.z - f.z * half;
  const cy = car.pos.y + 0.62;
  const dx = ball.pos.x - ax;
  const dz = ball.pos.z - az;
  const t = clamp((dx * f.x + dz * f.z) / (half * 2), 0, 1);
  const cx = ax + f.x * half * 2 * t;
  const cz = az + f.z * half * 2 * t;
  let nx = ball.pos.x - cx;
  let ny = ball.pos.y - cy;
  let nz = ball.pos.z - cz;
  let dist = Math.hypot(nx, ny, nz);
  const minDist = ARENA.ballRadius + 0.82;

  // Also catch a car shoving a ball that is directly above/below it.
  if (dist < 0.001) {
    nx = ball.pos.x - car.pos.x;
    nz = ball.pos.z - car.pos.z;
    dist = Math.hypot(nx, nz) || 1;
    ny = 0;
  }
  if (dist >= minDist) return 0;

  nx /= dist || 1;
  ny /= dist || 1;
  nz /= dist || 1;
  const penetration = minDist - dist;
  ball.pos.x += nx * penetration;
  ball.pos.y += ny * penetration;
  ball.pos.z += nz * penetration;

  const speed = Math.hypot(car.vel.x, car.vel.y, car.vel.z);
  const rel = ball.vel.x * nx + ball.vel.y * ny + ball.vel.z * nz;
  const carInto = car.vel.x * nx + car.vel.y * ny + car.vel.z * nz;
  if (rel > 5 && carInto < 1) return 0; // ball already flying away

  const power = Math.max(0, carInto) * 1.15 + speed * 0.42 + 2.6;
  ball.vel.x += nx * power + car.vel.x * 0.28;
  ball.vel.y += ny * power * 0.55 + car.vel.y * 0.4 + Math.min(5.2, speed * 0.1);
  ball.vel.z += nz * power + car.vel.z * 0.28;
  ball.vel.y = Math.max(-10, Math.min(20, ball.vel.y));
  car.vel.x *= 0.78;
  car.vel.y *= 0.86;
  car.vel.z *= 0.78;
  car.hitCooldown = 0.16;
  return Math.min(1, power / 30);
}

export function carCarCollision(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const min = ARENA.carHalfWidth * 2 + 0.3;
  if (dist > min || Math.abs(a.pos.y - b.pos.y) > 1.1 || dist < 0.0001) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const push = (min - dist) / 2;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  if (rel < 0) {
    const impulse = -rel * 0.65;
    a.vel.x -= nx * impulse;
    a.vel.z -= nz * impulse;
    b.vel.x += nx * impulse;
    b.vel.z += nz * impulse;
  }
  return Math.abs(rel);
}

/** Predict the ball position after `time` seconds (simple analytic bounce model). */
export function predictBall(ball, time) {
  let x = ball.pos.x;
  let y = ball.pos.y;
  let z = ball.pos.z;
  let vx = ball.vel.x;
  let vy = ball.vel.y;
  let vz = ball.vel.z;
  const dt = 1 / 60;
  for (let t = 0; t < time; t += dt) {
    vy -= ARENA.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    const r = ARENA.ballRadius;
    if (y < r) {
      y = r;
      if (vy < 0) vy = -vy * 0.7;
      vx *= 0.98;
      vz *= 0.98;
    }
    if (y > ARENA.ceiling - r) {
      y = ARENA.ceiling - r;
      vy = -Math.abs(vy) * 0.62;
    }
    if (z > ARENA.halfWidth - r) {
      z = ARENA.halfWidth - r;
      vz = -Math.abs(vz) * 0.79;
    } else if (z < -ARENA.halfWidth + r) {
      z = -ARENA.halfWidth + r;
      vz = Math.abs(vz) * 0.79;
    }
    if (x > ARENA.halfLength - r) {
      const mouth = Math.abs(z) < ARENA.goalHalfWidth - r * 0.22 && y < ARENA.goalHeight - r * 0.35;
      if (!mouth) {
        x = ARENA.halfLength - r;
        vx = -Math.abs(vx) * 0.8;
      }
    } else if (x < -ARENA.halfLength + r) {
      const mouth = Math.abs(z) < ARENA.goalHalfWidth - r * 0.22 && y < ARENA.goalHeight - r * 0.35;
      if (!mouth) {
        x = -ARENA.halfLength + r;
        vx = Math.abs(vx) * 0.8;
      }
    }
  }
  return { x, y, z };
}

/** Largest boost pad positions. Small pads use half these weights. */
export const BOOST_PADS = [
  { x: -33, z: -21.5, big: true },
  { x: -33, z: 21.5, big: true },
  { x: 33, z: -21.5, big: true },
  { x: 33, z: 21.5, big: true },
  { x: 0, z: -22, big: false },
  { x: 0, z: 22, big: false },
  { x: -21, z: -9, big: false },
  { x: -21, z: 9, big: false },
  { x: 21, z: -9, big: false },
  { x: 21, z: 9, big: false },
  { x: -11, z: 0, big: false },
  { x: 11, z: 0, big: false },
];

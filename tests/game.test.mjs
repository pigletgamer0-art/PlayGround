import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA,
  createBall,
  createCar,
  detectGoal,
  forwardSpeed,
  predictBall,
  stepBall,
  stepCar,
  collideCarBall,
} from '../src/physics.js';
import { createBot, DIFFICULTIES, updateBot } from '../src/ai.js';

const DT = 1 / 120;

function drive(car, input, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepCar(car, input, DT);
  return car;
}

test('throttle accelerates the car forward and boost drains the meter', () => {
  const car = createCar({ x: 0, z: 0, yaw: Math.PI / 2, boost: 100 });
  drive(car, { throttle: 1, steer: 0, boost: false }, 1);
  assert.ok(car.pos.x > 6, `expected forward travel, got ${car.pos.x}`);
  assert.ok(forwardSpeed(car) > 10);
  const boosted = createCar({ x: 0, z: 0, yaw: Math.PI / 2, boost: 100 });
  drive(boosted, { throttle: 1, steer: 0, boost: true }, 1);
  assert.ok(boosted.pos.x > car.pos.x, 'boost should be faster');
  assert.ok(boosted.boost < 75, `boost should drain, got ${boosted.boost}`);
});

test('steering rotates the chassis and reverse steering flips direction', () => {
  const car = createCar({ x: 0, z: 0, yaw: 0 });
  drive(car, { throttle: 0.6, steer: 1, boost: false }, 0.8);
  assert.ok(Math.abs(car.yaw) > 0.3, `expected yaw change, got ${car.yaw}`);
  const before = car.yaw;
  drive(car, { throttle: -0.6, steer: 1, boost: false }, 0.8);
  assert.ok(Math.abs(car.yaw) < Math.abs(before) + 0.4);
});

test('jumping leaves the ground and a second jump performs a flip', () => {
  const car = createCar({ x: 0, z: 0, yaw: Math.PI / 2 });
  stepCar(car, { throttle: 1, steer: 0, boost: false, jumpPressed: true }, DT);
  assert.equal(car.onGround, false);
  assert.ok(car.pos.y > 0.05);
  const x0 = car.pos.x;
  const vz0 = car.vel.x;
  stepCar(car, { throttle: 1, steer: 0, boost: false, jumpPressed: true }, DT);
  assert.equal(car.jumps, 2);
  assert.ok(car.vel.x > vz0 - 1);
  assert.ok(car.flipTime > 0);
  for (let i = 0; i < 240; i++) stepCar(car, { throttle: 0, steer: 0, boost: false }, DT);
  assert.equal(car.onGround, true);
  assert.equal(car.pos.y, 0);
  assert.notEqual(car.pos.x, x0);
});

test('ball falls, bounces and stays at or above the floor', () => {
  const ball = createBall(0, 8, 0);
  const events = [];
  let peakAfterBounce = 0;
  for (let i = 0; i < 360; i++) {
    stepBall(ball, DT, (type) => events.push(type));
    if (events.includes('floor')) peakAfterBounce = Math.max(peakAfterBounce, ball.pos.y);
  }
  assert.ok(events.includes('floor'));
  assert.ok(peakAfterBounce > ARENA.ballRadius + 0.2, 'ball should rebound');
  assert.ok(ball.pos.y >= ARENA.ballRadius - 1e-6);
});

test('goal detection only fires inside the mouth', () => {
  const ball = createBall(ARENA.halfLength + ARENA.ballRadius, 3, 0);
  assert.equal(detectGoal(ball), 'blue');
  ball.pos.x = -ARENA.halfLength - ARENA.ballRadius;
  assert.equal(detectGoal(ball), 'red');
  ball.pos.x = ARENA.halfLength + ARENA.ballRadius;
  ball.pos.z = ARENA.goalHalfWidth + 4;
  assert.equal(detectGoal(ball), null);
  ball.pos.z = 0;
  ball.pos.y = ARENA.goalHeight + 3;
  assert.equal(detectGoal(ball), null);
});

test('ball bounces off the end wall outside the goal mouth', () => {
  const ball = createBall(ARENA.halfLength - 2, 4, 18);
  ball.vel.x = 20;
  for (let i = 0; i < 60; i++) stepBall(ball, DT);
  assert.ok(ball.pos.x <= ARENA.halfLength - ARENA.ballRadius + 1e-6);
  assert.ok(ball.vel.x < 0, 'wall rebound should reverse x velocity');
});

test('car impact launches the ball and is capped by the speed limit', () => {
  const car = createCar({ x: 0, z: 0, yaw: Math.PI / 2 });
  const ball = createBall(2.2, 1.6, 0);
  car.vel.x = 28;
  const hit = collideCarBall(car, ball);
  assert.ok(hit > 0.1);
  assert.ok(ball.vel.x > 15);
  assert.ok(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z) <= ARENA.maxBallSpeed + 1);
});

test('ball prediction mirrors an actual simulation within tolerance', () => {
  const simulated = createBall(0, 6, 3);
  simulated.vel.x = 13;
  simulated.vel.y = 4;
  simulated.vel.z = -8;
  const predicted = predictBall(simulated, 1.2);
  for (let i = 0; i < 72; i++) stepBall(simulated, 1 / 60);
  assert.ok(Math.abs(predicted.x - simulated.pos.x) < 2.5, `x ${predicted.x} vs ${simulated.pos.x}`);
  assert.ok(Math.abs(predicted.z - simulated.pos.z) < 2.5, `z ${predicted.z} vs ${simulated.pos.z}`);
});

test('all difficulty presets produce sane bot inputs and move toward the ball', () => {
  for (const name of Object.keys(DIFFICULTIES)) {
    const bot = createBot(name, 42);
    const self = createCar({ x: 28, z: 0, yaw: -Math.PI / 2, team: 'red', boost: 70 });
    const ball = createBall(4, ARENA.ballRadius, 2);
    let lastX = self.pos.x;
    for (let i = 0; i < 240; i++) {
      const input = updateBot(bot, { self, ball, opponent: createCar(), pads: [], time: i * DT }, DT);
      for (const value of [input.throttle, input.steer]) {
        assert.ok(Number.isFinite(value), `${name} produced invalid input`);
      }
      assert.ok(Math.abs(input.steer) <= 1);
      stepCar(self, input, DT);
    }
    assert.ok(self.pos.x < lastX, `${name} bot should chase the ball downfield`);
    assert.ok(Math.abs(self.pos.z - ball.pos.z) < 14, `${name} bot should track the ball laterally`);
  }
});

test('bot reaches the ball before an idle opponent on a central kickoff', () => {
  const bot = createBot('pro', 9);
  const self = createCar({ x: 30, z: 0, yaw: -Math.PI / 2, team: 'red', boost: 34 });
  const ball = createBall(0, ARENA.ballRadius, 0);
  const opponent = createCar({ x: -30, z: 0, yaw: Math.PI / 2, team: 'blue', boost: 34 });
  let closest = Infinity;
  for (let i = 0; i < 180; i++) {
    const input = updateBot(bot, { self, ball, opponent, pads: [], time: i * DT }, DT);
    stepCar(self, input, DT);
    closest = Math.min(closest, Math.hypot(self.pos.x - ball.pos.x, self.pos.z - ball.pos.z));
  }
  assert.ok(closest < 5, `bot should get close to the kickoff ball, got ${closest}`);
});

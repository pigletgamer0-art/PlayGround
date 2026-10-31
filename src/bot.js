import * as THREE from 'three';
import { BOT_LEVELS, FIELD, clamp, rand, wrapAngle } from './constants.js';

export class Bot {
  constructor(level = 'pro') {
    this.setLevel(level);
    this.target = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.thinkTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.jumpCooldown = 0;
    this.boostTimer = 0;
    this.mode = 'attack';
    this.strike = false;
  }

  setLevel(level) {
    this.level = level;
    this.skill = BOT_LEVELS[level] ?? BOT_LEVELS.pro;
  }

  reset() {
    this.thinkTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.jumpCooldown = 0;
    this.boostTimer = 0;
    this.mode = 'attack';
    this.strike = false;
  }

  chooseTarget(game, car) {
    const ball = game.ball;
    const skill = this.skill;
    const lead = 0.12 + (1 - skill.reaction) * 0.14;
    const predicted = this.tmp.copy(ball.pos).addScaledVector(ball.vel, lead);
    predicted.y = 0;
    predicted.x = clamp(predicted.x, -46, 46);
    predicted.z = clamp(predicted.z, -27, 27);

    const goalX = -FIELD.halfLength + 4;
    const dirGoal = new THREE.Vector3(goalX - predicted.x, 0, -predicted.z);
    if (dirGoal.lengthSq() < 0.001) dirGoal.set(-1, 0, 0);
    dirGoal.normalize();
    const behindPoint = predicted.clone().addScaledVector(dirGoal, -6.4);
    const carFromBall = new THREE.Vector3(car.pos.x - predicted.x, 0, car.pos.z - predicted.z);
    const ballDistance = carFromBall.length();
    carFromBall.normalize();
    const alignment = carFromBall.dot(dirGoal.clone().multiplyScalar(-1));
    const sinceHit = (game.time ?? performance.now() / 1000) - (ball.lastHitTime ?? -99);

    let target;
    if (ball.lastHitBy === 'orange' && sinceHit < 0.55 && alignment < 0.35) {
      this.mode = 'recover';
      this.strike = false;
      target = predicted.clone().addScaledVector(dirGoal, -14);
      target.z += (car.pos.z >= predicted.z ? 1 : -1) * 10;
    } else if (predicted.x > 34 && ball.vel.x > 2) {
      this.mode = 'defend';
      this.strike = false;
      target = predicted.clone().addScaledVector(dirGoal, -5.2);
      if (target.x > 45) target.x = 45;
    } else if (alignment > 0.52 || (alignment > 0.1 && ballDistance < 7)) {
      // Good enough line: drive through the ball toward goal.
      this.mode = 'strike';
      this.strike = true;
      target = predicted.clone().addScaledVector(dirGoal, 4.2);
    } else if (alignment > 0.02) {
      this.mode = 'approach';
      this.strike = false;
      target = behindPoint.clone();
    } else {
      this.mode = 'loop';
      this.strike = false;
      const side = car.pos.z >= predicted.z ? 1 : -1;
      target = behindPoint.clone();
      target.x += 5;
      target.z += side * 11;
    }

    if (ball.pos.y > 5 && ball.vel.y < 0) {
      target.x = predicted.x + ball.vel.x * 0.45;
      target.z = predicted.z + ball.vel.z * 0.45;
    }

    target.x = clamp(target.x, -45, 45);
    target.z = clamp(target.z, -26, 26);
    if (!this.strike) {
      target.x += rand(-skill.aimNoise, skill.aimNoise);
      target.z += rand(-skill.aimNoise, skill.aimNoise);
    }
    this.target.copy(target);
    this.alignment = alignment;
  }

  update(dt, game) {
    const car = game.botCar;
    const ball = game.ball;
    this.thinkTimer -= dt;
    this.jumpCooldown -= dt;
    this.boostTimer -= dt;

    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.skill.reaction * rand(0.8, 1.25);
      this.chooseTarget(game, car);
    }

    const toTarget = this.tmp.copy(this.target).sub(car.pos);
    toTarget.y = 0;
    const distance = toTarget.length();
    const desiredYaw = Math.atan2(-toTarget.z, toTarget.x);
    const diff = wrapAngle(desiredYaw - car.yaw);
    const facing = Math.cos(diff);

    let steer = clamp(-diff * 2.55 + clamp(car.vel.dot(car.right) * -0.045, -0.3, 0.3), -1, 1);
    let throttle = 1;

    if (Math.abs(diff) > 2.2) {
      throttle = -0.7;
      steer = -steer;
    } else if (Math.abs(diff) > 1.1) {
      throttle = 0.45;
    }

    // Stuck recovery near a wall.
    if (car.speed < 2.2 && Math.abs(throttle) > 0.4 && this.reverseTimer <= 0) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.85) {
        this.reverseTimer = 0.6;
        this.stuckTimer = 0;
      }
    } else if (this.reverseTimer <= 0) {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      throttle = -1;
      steer = clamp(-steer, -1, 1);
    }

    const ballDistance = car.pos.distanceTo(ball.pos);
    const aligned = facing > 0.78;

    // Control speed when lining up so the bot can actually touch the ball
    // instead of blasting past it.
    if (this.mode === 'loop' && distance < 5) throttle = 0.5;
    if (this.mode === 'recover') throttle = 0.7;

    let boost = false;
    if (car.boost > 8 && this.boostTimer <= 0 && distance > 12 && aligned && this.mode !== 'strike') {
      boost = Math.random() < this.skill.boostLove * 0.9 + 0.04;
      if (boost) this.boostTimer = 0.14;
    }
    if (ballDistance > 11 && this.mode === 'defend' && aligned && car.boost > 10) boost = true;
    if (this.reverseTimer > 0) boost = false;

    let jump = false;
    if (this.jumpCooldown <= 0 && this.strike) {
      const ballAbove = ball.pos.y - car.pos.y;
      if (car.grounded && ballAbove > 2.8 && ballAbove < 5.4 && ballDistance < 7 && Math.random() < this.skill.jumpLove) {
        jump = true;
        this.jumpCooldown = 0.75;
      }
    }

    this.lastControls = { throttle, steer, boost, jump };
    return this.lastControls;
  }
}

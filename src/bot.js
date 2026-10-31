import * as THREE from 'three';
import { ARENA } from './arena.js';
import { clamp, rand, wrapAngle } from './utils.js';

const DIFFICULTIES = {
  rookie: {
    label: 'Rookie',
    reaction: 0.3,
    aimError: 2.3,
    lead: 0.35,
    jumpChance: 0.18,
    boostEagerness: 0.45,
    speed: 0.82,
    hesitation: 0.18,
    defense: 0.65,
  },
  pro: {
    label: 'Pro',
    reaction: 0.17,
    aimError: 1.15,
    lead: 0.7,
    jumpChance: 0.48,
    boostEagerness: 0.8,
    speed: 0.94,
    hesitation: 0.05,
    defense: 0.9,
  },
  allstar: {
    label: 'All-Star',
    reaction: 0.1,
    aimError: 0.55,
    lead: 0.95,
    jumpChance: 0.82,
    boostEagerness: 1,
    speed: 1,
    hesitation: 0,
    defense: 1,
  },
};

export class BotController {
  constructor(difficulty = 'pro') {
    this.target = new THREE.Vector3(0, 0, -28);
    this.thinkTimer = 0;
    this.jumpCooldown = 0;
    this.jumpPulse = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.hesitateTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.speed = 1;
    this.config = DIFFICULTIES.pro;
    this.setDifficulty(difficulty);
  }

  setDifficulty(name) {
    this.difficulty = DIFFICULTIES[name] ? name : 'pro';
    this.config = DIFFICULTIES[this.difficulty];
    this.reset();
  }

  reset() {
    this.thinkTimer = 0;
    this.jumpCooldown = 0.5;
    this.jumpPulse = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.hesitateTimer = 0;
  }

  update(dt, bot, ball, { kickoff = false } = {}) {
    const config = this.config;
    const c = config;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.jumpPulse = Math.max(0, this.jumpPulse - dt);
    this.reverseTimer = Math.max(0, this.reverseTimer - dt);
    this.hesitateTimer = Math.max(0, this.hesitateTimer - dt);
    this.thinkTimer -= dt;

    const ballPos = ball.pos;
    const botPos = bot.pos;

    if (this.thinkTimer <= 0) {
      this.thinkTimer = c.reaction * rand(0.7, 1.35);
      if (Math.random() < c.hesitation) this.hesitateTimer = rand(0.12, 0.32);

      const distance = botPos.distanceTo(ballPos);
      const leadTime = clamp(distance / 40, 0.04, 0.55) * c.lead;
      const predicted = ballPos.clone().addScaledVector(ball.vel, leadTime);
      predicted.y = ballPos.y;

      const goal = new THREE.Vector3(0, 0, ARENA.length / 2 + 2);
      const toGoal = goal.clone().sub(predicted);
      toGoal.y = 0;
      toGoal.normalize();

      // Stand on the opposite side of the ball to push it toward the player's goal.
      const target = predicted.clone().addScaledVector(toGoal, -(ball.radius + 2.7));

      // If the ball is deep in NOVA's half, bias harder toward a clearing angle.
      if (predicted.z < -ARENA.length * 0.22) {
        const clearance = new THREE.Vector3(Math.sign(predicted.x) * 6 || 0, 0, 18);
        target.addScaledVector(clearance, 0.25 * c.defense);
      }

      const side = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
      const noise = rand(-c.aimError, c.aimError);
      target.addScaledVector(side, noise);
      target.x = clamp(target.x, -ARENA.width / 2 + 3.2, ARENA.width / 2 - 3.2);
      target.z = clamp(target.z, -ARENA.length / 2 + 3.2, ARENA.length / 2 - 3.2);
      if (!kickoff) {
        this.target.copy(target);
      } else {
        this.target.set(ballPos.x, 0, ballPos.z);
      }
    }

    const toTarget = this.target.clone().sub(botPos);
    toTarget.y = 0;
    const dist = toTarget.length();
    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    let delta = wrapAngle(desiredYaw - bot.yaw);

    let steer = clamp(delta * 2.3, -1, 1);
    let throttle = 1;
    if (Math.abs(delta) > 0.62) throttle = 0.38;
    if (Math.abs(delta) > 1.55) throttle = -0.65;
    if (this.hesitateTimer > 0) throttle = 0;

    // Reverse out of a wall / pile-up.
    const moved = botPos.distanceTo(this.lastPos);
    this.lastPos.copy(botPos);
    if (moved < 0.05 && !bot.grounded) {
      // airborne, ignore
    } else if (moved < 0.035 && throttle > 0.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.65) {
        this.stuckTimer = 0;
        this.reverseTimer = 0.65;
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    if (this.reverseTimer > 0) {
      throttle = -0.9;
      steer = -steer;
    }

    // Use the handbrake on sharp, fast turns.
    const handbrake = Math.abs(delta) > 1.25 && bot.speed() > 15;

    // Boost when lined up and far from the ball, or when chasing on a kickoff.
    let boost = false;
    if (bot.boost > 6 && Math.abs(delta) < 0.4) {
      if (kickoff) boost = true;
      else if (dist > 9 && bot.boost > 12) boost = Math.random() < c.boostEagerness;
    }
    if (this.reverseTimer > 0) boost = false;

    // Air game: challenge lobbed balls, then boost through the aerial.
    let jump = false;
    const horizontal = Math.hypot(ballPos.x - botPos.x, ballPos.z - botPos.z);
    const height = ballPos.y - botPos.y;

    if (bot.grounded && this.jumpCooldown <= 0 && horizontal < 8 && height > 2.4 && height < 8.5) {
      if (Math.random() < c.jumpChance * 0.24) {
        this.jumpPulse = 0.08;
        this.jumpCooldown = rand(1.1, 2.2);
      }
    }
    if (!bot.grounded && bot.jumps === 1 && bot.airTime > 0.18 && height > 1.6 && horizontal < 6 && this.jumpCooldown <= 0.55) {
      if (Math.random() < c.jumpChance * 0.12) {
        this.jumpPulse = 0.08;
        this.jumpCooldown = 1.4;
      }
    }
    if (!bot.grounded) {
      if (ballPos.y > botPos.y) {
        const ballYaw = Math.atan2(-(ballPos.x - botPos.x), -(ballPos.z - botPos.z));
        const airDelta = wrapAngle(ballYaw - bot.yaw);
        steer = clamp(airDelta * 2.4, -1, 1);
        boost = bot.boost > 4 && Math.abs(airDelta) < 1.1 && height > 0.8;
      }
      throttle = 0;
    }

    jump = this.jumpPulse > 0;

    if (throttle > 0) throttle *= c.speed;

    return { throttle, steer, jump, boost, handbrake };
  }
}

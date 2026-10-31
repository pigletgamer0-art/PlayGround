import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, rand, TAU } from './utils.js';

export const CAR_PHYSICS = {
  rideHeight: 0.86,
  gravity: 33,
  jumpVelocity: 13.4,
  doubleJumpVelocity: 8.2,
  maxGroundSpeed: 31,
  maxBoostSpeed: 47,
  accel: 34,
  reverseAccel: 23,
  boostAccel: 53,
  boostDrain: 31,
  steerRate: 2.55,
};

export class Car {
  constructor(scene, { color = 0x18b6d8, accent = 0x3ee9ff, isPlayer = true, name = 'YOU' } = {}) {
    this.scene = scene;
    this.isPlayer = isPlayer;
    this.name = name;
    this.color = color;
    this.accentColor = accent;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.boosting = false;
    this.boost = 100;
    this.jumps = 0;
    this.airTime = 0;
    this.jumpHeld = false;
    this.wheelSpin = 0;
    this.flipTimer = 0;
    this.flipDirection = 1;
    this.basePitch = 0;
    this.baseRoll = 0;
    this.hitFlash = 0;
    this.stats = { topSpeed: 0, hits: 0, boostUsed: 0 };

    this.group = new THREE.Group();
    this.group.name = `car-${name}`;
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    scene.add(this.group);

    this.wheels = [];
    this.flames = [];
    this.build();
    this.reset(0, 0, 0);
  }

  build() {
    const paint = new THREE.MeshPhysicalMaterial({
      color: this.color,
      metalness: 0.42,
      roughness: 0.34,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.55,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x051018,
      emissive: this.accentColor,
      emissiveIntensity: 1.55,
      roughness: 0.32,
      metalness: 0.5,
    });
    const stripe = accent.clone();
    stripe.emissiveIntensity = 0.8;
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0a1018,
      metalness: 0.7,
      roughness: 0.38,
      envMapIntensity: 0.8,
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 0.95, metalness: 0.05 });
    const rim = new THREE.MeshStandardMaterial({
      color: 0x2a3848,
      metalness: 0.95,
      roughness: 0.18,
      envMapIntensity: 1.3,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x07131f,
      metalness: 0.85,
      roughness: 0.06,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 1.6,
    });

    const add = (mesh, parent = this.tilt) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const skirt = add(new THREE.Mesh(new RoundedBoxGeometry(1.92, 0.32, 3.9, 3, 0.12), dark));
    skirt.position.set(0, -0.02, 0);

    const body = add(new THREE.Mesh(new RoundedBoxGeometry(2.06, 0.5, 4.02, 4, 0.22), paint));
    body.position.set(0, 0.21, 0);

    const nose = add(new THREE.Mesh(new RoundedBoxGeometry(1.66, 0.26, 0.95, 3, 0.12), paint));
    nose.position.set(0, 0.17, -1.86);

    const cabin = add(new THREE.Mesh(new RoundedBoxGeometry(1.46, 0.52, 1.82, 3, 0.18), glass));
    cabin.position.set(0, 0.6, 0.24);

    const roof = add(new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.075, 1.18, 2, 0.03), paint));
    roof.position.set(0, 0.865, 0.24);

    const roofStripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 1.1), stripe));
    roofStripe.position.set(0, 0.91, 0.24);

    const hoodStripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 1.4), stripe));
    hoodStripe.position.set(0, 0.42, -1.2);

    const splitter = add(new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.07, 0.45), dark));
    splitter.position.set(0, -0.13, -1.94);

    const rearBumper = add(new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.16, 0.4), dark));
    rearBumper.position.set(0, 0.02, 1.94);

    // headlight bars
    for (const side of [-1, 1]) {
      const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.075, 0.06), new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xdff8ff,
        emissiveIntensity: 1.8,
        toneMapped: false,
      })));
      lamp.position.set(side * 0.62, 0.27, -2.01);

      const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.075, 0.05), new THREE.MeshStandardMaterial({
        color: 0xff2a1a,
        emissive: 0xff2a1a,
        emissiveIntensity: 1.6,
        toneMapped: false,
      })));
      tail.position.set(side * 0.6, 0.27, 2.02);
    }

    // spoiler
    const wing = add(new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.07, 0.42), paint));
    wing.position.set(0, 0.82, 1.82);
    for (const side of [-1, 1]) {
      const plate = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.46), dark));
      plate.position.set(side * 0.96, 0.72, 1.82);
      const strut = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), dark));
      strut.position.set(side * 0.58, 0.66, 1.8);
    }

    // wheels
    const tireGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.34, 20, 1);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12, 1);
    rimGeo.rotateZ(Math.PI / 2);
    const wheelPositions = [
      [-1.02, -0.4, -1.3, true],
      [1.02, -0.4, -1.3, true],
      [-1.02, -0.4, 1.3, false],
      [1.02, -0.4, 1.3, false],
    ];
    for (const [x, y, z, steer] of wheelPositions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      this.tilt.add(pivot);
      const wheel = new THREE.Mesh(tireGeo, rubber);
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      pivot.add(wheel);
      const hub = new THREE.Mesh(rimGeo, rim);
      wheel.add(hub);
      const glowHub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.375, 8), accent);
      glowHub.rotation.z = Math.PI / 2;
      wheel.add(glowHub);
      this.wheels.push({ pivot, wheel, steer, x, z });
    }

    // exhaust nozzles and flames
    for (const side of [-1, 1]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.28, 12), dark);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(side * 0.44, 0.1, 2.02);
      this.tilt.add(nozzle);

      const flameMat = new THREE.MeshBasicMaterial({
        color: this.accentColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.45, 12, 1, true), flameMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(side * 0.44, 0.1, 2.75);
      this.tilt.add(flame);
      this.flames.push(flame);

      const coreMat = flameMat.clone();
      coreMat.color.setHex(0xffffff);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 10, 1, true), coreMat);
      core.rotation.x = Math.PI / 2;
      core.position.set(side * 0.44, 0.1, 2.48);
      this.tilt.add(core);
      this.flames.push(core);
    }

    this.body = body;
    this.paintMaterial = paint;
    this.accentMaterial = accent;
  }

  reset(x, z, yaw) {
    this.pos.set(x, CAR_PHYSICS.rideHeight, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.boosting = false;
    this.boost = 100;
    this.jumps = 0;
    this.airTime = 0;
    this.jumpHeld = false;
    this.flipTimer = 0;
    this.wheelSpin = 0;
    this.basePitch = 0;
    this.baseRoll = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
    this.tilt.rotation.set(0, 0, 0);
    this.syncVisual(0);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  update(dt, controls, { audio, particles, onJump, onDoubleJump, onWallHit } = {}) {
    const forward = this.forward();
    const right = this.right();
    const throttle = controls.throttle;
    const steer = controls.steer;
    const jumpPressed = controls.jump && !this.jumpHeld;
    this.jumpHeld = controls.jump;
    if (jumpPressed) this.jumps = this.jumps || 0;

    let speedF = this.vel.dot(forward);
    let speedR = this.vel.dot(right);
    const wasGrounded = this.grounded;
    this.boosting = false;

    if (this.grounded) {
      const steerScale = clamp(Math.abs(speedF) / 5, 0, 1);
      const direction = speedF < -0.5 ? -1 : 1;
      const rate = controls.handbrake ? 3.3 : CAR_PHYSICS.steerRate;
      this.yaw += steer * rate * steerScale * direction * dt;

      if (throttle > 0) {
        const fade = 1 - clamp(speedF / CAR_PHYSICS.maxGroundSpeed, 0, 1) * 0.82;
        this.vel.addScaledVector(forward, CAR_PHYSICS.accel * throttle * fade * dt);
      } else if (throttle < 0) {
        const fade = 1 - clamp(-speedF / 15, 0, 1) * 0.55;
        this.vel.addScaledVector(forward, CAR_PHYSICS.reverseAccel * throttle * fade * dt);
      }

      if (controls.boost && this.boost > 0.4) {
        const fade = 1 - clamp(speedF / CAR_PHYSICS.maxBoostSpeed, 0, 1) * 0.62;
        this.vel.addScaledVector(forward, CAR_PHYSICS.boostAccel * fade * dt);
        this.boost = Math.max(0, this.boost - CAR_PHYSICS.boostDrain * dt);
        this.stats.boostUsed += CAR_PHYSICS.boostDrain * dt;
        this.boosting = true;
      }

      speedR = this.vel.dot(right);
      const grip = controls.handbrake ? 2.1 : 9.5;
      this.vel.addScaledVector(right, -speedR * Math.min(1, grip * dt));

      speedF = this.vel.dot(forward);
      const cap = this.boosting ? CAR_PHYSICS.maxBoostSpeed : CAR_PHYSICS.maxGroundSpeed;
      if (speedF > cap) this.vel.addScaledVector(forward, (cap - speedF) * Math.min(1, 12 * dt));

      speedF = this.vel.dot(forward);
      const rolling = throttle === 0 ? 1.2 : 0.18;
      this.vel.addScaledVector(forward, -speedF * rolling * dt);

      if (jumpPressed) {
        this.vel.y = CAR_PHYSICS.jumpVelocity;
        this.grounded = false;
        this.jumps = 1;
        this.airTime = 0;
        this.pos.y += 0.02;
        audio?.playJump();
        onJump?.();
        if (particles) {
          const point = this.pos.clone().addScaledVector(forward, -1.2);
          point.y = 0.2;
          particles.burst(point, 8, {
            color: new THREE.Color(this.accentColor),
            speed: 3.2,
            size: 0.6,
            life: 0.35,
            gravity: 2,
            drag: 2.2,
            spread: 1.4,
          });
        }
      }
    } else {
      this.airTime += dt;
      this.vel.y -= CAR_PHYSICS.gravity * dt;
      this.yaw += steer * 1.85 * dt;

      if (controls.boost && this.boost > 0.4) {
        this.vel.addScaledVector(forward, 27 * dt);
        this.vel.y += 9.5 * dt;
        this.boost = Math.max(0, this.boost - CAR_PHYSICS.boostDrain * dt);
        this.stats.boostUsed += CAR_PHYSICS.boostDrain * dt;
        this.boosting = true;
      }

      if (jumpPressed && this.jumps === 1 && this.airTime > 0.1) {
        this.jumps = 2;
        this.vel.y = Math.max(this.vel.y, CAR_PHYSICS.doubleJumpVelocity);
        this.vel.addScaledVector(forward, 4.2);
        this.flipTimer = 0.5;
        this.flipDirection = Math.sign(steer) || 1;
        audio?.playDoubleJump();
        onDoubleJump?.();
        if (particles) {
          const point = this.pos.clone();
          particles.burst(point, 12, {
            color: new THREE.Color(0xffffff),
            speed: 5,
            size: 0.5,
            life: 0.3,
            gravity: 0,
            drag: 3,
          });
        }
      }
    }

    // clamp horizontal speed globally
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    const hardCap = CAR_PHYSICS.maxBoostSpeed + 2;
    if (horiz > hardCap) {
      this.vel.x *= hardCap / horiz;
      this.vel.z *= hardCap / horiz;
    }

    this.pos.addScaledVector(this.vel, dt);

    // ground contact
    if (this.pos.y <= CAR_PHYSICS.rideHeight) {
      this.pos.y = CAR_PHYSICS.rideHeight;
      if (this.vel.y < 0) this.vel.y = 0;
      if (!wasGrounded && this.airTime > 0.08) {
        audio?.playWall(1.4);
        if (particles) {
          particles.burst(this.pos.clone().setY(0.14), 10, {
            color: new THREE.Color(0xcfeeff),
            speed: 2.5,
            size: 0.45,
            life: 0.35,
            gravity: 4,
            drag: 2.5,
            spread: 1.8,
          });
        }
      }
      this.grounded = true;
      this.jumps = 0;
      this.airTime = 0;
    } else {
      this.grounded = false;
    }

    // arena bounds
    const xLimit = 64 / 2 - 1.55;
    const zLimit = 92 / 2 - 2.4;
    if (Math.abs(this.pos.x) > xLimit) {
      const sign = Math.sign(this.pos.x);
      this.pos.x = sign * xLimit;
      if (Math.sign(this.vel.x) === sign) {
        const impact = Math.abs(this.vel.x);
        this.vel.x *= -0.32;
        if (impact > 5) {
          audio?.playWall(impact);
          onWallHit?.(impact);
          this.shake = Math.min(0.3, impact * 0.012);
        }
      }
    }
    if (Math.abs(this.pos.z) > zLimit) {
      const sign = Math.sign(this.pos.z);
      this.pos.z = sign * zLimit;
      if (Math.sign(this.vel.z) === sign) {
        const impact = Math.abs(this.vel.z);
        this.vel.z *= -0.32;
        if (impact > 5) {
          audio?.playWall(impact);
          onWallHit?.(impact);
          this.shake = Math.min(0.3, impact * 0.012);
        }
      }
    }

    if (this.flipTimer > 0) this.flipTimer = Math.max(0, this.flipTimer - dt);
    if (this.boosting && particles) this.emitBoost(particles, forward, right);
    if (this.boosting && audio && Math.random() < dt * 8) audio.playBoostStart();

    this.stats.topSpeed = Math.max(this.stats.topSpeed, this.speed() * 3.6);
    this.syncVisual(dt, controls);
  }

  emitBoost(particles, forward, right) {
    const base = this.pos.clone().addScaledVector(forward, -2.1);
    base.y += 0.12;
    for (const side of [-1, 1]) {
      const point = base.clone().addScaledVector(right, side * 0.44);
      particles.spawn({
        position: point,
        velocity: forward.clone().multiplyScalar(-rand(4, 9)).add(new THREE.Vector3(rand(-1.2, 1.2), rand(-0.3, 1.1), rand(-1.2, 1.2))),
        color: new THREE.Color(Math.random() < 0.4 ? 0xffffff : this.accentColor),
        size: rand(0.28, 0.6),
        life: rand(0.16, 0.34),
        gravity: -2.5,
        drag: 1.8,
        grow: 0.8,
        fade: 1.3,
      });
    }
  }

  syncVisual(dt, controls = { throttle: 0, steer: 0 }) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    const speed = this.speed();
    const targetRoll = -controls.steer * clamp(speed / 36, 0, 1) * 0.17;
    const accelerationPitch = this.grounded ? -clamp((this.boosting ? 0.1 : 0) + (controls.throttle || 0) * 0.03, -0.1, 0.1) : 0;
    let airPitch = 0;
    if (!this.grounded) airPitch = clamp(this.vel.y * 0.012, -0.2, 0.2);

    let flip = 0;
    if (this.flipTimer > 0) {
      const progress = 1 - this.flipTimer / 0.5;
      flip = -TAU * progress * this.flipDirection;
    }

    this.baseRoll = damp(this.baseRoll, targetRoll, 8, dt || 0.016);
    this.basePitch = damp(this.basePitch, accelerationPitch + airPitch, 6, dt || 0.016);
    this.tilt.rotation.z = this.baseRoll;
    this.tilt.rotation.x = this.basePitch + flip;

    this.wheelSpin += (speed * (this.vel.dot(this.forward()) >= 0 ? 1 : -1) * (dt || 0.016)) / 0.45;
    const steerAngle = -controls.steer * 0.42;
    for (const wheel of this.wheels) {
      wheel.wheel.rotation.x = this.wheelSpin;
      if (wheel.steer) wheel.pivot.rotation.y = steerAngle;
    }

    const flicker = 0.8 + Math.random() * 0.4;
    for (let i = 0; i < this.flames.length; i += 1) {
      const flame = this.flames[i];
      const isCore = i % 2 === 1;
      flame.visible = true;
      flame.material.opacity = this.boosting ? (isCore ? 0.9 : 0.55) * flicker : 0;
      const length = this.boosting ? (isCore ? 0.75 : 1.15) + Math.random() * 0.45 : 0.2;
      flame.scale.set(1, length, 1);
    }
    if (this.exhaustGlow) {
      this.exhaustGlow.material.opacity = this.boosting ? 0.3 + Math.random() * 0.15 : 0.05;
      this.exhaustGlow.scale.set(this.boosting ? 4.2 : 2.8, this.boosting ? 2.4 : 1.4, 1);
    }
    if (this.underglow) {
      this.underglow.material.opacity = (this.grounded ? 0.15 : 0.05) + (this.boosting ? 0.08 : 0);
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

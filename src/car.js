import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAR, FIELD, clamp, damp } from './constants.js';

const GROUND_Y = FIELD.carGroundY;

export class Car {
  constructor(scene, team, { isBot = false, accent = null } = {}) {
    this.scene = scene;
    this.team = team;
    this.isBot = isBot;
    this.pos = new THREE.Vector3(isBot ? 30 : -30, GROUND_Y, 0);
    this.vel = new THREE.Vector3();
    this.yaw = isBot ? Math.PI : 0;
    this.grounded = true;
    this.jumps = 0;
    this.boost = CAR.boostStart;
    this.boosting = false;
    this.hitCooldown = 0;
    this.airTime = 0;
    this.speed = 0;
    this.accelScale = 1;
    this.maxSpeed = CAR.maxSpeed;
    this.boostSpeed = CAR.boostSpeed;
    this.steerRate = CAR.steerRate;
    this.onEvent = () => {};
    this.boostSpawn = 0;
    this.landImpact = 0;

    this.forward = new THREE.Vector3(1, 0, 0);
    this.right = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();

    this.build(accent ?? team.accent);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    scene.add(this.root);
  }

  build(accentColor) {
    const teamColor = this.team.color;
    const accent = accentColor;
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: 0.06,
      metalness: 0.42,
      roughness: 0.3,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.8,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d15,
      metalness: 0.8,
      roughness: 0.35,
    });
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x121726,
      metalness: 0.65,
      roughness: 0.5,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x061019,
      metalness: 0.9,
      roughness: 0.08,
      clearcoat: 1,
      transparent: true,
      opacity: 0.92,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 2.2,
      metalness: 0.2,
      roughness: 0.3,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.9, metalness: 0.1 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9c6d8, metalness: 0.95, roughness: 0.18 });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdff2ff,
      emissiveIntensity: 3,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff2a1a,
      emissive: 0xff2a1a,
      emissiveIntensity: 2.5,
    });

    this.root = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.root.add(this.bodyRoot);

    const add = (geo, mat, x, y, z, parent = this.bodyRoot, opts = {}) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
      mesh.castShadow = opts.shadow !== false;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };

    // Main body and aero pieces, all facing +X.
    const body = add(new RoundedBoxGeometry(5, 0.9, 2.55, 4, 0.3), bodyMat, 0, 0.05, 0);
    body.scale.set(1, 1, 1);
    add(new RoundedBoxGeometry(4.55, 0.52, 2.25, 3, 0.18), carbonMat, 0.05, -0.53, 0);
    add(new RoundedBoxGeometry(2.65, 0.46, 2.18, 3, 0.16), bodyMat, 1.03, 0.47, 0, this.bodyRoot, {
      rot: [0, 0, -0.075],
    });
    add(new RoundedBoxGeometry(1.62, 0.6, 1.5, 3, 0.24), glassMat, 0.1, 0.78, 0);
    add(new RoundedBoxGeometry(1.5, 0.34, 1.32, 3, 0.14), bodyMat, -1.32, 0.62, 0, this.bodyRoot, {
      rot: [0, 0, 0.08],
    });

    // Splitter, diffuser and spoiler.
    add(new RoundedBoxGeometry(0.95, 0.16, 2.72, 2, 0.06), darkMat, 2.44, -0.68, 0);
    add(new RoundedBoxGeometry(0.62, 0.22, 2.5, 2, 0.06), carbonMat, -2.35, -0.52, 0);
    add(new RoundedBoxGeometry(0.42, 0.12, 2.5, 2, 0.05), carbonMat, -2.18, 0.92, 0);
    add(new THREE.BoxGeometry(0.16, 0.46, 0.12), carbonMat, -2.15, 0.7, 0.75);
    add(new THREE.BoxGeometry(0.16, 0.46, 0.12), carbonMat, -2.15, 0.7, -0.75);

    // Glowing trim strips.
    add(new THREE.BoxGeometry(2.9, 0.055, 0.05), accentMat, 0.1, 0.24, 1.285);
    add(new THREE.BoxGeometry(2.9, 0.055, 0.05), accentMat, 0.1, 0.24, -1.285);
    add(new THREE.BoxGeometry(0.07, 0.05, 1.8), accentMat, 2.08, 0.62, 0, this.bodyRoot, {
      rot: [0, 0, -0.075],
    });
    add(new THREE.BoxGeometry(0.05, 0.08, 1.5), accentMat, -2.38, 0.93, 0);

    // Lights.
    add(new THREE.BoxGeometry(0.06, 0.14, 0.46), lightMat, 2.53, 0.18, 0.66, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.06, 0.14, 0.46), lightMat, 2.53, 0.18, -0.66, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.06, 0.16, 0.58), tailMat, -2.54, 0.26, 0.7, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.06, 0.16, 0.58), tailMat, -2.54, 0.26, -0.7, this.bodyRoot, { shadow: false });

    // Wheels: axle runs along local Z.
    this.wheels = [];
    this.frontWheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.79, 0.79, 0.52, 24, 1);
    tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.55, 20, 1);
    rimGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.57, 0.055, 8, 22);
    for (const [x, z, front] of [[1.58, 1.37, true], [1.58, -1.37, true], [-1.62, 1.37, false], [-1.62, -1.37, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.54, z);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, accentMat);
      ring.position.z = z > 0 ? 0.29 : -0.29;
      wheel.add(tire, rim, ring);
      pivot.add(wheel);
      this.root.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(pivot);
    }

    // Boost nozzles and flames.
    this.flames = [];
    const nozzleGeo = new THREE.CylinderGeometry(0.27, 0.33, 0.4, 12);
    nozzleGeo.rotateZ(Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.4, 2.6, 14, 1, true);
    flameGeo.rotateZ(Math.PI / 2);
    flameGeo.translate(-1.3, 0, 0);
    for (const z of [0.62, -0.62]) {
      add(nozzleGeo, darkMat, -2.64, -0.02, z, this.bodyRoot, { shadow: false });
      const outerMat = new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const outer = new THREE.Mesh(flameGeo, outerMat);
      outer.position.set(-2.75, -0.02, z);
      outer.visible = false;
      this.bodyRoot.add(outer);
      const inner = new THREE.Mesh(flameGeo, innerMat);
      inner.scale.set(0.46, 0.48, 0.48);
      inner.position.set(-2.75, -0.02, z);
      inner.visible = false;
      this.bodyRoot.add(inner);
      this.flames.push({ outer, inner, z });
    }

    this.boostLight = new THREE.PointLight(accent, 0, 12, 2);
    this.boostLight.position.set(-3.1, 0, 0);
    this.bodyRoot.add(this.boostLight);

    // Team-coloured underglow.
    this.underLight = new THREE.PointLight(teamColor, 2.2, 10, 2);
    this.underLight.position.set(0, -1.2, 0);
    this.root.add(this.underLight);

    // Ground shadow blob for readability under the car.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.24)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 4.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -GROUND_Y + 0.04;
    blob.renderOrder = 1;
    this.root.add(blob);
    this.shadowBlob = blob;
  }

  reset(x, z, yaw, boost = CAR.boostStart) {
    this.pos.set(x, GROUND_Y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.jumps = 0;
    this.boost = boost;
    this.boosting = false;
    this.hitCooldown = 0;
    this.airTime = 0;
    this.landImpact = 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.bodyRoot.rotation.set(0, 0, 0);
    for (const flame of this.flames) {
      flame.outer.visible = false;
      flame.inner.visible = false;
    }
    this.boostLight.intensity = 0;
  }

  update(dt, controls, fx = null) {
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const wantBoost = Boolean(controls.boost) && this.boost > 0.5;

    this.forward.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.right.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const wasGrounded = this.grounded;

    if (wasGrounded) {
      const fwdSpeed = this.vel.dot(this.forward);
      const speedFactor = clamp(Math.abs(fwdSpeed) / 12, 0.12, 1);
      this.yaw -= steer * this.steerRate * speedFactor * dt * Math.sign(fwdSpeed || 1);

      this.forward.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.right.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

      const accel = CAR.accel * this.accelScale;
      this.vel.addScaledVector(this.forward, throttle * accel * dt);

      const lateral = this.vel.dot(this.right);
      this.vel.addScaledVector(this.right, -lateral * Math.min(1, 12 * dt));

      if (Math.abs(throttle) < 0.06) {
        const roll = Math.exp(-2.1 * dt);
        this.vel.x *= roll;
        this.vel.z *= roll;
      }

      if (wantBoost) {
        this.boost = Math.max(0, this.boost - CAR.boostDrain * dt);
        this.vel.addScaledVector(this.forward, CAR.boostAccel * this.accelScale * dt);
        this.boosting = true;
      } else {
        this.boosting = false;
      }

      const cap = (wantBoost ? this.boostSpeed : this.maxSpeed) * this.accelScale;
      const along = this.vel.dot(this.forward);
      if (along > cap) this.vel.addScaledVector(this.forward, -(along - cap) * Math.min(1, 7 * dt));
      if (along < -14) this.vel.addScaledVector(this.forward, -(along + 14) * Math.min(1, 9 * dt));
    } else {
      this.airTime += dt;
      this.boosting = false;
      this.vel.y -= FIELD.gravity * dt;
      this.yaw -= steer * 1.18 * dt;
      this.forward.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.right.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.vel.addScaledVector(this.forward, throttle * CAR.airAccel * dt);
      this.vel.x *= Math.exp(-0.08 * dt);
      this.vel.z *= Math.exp(-0.08 * dt);
      if (wantBoost) {
        this.boost = Math.max(0, this.boost - CAR.boostDrain * dt);
        this.vel.addScaledVector(this.forward, CAR.airBoostAccel * this.accelScale * dt);
        this.boosting = true;
      }
    }

    // Jump / double jump.
    if (controls.jump) {
      if (this.grounded) {
        this.vel.y = CAR.jumpSpeed;
        this.pos.y += 0.05;
        this.grounded = false;
        this.jumps = 1;
        this.airTime = 0;
        this.onEvent('jump');
        if (fx) {
          fx.emit(this.tmp.copy(this.pos).setY(0.2), {
            count: 14,
            color: this.team.accent,
            speed: 5,
            spread: 2.5,
            life: 0.35,
            size: 0.32,
            direction: new THREE.Vector3(0, 1, 0),
            jitter: 0.5,
          });
        }
      } else if (this.jumps < 2) {
        this.vel.y = Math.max(this.vel.y, 0) + CAR.doubleJumpSpeed * 0.75;
        this.vel.addScaledVector(this.forward, 7.5);
        this.jumps = 2;
        this.onEvent('double');
        if (fx) {
          fx.emit(this.pos, {
            count: 22,
            color: this.team.accent,
            speed: 8,
            spread: 3,
            life: 0.4,
            size: 0.34,
            direction: new THREE.Vector3(0, 0.4, 0),
          });
        }
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    // Arena bounds for cars.
    const carX = FIELD.halfLength - 2.6;
    const carZ = FIELD.halfWidth - 1.8;
    if (this.pos.x > carX) {
      this.pos.x = carX;
      this.vel.x = Math.min(0, this.vel.x) * 0.25;
    } else if (this.pos.x < -carX) {
      this.pos.x = -carX;
      this.vel.x = Math.max(0, this.vel.x) * 0.25;
    }
    if (this.pos.z > carZ) {
      this.pos.z = carZ;
      this.vel.z = Math.min(0, this.vel.z) * 0.25;
    } else if (this.pos.z < -carZ) {
      this.pos.z = -carZ;
      this.vel.z = Math.max(0, this.vel.z) * 0.25;
    }

    // Ground.
    if (this.pos.y <= GROUND_Y) {
      const impact = -this.vel.y;
      this.pos.y = GROUND_Y;
      if (!wasGrounded && impact > 5) {
        this.landImpact = clamp(impact / 18, 0, 1);
        this.onEvent('land', impact);
        if (fx) {
          fx.emit(this.pos, {
            count: Math.round(8 + impact),
            color: 0x9fb6d8,
            speed: 6,
            spread: 4,
            life: 0.45,
            size: 0.28,
            gravity: 5,
            jitter: 0.9,
          });
        }
      }
      this.vel.y = 0;
      this.grounded = true;
      this.jumps = 0;
      this.airTime = 0;
    } else {
      this.grounded = false;
    }

    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // Visual orientation.
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.speed = speed;
    const speedFactor = clamp(speed / 30, 0, 1);
    const rollTarget = this.grounded ? -steer * speedFactor * 0.15 : steer * 0.28;
    const pitchTarget = this.grounded
      ? clamp(-throttle * 0.035 - (this.boosting ? 0.04 : 0), -0.09, 0.07)
      : clamp(this.vel.y * 0.012, -0.2, 0.25);
    this.bodyRoot.rotation.x = damp(this.bodyRoot.rotation.x, rollTarget, 8, dt);
    this.bodyRoot.rotation.z = damp(this.bodyRoot.rotation.z, pitchTarget - this.landImpact * 0.18, 9, dt);
    this.landImpact = damp(this.landImpact, 0, 7, dt);

    const spin = speed * dt / 0.79;
    const frontSteer = steer * 0.42;
    for (let i = 0; i < this.wheels.length; i += 1) {
      this.wheels[i].rotation.z -= spin * (this.grounded ? 1 : 0.55);
    }
    for (const pivot of this.frontWheels) pivot.rotation.y = damp(pivot.rotation.y, frontSteer, 12, dt);

    // Boost flames.
    const boostOn = this.boosting && this.boost > 0;
    for (const flame of this.flames) {
      flame.outer.visible = boostOn;
      flame.inner.visible = boostOn;
      if (boostOn) {
        const flicker = 0.85 + Math.random() * 0.45;
        flame.outer.scale.set(0.8 + Math.random() * 0.35, flicker, flicker);
        flame.inner.scale.set(0.9 + Math.random() * 0.3, flicker * 0.55, flicker * 0.55);
      }
    }
    this.boostLight.intensity = damp(this.boostLight.intensity, boostOn ? 10 : 0, 20, dt);
    this.underLight.intensity = damp(this.underLight.intensity, this.grounded ? 2.4 : 0.7, 8, dt);

    // Boost trail.
    if (boostOn && fx) {
      this.boostSpawn -= dt;
      while (this.boostSpawn <= 0) {
        this.boostSpawn += 0.018;
        const nozzle = this.tmp2.set(-3.2, -0.02, Math.random() < 0.5 ? 0.62 : -0.62);
        nozzle.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        nozzle.add(this.pos);
        fx.trail(nozzle, this.team.accent, 0.38, 0.36, 1.1);
        if (Math.random() < 0.35) fx.trail(nozzle, 0xffffff, 0.22, 0.26, 0.7);
      }
    } else {
      this.boostSpawn = 0;
    }
  }
}

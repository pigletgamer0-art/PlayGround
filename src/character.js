import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FIELD, clamp, damp, wrapAngle } from './constants.js';

const GROUND_Y = 0;

/**
 * A stylised neon pilot that can step out of the car. Movement is
 * camera-relative so it feels like a conventional third-person game.
 */
export class Character {
  constructor(scene, team) {
    this.scene = scene;
    this.team = team;
    this.pos = new THREE.Vector3(0, GROUND_Y, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.speed = 0;
    this.walkPhase = 0;
    this.airTime = 0;
    this.kickCooldown = 0;
    this.stepTimer = 0;
    this.onFootstep = () => {};

    this.root = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.root.add(this.bodyRoot);
    this.build();
    this.root.visible = false;
    scene.add(this.root);
  }

  build() {
    const teamColor = this.team.color;
    const accent = this.team.accent;
    const suit = new THREE.MeshPhysicalMaterial({
      color: 0x1d2f4d,
      metalness: 0.4,
      roughness: 0.4,
      clearcoat: 0.45,
      clearcoatRoughness: 0.32,
    });
    const armor = new THREE.MeshPhysicalMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: 0.22,
      metalness: 0.5,
      roughness: 0.3,
      clearcoat: 0.75,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 2.4,
      metalness: 0.2,
      roughness: 0.3,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x080b12, metalness: 0.7, roughness: 0.5 });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x8ff4ff,
      emissive: 0x5fe8ff,
      emissiveIntensity: 3.4,
      metalness: 0.1,
      roughness: 0.1,
    });

    const add = (geo, mat, x, y, z, parent = this.bodyRoot, opts = {}) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
      mesh.castShadow = opts.shadow !== false;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };

    // Torso and shoulders. Character faces +X, so depth is along X and
    // shoulder width is along Z.
    add(new RoundedBoxGeometry(0.66, 0.94, 0.9, 4, 0.2), suit, 0, 1.72, 0);
    add(new RoundedBoxGeometry(0.7, 0.34, 0.98, 3, 0.14), armor, 0, 2.02, 0);
    add(new RoundedBoxGeometry(0.18, 0.2, 0.68, 2, 0.06), accentMat, 0.36, 1.82, 0);
    add(new RoundedBoxGeometry(0.5, 0.16, 0.54, 2, 0.05), dark, -0.08, 1.2, 0);

    // Chest light and suit seams.
    add(new THREE.BoxGeometry(0.06, 0.26, 0.1), accentMat, 0.35, 1.66, 0);
    add(new THREE.BoxGeometry(0.06, 0.08, 0.56), accentMat, 0.34, 1.94, 0.34, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.06, 0.08, 0.56), accentMat, 0.34, 1.94, -0.34, this.bodyRoot, { shadow: false });

    // Helmet.
    const helmet = add(new THREE.SphereGeometry(0.37, 24, 18), armor, 0.02, 2.5, 0);
    helmet.scale.set(1.08, 1.02, 0.94);
    add(new RoundedBoxGeometry(0.2, 0.26, 0.56, 3, 0.08), visorMat, 0.31, 2.52, 0, this.bodyRoot, { shadow: false });
    add(new RoundedBoxGeometry(0.16, 0.12, 0.4, 2, 0.04), dark, -0.3, 2.52, 0);
    // Antenna.
    add(new THREE.CylinderGeometry(0.022, 0.03, 0.42, 6), dark, -0.16, 2.9, 0.22, this.bodyRoot, { shadow: false });
    add(new THREE.SphereGeometry(0.06, 8, 8), accentMat, -0.16, 3.12, 0.22, this.bodyRoot, { shadow: false });

    // Backpack with a single wide exhaust vent, so it reads as gear rather
    // than a second face when seen from behind.
    add(new RoundedBoxGeometry(0.42, 0.62, 0.62, 3, 0.1), dark, -0.44, 1.76, 0);
    add(new THREE.BoxGeometry(0.06, 0.08, 0.5), accentMat, -0.69, 1.94, 0, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.04, 0.5, 0.06), accentMat, -0.66, 1.74, 0, this.bodyRoot, { shadow: false });
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8a2d,
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.4,
    });
    add(new RoundedBoxGeometry(0.14, 0.13, 0.42, 2, 0.03), dark, -0.63, 1.45, 0, this.bodyRoot, { shadow: false });
    add(new THREE.BoxGeometry(0.05, 0.07, 0.3), exhaustMat, -0.71, 1.45, 0, this.bodyRoot, { shadow: false });

    // Legs.
    this.legs = [];
    for (const z of [0.26, -0.26]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.24, z);
      this.bodyRoot.add(pivot);
      add(new RoundedBoxGeometry(0.38, 0.68, 0.4, 3, 0.13), suit, 0, -0.32, 0, pivot);
      add(new RoundedBoxGeometry(0.34, 0.5, 0.36, 3, 0.1), dark, 0, -0.82, 0, pivot);
      add(new RoundedBoxGeometry(0.62, 0.24, 0.4, 3, 0.08), armor, 0.12, -1.08, 0, pivot);
      add(new THREE.BoxGeometry(0.06, 0.06, 0.12), accentMat, 0.4, -0.86, 0, pivot, { shadow: false });
      add(new THREE.BoxGeometry(0.05, 0.44, 0.1), accentMat, -0.2, -0.42, 0, pivot, { shadow: false });
      this.legs.push(pivot);
    }

    // Arms.
    this.arms = [];
    for (const z of [0.56, -0.56]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.0, z);
      this.bodyRoot.add(pivot);
      add(new RoundedBoxGeometry(0.3, 0.64, 0.32, 3, 0.1), suit, 0, -0.28, 0, pivot);
      add(new RoundedBoxGeometry(0.26, 0.5, 0.28, 3, 0.08), armor, 0, -0.8, 0, pivot);
      add(new RoundedBoxGeometry(0.34, 0.24, 0.32, 2, 0.06), dark, 0.02, -1.08, 0, pivot);
      this.arms.push(pivot);
    }

    // Soft ground contact shadow.
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.04;
    blob.renderOrder = 1;
    this.root.add(blob);
    this.shadowBlob = blob;

    this.underLight = new THREE.PointLight(accent, 1.6, 7, 2);
    this.underLight.position.set(0, 0.6, 0);
    this.root.add(this.underLight);
  }

  spawn(carPos, carYaw) {
    // Step out on whichever side of the car has more room.
    const right = new THREE.Vector3(Math.sin(carYaw), 0, Math.cos(carYaw));
    const probe = 3.6;
    const options = [1, -1].map((side) => {
      const x = clamp(carPos.x + right.x * probe * side, -FIELD.halfLength + 2.4, FIELD.halfLength - 2.4);
      const z = clamp(carPos.z + right.z * probe * side, -FIELD.halfWidth + 2.4, FIELD.halfWidth - 2.4);
      return { x, z, room: Math.hypot(x - carPos.x, z - carPos.z) };
    });
    const spot = options[0].room >= options[1].room ? options[0] : options[1];
    this.pos.set(spot.x, GROUND_Y, spot.z);
    this.vel.set(0, 0, 0);
    this.yaw = carYaw;
    this.grounded = true;
    this.speed = 0;
    this.walkPhase = 0;
    this.kickCooldown = 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.vel.set(0, 0, 0);
    this.speed = 0;
  }

  update(dt, controls, cameraYaw, fx = null) {
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const sprint = Boolean(controls.boost);
    const input = Math.hypot(throttle, steer);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);

    // Camera-relative movement.
    const cfx = Math.cos(cameraYaw);
    const cfz = -Math.sin(cameraYaw);
    const crx = Math.sin(cameraYaw);
    const crz = Math.cos(cameraYaw);
    let mx = cfx * throttle + crx * steer;
    let mz = cfz * throttle + crz * steer;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001) {
      mx /= mlen;
      mz /= mlen;
    }

    const targetSpeed = input > 0.08 ? (sprint ? 17.2 : 9.6) * Math.min(1, input * 1.25) : 0;
    const targetVX = mx * targetSpeed;
    const targetVZ = mz * targetSpeed;
    const accel = this.grounded ? 13 : 2.4;
    this.vel.x = damp(this.vel.x, targetVX, accel, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel, dt);

    if (input > 0.12) {
      const desiredYaw = Math.atan2(-mz, mx);
      this.yaw = wrapAngle(this.yaw + wrapAngle(desiredYaw - this.yaw) * Math.min(1, 13 * dt));
    }

    if (controls.jump && this.grounded) {
      this.vel.y = 12.8;
      this.grounded = false;
      this.airTime = 0;
      this.onFootstep('jump');
      if (fx) {
        fx.emit(this.pos, {
          count: 10,
          color: this.team.accent,
          speed: 4,
          spread: 2,
          life: 0.3,
          size: 0.24,
          direction: new THREE.Vector3(0, 1, 0),
          jitter: 0.5,
        });
      }
    }

    if (!this.grounded) {
      this.airTime += dt;
      this.vel.y -= FIELD.gravity * dt;
    }

    this.pos.addScaledVector(this.vel, dt);

    // Keep the pilot inside the playing surface.
    const bx = FIELD.halfLength - 2;
    const bz = FIELD.halfWidth - 2;
    if (this.pos.x > bx) { this.pos.x = bx; this.vel.x = Math.min(0, this.vel.x); }
    else if (this.pos.x < -bx) { this.pos.x = -bx; this.vel.x = Math.max(0, this.vel.x); }
    if (this.pos.z > bz) { this.pos.z = bz; this.vel.z = Math.min(0, this.vel.z); }
    else if (this.pos.z < -bz) { this.pos.z = -bz; this.vel.z = Math.max(0, this.vel.z); }

    if (this.pos.y <= GROUND_Y) {
      if (!this.grounded && this.vel.y < -6) this.onFootstep('land');
      this.pos.y = GROUND_Y;
      this.vel.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
    }

    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.speed = planar;
    this.walkPhase += planar * dt * 1.65;
    if (this.grounded && planar > 0.8) {
      this.stepTimer -= dt * (sprint ? 1.35 : 1);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.3;
        this.onFootstep('step');
      }
    }

    // Pose.
    const swing = this.grounded ? Math.sin(this.walkPhase) * Math.min(1, planar / 10) * 0.72 : 0.34;
    const idle = Math.sin(performance.now() * 0.0022) * 0.015;
    this.legs[0].rotation.z = this.grounded ? swing : 0.5;
    this.legs[1].rotation.z = this.grounded ? -swing : -0.3;
    this.arms[0].rotation.z = this.grounded ? -swing * 0.8 : -0.45;
    this.arms[1].rotation.z = this.grounded ? swing * 0.8 : -0.45;
    this.bodyRoot.position.y = this.grounded ? Math.abs(Math.sin(this.walkPhase)) * 0.045 + idle : 0.05;
    this.bodyRoot.rotation.z = damp(this.bodyRoot.rotation.z, -Math.min(1, planar / 18) * 0.13, 8, dt);
    this.bodyRoot.rotation.x = damp(this.bodyRoot.rotation.x, this.grounded ? 0 : clamp(-this.vel.y * 0.012, -0.14, 0.2), 8, dt);
    this.shadowBlob.material.opacity = this.grounded ? 1 : 0.45;

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.underLight.intensity = damp(this.underLight.intensity, this.grounded ? 1.6 : 0.6, 8, dt);
  }
}

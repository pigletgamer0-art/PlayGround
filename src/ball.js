import * as THREE from 'three';
import { ARENA } from './arena.js';
import { makeBallTexture, makeHaloTexture } from './textures.js';
import { clamp, rand } from './utils.js';

export const BALL_RADIUS = 1.82;

export class Ball {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, BALL_RADIUS, 0);
    this.vel = new THREE.Vector3();
    this.radius = BALL_RADIUS;
    this.trailClock = 0;
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinSpeed = 0;

    const material = new THREE.MeshPhysicalMaterial({
      map: makeBallTexture(),
      metalness: 0.16,
      roughness: 0.44,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.45,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(),
      color: 0xbdf6ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    this.halo.scale.setScalar(BALL_RADIUS * 4.2);
    this.scene.add(this.halo);

    this.light = new THREE.PointLight(0x9deeff, 9, 14, 2);
    this.scene.add(this.light);

    this.reset();
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, BALL_RADIUS, z);
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.halo.position.copy(this.pos);
    this.light.position.copy(this.pos);
  }

  update(dt, particles) {
    this.vel.y -= 24 * dt;
    const drag = Math.max(0, 1 - 0.075 * dt);
    this.vel.multiplyScalar(drag);

    this.pos.addScaledVector(this.vel, dt);
    const r = BALL_RADIUS;

    // Floor
    if (this.pos.y < r) {
      this.pos.y = r;
      if (this.vel.y < 0) {
        const bounce = -this.vel.y * 0.72;
        this.vel.y = bounce > 1.2 ? bounce : 0;
        this.vel.x *= 0.992;
        this.vel.z *= 0.992;
        if (bounce > 5 && particles) {
          particles.burst(this.pos.clone().setY(0.15), 12, {
            color: new THREE.Color(0xcfeeff),
            speed: bounce * 0.35,
            size: 0.55,
            life: 0.45,
            gravity: 7,
            drag: 1.8,
            spread: 1.7,
          });
        }
      }
    }

    // Ceiling
    if (this.pos.y > ARENA.wallHeight - r) {
      this.pos.y = ARENA.wallHeight - r;
      if (this.vel.y > 0) this.vel.y *= -0.55;
    }

    // Side walls
    const xLimit = ARENA.width / 2 - r;
    if (Math.abs(this.pos.x) > xLimit) {
      const sign = Math.sign(this.pos.x);
      this.pos.x = sign * xLimit;
      this.vel.x *= -0.78;
    }

    // End walls / goals
    const throughGoal = Math.abs(this.pos.x) < ARENA.goalWidth / 2 - 0.3 && this.pos.y < ARENA.goalHeight - 0.2;
    const zWall = ARENA.length / 2 - r;
    if (!throughGoal) {
      if (Math.abs(this.pos.z) > zWall) {
        const sign = Math.sign(this.pos.z);
        this.pos.z = sign * zWall;
        this.vel.z *= -0.78;
      }
    } else if (Math.abs(this.pos.z) > ARENA.length / 2) {
      const sign = Math.sign(this.pos.z);
      // Constrain the ball inside the goal box once it has crossed the line.
      const goalX = ARENA.goalWidth / 2 - r;
      if (Math.abs(this.pos.x) > goalX) {
        this.pos.x = Math.sign(this.pos.x) * goalX;
        this.vel.x *= -0.4;
      }
      if (this.pos.y > ARENA.goalHeight - r) {
        this.pos.y = ARENA.goalHeight - r;
        if (this.vel.y > 0) this.vel.y *= -0.4;
      }
      const backZ = ARENA.length / 2 + ARENA.goalDepth - r - 0.2;
      if (Math.abs(this.pos.z) > backZ) {
        this.pos.z = sign * backZ;
        this.vel.z *= -0.28;
        this.vel.x *= 0.8;
      }
    }

    // Posts (simple vertical cylinders at the mouth)
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        const px = side * ARENA.goalWidth / 2;
        const pz = end * ARENA.length / 2;
        const dx = this.pos.x - px;
        const dz = this.pos.z - pz;
        const dist = Math.hypot(dx, dz);
        const min = r + 0.25;
        if (dist < min && this.pos.y < ARENA.goalHeight + r) {
          const nx = dist > 0.001 ? dx / dist : 1;
          const nz = dist > 0.001 ? dz / dist : 0;
          this.pos.x = px + nx * min;
          this.pos.z = pz + nz * min;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= 1.7 * vn * nx;
            this.vel.z -= 1.7 * vn * nz;
            this.vel.multiplyScalar(0.85);
          }
        }
      }
    }

    // Hard speed cap
    const speed = this.vel.length();
    if (speed > 62) this.vel.multiplyScalar(62 / speed);

    // Visuals
    this.mesh.position.copy(this.pos);
    this.halo.position.copy(this.pos);
    this.light.position.copy(this.pos);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.1) {
      this.spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.spinSpeed = hSpeed / BALL_RADIUS;
      this.mesh.rotateOnWorldAxis(this.spinAxis, this.spinSpeed * dt * 0.55);
    }
    this.halo.material.opacity = 0.22 + Math.sin(performance.now() * 0.003) * 0.04 + clamp(speed / 120, 0, 0.12);

    if (particles) {
      this.trailClock += dt;
      const interval = speed > 26 ? 0.022 : 0.04;
      while (this.trailClock > interval) {
        this.trailClock -= interval;
        const tint = new THREE.Color(Math.random() < 0.25 ? 0x6fe8ff : 0xe8fdff);
        particles.spawn({
          position: this.pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.9)),
          velocity: new THREE.Vector3(rand(-0.7, 0.7), rand(-0.2, 1.1), rand(-0.7, 0.7)),
          color: tint,
          size: rand(0.3, 0.7),
          life: rand(0.25, 0.55),
          gravity: 1.2,
          drag: 1.4,
          grow: 1.2,
          fade: 1.5,
        });
      }
    }
  }

  collideCar(car) {
    if (Math.abs(this.pos.y - car.pos.y) > 2.5) return 0;

    const dx = this.pos.x - car.pos.x;
    const dz = this.pos.z - car.pos.z;
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const halfW = 1.05;
    const halfL = 2.08;
    const cx = clamp(localX, -halfW, halfW);
    const cz = clamp(localZ, -halfL, halfL);
    const cy = clamp(this.pos.y - car.pos.y, -0.58, 0.72);

    const worldX = car.pos.x + cx * cos + cz * sin;
    const worldZ = car.pos.z - cx * sin + cz * cos;
    const worldY = car.pos.y + cy;

    let nx = this.pos.x - worldX;
    let ny = this.pos.y - worldY;
    let nz = this.pos.z - worldZ;
    let dist = Math.hypot(nx, ny, nz);

    if (dist > BALL_RADIUS) return 0;
    if (dist < 0.0001) {
      nx = 0; ny = 1; nz = 0; dist = 0.0001;
    }
    nx /= dist; ny /= dist; nz /= dist;

    const penetration = BALL_RADIUS - dist;
    this.pos.x += nx * penetration;
    this.pos.y += ny * penetration;
    this.pos.z += nz * penetration;

    const relX = this.vel.x - car.vel.x;
    const relY = this.vel.y - car.vel.y;
    const relZ = this.vel.z - car.vel.z;
    const vn = relX * nx + relY * ny + relZ * nz;
    if (vn >= 0) return 0;

    const impact = -vn;
    const power = 1.42;
    this.vel.x += nx * impact * power + car.vel.x * 0.22;
    this.vel.y += ny * impact * power + car.vel.y * 0.1;
    this.vel.z += nz * impact * power + car.vel.z * 0.22;

    // A little lift when catching the ball with the nose or roof.
    const carSpeed = car.speed();
    this.vel.y += clamp(carSpeed * 0.1 + impact * 0.06, 0, 5.5);

    // Keep the ball from being pinched through the car.
    if (Math.hypot(this.pos.x - car.pos.x, this.pos.z - car.pos.z) < 2.4) {
      const awayX = this.pos.x - car.pos.x;
      const awayZ = this.pos.z - car.pos.z;
      const len = Math.hypot(awayX, awayZ) || 1;
      this.vel.x += (awayX / len) * impact * 0.25;
      this.vel.z += (awayZ / len) * impact * 0.25;
    }

    car.vel.multiplyScalar(clamp(1 - impact * 0.006, 0.88, 1));
    car.stats.hits += 1;
    this.spinSpeed += impact;

    const speed = this.vel.length();
    if (speed > 62) this.vel.multiplyScalar(62 / speed);
    return impact;
  }
}

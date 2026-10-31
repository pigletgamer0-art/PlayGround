import * as THREE from 'three';
import { FIELD, clamp } from './constants.js';

function makeBallTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8edf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft blue shading bands.
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, 'rgba(110,150,210,0.32)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(70,100,160,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hex grid.
  const r = 44;
  const h = Math.sin(Math.PI / 3) * r;
  ctx.strokeStyle = 'rgba(20,34,62,0.55)';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  for (let row = -1; row < canvas.height / h + 2; row += 1) {
    for (let col = -1; col < canvas.width / (r * 1.5) + 2; col += 1) {
      const cx = col * r * 1.5;
      const cy = row * h * 2 + (col % 2 ? h : 0);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Small team-coloured flecks to catch the light.
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(60,150,255,0.12)' : 'rgba(255,120,40,0.10)';
    ctx.beginPath();
    ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 20 + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.2, 'rgba(180,225,255,0.5)');
  g.addColorStop(0.5, 'rgba(90,170,255,0.16)');
  g.addColorStop(1, 'rgba(20,60,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Ball {
  constructor(scene) {
    this.scene = scene;
    this.radius = FIELD.ballRadius;
    this.pos = new THREE.Vector3(0, this.radius + 0.2, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.onEvent = () => {};
    this.trailTimer = 0;
    this.lastTouch = 'blue';
    this.lastHitBy = null;
    this.lastHitTime = -99;
    this.hitFlash = 0;

    this.group = new THREE.Group();
    const geo = new THREE.SphereGeometry(this.radius, 48, 32);
    const mat = new THREE.MeshPhysicalMaterial({
      map: makeBallTexture(),
      color: 0xffffff,
      metalness: 0.28,
      roughness: 0.32,
      clearcoat: 0.75,
      clearcoatRoughness: 0.2,
      emissive: 0x1a2c4a,
      emissiveIntensity: 0.5,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.group.add(this.mesh);

    // Faint crystalline cage to make the ball read at distance.
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.radius * 1.008, 2),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8ff,
        wireframe: true,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
      }),
    );
    this.group.add(cage);

    const glowMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0x9ed8ff,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(7.5);
    this.group.add(this.glow);

    this.light = new THREE.PointLight(0x9fd8ff, 5, 20, 2);
    this.light.position.set(0, 0, 0);
    this.group.add(this.light);

    scene.add(this.group);
    this.group.position.copy(this.pos);
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, this.radius + 0.15, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.mesh.quaternion.identity();
    this.hitFlash = 0;
    this.lastHitBy = null;
    this.lastHitTime = -99;
    this.light.intensity = 5;
  }

  update(dt, fx = null, active = true) {
    if (!active) {
      this.mesh.rotation.y += dt * 0.18;
      this.light.intensity = 4 + Math.sin(performance.now() * 0.002) * 1.2;
      return;
    }

    const speed = this.vel.length();
    this.vel.y -= FIELD.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);

    // Floor.
    if (this.pos.y < this.radius) {
      const impact = -this.vel.y;
      this.pos.y = this.radius;
      if (this.vel.y < -1.2) {
        this.vel.y = -this.vel.y * 0.66;
        this.vel.x *= 0.985;
        this.vel.z *= 0.985;
        if (impact > 6) {
          this.onEvent('bounce', impact);
          if (fx) {
            fx.emit(this.pos, {
              count: Math.round(impact * 0.7),
              color: 0xbfe6ff,
              speed: 4,
              spread: 4,
              life: 0.35,
              size: 0.25,
              gravity: 8,
              jitter: 0.8,
            });
          }
        }
      } else {
        this.vel.y = 0;
        const roll = Math.exp(-0.72 * dt);
        this.vel.x *= roll;
        this.vel.z *= roll;
      }
    }

    // Gentle arena circulation keeps the ball out of dead corners.
    if (this.pos.y < 6) {
      if (Math.abs(this.pos.z) > FIELD.halfWidth - 4.5 && Math.abs(this.vel.z) < 14) {
        this.vel.z -= Math.sign(this.pos.z) * 6.5 * dt;
      }
      if (Math.abs(this.pos.x) > FIELD.halfLength - 5.5 && Math.abs(this.vel.x) < 14 && !(Math.abs(this.pos.z) < FIELD.goalHalfWidth - 0.4 && this.pos.y < FIELD.goalHeight - 0.25)) {
        this.vel.x -= Math.sign(this.pos.x) * 6.5 * dt;
      }
    }

    // Side glass.
    const side = FIELD.halfWidth - this.radius;
    if (this.pos.z > side) {
      this.pos.z = side;
      if (this.vel.z > 0) {
        this.vel.z = -this.vel.z * 0.72;
        this.onEvent('wall', Math.abs(this.vel.z));
      }
    } else if (this.pos.z < -side) {
      this.pos.z = -side;
      if (this.vel.z < 0) {
        this.vel.z = -this.vel.z * 0.72;
        this.onEvent('wall', Math.abs(this.vel.z));
      }
    }

    // Ceiling.
    const top = FIELD.ceiling - this.radius;
    if (this.pos.y > top) {
      this.pos.y = top;
      this.vel.y = -Math.abs(this.vel.y) * 0.6;
    }

    // Ends, with goal mouths cut out.
    const inMouth = Math.abs(this.pos.z) < FIELD.goalHalfWidth - 0.4 && this.pos.y < FIELD.goalHeight - 0.25;
    const end = FIELD.halfLength - this.radius;
    if (!inMouth) {
      if (this.pos.x > end) {
        this.pos.x = end;
        if (this.vel.x > 0) {
          this.vel.x = -this.vel.x * 0.72;
          this.onEvent('wall', Math.abs(this.vel.x));
        }
      } else if (this.pos.x < -end) {
        this.pos.x = -end;
        if (this.vel.x < 0) {
          this.vel.x = -this.vel.x * 0.72;
          this.onEvent('wall', Math.abs(this.vel.x));
        }
      }
    } else {
      const back = FIELD.halfLength + FIELD.goalDepth - this.radius;
      if (this.pos.x > back) {
        this.pos.x = back;
        this.vel.x = -Math.abs(this.vel.x) * 0.35;
      } else if (this.pos.x < -back) {
        this.pos.x = -back;
        this.vel.x = Math.abs(this.vel.x) * 0.35;
      }
      // Net side walls.
      const netSide = FIELD.goalHalfWidth - this.radius * 0.4;
      if (Math.abs(this.pos.x) > FIELD.halfLength - this.radius) {
        if (this.pos.z > netSide) {
          this.pos.z = netSide;
          this.vel.z = -Math.abs(this.vel.z) * 0.4;
        } else if (this.pos.z < -netSide) {
          this.pos.z = -netSide;
          this.vel.z = Math.abs(this.vel.z) * 0.4;
        }
      }
    }

    if (this.pos.y > FIELD.ceiling + 4 || Math.abs(this.pos.x) > FIELD.halfLength + FIELD.goalDepth + 6) {
      this.reset(0, 0);
      this.onEvent('reset');
    }

    // Rolling spin.
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    if (horiz > 0.05) {
      const axis = new THREE.Vector3(-this.vel.z, 0, this.vel.x).normalize();
      const angle = (horiz * dt) / this.radius;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      this.mesh.quaternion.premultiply(q);
    } else {
      this.mesh.rotation.y += dt * 0.15;
    }

    // Speed-based glow and trail.
    const t = clamp(speed / 48, 0, 1);
    this.light.intensity = 5 + t * 15;
    this.light.color.setHSL(0.56 - t * 0.05, 0.75, 0.62 + t * 0.15);
    this.glow.material.opacity = 0.3 + t * 0.3;
    this.glow.scale.setScalar(7 + t * 5);
    this.group.position.copy(this.pos);

    if (fx && speed > 9) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.035;
        fx.trail(this.pos, speed > 38 ? 0xfff0b0 : 0xa8e0ff, 0.5 + t * 0.3, 0.55, 0.5);
      }
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }
}

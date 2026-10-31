import * as THREE from 'three';
import { rand } from './constants.js';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.25, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.02, d);
    float sparkle = smoothstep(0.5, 0.18, d);
    gl_FragColor = vec4(vColor * (0.7 + sparkle * 1.4), core * vAlpha);
  }
`;

export class Effects {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.capacity = 1200;
    this.particles = Array.from({ length: this.capacity }, () => ({
      active: false,
      life: 1,
      maxLife: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      color: new THREE.Color(),
      size: 1,
      gravity: 0,
      drag: 0,
    }));
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    this.alphas = new Float32Array(this.capacity);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, this.capacity);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: window.innerHeight * 0.6 } },
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);

    // Ground shockwave rings.
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    for (let i = 0; i < 10; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, scale: 8 });
    }
    this.ringCursor = 0;

    this.tmpColor = new THREE.Color();
  }

  resize(height) {
    this.material.uniforms.uScale.value = height * 0.6;
  }

  emit(position, options = {}) {
    const {
      count = 1,
      color = 0xffffff,
      speed = 4,
      spread = 0.2,
      life = 0.6,
      size = 0.45,
      gravity = 0,
      drag = 1.6,
      direction = null,
      jitter = 0,
    } = options;
    this.tmpColor.set(color);
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      p.active = true;
      p.maxLife = life * rand(0.65, 1.25);
      p.life = p.maxLife;
      p.pos.copy(position);
      p.pos.x += rand(-jitter, jitter);
      p.pos.y += rand(-jitter, jitter);
      p.pos.z += rand(-jitter, jitter);
      if (direction) {
        p.vel.copy(direction).multiplyScalar(speed * rand(0.55, 1.25));
        p.vel.x += rand(-spread, spread);
        p.vel.y += rand(-spread, spread);
        p.vel.z += rand(-spread, spread);
      } else {
        const theta = rand(0, Math.PI * 2);
        const phi = Math.acos(rand(-1, 1));
        const s = speed * rand(0.25, 1);
        p.vel.set(
          Math.sin(phi) * Math.cos(theta) * s,
          Math.cos(phi) * s,
          Math.sin(phi) * Math.sin(theta) * s,
        );
      }
      p.color.copy(this.tmpColor);
      p.size = size * rand(0.7, 1.35);
      p.gravity = gravity;
      p.drag = drag;
    }
  }

  trail(position, color, size = 0.34, life = 0.5, drift = 0.6) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    p.active = true;
    p.maxLife = life * rand(0.75, 1.25);
    p.life = p.maxLife;
    p.pos.copy(position);
    p.pos.x += rand(-0.25, 0.25);
    p.pos.y += rand(-0.25, 0.25);
    p.pos.z += rand(-0.25, 0.25);
    p.vel.set(rand(-drift, drift), rand(-drift, drift), rand(-drift, drift));
    p.color.set(color);
    p.size = size * rand(0.8, 1.25);
    p.gravity = 0;
    p.drag = 0.4;
  }

  ring(position, color, maxScale = 9, life = 0.65) {
    const entry = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    entry.mesh.position.copy(position);
    entry.mesh.position.y = Math.max(0.15, position.y);
    entry.mesh.material.color.set(color);
    entry.mesh.material.opacity = 0.95;
    entry.mesh.scale.setScalar(0.6);
    entry.mesh.visible = true;
    entry.life = life;
    entry.maxLife = life;
    entry.scale = maxScale;
  }

  goalBurst(position, color, accent) {
    this.emit(position, {
      count: 130,
      color,
      speed: 26,
      spread: 12,
      life: 1.5,
      size: 0.7,
      gravity: 8,
      drag: 0.9,
    });
    this.emit(position, {
      count: 70,
      color: accent,
      speed: 15,
      spread: 8,
      life: 1.2,
      size: 0.5,
      gravity: 4,
      drag: 1.1,
    });
    this.emit(position, {
      count: 40,
      color: 0xffffff,
      speed: 34,
      spread: 14,
      life: 0.9,
      size: 0.38,
      gravity: 6,
      drag: 1.6,
    });
    this.ring(new THREE.Vector3(position.x, 0.2, position.z), color, 26, 1.1);
    this.ring(new THREE.Vector3(position.x, 0.2, position.z), 0xffffff, 16, 0.85);
  }

  update(dt) {
    const pos = this.positions;
    const col = this.colors;
    const size = this.sizes;
    const alpha = this.alphas;
    for (let i = 0; i < this.capacity; i += 1) {
      const p = this.particles[i];
      const i3 = i * 3;
      if (!p.active) {
        alpha[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        alpha[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      const dragFactor = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(dragFactor);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.08) {
        p.pos.y = 0.08;
        p.vel.y *= -0.35;
      }
      const t = p.life / p.maxLife;
      pos[i3] = p.pos.x;
      pos[i3 + 1] = p.pos.y;
      pos[i3 + 2] = p.pos.z;
      col[i3] = p.color.r;
      col[i3 + 1] = p.color.g;
      col[i3 + 2] = p.color.b;
      size[i] = p.size;
      alpha[i] = Math.min(1, t * 2.4) * 0.9;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;

    for (const entry of this.rings) {
      if (!entry.life) continue;
      entry.life -= dt;
      const t = 1 - Math.max(0, entry.life) / entry.maxLife;
      entry.mesh.scale.setScalar(0.6 + t * entry.scale);
      entry.mesh.material.opacity = (1 - t) ** 1.6 * 0.95;
      if (entry.life <= 0) entry.mesh.visible = false;
    }
  }
}

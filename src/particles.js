import * as THREE from 'three';

const MAX = 1400;

/** A compact CPU particle pool rendered as soft additive points. */
export class ParticlePool {
  constructor(scene) {
    this.max = MAX;
    this.cursor = 0;
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.alphas = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.baseColor = new Float32Array(MAX * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('particleColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, MAX);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute vec3 particleColor;
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = particleColor;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (310.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p) * 2.0;
          if (d > 1.0) discard;
          float core = pow(1.0 - d, 1.7);
          gl_FragColor = vec4(vColor * core, core * vAlpha);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
  }

  emit({
    x = 0,
    y = 0,
    z = 0,
    vx = 0,
    vy = 0,
    vz = 0,
    spread = 1,
    color = [1, 1, 1],
    size = 0.6,
    life = 0.6,
    gravity = 0,
    drag = 1.4,
    count = 1,
  } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const i3 = i * 3;
      this.positions[i3] = x + (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = y + (Math.random() - 0.5) * spread;
      this.positions[i3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i3] = vx + (Math.random() - 0.5) * spread * 3;
      this.vel[i3 + 1] = vy + (Math.random() - 0.5) * spread * 3;
      this.vel[i3 + 2] = vz + (Math.random() - 0.5) * spread * 3;
      const tint = 0.82 + Math.random() * 0.35;
      this.baseColor[i3] = color[0] * tint;
      this.baseColor[i3 + 1] = color[1] * tint;
      this.baseColor[i3 + 2] = color[2] * tint;
      this.colors[i3] = this.baseColor[i3];
      this.colors[i3 + 1] = this.baseColor[i3 + 1];
      this.colors[i3 + 2] = this.baseColor[i3 + 2];
      this.life[i] = life * (0.75 + Math.random() * 0.5);
      this.maxLife[i] = this.life[i];
      this.size0[i] = size * (0.7 + Math.random() * 0.7);
      this.sizes[i] = this.size0[i];
      this.alphas[i] = 1;
      this.gravity[i] = gravity;
      this.drag[i] = drag;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      this.vel[i3 + 1] -= this.gravity[i] * dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] *= d;
      this.vel[i3 + 2] *= d;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.1) {
        this.positions[i3 + 1] = 0.1;
        this.vel[i3 + 1] *= -0.25;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alphas[i] = t * t;
      this.sizes[i] = this.size0[i] * (0.55 + t * 0.65);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.particleColor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

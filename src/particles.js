import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    vAlpha = aAlpha * smoothstep(2.5, 6.0, dist);
    gl_PointSize = min(64.0, aSize * (240.0 / max(1.0, dist)));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor * tex.rgb, alpha);
  }
`;

export class ParticleField {
  constructor(scene, glowTexture, capacity = 2600) {
    this.capacity = capacity;
    this.particles = new Array(capacity);
    for (let i = 0; i < capacity; i += 1) {
      this.particles[i] = {
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(),
        gravity: 0,
        drag: 0,
        fade: 1,
        grow: 0,
        swirl: 0,
      };
    }
    this.cursor = 0;

    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    for (let i = 0; i < capacity; i += 1) {
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geometry = geometry;
    this.dirty = true;
  }

  spawn({ position, velocity, color, size = 1, life = 1, gravity = 0, drag = 0, fade = 1, grow = 0, swirl = 0 }) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    p.active = true;
    p.pos.copy(position);
    if (velocity) p.vel.copy(velocity); else p.vel.set(0, 0, 0);
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color.copy(color);
    p.gravity = gravity;
    p.drag = drag;
    p.fade = fade;
    p.grow = grow;
    p.swirl = swirl;
  }

  burst(position, count, { color, speed = 8, size = 1, life = 1, gravity = 10, drag = 1.4, spread = 1, fade = 1, grow = 0 }) {
    const base = color instanceof THREE.Color ? color : new THREE.Color(color);
    const tint = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.9));
      dir.x *= spread;
      tint.copy(base).offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.18);
      this.spawn({
        position,
        velocity: dir,
        color: tint,
        size: size * (0.55 + Math.random() * 0.9),
        life: life * (0.55 + Math.random() * 0.8),
        gravity,
        drag,
        fade,
        grow,
      });
    }
  }

  update(dt) {
    const { positions, colors, sizes, alphas } = this;
    const tempColor = new THREE.Color();
    for (let i = 0; i < this.capacity; i += 1) {
      const p = this.particles[i];
      const i3 = i * 3;
      if (!p.active) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (p.swirl) {
        const angle = p.swirl * dt;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const vx = p.vel.x * cos - p.vel.z * sin;
        const vz = p.vel.x * sin + p.vel.z * cos;
        p.vel.x = vx;
        p.vel.z = vz;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.05) {
        p.pos.y = 0.05;
        p.vel.y *= -0.25;
        p.vel.x *= 0.8;
        p.vel.z *= 0.8;
      }
      const t = p.life / p.maxLife;
      positions[i3] = p.pos.x;
      positions[i3 + 1] = p.pos.y;
      positions[i3 + 2] = p.pos.z;
      tempColor.copy(p.color);
      colors[i3] = tempColor.r;
      colors[i3 + 1] = tempColor.g;
      colors[i3 + 2] = tempColor.b;
      sizes[i] = p.size * (1 + p.grow * (1 - t));
      alphas[i] = Math.pow(t, p.fade);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

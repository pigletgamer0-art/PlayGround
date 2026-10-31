import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FIELD, TEAM, rand } from './constants.js';

const px = (x) => ((x + FIELD.halfLength) / (FIELD.halfLength * 2)) * 2048;
const pz = (z) => ((z + FIELD.halfWidth) / (FIELD.halfWidth * 2)) * 1310;

function fieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1310;
  const ctx = canvas.getContext('2d');

  // Base and mow stripes.
  ctx.fillStyle = '#0a2426';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const stripe = canvas.width / 8;
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(24,64,63,0.5)' : 'rgba(7,30,33,0.55)';
    ctx.fillRect(i * stripe, 0, stripe, canvas.height);
  }

  // Cool / warm end washes.
  const left = ctx.createLinearGradient(0, 0, 500, 0);
  left.addColorStop(0, 'rgba(22,72,130,0.44)');
  left.addColorStop(1, 'rgba(22,72,130,0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, 500, canvas.height);
  const right = ctx.createLinearGradient(canvas.width, 0, canvas.width - 500, 0);
  right.addColorStop(0, 'rgba(132,55,18,0.4)');
  right.addColorStop(1, 'rgba(132,55,18,0)');
  ctx.fillStyle = right;
  ctx.fillRect(canvas.width - 500, 0, 500, canvas.height);

  // Fine turf noise.
  for (let i = 0; i < 12000; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3 + 1, Math.random() * 3 + 1);
  }

  const line = (x1, z1, x2, z2, width = 8, color = 'rgba(228,244,255,0.82)') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(x1), pz(z1));
    ctx.lineTo(px(x2), pz(z2));
    ctx.stroke();
  };
  const circle = (x, z, r, width = 8) => {
    ctx.strokeStyle = 'rgba(228,244,255,0.82)';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(px(x), pz(z), (r / (FIELD.halfLength * 2)) * 2048, 0, Math.PI * 2);
    ctx.stroke();
  };
  const rect = (x, z, w, h, width = 8) => {
    ctx.strokeStyle = 'rgba(228,244,255,0.78)';
    ctx.lineWidth = width;
    ctx.strokeRect(px(x - w / 2), pz(z - h / 2), (w / (FIELD.halfLength * 2)) * 2048, (h / (FIELD.halfWidth * 2)) * 1310);
  };

  // Boundary.
  rect(0, 0, 96, 60, 10);

  // Centre line, circle and dot.
  line(0, -30, 0, 30, 9);
  circle(0, 0, 9, 9);
  ctx.fillStyle = 'rgba(228,244,255,0.9)';
  ctx.beginPath();
  ctx.arc(px(0), pz(0), 11, 0, Math.PI * 2);
  ctx.fill();

  // Goal boxes.
  rect(-44, 0, 12, 25, 8);
  rect(44, 0, 12, 25, 8);
  rect(-47, 0, 6, 21, 7);
  rect(47, 0, 6, 21, 7);

  // Penalty arcs (clipped by canvas edges naturally).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  ctx.strokeStyle = 'rgba(228,244,255,0.64)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(px(-50), pz(0), (20 / 100) * 2048, -Math.PI / 2.6, Math.PI / 2.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(50), pz(0), (20 / 100) * 2048, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6);
  ctx.stroke();
  ctx.restore();

  // Corner arcs.
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    ctx.strokeStyle = 'rgba(228,244,255,0.6)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(px(sx * 48), pz(sz * 30), 42, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Faint centre emblem.
  ctx.save();
  ctx.translate(px(0), pz(0));
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#d9f6ff';
  ctx.lineWidth = 9;
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * 168;
    const y = Math.sin(a) * 168;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Midfield chevrons.
  ctx.strokeStyle = 'rgba(228,244,255,0.13)';
  ctx.lineWidth = 13;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px(dir * 5), pz(-18));
    ctx.lineTo(px(dir * 10), pz(0));
    ctx.lineTo(px(dir * 5), pz(18));
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(220,240,255,0.5)');
  g.addColorStop(1, 'rgba(160,210,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


function ribbonTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 128;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, '#081222');
  bg.addColorStop(0.5, '#0b1c33');
  bg.addColorStop(1, '#050a14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 2048, 128);
  ctx.fillStyle = 'rgba(90,200,255,0.16)';
  ctx.fillRect(0, 0, 2048, 2);
  ctx.fillStyle = 'rgba(255,150,60,0.16)';
  ctx.fillRect(0, 126, 2048, 2);
  ctx.font = '800 54px "Arial Narrow", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const text = 'ROCKET DUEL   ✦   BOOST   ✦   SUPERSONIC   ✦   OMG ARENA   ✦   ';
  let x = 12;
  let flip = false;
  while (x < 2100) {
    ctx.fillStyle = flip ? 'rgba(255,176,92,0.72)' : 'rgba(150,220,255,0.72)';
    ctx.fillText(text, x, 66);
    x += ctx.measureText(text).width;
    flip = !flip;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export class Arena {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pads = [];
    this.scoreTextures = [];
    this.goalLights = [];
    this.lampMats = [];
    this.time = 0;
    this.build();
  }

  build() {
    const scene = this.scene;

    // Environment reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.34;
    pmrem.dispose();

    this.buildSky();
    this.buildLights();
    this.buildField();
    this.buildWalls();
    this.buildGoals();
    this.buildStands();
    this.buildFloodlights();
    this.buildScoreboards();
    this.buildPads();
  }

  buildSky() {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0x070b17, 0.0021);
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x040716) },
        mid: { value: new THREE.Color(0x0d1736) },
        horizon: { value: new THREE.Color(0x24183f) },
        bottom: { value: new THREE.Color(0x04050b) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col;
          if (h > 0.18) col = mix(mid, top, smoothstep(0.18, 0.9, h));
          else if (h > -0.02) col = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
          else col = mix(bottom, horizon, smoothstep(-0.6, -0.02, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(geo, mat));

    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(rand(0.05, 1));
      const radius = 350;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      color.setHSL(rand(0.52, 0.68), rand(0.2, 0.8), rand(0.55, 0.95));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    // Soft moon glow.
    const moonTex = glowTexture();
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonTex, color: 0xcfe2ff, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    moon.position.set(-160, 190, -260);
    moon.scale.setScalar(95);
    scene.add(moon);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x89b6ff, 0x0a0c14, 0.82);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xd8e6ff, 1.7);
    key.position.set(30, 66, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -75;
    key.shadow.camera.right = 75;
    key.shadow.camera.top = 75;
    key.shadow.camera.bottom = -75;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 160;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x4d7dff, 0.72);
    rim.position.set(-50, 28, -40);
    this.scene.add(rim);

    const blueSpot = new THREE.SpotLight(0x3d7bff, 165, 140, 0.72, 0.65, 1.35);
    blueSpot.position.set(-48, 40, -20);
    blueSpot.target.position.set(0, 0, 0);
    this.scene.add(blueSpot, blueSpot.target);

    const orangeSpot = new THREE.SpotLight(0xff6a24, 155, 140, 0.72, 0.65, 1.35);
    orangeSpot.position.set(48, 40, 20);
    orangeSpot.target.position.set(0, 0, 0);
    this.scene.add(orangeSpot, orangeSpot.target);
  }

  buildField() {
    const tex = fieldTexture();
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfLength * 2, FIELD.halfWidth * 2),
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.82,
        metalness: 0.16,
        envMapIntensity: 0.32,
      }),
    );
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    this.scene.add(field);

    // Outer apron.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfLength * 2 + 30, FIELD.halfWidth * 2 + 26),
      new THREE.MeshStandardMaterial({ color: 0x070b13, roughness: 0.9, metalness: 0.2 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.06;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // Glowing perimeter lines.
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.5 });
    const makeStrip = (w, d, x, z, color) => {
      const mat = color ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }) : stripMat;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat);
      strip.position.set(x, 0.04, z);
      this.scene.add(strip);
    };
    makeStrip(100, 0.25, 0, FIELD.halfWidth + 0.12);
    makeStrip(100, 0.25, 0, -FIELD.halfWidth - 0.12);
    makeStrip(0.25, 64, FIELD.halfLength + 0.12, 0);
    makeStrip(0.25, 64, -FIELD.halfLength - 0.12, 0);
  }

  buildWalls() {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x8ed6ff,
      transparent: true,
      opacity: 0.055,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b2740, metalness: 0.85, roughness: 0.35 });
    const railMat = new THREE.MeshBasicMaterial({ color: 0x7fe4ff, transparent: true, opacity: 0.6 });
    const warmRail = new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.6 });

    const addPane = (w, h, x, y, z, ry = 0) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
      pane.position.set(x, y, z);
      pane.rotation.y = ry;
      pane.renderOrder = 2;
      this.scene.add(pane);
    };

    addPane(100, FIELD.wallHeight, 0, FIELD.wallHeight / 2, FIELD.halfWidth, 0);
    addPane(100, FIELD.wallHeight, 0, FIELD.wallHeight / 2, -FIELD.halfWidth, 0);

    for (const sx of [-1, 1]) {
      const x = sx * FIELD.halfLength;
      addPane(FIELD.halfWidth - FIELD.goalHalfWidth, FIELD.wallHeight, x, FIELD.wallHeight / 2, -(FIELD.goalHalfWidth + (FIELD.halfWidth - FIELD.goalHalfWidth) / 2), Math.PI / 2);
      addPane(FIELD.halfWidth - FIELD.goalHalfWidth, FIELD.wallHeight, x, FIELD.wallHeight / 2, FIELD.goalHalfWidth + (FIELD.halfWidth - FIELD.goalHalfWidth) / 2, Math.PI / 2);
      addPane(FIELD.goalHalfWidth * 2, FIELD.wallHeight - FIELD.goalHeight, x, FIELD.goalHeight + (FIELD.wallHeight - FIELD.goalHeight) / 2, 0, Math.PI / 2);
    }

    // Structural posts and rails.
    const postGeo = new THREE.BoxGeometry(0.28, FIELD.wallHeight, 0.28);
    const posts = [];
    for (let x = -FIELD.halfLength; x <= FIELD.halfLength + 0.01; x += 10) {
      posts.push([x, FIELD.halfWidth], [x, -FIELD.halfWidth]);
    }
    for (let z = -FIELD.halfWidth; z <= FIELD.halfWidth + 0.01; z += 8) {
      posts.push([FIELD.halfLength, z], [-FIELD.halfLength, z]);
    }
    const postMesh = new THREE.InstancedMesh(postGeo, frameMat, posts.length);
    const dummy = new THREE.Object3D();
    posts.forEach(([x, z], i) => {
      dummy.position.set(x, FIELD.wallHeight / 2, z);
      dummy.updateMatrix();
      postMesh.setMatrixAt(i, dummy.matrix);
    });
    postMesh.castShadow = false;
    this.scene.add(postMesh);

    const railGeoLong = new THREE.BoxGeometry(100.4, 0.16, 0.16);
    const railGeoShort = new THREE.BoxGeometry(0.16, 0.16, 64.4);
    for (const y of [0.35, 11, FIELD.wallHeight - 0.2]) {
      const mat = y > 11 ? railMat : frameMat;
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(railGeoLong, mat);
        rail.position.set(0, y, sz * FIELD.halfWidth);
        this.scene.add(rail);
      }
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(railGeoShort, mat);
        rail.position.set(sx * FIELD.halfLength, y, 0);
        this.scene.add(rail);
      }
    }
    // Team-coloured rails across each goal end.
    for (const [sx, mat] of [[-1, railMat], [1, warmRail]]) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, FIELD.halfWidth * 2), mat);
      top.position.set(sx * FIELD.halfLength, FIELD.wallHeight - 0.15, 0);
      this.scene.add(top);
    }

    // Vertical light blades on side walls.
    const bladeGeo = new THREE.BoxGeometry(0.1, 6.5, 0.12);
    for (let x = -40; x <= 40; x += 20) {
      for (const sz of [-1, 1]) {
        const color = sz > 0 ? 0x65d9ff : 0xff9a4d;
        const blade = new THREE.Mesh(
          bladeGeo,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
        );
        blade.position.set(x, 5.5, sz * (FIELD.halfWidth - 0.25));
        this.scene.add(blade);
      }
    }
  }

  buildGoals() {
    for (const sx of [-1, 1]) {
      const team = sx > 0 ? TEAM.orange : TEAM.blue;
      const x = sx * FIELD.halfLength;
      const accentMat = new THREE.MeshStandardMaterial({
        color: team.accent,
        emissive: team.accent,
        emissiveIntensity: 2.4,
        metalness: 0.4,
        roughness: 0.3,
      });
      const postGeo = new THREE.BoxGeometry(0.55, FIELD.goalHeight, 0.55);
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, accentMat);
        post.position.set(x, FIELD.goalHeight / 2, sz * FIELD.goalHalfWidth);
        post.castShadow = true;
        this.scene.add(post);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, FIELD.goalHalfWidth * 2 + 0.55), accentMat);
      cross.position.set(x, FIELD.goalHeight, 0);
      cross.castShadow = true;
      this.scene.add(cross);

      // Recess floor.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.goalDepth, FIELD.goalHalfWidth * 2),
        new THREE.MeshStandardMaterial({ color: team.deep, emissive: team.color, emissiveIntensity: 0.22, roughness: 0.55, metalness: 0.5 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x + sx * FIELD.goalDepth / 2, 0.03, 0);
      this.scene.add(floor);

      // Dark back wall.
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.goalHalfWidth * 2, FIELD.goalHeight),
        new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.9, metalness: 0.2, side: THREE.DoubleSide }),
      );
      back.position.set(x + sx * (FIELD.goalDepth + 0.4), FIELD.goalHeight / 2, 0);
      back.rotation.y = Math.PI / 2;
      this.scene.add(back);

      // Nets.
      const points = [];
      const bx = x + sx * FIELD.goalDepth;
      for (let i = 0; i <= 14; i += 1) {
        const z = -FIELD.goalHalfWidth + (i / 14) * FIELD.goalHalfWidth * 2;
        points.push(bx, 0.1, z, bx, FIELD.goalHeight, z);
      }
      for (let i = 0; i <= 7; i += 1) {
        const y = (i / 7) * FIELD.goalHeight;
        points.push(bx, y, -FIELD.goalHalfWidth, bx, y, FIELD.goalHalfWidth);
      }
      // Side nets.
      for (const sz of [-1, 1]) {
        for (let i = 0; i <= 7; i += 1) {
          const y = (i / 7) * FIELD.goalHeight;
          points.push(x, y, sz * FIELD.goalHalfWidth, bx, y, sz * FIELD.goalHalfWidth);
        }
        for (let i = 0; i <= 5; i += 1) {
          const xx = x + sx * (i / 5) * FIELD.goalDepth;
          points.push(xx, 0.05, sz * FIELD.goalHalfWidth, xx, FIELD.goalHeight, sz * FIELD.goalHalfWidth);
        }
      }
      const netGeo = new THREE.BufferGeometry();
      netGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const net = new THREE.LineSegments(
        netGeo,
        new THREE.LineBasicMaterial({ color: team.accent, transparent: true, opacity: 0.42 }),
      );
      this.scene.add(net);

      // Goal line and glow.
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, FIELD.goalHalfWidth * 2),
        new THREE.MeshBasicMaterial({ color: team.accent, transparent: true, opacity: 0.95 }),
      );
      line.position.set(x, 0.06, 0);
      this.scene.add(line);

      const light = new THREE.PointLight(team.color, 11, 34, 2);
      light.position.set(x + sx * 3.5, 4, 0);
      light.userData.flash = 0;
      this.scene.add(light);
      this.goalLights.push(light);

      // Goal-mouth shimmer.
      const shimmer = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.goalHalfWidth * 2, FIELD.goalHeight),
        new THREE.MeshBasicMaterial({
          color: team.color,
          transparent: true,
          opacity: 0.05,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      shimmer.position.set(x + sx * 0.3, FIELD.goalHeight / 2, 0);
      shimmer.rotation.y = Math.PI / 2;
      this.scene.add(shimmer);
    }
  }

  buildStands() {
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1b, roughness: 0.88, metalness: 0.25 });
    const crowdPalette = [
      new THREE.Color(0x0f1c35),
      new THREE.Color(0x14284c),
      new THREE.Color(0x2b1a14),
      new THREE.Color(0x2f3140),
      new THREE.Color(0x181b25),
      new THREE.Color(0x17427a),
      new THREE.Color(0x6c2c12),
      new THREE.Color(0x8c96a8),
      new THREE.Color(0x29568f),
      new THREE.Color(0xa8541e),
    ];
    const dummy = new THREE.Object3D();
    const crowdCount = 2600;
    const crowdGeo = new THREE.BoxGeometry(0.54, 1.05, 0.54);
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05 });
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
    crowd.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const tiers = [];
    let index = 0;
    const color = new THREE.Color();
    const placeRows = (side) => {
      for (let row = 0; row < 6; row += 1) {
        const y = 3.3 + row * 2.4;
        const offset = 37.5 + row * 3.4;
        if (side === 'z+') tiers.push({ w: 124, h: 2.4, d: 3.6, x: 0, y, z: offset });
        if (side === 'z-') tiers.push({ w: 124, h: 2.4, d: 3.6, x: 0, y, z: -offset });
        if (side === 'x+') tiers.push({ w: 3.6, h: 2.4, d: 76, x: 63 + row * 3.4, y, z: 0 });
        if (side === 'x-') tiers.push({ w: 3.6, h: 2.4, d: 76, x: -63 - row * 3.4, y, z: 0 });
        for (let i = 0; i < 100 && index < crowdCount; i += 1) {
          let cx = 0;
          let cz = 0;
          if (side === 'z+' || side === 'z-') {
            cx = rand(-60, 60);
            cz = (side === 'z+' ? 1 : -1) * (offset + rand(-1.3, 1.3));
          } else {
            cx = (side === 'x+' ? 1 : -1) * (63 + row * 3.4 + rand(-1.3, 1.3));
            cz = rand(-34, 34);
          }
          dummy.position.set(cx, y + 1.55, cz);
          dummy.rotation.y = rand(0, Math.PI * 2);
          const scale = rand(0.8, 1.3);
          dummy.scale.set(scale, rand(0.85, 1.25), scale);
          dummy.updateMatrix();
          crowd.setMatrixAt(index, dummy.matrix);
          color.copy(crowdPalette[Math.floor(Math.random() * crowdPalette.length)]);
          if (Math.random() < 0.07) color.setHex(Math.random() < 0.5 ? 0x5bc8ff : 0xffa64d);
          crowd.setColorAt(index, color);
          index += 1;
        }
      }
    };
    ['z+', 'z-', 'x+', 'x-'].forEach(placeRows);
    crowd.count = index;
    crowd.instanceColor.needsUpdate = true;
    this.scene.add(crowd);

    // Tier structure.
    for (const tier of tiers) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(tier.w, tier.h, tier.d), tierMat);
      mesh.position.set(tier.x, tier.y, tier.z);
      this.scene.add(mesh);
    }

    // Rail glow around the crowd base.
    const railMat = new THREE.MeshBasicMaterial({ color: 0x5cc9ff, transparent: true, opacity: 0.32 });
    const warmMat = new THREE.MeshBasicMaterial({ color: 0xff9b4d, transparent: true, opacity: 0.32 });
    for (const [z, mat] of [[1, railMat], [-1, warmMat]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(120, 0.18, 0.18), mat);
      rail.position.set(0, 5.1, z * 35.6);
      this.scene.add(rail);
    }

    // LED ribbon boards ringing the lower bowl.
    const ribbonTex = ribbonTexture();
    const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbonTex, side: THREE.DoubleSide, toneMapped: false });
    for (const sz of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(116, 1.4), ribbonMat);
      board.position.set(0, 4.8, sz * 35.1);
      board.rotation.y = sz > 0 ? Math.PI : 0;
      this.scene.add(board);
    }
    for (const sx of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(72, 1.4), ribbonMat);
      board.position.set(sx * 61.4, 4.8, 0);
      board.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(board);
    }

    // Camera flashes / phone lights in the crowd.
    const phoneCount = 130;
    const phoneGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const phoneMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff });
    const phones = new THREE.InstancedMesh(phoneGeo, phoneMat, phoneCount);
    for (let i = 0; i < phoneCount; i += 1) {
      const side = Math.floor(Math.random() * 4);
      const rowY = 3.3 + Math.floor(Math.random() * 6) * 2.4 + 1.7;
      let posX = 0;
      let posZ = 0;
      if (side === 0 || side === 1) {
        posX = rand(-60, 60);
        posZ = (side === 0 ? 1 : -1) * rand(38, 55);
      } else {
        posX = (side === 2 ? 1 : -1) * rand(38, 55);
        posZ = rand(-34, 34);
      }
      dummy.position.set(posX, rowY + rand(0.4, 1), posZ);
      dummy.scale.setScalar(rand(0.7, 1.5));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      phones.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(phones);
  }

  buildFloodlights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1b2436, metalness: 0.8, roughness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xe8f5ff });
    this.lampMats.push(lampMat);
    const glow = glowTexture();
    const corners = [
      [-58, -42, 0x6fc6ff],
      [-58, 42, 0x6fc6ff],
      [58, -42, 0xffa15c],
      [58, 42, 0xffa15c],
    ];
    for (const [x, z, color] of corners) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 34, 10), poleMat);
      pole.position.set(x, 17, z);
      this.scene.add(pole);

      const head = new THREE.Group();
      head.position.set(x, 34.5, z);
      head.rotation.y = Math.atan2(-x, -z);
      head.rotation.x = 0.32;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.4, 1.2), poleMat);
      head.add(housing);
      for (let ix = -2; ix <= 2; ix += 1) {
        for (let iy = -1; iy <= 1; iy += 1) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 0.18), lampMat);
          lamp.position.set(ix * 1.45, iy * 0.95, 0.65);
          head.add(lamp);
        }
      }
      this.scene.add(head);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.27, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.set(x, 34.5, z);
      halo.scale.setScalar(18);
      this.scene.add(halo);

    }
  }

  buildScoreboards() {
    for (const sx of [-1, 1]) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.scoreTextures.push({ tex, canvas, sx });

      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), mat);
      screen.position.set(sx * 59, 28.5, 0);
      screen.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(screen);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(31.4, 16.2, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.8, roughness: 0.4 }),
      );
      frame.position.set(sx * 59.5, 28.5, 0);
      frame.rotation.y = Math.PI / 2;
      this.scene.add(frame);

      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 18, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x172033, metalness: 0.8, roughness: 0.4 }),
      );
      support.position.set(sx * 59.5, 37.5, 0);
      this.scene.add(support);

      this.drawScoreboard(canvas, 0, 0, '5:00', 'FIRST TO 3');
    }
  }

  drawScoreboard(canvas, blue, orange, clock, mode) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#071227');
    bg.addColorStop(0.5, '#050912');
    bg.addColorStop(1, '#1a0b05');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Frame.
    ctx.strokeStyle = 'rgba(120,190,255,0.28)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // Team bands.
    const blueGrad = ctx.createLinearGradient(0, 0, 320, 0);
    blueGrad.addColorStop(0, 'rgba(40,110,255,0.34)');
    blueGrad.addColorStop(1, 'rgba(40,110,255,0)');
    ctx.fillStyle = blueGrad;
    ctx.fillRect(0, 0, 340, h);
    const orangeGrad = ctx.createLinearGradient(w, 0, w - 340, 0);
    orangeGrad.addColorStop(0, 'rgba(255,100,26,0.34)');
    orangeGrad.addColorStop(1, 'rgba(255,100,26,0)');
    ctx.fillStyle = orangeGrad;
    ctx.fillRect(w - 340, 0, 340, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 46px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = 'rgba(120,200,255,0.95)';
    ctx.fillText('BLUE', 170, 88);
    ctx.fillStyle = 'rgba(255,170,90,0.95)';
    ctx.fillText('ORANGE', w - 170, 88);

    ctx.font = 'italic 900 220px "Arial Black", Arial, sans-serif';
    ctx.fillStyle = '#eef7ff';
    ctx.shadowColor = '#2b7dff';
    ctx.shadowBlur = 34;
    ctx.fillText(String(blue), 170, 260);
    ctx.shadowColor = '#ff6b1e';
    ctx.fillText(String(orange), w - 170, 260);
    ctx.shadowBlur = 0;

    ctx.font = '800 92px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(clock, w / 2, 246);
    ctx.font = '600 36px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = 'rgba(190,220,255,0.62)';
    ctx.fillText(mode, w / 2, 348);

    ctx.font = '700 30px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = 'rgba(200,230,255,0.35)';
    ctx.fillText('ROCKET DUEL  //  OMGITHUB ARENA', w / 2, 444);
  }

  updateScoreboard(blue, orange, clock, mode) {
    for (const entry of this.scoreTextures) {
      this.drawScoreboard(entry.canvas, blue, orange, clock, mode);
      entry.tex.needsUpdate = true;
    }
  }

  buildPads() {
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xffc94d,
      emissive: 0xffaa22,
      emissiveIntensity: 1.6,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    const smallMat = new THREE.MeshStandardMaterial({
      color: 0x7fe0ff,
      emissive: 0x2fc4ff,
      emissiveIntensity: 1.5,
      metalness: 0.4,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.5 });
    const smallRingMat = new THREE.MeshBasicMaterial({ color: 0xbdf2ff, transparent: true, opacity: 0.4 });

    const spots = [
      [-36, -22, true], [-36, 22, true], [36, -22, true], [36, 22, true],
      [-22, -10, false], [-22, 10, false], [-12, -26, false], [-12, 26, false],
      [22, -10, false], [22, 10, false], [12, -26, false], [12, 26, false],
      [0, -24, false], [0, 24, false], [44, 0, false], [-44, 0, false],
      [6, 0, false], [-6, 0, false], [0, -11, false], [0, 11, false],
    ];
    for (const [x, z, big] of spots) {
      const group = new THREE.Group();
      group.position.set(x, 0.08, z);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(big ? 1.8 : 0.85, big ? 2.05 : 0.95, 0.16, 6),
        big ? padMat.clone() : smallMat.clone(),
      );
      disc.castShadow = false;
      group.add(disc);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(big ? 1.55 : 0.72, big ? 0.11 : 0.06, 8, 30),
        big ? ringMat.clone() : smallRingMat.clone(),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      group.add(ring);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: big ? 0xffbe4d : 0x6bdcff,
          transparent: true,
          opacity: big ? 0.23 : 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.setScalar(big ? 4.8 : 2.7);
      glow.position.y = 0.5;
      group.add(glow);
      this.scene.add(group);
      this.pads.push({ group, disc, ring, glow, big, x, z, active: true, timer: 0, phase: Math.random() * 6.28 });
    }
  }

  update(dt) {
    this.time += dt;
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) {
          pad.active = true;
          pad.group.visible = true;
        }
        continue;
      }
      pad.disc.rotation.y += dt * (pad.big ? 0.9 : 0.6);
      const pulse = 1 + Math.sin(this.time * 2.4 + pad.phase) * 0.06;
      pad.group.scale.setScalar(pulse);
      pad.ring.rotation.z += dt * 0.4;
      pad.glow.material.opacity = (pad.big ? 0.25 : 0.13) * (0.85 + Math.sin(this.time * 3 + pad.phase) * 0.15);
    }
    for (const light of this.goalLights) {
      light.userData.flash = Math.max(0, (light.userData.flash || 0) - dt * 0.7);
      light.intensity = 10 + Math.sin(this.time * 1.4) * 1.2 + light.userData.flash * 70;
    }
  }

  collectPad(pad, car) {
    if (!pad.active) return 0;
    const amount = pad.big ? 100 : 12;
    if (car.boost >= 99.5) return 0;
    pad.active = false;
    pad.group.visible = false;
    pad.timer = pad.big ? 8 : 4;
    car.boost = Math.min(100, car.boost + amount);
    return amount;
  }

  flashGoal(teamKey) {
    // index 0 is the blue net at -X, index 1 the orange net at +X.
    const light = teamKey === 'blue' ? this.goalLights[1] : this.goalLights[0];
    if (light) light.userData.flash = 1;
  }
}

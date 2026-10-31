import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ARENA, BOOST_PADS, clamp, damp } from './physics.js';

export const TEAM = {
  blue: {
    main: 0x246bff,
    dark: 0x0b2f8a,
    light: 0x62d6ff,
    glow: 0x3b82ff,
    css: '#3b82ff',
    name: 'BLUE',
  },
  red: {
    main: 0xff3b30,
    dark: 0x7a120f,
    light: 0xffb27a,
    glow: 0xff4636,
    css: '#ff4636',
    name: 'RED',
  },
};

function canvasTexture(width, height, draw, { repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Software rasterisers take many seconds to compile the physically based
// shaders and then shade every pixel with a full PBR evaluation. On those
// renderers we fall back to cheap Lambert materials; emissive trims, maps and
// colours are preserved so the arena still reads correctly.
let simpleMaterials = false;
const PBR_ONLY = new Set([
  'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'sheen',
  'sheenColor', 'sheenRoughness', 'transmission', 'thickness', 'ior',
  'specularIntensity', 'specularColor', 'iridescence', 'iridescenceIOR',
  'anisotropy', 'anisotropyRotation', 'envMapIntensity', 'reflectivity',
  'refractionRatio',
]);

function standard(params = {}) {
  if (!simpleMaterials) return standard(params);
  const plain = {};
  for (const [key, value] of Object.entries(params)) if (!PBR_ONLY.has(key)) plain[key] = value;
  return new THREE.MeshLambertMaterial(plain);
}

function physical(params = {}) {
  if (!simpleMaterials) return physical(params);
  return standard(params);
}


function makeFieldTexture() {
  return canvasTexture(2048, 1366, (ctx, w, h) => {
    // Pitch base.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0c3735');
    grad.addColorStop(0.5, '#10423d');
    grad.addColorStop(1, '#0a302f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Mown stripes along the long axis.
    const stripe = w / 22;
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.026)';
      ctx.fillRect(i * stripe, 0, stripe, h);
    }

    // Subtle hex weave.
    ctx.strokeStyle = 'rgba(120,255,235,0.035)';
    ctx.lineWidth = 2;
    const hr = 34;
    for (let row = -1; row < h / (hr * 1.5) + 1; row++) {
      for (let col = -1; col < w / (hr * 1.732) + 2; col++) {
        const cx = col * hr * 1.732 + (row % 2 ? hr * 0.866 : 0);
        const cy = row * hr * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          const px = cx + Math.cos(a) * hr;
          const py = cy + Math.sin(a) * hr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Team halves wash.
    const blueWash = ctx.createLinearGradient(0, 0, w / 2, 0);
    blueWash.addColorStop(0, 'rgba(40,110,255,0.10)');
    blueWash.addColorStop(1, 'rgba(40,110,255,0)');
    ctx.fillStyle = blueWash;
    ctx.fillRect(0, 0, w / 2, h);
    const redWash = ctx.createLinearGradient(w, 0, w / 2, 0);
    redWash.addColorStop(0, 'rgba(255,60,50,0.09)');
    redWash.addColorStop(1, 'rgba(255,60,50,0)');
    ctx.fillStyle = redWash;
    ctx.fillRect(w / 2, 0, w / 2, h);

    // Markings.
    const line = 'rgba(225,255,250,0.72)';
    ctx.strokeStyle = line;
    ctx.lineWidth = 10;
    const insetX = 66;
    const insetY = 62;
    ctx.strokeRect(insetX, insetY, w - insetX * 2, h - insetY * 2);
    ctx.beginPath();
    ctx.moveTo(w / 2, insetY);
    ctx.lineTo(w / 2, h - insetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 200, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 13, 0, Math.PI * 2);
    ctx.fillStyle = line;
    ctx.fill();

    // Goal boxes and arcs.
    ctx.lineWidth = 9;
    const boxW = 310;
    const boxH = h * 0.58;
    for (const side of [0, 1]) {
      const x0 = side ? w - insetX - boxW : insetX;
      ctx.strokeRect(x0, (h - boxH) / 2, boxW, boxH);
      const smallW = 150;
      const smallH = h * 0.32;
      const x1 = side ? w - insetX - smallW : insetX;
      ctx.strokeRect(x1, (h - smallH) / 2, smallW, smallH);
      ctx.beginPath();
      ctx.arc(side ? w - insetX - boxW : insetX + boxW, h / 2, 118, side ? Math.PI * 0.5 : -Math.PI * 0.5, side ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.stroke();
    }

    // Corner arcs.
    for (const [cx, cy, a0] of [
      [insetX, insetY, 0],
      [w - insetX, insetY, Math.PI / 2],
      [w - insetX, h - insetY, Math.PI],
      [insetX, h - insetY, -Math.PI / 2],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 54, a0, a0 + Math.PI / 2);
      ctx.stroke();
    }

    // Center crest.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#b9fff4';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * 330;
      const py = Math.sin(a) * 330;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#d8fff9';
    ctx.font = '800 150px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R/C', 0, 8);
    ctx.restore();

    // Scuffs and light speckle.
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      const r = Math.random() * 2.2;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeNetTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(170,225,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= w; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let i = 0; i <= h; i += 16) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }
  });
}

function makeGlowTexture(color = '#60c8ff') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function makeBallTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#dfe8f4';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.55, 'rgba(140,170,210,0.08)');
    grad.addColorStop(1, 'rgba(70,95,130,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const r = 58;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#26364f';
    ctx.fillStyle = 'rgba(40,60,92,0.12)';
    for (let row = -1; row < h / (r * 1.5) + 1; row++) {
      for (let col = -1; col < w / (r * 1.732) + 2; col++) {
        const cx = col * r * 1.732 + (row % 2 ? r * 0.866 : 0);
        const cy = row * r * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    // A few hot accents.
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,122,40,0.55)' : 'rgba(50,190,255,0.45)';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

function rounded(w, h, d, r, material, opts) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, r), material, opts);
}

function buildSky(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x02050b) },
        bottom: { value: new THREE.Color(0x0a2436) },
        glow: { value: new THREE.Color(0x0c3d54) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 bottom; uniform vec3 glow;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(bottom, top, smoothstep(-0.05, 0.75, h));
          c += glow * pow(max(0.0, 1.0 - abs(h - 0.04) * 3.0), 3.0) * 0.32;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.frustumCulled = false;
  scene.add(dome);

  const starCount = 420;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.42;
    const r = 180 + Math.random() * 40;
    positions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    positions[i * 3 + 1] = 24 + Math.sin(phi) * r * 0.9;
    positions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    const t = 0.55 + Math.random() * 0.45;
    colors[i * 3] = t * 0.75;
    colors[i * 3 + 1] = t * 0.9;
    colors[i * 3 + 2] = t;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.8, fog: false, depthWrite: false }),
  );
  scene.add(stars);
  return { dome, stars };
}

function buildArena(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const floorTex = makeFieldTexture();
  floorTex.anisotropy = 8;
  const floorMat = standard({
    map: floorTex,
    roughness: 0.42,
    metalness: 0.24,
    envMapIntensity: 0.6,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.halfLength * 2, ARENA.halfWidth * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Outer apron.
  const apronMat = standard({ color: 0x07111b, roughness: 0.72, metalness: 0.35 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(120, 92), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.04;
  apron.receiveShadow = true;
  group.add(apron);

  const wallMat = standard({ color: 0x0a1724, roughness: 0.46, metalness: 0.62 });
  const wallDark = standard({ color: 0x060d16, roughness: 0.65, metalness: 0.45 });
  const cyanTrim = standard({
    color: 0x0a2a34,
    emissive: 0x32d8ff,
    emissiveIntensity: 1.6,
    roughness: 0.35,
  });
  const glassMat = physical({
    color: 0x7ad7ff,
    transparent: true,
    opacity: 0.07,
    roughness: 0.08,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const L = ARENA.halfLength;
  const W = ARENA.halfWidth;
  const H = ARENA.wallHeight;

  // Side walls.
  for (const z of [-W, W]) {
    group.add(mesh(new THREE.BoxGeometry(L * 2, H, 0.7), wallMat, { z, y: H / 2 }));
    group.add(mesh(new THREE.BoxGeometry(L * 2, 0.22, 0.16), cyanTrim, { z: z - Math.sign(z) * 0.38, y: 0.55, shadow: false }));
    group.add(mesh(new THREE.BoxGeometry(L * 2, 0.14, 0.14), cyanTrim, { z: z - Math.sign(z) * 0.38, y: H - 0.5, shadow: false }));
    const glass = mesh(new THREE.PlaneGeometry(L * 2, H * 0.55), glassMat, { z: z - Math.sign(z) * 0.38, y: H * 0.63, shadow: false });
    glass.rotation.y = z > 0 ? Math.PI : 0;
    group.add(glass);
    // Vertical ribs.
    for (let x = -L + 6; x <= L - 6; x += 8) {
      group.add(mesh(new THREE.BoxGeometry(0.24, H, 0.24), wallDark, { x, z: z - Math.sign(z) * 0.38, y: H / 2, shadow: false }));
    }
  }

  // End walls around each goal mouth.
  for (const side of [-1, 1]) {
    const x = side * L;
    for (const z of [-19, 19]) {
      group.add(mesh(new THREE.BoxGeometry(0.7, H, 18), wallMat, { x, z, y: H / 2 }));
    }
    group.add(mesh(new THREE.BoxGeometry(0.7, H - ARENA.goalHeight, W * 2), wallMat, { x, y: ARENA.goalHeight + (H - ARENA.goalHeight) / 2 }));
    // Trim strips on end walls.
    for (const z of [-19, 19]) {
      group.add(mesh(new THREE.BoxGeometry(0.16, H, 0.16), cyanTrim, { x: x - side * 0.4, z: z + Math.sign(z) * 8.9, y: H / 2, shadow: false }));
    }
    const glass = mesh(new THREE.PlaneGeometry(W * 2, H * 0.5), glassMat, { x: x - side * 0.38, y: H * 0.72, shadow: false });
    glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(glass);
  }

  // Goal frames, nets and lights.
  const goals = {};
  const netTex = makeNetTexture();
  for (const [team, side] of [
    ['blue', -1],
    ['red', 1],
  ]) {
    const color = TEAM[team].glow;
    const frameMat = standard({ color: TEAM[team].dark, emissive: color, emissiveIntensity: 1.15, metalness: 0.7, roughness: 0.3 });
    const x = side * L;
    const goal = new THREE.Group();
    goal.position.x = x;
    group.add(goal);

    for (const z of [-ARENA.goalHalfWidth, ARENA.goalHalfWidth]) {
      goal.add(mesh(new THREE.BoxGeometry(0.8, ARENA.goalHeight + 0.4, 0.8), frameMat, { z, y: (ARENA.goalHeight + 0.4) / 2 }));
    }
    goal.add(mesh(new THREE.BoxGeometry(0.85, 0.75, ARENA.goalHalfWidth * 2 + 0.8), frameMat, { y: ARENA.goalHeight + 0.38 }));

    // Net surfaces.
    const netMat = new THREE.MeshBasicMaterial({
      map: netTex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: 0xbfe8ff,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.goalHalfWidth * 2, ARENA.goalHeight), netMat);
    back.position.set(side * ARENA.goalDepth, ARENA.goalHeight / 2, 0);
    back.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    goal.add(back);
    for (const z of [-ARENA.goalHalfWidth, ARENA.goalHalfWidth]) {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.goalDepth, ARENA.goalHeight), netMat);
      sideNet.position.set((side * ARENA.goalDepth) / 2, ARENA.goalHeight / 2, z);
      goal.add(sideNet);
    }
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.goalDepth, ARENA.goalHalfWidth * 2), netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set((side * ARENA.goalDepth) / 2, ARENA.goalHeight, 0);
    goal.add(topNet);

    // Goal floor and glow strip.
    const goalFloor = mesh(new THREE.BoxGeometry(ARENA.goalDepth, 0.08, ARENA.goalHalfWidth * 2), standard({ color: 0x071019, roughness: 0.6 }), {
      x: (side * ARENA.goalDepth) / 2,
      y: 0.02,
      shadow: false,
    });
    goal.add(goalFloor);
    const strip = mesh(new THREE.BoxGeometry(0.22, 0.22, ARENA.goalHalfWidth * 2 - 0.6), new THREE.MeshBasicMaterial({ color }), {
      x: side * (ARENA.goalDepth - 0.6),
      y: 0.18,
      shadow: false,
    });
    goal.add(strip);

    const light = new THREE.PointLight(color, 18, 34, 2);
    light.position.set(side * (L + 2.5), 5, 0);
    group.add(light);
    goals[team] = { group, light, frameMat, strip, color, side };
  }

  // Stands: tiered rows around the pitch.
  const standMat = standard({ color: 0x0a1420, roughness: 0.62, metalness: 0.5 });
  const standEdge = standard({ color: 0x102232, roughness: 0.5, metalness: 0.6, emissive: 0x0b3042, emissiveIntensity: 0.5 });
  const standGroup = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 6; tier++) {
      const z = side * (W + 5.2 + tier * 2.1);
      const y = H + 0.5 + tier * 1.18;
      const box = mesh(new THREE.BoxGeometry(L * 2 + 20, 1.2, 2.3), tier % 2 ? standMat : standEdge, { z, y, shadow: false });
      standGroup.add(box);
    }
    for (let tier = 0; tier < 5; tier++) {
      const x = side * (L + 7 + tier * 2.1);
      const y = H + 0.5 + tier * 1.18;
      standGroup.add(mesh(new THREE.BoxGeometry(2.3, 1.2, W * 2 + 8), tier % 2 ? standMat : standEdge, { x, y, shadow: false }));
    }
  }
  group.add(standGroup);

  // Crowd points.
  const crowdCount = 760;
  const crowdPos = new Float32Array(crowdCount * 3);
  const crowdCol = new Float32Array(crowdCount * 3);
  const palette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0x79cfff),
    new THREE.Color(0x3b82ff),
    new THREE.Color(0xff7a5c),
    new THREE.Color(0xff3b30),
    new THREE.Color(0xffd166),
  ];
  for (let i = 0; i < crowdCount; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const alongX = Math.random() > 0.42;
    let x;
    let z;
    if (alongX) {
      x = (Math.random() - 0.5) * (L * 2 + 12);
      z = side * (W + 4.2 + Math.random() * 11);
    } else {
      x = side * (L + 6 + Math.random() * 10);
      z = (Math.random() - 0.5) * (W * 2 + 2);
    }
    crowdPos[i * 3] = x;
    crowdPos[i * 3 + 1] = H + 1.6 + Math.random() * 6.6;
    crowdPos[i * 3 + 2] = z;
    const c = palette[(Math.random() * palette.length) | 0];
    const l = 0.5 + Math.random() * 0.6;
    crowdCol[i * 3] = c.r * l;
    crowdCol[i * 3 + 1] = c.g * l;
    crowdCol[i * 3 + 2] = c.b * l;
  }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3));
  crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdCol, 3));
  const crowd = new THREE.Points(
    crowdGeo,
    new THREE.PointsMaterial({ size: 0.72, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }),
  );
  group.add(crowd);

  // Roof trusses and stadium light bars.
  const trussMat = standard({ color: 0x0c1824, metalness: 0.7, roughness: 0.45 });
  const lampMat = standard({ color: 0x151f2a, emissive: 0xd8f4ff, emissiveIntensity: 2.2, roughness: 0.3 });
  for (let x = -36; x <= 36; x += 12) {
    const truss = mesh(new THREE.BoxGeometry(0.5, 0.5, W * 2 + 18), trussMat, { x, y: 27.5, shadow: false });
    group.add(truss);
  }
  for (const z of [-16, 16]) {
    for (const x of [-30, -10, 10, 30]) {
      group.add(mesh(new THREE.BoxGeometry(4.4, 0.22, 1.3), lampMat, { x, y: 26.2, z, shadow: false }));
    }
  }
  group.add(mesh(new THREE.BoxGeometry(L * 2 + 24, 0.6, 0.6), trussMat, { y: 27.5, z: -W - 10, shadow: false }));
  group.add(mesh(new THREE.BoxGeometry(L * 2 + 24, 0.6, 0.6), trussMat, { y: 27.5, z: W + 10, shadow: false }));

  // Floating dust motes.
  const dustCount = 130;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * L * 1.9;
    dustPos[i * 3 + 1] = 0.5 + Math.random() * 20;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * W * 1.9;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ size: 0.13, color: 0x9fe8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(dust);

  // Boost pads.
  const pads = [];
  const padGroup = new THREE.Group();
  group.add(padGroup);
  for (const data of BOOST_PADS) {
    const g = new THREE.Group();
    g.position.set(data.x, 0.07, data.z);
    const radius = data.big ? 2.5 : 1.25;
    const padColor = data.big ? 0xff9d2e : 0xffc857;
    const baseMat = standard({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.35, emissive: padColor, emissiveIntensity: 0.35 });
    const base = mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 32), baseMat, { y: 0.02, shadow: false });
    g.add(base);
    const ringMat = new THREE.MeshBasicMaterial({ color: padColor, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, data.big ? 0.12 : 0.07, 8, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    g.add(ring);
    const coreMat = new THREE.MeshBasicMaterial({ color: padColor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.4, 24), coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.1;
    g.add(core);
    if (data.big) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.35, radius * 0.75, 2.4, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: padColor,
          transparent: true,
          opacity: 0.09,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.y = 1.2;
      g.add(beam);
    }
    padGroup.add(g);
    pads.push({ ...data, group: g, ring, core, baseMat, ringMat, coreMat, active: true, respawn: 0, scale: 1 });
  }

  // Shockwave pool.
  const shockwaves = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 64), mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    group.add(m);
    shockwaves.push({ mesh: m, mat, life: 0, max: 0.7, speed: 24 });
  }

  return { group, floor, goals, pads, crowd, dust, shockwaves, stars: null };
}

function buildCar(team, isBot = false) {
  const t = TEAM[team];
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  const bodyMat = standard({ color: t.main, metalness: 0.62, roughness: 0.29 });
  const bodyDark = standard({ color: t.dark, metalness: 0.7, roughness: 0.35 });
  const whiteMat = standard({ color: 0xe8eef7, metalness: 0.42, roughness: 0.32 });
  const carbonMat = standard({ color: 0x111722, metalness: 0.55, roughness: 0.55 });
  const glassMat = standard({ color: 0x0a1420, metalness: 0.75, roughness: 0.12 });
  const accentMat = standard({ color: t.light, emissive: t.glow, emissiveIntensity: 1.15, metalness: 0.4, roughness: 0.3 });

  const main = rounded(1.5, 0.52, 3.0, 0.2, bodyMat, { y: 0.65 });
  tilt.add(main);
  tilt.add(rounded(1.6, 0.18, 2.94, 0.09, carbonMat, { y: 0.42 }));
  tilt.add(rounded(1.34, 0.28, 1.15, 0.12, bodyMat, { y: 0.9, z: 0.92 }));
  tilt.add(rounded(1.24, 0.5, 1.3, 0.18, glassMat, { y: 1.09, z: -0.18 }));
  tilt.add(rounded(1.12, 0.12, 1.0, 0.05, bodyMat, { y: 1.36, z: -0.2 }));
  // Side stripes.
  for (const x of [-0.76, 0.76]) {
    tilt.add(rounded(0.06, 0.2, 1.55, 0.03, accentMat, { x, y: 0.68, z: 0.18, shadow: false }));
  }
  // Spoiler.
  tilt.add(rounded(1.6, 0.08, 0.42, 0.03, carbonMat, { y: 1.14, z: -1.3 }));
  for (const x of [-0.55, 0.55]) {
    tilt.add(rounded(0.08, 0.34, 0.16, 0.02, carbonMat, { x, y: 0.96, z: -1.28 }));
  }
  // Headlights.
  for (const x of [-0.45, 0.45]) {
    tilt.add(rounded(0.3, 0.1, 0.08, 0.02, standard({ color: 0xffffff, emissive: 0xd9f4ff, emissiveIntensity: 2.4 }), { x, y: 0.8, z: 1.51, shadow: false }));
  }
  // Tail lights.
  const tailMat = standard({ color: 0x220000, emissive: 0xff2211, emissiveIntensity: 1.6 });
  tilt.add(mesh(new THREE.BoxGeometry(1.2, 0.12, 0.06), tailMat, { y: 0.74, z: -1.52, shadow: false }));

  // Wheels.
  const wheelMat = standard({ color: 0x0c0f14, roughness: 0.85, metalness: 0.1 });
  const rimMat = standard({ color: 0x1c2533, metalness: 0.9, roughness: 0.28, emissive: t.glow, emissiveIntensity: 0.55 });
  const wheels = [];
  for (const [x, z, front] of [
    [-0.81, 0.98, true],
    [0.81, 0.98, true],
    [-0.81, -1.02, false],
    [0.81, -1.02, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.36, 18), wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    spin.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.38, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    spin.add(rim);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.08), whiteMat);
      spoke.rotation.x = (Math.PI / 4) * i;
      spin.add(spoke);
    }
    tilt.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  // Boost nozzles + flames.
  const flames = [];
  for (const x of [-0.38, 0.38]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 12), carbonMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(x, 0.62, -1.58);
    tilt.add(nozzle);
    const flameMat = new THREE.MeshBasicMaterial({
      color: t.glow,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 10, 1, true), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.62, -2.05);
    flame.visible = false;
    tilt.add(flame);
    flames.push(flame);
  }

  // Underglow decal.
  const glowTex = makeGlowTexture(t.css);
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.2),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.02;
  root.add(under);

  // Soft team light follows the car.
  const light = new THREE.PointLight(t.glow, isBot ? 1.2 : 2.2, 7, 2);
  light.position.set(0, 1.4, 0);
  root.add(light);

  return { root, tilt, wheels, flames, light, under, steer: 0, prevSpeed: 0, team };
}

function buildBall() {
  const tex = makeBallTexture();
  const mat = physical({
    map: tex,
    roughness: 0.38,
    metalness: 0.16,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
    emissive: 0x7fb8ff,
    emissiveIntensity: 0.09,
  });
  const root = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(ARENA.ballRadius, 40, 28), mat);
  ball.castShadow = true;
  ball.receiveShadow = true;
  root.add(ball);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('#8ed4ff'),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(7.5, 7.5, 1);
  root.add(glow);

  const light = new THREE.PointLight(0x9fd8ff, 3.2, 12, 2);
  light.position.set(0, 0, 0);
  root.add(light);

  return { root, mesh: ball, glow, light, mat };
}

export function createWorld(scene, renderer, { lowPower = false } = {}) {
  simpleMaterials = lowPower;
  const sky = buildSky(scene);
  const arena = buildArena(scene);
  arena.stars = sky.stars;

  const hemi = new THREE.HemisphereLight(0x9ccfff, 0x07111a, 1.25);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xdff4ff, 2.35);
  key.position.set(24, 46, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 1536, lowPower ? 512 : 1536);
  key.shadow.camera.left = -58;
  key.shadow.camera.right = 58;
  key.shadow.camera.top = 48;
  key.shadow.camera.bottom = -48;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 110;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.DirectionalLight(0x5b8dff, 0.75);
  rim.position.set(-30, 22, -24);
  scene.add(rim);

  const warm = new THREE.DirectionalLight(0xff9a66, 0.36);
  warm.position.set(8, 12, 30);
  scene.add(warm);

  const cars = {
    blue: buildCar('blue', false),
    red: buildCar('red', true),
  };
  scene.add(cars.blue.root, cars.red.root);

  const ball = buildBall();
  scene.add(ball.root);

  // Software rasterisers choke on many per-pixel point lights. Keep the
  // emissive strips and sprites for glow, but drop the extra light sources.
  if (lowPower) {
    scene.traverse((object) => {
      if (object.isPointLight) object.visible = false;
    });
  }

  const shockwaves = arena.shockwaves;
  let flash = { blue: 0, red: 0 };
  let time = 0;

  function spawnShockwave(x, y, z, color, max = 0.8, speed = 28) {
    const s = shockwaves.find((s) => s.life <= 0) || shockwaves[0];
    s.mesh.position.set(x, Math.max(0.2, y), z);
    s.mesh.rotation.set(-Math.PI / 2, 0, 0);
    s.mesh.scale.setScalar(1);
    s.mat.color.set(color);
    s.mat.opacity = 0.9;
    s.mesh.visible = true;
    s.life = max;
    s.max = max;
    s.speed = speed;
  }

  function update(dt, { boostActive = false, timeScale = 1 } = {}) {
    time += dt;
    const t = time;
    arena.goals.blue.frameMat.emissiveIntensity = 1.05 + Math.sin(t * 2.4) * 0.2 + flash.blue * 5;
    arena.goals.red.frameMat.emissiveIntensity = 1.05 + Math.sin(t * 2.4 + 1.7) * 0.2 + flash.red * 5;
    arena.goals.blue.light.intensity = 18 + Math.sin(t * 2) * 3 + flash.blue * 90;
    arena.goals.red.light.intensity = 18 + Math.sin(t * 2 + 1.2) * 3 + flash.red * 90;
    flash.blue = Math.max(0, flash.blue - dt * 1.7);
    flash.red = Math.max(0, flash.red - dt * 1.7);
    if (flash.blue > 0 || flash.red > 0) {
      key.intensity = 2.35 + (flash.blue + flash.red) * 0.9;
    } else key.intensity = damp(key.intensity, 2.35, 5, dt);

    arena.crowd.material.opacity = 0.84 + Math.sin(t * 1.7) * 0.08;
    arena.dust.rotation.y = t * 0.006;
    arena.dust.position.y = Math.sin(t * 0.3) * 0.4;
    for (const pad of arena.pads) {
      if (!pad.active) continue;
      pad.ring.rotation.z = t * (pad.big ? 0.9 : 1.6);
      const pulse = 0.82 + Math.sin(t * 3.2 + pad.x) * 0.16;
      pad.ring.scale.setScalar(pulse);
      pad.coreMat.opacity = 0.55 + Math.sin(t * 4 + pad.z) * 0.25;
      pad.group.scale.setScalar(pad.scale);
    }
    for (const s of shockwaves) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const p = 1 - Math.max(0, s.life) / s.max;
      s.mesh.scale.setScalar(1 + p * s.speed);
      s.mat.opacity = (1 - p) * 0.9;
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const car of Object.values(cars)) {
      for (const flame of car.flames) {
        if (!flame.visible) continue;
        flame.scale.y = 0.7 + Math.random() * 0.8;
        flame.material.opacity = 0.55 + Math.random() * 0.35;
      }
      car.under.material.opacity = boostActive ? 0.42 : 0.26;
    }
    sky.stars.rotation.y = t * 0.003;
    return { time };
  }

  function flashGoal(team) {
    flash[team] = 1;
    const goal = arena.goals[team];
    spawnShockwave(goal.side * (ARENA.halfLength + 2), 3.5, 0, TEAM[team].glow, 1.1, 22);
    spawnShockwave(goal.side * (ARENA.halfLength - 2), 0.4, 0, 0xffffff, 0.8, 30);
  }

  function setPadActive(index, active) {
    const pad = arena.pads[index];
    if (!pad) return;
    pad.active = active;
    pad.group.visible = active;
    if (active) pad.scale = 0.2;
  }

  function updatePadScales(dt) {
    for (const pad of arena.pads) {
      if (!pad.active) continue;
      if (pad.scale < 1) pad.scale = Math.min(1, pad.scale + dt * 3);
    }
  }

  function syncCar(visual, state, dt) {
    visual.root.position.set(state.pos.x, state.pos.y, state.pos.z);
    visual.root.rotation.y = state.yaw;
    const speed = Math.hypot(state.vel.x, state.vel.z);
    visual.tilt.rotation.x = damp(visual.tilt.rotation.x, clamp(-state.vel.y * 0.018, -0.22, 0.22), 8, dt);
    visual.tilt.rotation.z = damp(visual.tilt.rotation.z, -visual.steer * Math.min(1, speed / 26) * 0.14, 7, dt);
    visual.tilt.position.y = state.onGround ? 0 : 0.02;
    for (const wheel of visual.wheels) {
      wheel.spin.rotation.x = state.wheelSpin;
      if (wheel.front) wheel.pivot.rotation.y = -visual.steer * 0.36;
    }
    for (const flame of visual.flames) {
      flame.visible = state.boosting;
      if (flame.visible) flame.scale.x = flame.scale.z = 0.8 + Math.random() * 0.4;
    }
  }

  function syncBall(state, dt) {
    ball.root.position.set(state.pos.x, state.pos.y, state.pos.z);
    ball.mesh.rotation.x += (state.vel.z / ARENA.ballRadius) * dt;
    ball.mesh.rotation.z -= (state.vel.x / ARENA.ballRadius) * dt;
    ball.mesh.rotation.y += state.vel.y * dt * 0.01;
    const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z);
    ball.glow.material.opacity = 0.2 + Math.min(0.35, speed / 90);
    ball.glow.scale.setScalar(7.2 + Math.min(3, speed * 0.08));
    ball.light.intensity = 2.6 + Math.min(4, speed * 0.12);
  }

  return {
    arena,
    cars,
    ball,
    key,
    hemi,
    rim,
    update,
    syncCar,
    syncBall,
    flashGoal,
    setPadActive,
    updatePadScales,
    spawnShockwave,
    get flash() {
      return flash;
    },
    time: () => time,
  };
}

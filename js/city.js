'use strict';
/* City: procedural Queens district, crisp pixel-art top-down rendering */
const buildings = [];
const lamps = [];
const trees = [];
const benches = [];
const cars = [];
const peds = [];
const enemies = [];
const particles = [];

const PALETTES = [
  { roof: '#59636b', wall: '#39434a', trim: '#79838a' },
  { roof: '#6d5a49', wall: '#493a2f', trim: '#8a7561' },
  { roof: '#54685f', wall: '#374a43', trim: '#718a7e' },
  { roof: '#5f5266', wall: '#413747', trim: '#7f6f88' },
  { roof: '#586272', wall: '#39424f', trim: '#77849a' }
];

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) % 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h % 1000) / 1000;
}
function rng(seed) { let s = seed % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const tpx = (t) => t * TILE;
const isRoad = (tx, ty) => (tx % 9 + 9) % 9 < 2 || (ty % 9 + 9) % 9 < 2;

/* ---------- map generation ---------- */
function buildCity() {
  for (let by = 0; by < MH; by += 9) {
    for (let bx = 0; bx < MW; bx += 9) {
      if (bx >= 72) continue;
      if (bx === 36 && by === 18) continue; // park
      const h = hash(bx, by);
      const r = rng(bx * 37 + by * 91 + 7);
      const x0 = bx + 3, y0 = by + 3;
      const special = (bx === 54 && by === 36) ? 'centro' : (bx === 18 && by === 36) ? 'deli' :
        (bx === 63 && by === 9) ? 'inmuebles' : (bx === 18 && by === 9) ? 'safehouse' : null;
      if (special) {
        buildings.push({ x: x0, y: y0, w: 5, h: 5, style: 2, special, label: special === 'centro' ? 'CENTRO COMUNITARIO' : special === 'deli' ? 'DELI 24H' : special === 'inmuebles' ? 'INMUEBLES' : 'APARTAMENTOS' });
        continue;
      }
      if (h < .34) {
        const gap = h < .17 ? 1 : 2;
        buildings.push({ x: x0, y: y0, w: 5, h: 2, style: Math.floor(r() * 5) });
        buildings.push({ x: x0, y: y0 + 2 + gap, w: 5, h: 3 - gap + 1, style: Math.floor(r() * 5) });
      } else if (h < .68) {
        const gap = h < .5 ? 1 : 2;
        buildings.push({ x: x0, y: y0, w: 2, h: 5, style: Math.floor(r() * 5) });
        buildings.push({ x: x0 + 2 + gap, y: y0, w: 3 - gap + 1, h: 5, style: Math.floor(r() * 5) });
      } else {
        buildings.push({ x: x0 + (h > .85 ? 1 : 0), y: y0, w: 4, h: 5, style: Math.floor(r() * 5) });
      }
    }
  }
  // street lamps at block corners
  for (let by = 0; by < MH; by += 9) for (let bx = 0; bx < MW - 8; bx += 9) {
    if (bx >= 72) continue;
    lamps.push({ x: tpx(bx + 2.2), y: tpx(by + 2.2) });
    if ((bx + by) % 27 === 0) lamps.push({ x: tpx(bx + 7.6), y: tpx(by + 7.6) });
  }
  // park trees
  for (let i = 0; i < 26; i++) {
    trees.push({ x: tpx(38 + Math.random() * 5.4), y: tpx(20 + Math.random() * 5.4), s: rand(.8, 1.3) });
  }
  for (let i = 0; i < 18; i++) {
    const tx = 3 + Math.floor(Math.random() * 66), ty = 3 + Math.floor(Math.random() * 56);
    if (!isRoad(tx, ty) && !(tx >= 38 && tx <= 44 && ty >= 20 && ty <= 26)) {
      // only place on sidewalk ring
      if (tx % 9 === 2 || ty % 9 === 2) trees.push({ x: tpx(tx + .5), y: tpx(ty + .5), s: rand(.7, 1) });
    }
  }
  benches.push({ x: tpx(39.4), y: tpx(21.2) }, { x: tpx(42.4), y: tpx(24.6) });
}

/* ---------- static render ---------- */
const cityCanvas = document.createElement('canvas');
cityCanvas.width = MAPW; cityCanvas.height = MAPH;
const cctx = cityCanvas.getContext('2d');

function renderCity() {
  const c = cctx;
  // sidewalk base
  c.fillStyle = '#6f7168'; c.fillRect(0, 0, MAPW, MAPH);
  for (let y = 0; y < MAPH; y += 8) for (let x = 0; x < MAPW; x += 16) {
    c.globalAlpha = .07 + Math.random() * .05;
    c.fillStyle = Math.random() > .5 ? '#fff' : '#1a1a14';
    c.fillRect(x + (y % 16), y, 7, 1);
  }
  c.globalAlpha = 1;
  // blocks (sidewalk tone) + seams
  for (let by = 0; by < MH; by += 9) for (let bx = 0; bx < MW; bx += 9) {
    if (bx >= 72) continue;
    c.fillStyle = '#787a6e';
    c.fillRect(tpx(bx + 2), tpx(by + 2), tpx(7), tpx(7));
    c.strokeStyle = 'rgba(40,44,38,.18)'; c.lineWidth = 2;
    c.strokeRect(tpx(bx + 2) + 1, tpx(by + 2) + 1, tpx(7) - 2, tpx(7) - 2);
    for (let ty = by + 2; ty < by + 9; ty += 2) {
      c.fillStyle = 'rgba(255,255,255,.045)';
      c.fillRect(tpx(bx + 2), tpx(ty), tpx(7), 1);
    }
  }
  // roads
  for (let k = 0; k < 9; k++) {
    const vx = tpx(k * 9), hy = tpx(k * 9);
    if (vx + tpx(2) <= tpx(72) + 2) {
      c.fillStyle = '#343b3f'; c.fillRect(vx, 0, tpx(2), MAPH);
      c.fillStyle = '#3c4448'; c.fillRect(vx + 3, 0, tpx(2) - 6, MAPH);
    }
    c.fillStyle = '#343b3f'; c.fillRect(0, hy, tpx(72), tpx(2));
    c.fillStyle = '#3c4448'; c.fillRect(0, hy + 3, tpx(72), tpx(2) - 6);
  }
  // lane dashes
  c.fillStyle = '#d9c67d';
  for (let k = 0; k < 9; k++) {
    const cy = tpx(k * 9 + 1);
    for (let x = tpx(3); x < tpx(71); x += 46) {
      if (isRoad(Math.floor(x / TILE), k * 9 + 1)) c.fillRect(x, cy - 1, 18, 2);
    }
    const cx = tpx(k * 9 + 1);
    for (let y = tpx(3); y < tpx(61); y += 46) {
      c.fillRect(cx - 1, y, 2, 18);
    }
  }
  // crosswalks + curbs
  for (let ky = 0; ky < 7; ky++) for (let kx = 0; kx < 8; kx++) {
    const ix = tpx(kx * 9), iy = tpx(ky * 9);
    c.fillStyle = 'rgba(235,235,220,.72)';
    for (let i = 0; i < 5; i++) {
      c.fillRect(ix + 5, iy - 14 + i * 5, tpx(2) - 10, 2);
      c.fillRect(ix - 14 + i * 5, iy + 5, 2, tpx(2) - 10);
    }
  }
  // river
  const riverX = tpx(73.4);
  c.fillStyle = '#173d52'; c.fillRect(riverX, 0, MAPW - riverX, MAPH);
  const wg = c.createLinearGradient(riverX, 0, MAPW, 0);
  wg.addColorStop(0, '#1a4a60'); wg.addColorStop(.5, '#123748'); wg.addColorStop(1, '#0c2a38');
  c.fillStyle = wg; c.fillRect(riverX, 0, MAPW - riverX, MAPH);
  c.fillStyle = '#2e5a66'; c.fillRect(riverX - 5, 0, 5, MAPH);
  for (let i = 0; i < 140; i++) {
    c.globalAlpha = rand(.05, .15); c.fillStyle = '#7ecbdc';
    c.fillRect(rand(riverX + 8, MAPW), rand(0, MAPH), rand(8, 34), 1);
  }
  c.globalAlpha = 1;
  // park
  const px = tpx(38), py = tpx(20), pw = tpx(6), ph = tpx(6);
  c.fillStyle = '#3e6b45'; c.fillRect(px, py, pw, ph);
  c.fillStyle = '#487a4e'; c.fillRect(px + 6, py + 6, pw - 12, ph - 12);
  c.fillStyle = '#8d8a6c'; c.fillRect(px + pw * .42, py, 16, ph);
  c.fillRect(px, py + ph * .52, pw, 14);
  c.fillStyle = '#204a63'; c.beginPath(); c.ellipse(px + pw * .7, py + ph * .38, 27, 18, 0, 0, 7); c.fill();
  c.fillStyle = '#2d6680'; c.beginPath(); c.ellipse(px + pw * .69, py + ph * .37, 22, 14, 0, 0, 7); c.fill();
  c.strokeStyle = '#b6a97c'; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  // trees (static canopy)
  for (const tr of trees) drawTreeStatic(c, tr.x, tr.y, tr.s);
  // benches
  for (const b of benches) {
    c.fillStyle = '#5c4932'; c.fillRect(b.x - 14, b.y - 5, 28, 10);
    c.fillStyle = '#7a6242'; c.fillRect(b.x - 12, b.y - 4, 24, 7);
  }
  // buildings
  for (const b of buildings) drawBuildingStatic(c, b);
  // lamps (poles)
  for (const l of lamps) {
    c.fillStyle = 'rgba(20,24,24,.4)'; c.beginPath(); c.ellipse(l.x + 5, l.y + 6, 9, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#3a3f3d'; c.fillRect(l.x - 1, l.y - 9, 3, 12);
    c.fillStyle = '#ffe6a3'; c.fillRect(l.x - 4, l.y - 12, 9, 5);
    c.fillStyle = '#5c645f'; c.fillRect(l.x - 4, l.y - 12, 9, 1);
  }
  // hydrants / trash
  for (let by = 0; by < MH; by += 9) for (let bx = 0; bx < MW - 9; bx += 9) {
    if (bx >= 72) continue;
    const hx = tpx(bx + 2.4), hy = tpx(by + 8.4);
    c.fillStyle = '#8f3f35'; c.fillRect(hx, hy, 4, 6); c.fillRect(hx - 1, hy + 1, 6, 2);
    c.fillStyle = '#2e3a33'; c.fillRect(tpx(bx + 8.1), tpx(by + 2.5), 7, 8);
  }
  // road names
  c.save();
  c.fillStyle = 'rgba(226,226,205,.22)';
  c.font = '700 15px monospace';
  c.fillText('Q U E E N S   B L V D', 180, tpx(9) + 26);
  c.fillText('S T A R K   A V E', 470, tpx(27) + 26);
  c.fillText('B A X T E R   S T', 820, tpx(45) + 26);
  c.translate(tpx(18) + 26, 620); c.rotate(Math.PI / 2);
  c.fillText('B A X T E R   A V E', 0, 0);
  c.restore();
}

function drawTreeStatic(c, x, y, s) {
  c.fillStyle = 'rgba(15,22,16,.28)';
  c.beginPath(); c.ellipse(x + 7, y + 8, 15 * s, 6 * s, 0, 0, 7); c.fill();
  c.fillStyle = '#2f4e32'; c.beginPath(); c.arc(x, y, 15 * s, 0, 7); c.fill();
  c.fillStyle = '#3c6440'; c.beginPath(); c.arc(x - 3 * s, y - 3 * s, 12 * s, 0, 7); c.fill();
  c.fillStyle = '#4d7a4f'; c.beginPath(); c.arc(x - 5 * s, y - 6 * s, 7 * s, 0, 7); c.fill();
  c.fillStyle = '#5f8c5a'; c.beginPath(); c.arc(x - 7 * s, y - 8 * s, 3 * s, 0, 7); c.fill();
}

function drawBuildingStatic(c, b) {
  const p = PALETTES[b.style % PALETTES.length];
  const x = tpx(b.x), y = tpx(b.y), w = tpx(b.w), h = tpx(b.h);
  const special = b.special;
  // shadow
  c.fillStyle = 'rgba(8,14,18,.42)';
  c.fillRect(x + 9, y + 11, w, h);
  // walls
  c.fillStyle = special ? '#3c4a4d' : p.wall;
  c.fillRect(x, y, w, h);
  c.fillStyle = special ? '#58676a' : p.roof;
  c.fillRect(x + 3, y + 3, w - 6, h - 6);
  // roof texture / edge
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1;
  c.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  // roof details
  const r = rng(b.x * 131 + b.y * 17);
  const units = 2 + Math.floor(r() * 3);
  for (let i = 0; i < units; i++) {
    const ux = x + 12 + r() * (w - 34), uy = y + 12 + r() * (h - 34);
    c.fillStyle = 'rgba(18,22,24,.4)'; c.fillRect(ux + 3, uy + 3, 15, 12);
    c.fillStyle = special ? '#8fa3a6' : '#6d7879'; c.fillRect(ux, uy, 15, 12);
    c.fillStyle = '#4a5556'; c.fillRect(ux + 2, uy + 2, 11, 8);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(ux + 2, uy + 2, 11, 1);
  }
  // skylight
  if (r() > .45) { c.fillStyle = '#7fa9b4'; c.globalAlpha = .5; c.fillRect(x + w * .58, y + h * .56, 16, 12); c.globalAlpha = 1; }
  // entrance on south face
  c.fillStyle = '#252d2f'; c.fillRect(x + w / 2 - 10, y + h - 4, 20, 4);
  c.fillStyle = special ? '#ffcf5c' : '#d5c9a2'; c.fillRect(x + w / 2 - 8, y + h - 3, 16, 2);
  // awnings on some shops
  if (!special && r() > .62) {
    c.fillStyle = r() > .5 ? '#8a3d33' : '#2e6a5c';
    c.fillRect(x + 6, y + h - 7, w - 12, 5);
    c.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < w - 12; i += 8) c.fillRect(x + 6 + i, y + h - 7, 4, 5);
  }
  // special signage
  if (special) {
    c.fillStyle = 'rgba(4,12,16,.85)';
    c.fillRect(x + 6, y + 8, w - 12, 18);
    c.fillStyle = '#ffcf5c'; c.font = '900 8px Trebuchet MS, sans-serif'; c.textAlign = 'center';
    c.fillText(b.label || '', x + w / 2, y + 20);
    c.textAlign = 'left';
    if (special === 'centro') {
      c.fillStyle = '#74e4ff'; c.fillRect(x + w / 2 - 1, y - 10, 2, 10);
      c.fillRect(x + w / 2 + 1, y - 9, 12, 7);
      c.fillStyle = '#0a2a35'; c.font = '900 5px monospace'; c.fillText('CC', x + w / 2 + 3, y - 4);
    }
  }
}

/* ---------- scene entities ---------- */
const NPC_DEFS = {
  peter: { x: 29.3, y: 24.6, name: 'PETER PARKER', skin: '#e2b08b', hair: '#4a2f22', top: '#31466f', bottom: '#28303c', accent: '#c23b3b', label: true },
  jessica: { x: 39.6, y: 29.1, name: 'JESSICA JONES', skin: '#d9a583', hair: '#241d22', top: '#4a3550', bottom: '#28252e', accent: '#8b5f9a', label: true },
  luke: { x: 30.6, y: 10.2, name: 'LUKE CAGE', skin: '#7c4c33', hair: '#1c1918', top: '#c9b44a', bottom: '#232a30', accent: '#8e7c2a', label: true },
  deli: { x: 23.5, y: 44.4, name: 'DELI 24H', skin: '#b9855f', hair: '#2a211c', top: '#587a63', bottom: '#2c3338', accent: '#cf7d49', label: true },
  agent: { x: 68.5, y: 17.2, name: 'AGENTE RAMÍREZ', skin: '#c6946f', hair: '#1f1b19', top: '#2f3a3f', bottom: '#232a2e', accent: '#8f9aa0', label: true }
};
const NPCS = Object.entries(NPC_DEFS).map(([id, d]) => ({ id, ...d, x: tpx(d.x), y: tpx(d.y), phase: rand(0, 6) }));

function initAmbient() {
  const carColors = ['#a33b32', '#2f5d80', '#c9b44a', '#4a4f55', '#dcd6c4', '#376b57'];
  for (let i = 0; i < 9; i++) {
    const k = Math.floor(Math.random() * 6);
    cars.push({ axis: 'h', x: rand(100, MAPW - 300), y: tpx(k * 9 + .6), speed: rand(38, 72) * (Math.random() > .5 ? 1 : -1), color: carColors[i % 6] });
  }
  for (let i = 0; i < 5; i++) {
    const k = Math.floor(Math.random() * 7);
    cars.push({ axis: 'v', x: tpx(k * 9 + .6), y: rand(100, MAPH - 300), speed: rand(38, 66) * (Math.random() > .5 ? 1 : -1), color: carColors[(i + 2) % 6] });
  }
  for (let i = 0; i < 18; i++) {
    const tx = 3 + Math.floor(Math.random() * 68), ty = 3 + Math.floor(Math.random() * 58);
    if (isRoad(tx, ty)) continue;
    peds.push({ x: tpx(tx + .5), y: tpx(ty + .5), tx: tpx(tx + .5), ty: tpx(ty + .5), phase: rand(0, 6), speed: rand(18, 32), skin: ['#e2b08b', '#c08e68', '#8a5c40', '#6b4630'][i % 4], top: ['#7d5b4b', '#4d6470', '#6b6b4a', '#5a4a63', '#2f5450'][i % 5] });
  }
}

function updateAmbient(dt) {
  for (const car of cars) {
    if (car.axis === 'h') {
      car.x += car.speed * dt;
      if (car.x > MAPW + 60) car.x = -60;
      if (car.x < -60) car.x = MAPW + 60;
    } else {
      car.y += car.speed * dt;
      if (car.y > MAPH + 60) car.y = -60;
      if (car.y < -60) car.y = MAPH + 60;
    }
  }
  for (const p of peds) {
    const d = dist(p.x, p.y, p.tx, p.ty);
    if (d < 6) {
      const tx = clamp(p.x + rand(-110, 110), tpx(3), tpx(70));
      const ty = clamp(p.y + rand(-110, 110), tpx(3), tpx(60));
      if (!blockAt(tx, ty, 9) && !isRoad(Math.floor(tx / TILE), Math.floor(ty / TILE))) { p.tx = tx; p.ty = ty; }
    } else {
      const dx = (p.tx - p.x) / d, dy = (p.ty - p.y) / d;
      const nx = p.x + dx * p.speed * dt, ny = p.y + dy * p.speed * dt;
      if (!blockAt(nx, ny, 7)) { p.x = nx; p.y = ny; p.phase += dt * 7; }
      else { p.tx = p.x; p.ty = p.y; }
    }
  }
  // weather
  state.rainTimer -= dt;
  if (state.rainTimer <= 0) {
    if (state.weather === 'clear') { state.weather = 'rain'; state.rainTimer = rand(35, 70); notify('Empieza a llover sobre Queens.', 'bad'); }
    else { state.weather = 'clear'; state.rainTimer = rand(60, 120); notify('La tormenta se disipa.', 'good'); }
  }
}

function blockAt(x, y, r) {
  r = r || 8;
  if (x < 14 || y < 14 || x > MAPW - 14 || y > MAPH - 14) return true;
  if (x > tpx(74) - 6) return true;
  for (const b of buildings) {
    const bx = tpx(b.x), by = tpx(b.y), bw = tpx(b.w), bh = tpx(b.h);
    if (x > bx - r && x < bx + bw + r && y > by - r && y < by + bh + r) return true;
  }
  return false;
}
function moveEntity(e, dx, dy, r) {
  if (!blockAt(e.x + dx, e.y, r)) e.x += dx;
  if (!blockAt(e.x, e.y + dy, r)) e.y += dy;
}

/* ---------- sprites ---------- */
function drawHuman(c, x, y, o) {
  const s = o.scale || 1;
  const ph = o.phase || 0;
  const moving = o.moving;
  const swing = moving ? Math.sin(ph) * 2.6 : 0;
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(s, s);
  // shadow
  c.fillStyle = 'rgba(6,10,12,.34)';
  c.beginPath(); c.ellipse(0, 1, 9, 3.6, 0, 0, 7); c.fill();
  c.fillStyle = o.bottom || '#2b3138';
  c.fillRect(-5, -1 + Math.max(0, swing) * .3, 4, 10 - Math.abs(swing) * .4);
  c.fillRect(1, -1 + Math.max(0, -swing) * .3, 4, 10 - Math.abs(swing) * .4);
  c.fillStyle = '#22272b';
  c.fillRect(-5, 8 + Math.max(0, swing) * .3, 4, 3);
  c.fillRect(1, 8 + Math.max(0, -swing) * .3, 4, 3);
  // torso
  c.fillStyle = o.top || '#3b5060';
  c.fillRect(-6, -13, 12, 13);
  c.fillStyle = o.accent || '#5f7d8a';
  c.fillRect(-6, -13, 12, 2);
  c.fillRect(-1, -11, 2, 9);
  // arms
  c.fillStyle = o.top || '#3b5060';
  c.fillRect(-8, -12, 2.5, 9 + swing * .4);
  c.fillRect(5.5, -12, 2.5, 9 - swing * .4);
  c.fillStyle = o.skin || '#c08e68';
  c.fillRect(-8, -3 + swing * .4, 2.5, 3);
  c.fillRect(5.5, -3 - swing * .4, 2.5, 3);
  // head
  c.fillStyle = o.skin || '#c08e68';
  c.fillRect(-4, -21, 8, 8);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-4, -15, 8, 1.5);
  // hair
  c.fillStyle = o.hair || '#2b241f';
  c.fillRect(-4.5, -22, 9, 4);
  if (o.longHair) c.fillRect(-5, -19, 2.5, 9);
  // eyes
  c.fillStyle = '#101418';
  c.fillRect(-2.5, -18, 1.4, 1.4); c.fillRect(1.1, -18, 1.4, 1.4);
  // accessory
  if (o.hero) {
    c.fillStyle = '#74e4ff'; c.fillRect(-6, -7, 12, 1.5);
    c.fillStyle = 'rgba(116,228,255,.35)'; c.fillRect(-7, -12, 1, 12); c.fillRect(6, -12, 1, 12);
  }
  c.restore();
}

function drawCar(c, car) {
  c.save(); c.translate(car.x, car.y);
  const horiz = car.axis === 'h';
  if (!horiz) c.rotate(Math.PI / 2);
  c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(-20, -8, 44, 18);
  c.fillStyle = car.color; c.fillRect(-21, -10, 42, 20);
  c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(-21, -10, 42, 3);
  c.fillStyle = '#1b252c'; c.fillRect(-9, -7, 18, 14);
  c.fillStyle = '#6f95a5'; c.fillRect(-7, -6, 14, 12);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-7, -6, 14, 2);
  c.fillStyle = '#ffe9a8'; c.fillRect(19, -7, 3, 5); c.fillRect(19, 2, 3, 5);
  c.fillStyle = '#b3403a'; c.fillRect(-22, -7, 2, 5); c.fillRect(-22, 2, 2, 5);
  c.restore();
}

/* ---------- main city draw ---------- */
function cityZoom() { return W < 700 ? .92 : clamp(W / 1200 + .42, .95, 1.28); }

function drawCity(dt) {
  const z = cityZoom();
  const targetX = clamp(player.x, W / (2 * z), MAPW - W / (2 * z));
  const targetY = clamp(player.y, H / (2 * z), MAPH - H / (2 * z));
  cam.x = lerp(cam.x, targetX, Math.min(1, dt * 6));
  cam.y = lerp(cam.y, targetY, Math.min(1, dt * 6));
  const shakeX = cam.shake > 0 ? rand(-cam.shake, cam.shake) : 0;
  const shakeY = cam.shake > 0 ? rand(-cam.shake, cam.shake) : 0;
  cam.shake = Math.max(0, cam.shake - dt * 26);

  ctx.fillStyle = '#10171b'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);

  ctx.drawImage(cityCanvas, 0, 0);
  // water shimmer
  const t = gameTime;
  ctx.save(); ctx.beginPath(); ctx.rect(tpx(73.4), 0, MAPW - tpx(73.4), MAPH); ctx.clip();
  for (let i = 0; i < 16; i++) {
    const wy = (i * 97 + Math.sin(t * .4 + i) * 20) % MAPH;
    ctx.globalAlpha = .06 + (i % 3) * .02; ctx.fillStyle = '#9fe6f4';
    ctx.fillRect(tpx(74) + (i * 23) % 120, wy, 46, 1.5);
  }
  ctx.globalAlpha = 1; ctx.restore();

  // ground markers
  drawGroundEffects(ctx);
  // cars
  for (const car of cars) {
    if (Math.abs(car.x - cam.x) < W / z && Math.abs(car.y - cam.y) < H / z) drawCar(ctx, car);
  }
  // draw all actors sorted by y
  const actors = [];
  for (const p of peds) actors.push({ y: p.y, kind: 'ped', ref: p });
  for (const n of NPCS) actors.push({ y: n.y, kind: 'npc', ref: n });
  for (const e of enemies) if (e.alive) actors.push({ y: e.y, kind: 'enemy', ref: e });
  actors.push({ y: player.y, kind: 'player', ref: player });
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a.kind === 'ped') drawHuman(ctx, a.ref.x, a.ref.y, { skin: a.ref.skin, top: a.ref.top, bottom: '#333b3f', moving: true, phase: a.ref.phase, scale: .9 });
    else if (a.kind === 'npc') drawNPC(a.ref);
    else if (a.kind === 'enemy') drawEnemy(a.ref);
    else drawPlayerSprite();
  }
  drawParticles(ctx);
  drawWorldMarkers(ctx);
  ctx.restore();

  drawLighting();
  drawRain();
  drawVignette();
}

function drawNPC(n) {
  const o = { skin: n.skin, hair: n.hair, top: n.top, bottom: n.bottom, accent: n.accent, moving: false, phase: gameTime + n.phase, scale: 1.02 };
  if (n.id === 'jessica') { o.longHair = true; o.accent = '#b06fc1'; }
  if (n.id === 'peter') { o.hero = false; o.accent = '#c23b3b'; }
  drawHuman(ctx, n.x, n.y, o);
  const d = dist(player.x, player.y, n.x, n.y);
  if (d < 170) {
    ctx.font = '700 7px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,12,16,.72)';
    const w = ctx.measureText(n.name).width + 10;
    ctx.fillRect(n.x - w / 2, n.y - 42, w, 12);
    ctx.fillStyle = n.id === 'peter' ? '#ffcf5c' : '#bfe3ee';
    ctx.fillText(n.name, n.x, n.y - 33);
    ctx.textAlign = 'left';
  }
}

function drawPlayerSprite() {
  const moving = player.moving;
  drawHuman(ctx, player.x, player.y, {
    skin: '#d8a074', hair: '#2b211c', top: '#2c4f75', bottom: '#232a33', accent: '#74e4ff',
    moving, phase: player.walk, hero: true, scale: 1.04
  });
  // attack arc
  if (player.attackAnim > 0) {
    ctx.save();
    ctx.translate(player.x, player.y - 10);
    ctx.rotate(player.dir > 0 ? 0 : Math.PI);
    ctx.globalAlpha = player.attackAnim * .9;
    ctx.strokeStyle = '#ffe8a3'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 24, -1.1, 1.1); ctx.stroke();
    ctx.globalAlpha = player.attackAnim * .28;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 24, -1.1, 1.1); ctx.fill();
    ctx.restore();
  }
}

function drawEnemy(e) {
  drawHuman(ctx, e.x, e.y, {
    skin: '#b7825e', hair: '#171717', top: '#583030', bottom: '#262429', accent: '#9e3b3b',
    moving: e.moving, phase: e.phase, scale: 1, hero: false
  });
  if (e.flash > 0) {
    ctx.globalAlpha = e.flash * .55; ctx.fillStyle = '#fff';
    ctx.fillRect(e.x - 9, e.y - 26, 18, 34); ctx.globalAlpha = 1;
  }
  const w = 34, h = 4;
  ctx.fillStyle = 'rgba(4,8,10,.75)'; ctx.fillRect(e.x - w / 2, e.y - 38, w, h);
  ctx.fillStyle = '#ff645e'; ctx.fillRect(e.x - w / 2, e.y - 38, w * (e.hp / e.maxHp), h);
}

function spawnParticles(x, y, color, n) {
  for (let i = 0; i < (n || 6); i++) {
    particles.push({ x, y, vx: rand(-70, 70), vy: rand(-90, 10), life: rand(.25, .55), max: .55, color, size: rand(1.5, 3.5) });
  }
}
function drawParticles(c) {
  for (const p of particles) {
    c.globalAlpha = clamp(p.life / p.max, 0, 1);
    c.fillStyle = p.color; c.fillRect(p.x, p.y, p.size, p.size);
  }
  c.globalAlpha = 1;
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/* ---------- atmosphere ---------- */
function drawLighting() {
  const hour = state.cityTime;
  const day = clamp(Math.sin((hour - 6) / 12 * Math.PI), 0, 1);
  const dark = clamp(.78 - day * .72 + (state.weather === 'rain' ? .08 : 0), .05, .66);
  if (dark > .03) {
    ctx.fillStyle = `rgba(5,12,32,${dark})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const z = cityZoom();
    for (const l of lamps) {
      const sx = (l.x - cam.x) * z + W / 2, sy = (l.y - cam.y) * z + H / 2;
      if (sx < -120 || sy < -120 || sx > W + 120 || sy > H + 120) continue;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 78 * z);
      glow.addColorStop(0, `rgba(255,221,150,${.40 * dark + .1})`);
      glow.addColorStop(.45, `rgba(255,196,105,${.15 * dark})`);
      glow.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 78 * z, 0, 7); ctx.fill();
    }
    // player light
    const px = (player.x - cam.x) * z + W / 2, py = (player.y - cam.y) * z + H / 2;
    const pg = ctx.createRadialGradient(px, py, 10, px, py, 120 * z);
    pg.addColorStop(0, `rgba(140,220,255,${.10 * dark})`);
    pg.addColorStop(1, 'rgba(80,160,200,0)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 120 * z, 0, 7); ctx.fill();
    ctx.restore();
  }
}

let lightning = 0;
function drawRain() {
  if (state.weather !== 'rain') return;
  ctx.save();
  ctx.strokeStyle = 'rgba(174,219,235,.32)'; ctx.lineWidth = 1;
  for (let i = 0; i < 130; i++) {
    const x = (i * 79 + gameTime * 210) % (W + 200) - 100;
    const y = (i * 131 + gameTime * 720) % (H + 100) - 50;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 15); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(24,44,58,.12)'; ctx.fillRect(0, 0, W, H);
  if (lightning > 0) { ctx.fillStyle = `rgba(220,240,255,${lightning * .35})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  if (Math.random() < .0015 && lightning <= 0) { lightning = 1; sfx('thunder'); }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .32, W / 2, H / 2, Math.max(W, H) * .72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.52)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // subtle scanline / pixel grid
  ctx.globalAlpha = .035; ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
}

function drawMini(targetCanvas) {
  const mc = targetCanvas.getContext('2d');
  const cw = targetCanvas.width, ch = targetCanvas.height;
  mc.clearRect(0, 0, cw, ch);
  const sx = cw / MAPW, sy = ch / MAPH;
  mc.fillStyle = '#0a1a20'; mc.fillRect(0, 0, cw, ch);
  mc.fillStyle = '#1d3a33'; mc.fillRect(tpx(38) * sx, tpx(20) * sy, tpx(6) * sx, tpx(6) * sy);
  mc.fillStyle = '#133446'; mc.fillRect(tpx(73.4) * sx, 0, cw - tpx(73.4) * sx, ch);
  for (const b of buildings) {
    mc.fillStyle = '#2b4149';
    mc.fillRect(b.x * TILE * sx, b.y * TILE * sy, b.w * TILE * sx, b.h * TILE * sy);
  }
  // quest marker
  const tgt = activeTarget();
  if (tgt) {
    mc.fillStyle = '#ffcf5c';
    mc.beginPath(); mc.arc(tgt.x * sx, tgt.y * sy, 2.6, 0, 7); mc.fill();
    mc.strokeStyle = 'rgba(255,207,92,.5)'; mc.beginPath(); mc.arc(tgt.x * sx, tgt.y * sy, 5, 0, 7); mc.stroke();
  }
  for (const n of NPCS) {
    mc.fillStyle = n.id === 'peter' ? '#74e4ff' : '#5f808c';
    mc.fillRect(n.x * sx - 1, n.y * sy - 1, 2.5, 2.5);
  }
  mc.fillStyle = '#fff';
  mc.beginPath(); mc.arc(player.x * sx, player.y * sy, 2.8, 0, 7); mc.fill();
  mc.strokeStyle = '#74e4ff'; mc.lineWidth = 1;
  mc.beginPath(); mc.arc(player.x * sx, player.y * sy, 5, 0, 7); mc.stroke();
  // viewport box
  const z = cityZoom();
  mc.strokeStyle = 'rgba(255,255,255,.16)';
  mc.strokeRect((cam.x - W / (2 * z)) * sx, (cam.y - H / (2 * z)) * sy, W / z * sx, H / z * sy);
}

buildCity();
renderCity();
initAmbient();

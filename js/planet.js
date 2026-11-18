'use strict';
/* Planet view: procedurally textured globe with orthographic row mapping */
let planetLon = -74 * Math.PI / 180;
let planetZoom = 1, planetTargetZoom = 1;
let selectedLoc = 'nyc';
let planetMarkers = [];
let planetDragging = false, dragDist = 0, lastPX = 0;
const planetPointers = new Map();
let pinchStart = 0, pinchZoom = 1;

const LOCATIONS = [
  { id: 'nyc', name: 'NUEVA YORK', meta: 'ESTADOS UNIDOS · TIERRA · SECTOR 616', lat: 40.7, lon: -74, unlocked: true, level: 1,
    desc: 'La ciudad que nunca duerme. Queens, Manhattan y un distrito lleno de secretos, deudas y máscaras.', action: 'DESCENDER A NUEVA YORK' },
  { id: 'wakanda', name: 'WAKANDA', meta: 'ÁFRICA CENTRAL · ZONA PROTEGIDA', lat: -1.5, lon: 30.5, unlocked: false, level: 8,
    desc: 'La nación más avanzada del planeta. Sus fronteras están cerradas a visitantes sin invitación.', action: 'REQUIERE NIVEL 8' },
  { id: 'madripoor', name: 'MADRIPOOR', meta: 'SUDESTE ASIÁTICO · CIUDAD LIBRE', lat: 1.4, lon: 103.8, unlocked: false, level: 5,
    desc: 'Paraíso de contrabandistas, mercenarios y tratos que no aparecen en ningún registro.', action: 'REQUIERE NIVEL 5' },
  { id: 'latveria', name: 'LATVERIA', meta: 'EUROPA ORIENTAL · TERRITORIO CERRADO', lat: 45.8, lon: 22.5, unlocked: false, level: 12,
    desc: 'El país de Doom. Los satélites evitan mirar demasiado tiempo hacia sus fronteras.', action: 'REQUIERE NIVEL 12' }
];

/* ---- world texture ---- */
const TEXW = 1024, TEXH = 512;
const worldTex = document.createElement('canvas'); worldTex.width = TEXW; worldTex.height = TEXH;
const cloudTex = document.createElement('canvas'); cloudTex.width = TEXW; cloudTex.height = TEXH;

const CONTINENTS = [
  [[-168,65],[-150,70],[-125,70],[-100,72],[-82,72],[-60,58],[-55,48],[-70,42],[-80,30],[-97,26],[-105,20],[-115,30],[-125,40],[-135,55]],
  [[-80,10],[-60,12],[-50,0],[-35,-6],[-38,-22],[-55,-35],[-68,-55],[-75,-40],[-72,-18],[-81,-4]],
  [[-10,36],[0,44],[10,55],[30,70],[45,68],[60,55],[40,45],[30,40],[15,37]],
  [[-17,15],[10,35],[32,31],[43,12],[51,12],[40,-10],[32,-28],[18,-35],[8,-2]],
  [[30,45],[60,55],[100,72],[140,70],[180,65],[160,45],[140,35],[120,20],[105,10],[95,5],[80,20],[60,28],[45,38]],
  [[113,-22],[130,-12],[145,-15],[153,-28],[145,-38],[128,-32]],
  [[-45,60],[-20,70],[-25,82],[-55,82],[-60,70]]
];

function texXY(lon, lat) { return [((lon + 180) / 360) * TEXW, ((90 - lat) / 180) * TEXH]; }

function buildWorldTexture() {
  const c = worldTex.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, TEXH);
  g.addColorStop(0, '#0a3d54'); g.addColorStop(.25, '#0d5570');
  g.addColorStop(.5, '#0d4b66'); g.addColorStop(.75, '#0b4360'); g.addColorStop(1, '#082f45');
  c.fillStyle = g; c.fillRect(0, 0, TEXW, TEXH);
  // ocean noise
  for (let i = 0; i < 900; i++) {
    c.globalAlpha = rand(.02, .06);
    c.fillStyle = i % 2 ? '#4fd2e8' : '#001a2a';
    c.fillRect(rand(0, TEXW), rand(0, TEXH), rand(3, 22), rand(1, 4));
  }
  c.globalAlpha = 1;
  // continents
  CONTINENTS.forEach((poly, idx) => {
    c.beginPath();
    poly.forEach(([lon, lat], i) => { const [x, y] = texXY(lon, lat); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.closePath();
    const green = idx === 4 ? '#5b7b4d' : idx === 3 ? '#7d784a' : '#4c7350';
    c.fillStyle = green; c.fill();
    c.strokeStyle = '#7fae7c'; c.lineWidth = 1.2; c.globalAlpha = .5; c.stroke();
    c.globalAlpha = 1;
    // interior variation
    for (let i = 0; i < 30; i++) {
      const [px, py] = texXY(poly[(i * 7) % poly.length][0] + rand(-6, 6), poly[(i * 5) % poly.length][1] + rand(-5, 5));
      c.globalAlpha = .18; c.fillStyle = i % 3 ? '#8b8a55' : '#315b3e';
      c.beginPath(); c.ellipse(px, py, rand(2, 13), rand(2, 9), rand(0, 3), 0, 7); c.fill();
    }
    c.globalAlpha = 1;
  });
  // islands
  const isles = [[-4,58,4,3],[-2,53,3,2],[139,36,5,2],[47,-19,4,2],[112,-7,7,2],[122,12,3,2],[-61,17,3,1],[-149,-17,3,1],[174,-41,3,2]];
  isles.forEach(([lon, lat, w, h]) => {
    const [x, y] = texXY(lon, lat);
    c.fillStyle = '#4e7553'; c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 7); c.fill();
  });
  // ice caps
  c.fillStyle = '#e8f5f7';
  c.globalAlpha = .92; c.fillRect(0, 0, TEXW, 16); c.fillRect(0, TEXH - 22, TEXW, 22);
  c.globalAlpha = .45; c.fillRect(0, 16, TEXW, 12); c.fillRect(0, TEXH - 38, TEXW, 16);
  c.globalAlpha = 1;
  // clouds
  const cc = cloudTex.getContext('2d');
  cc.clearRect(0, 0, TEXW, TEXH);
  for (let i = 0; i < 120; i++) {
    const x = rand(0, TEXW), y = rand(20, TEXH - 30);
    const rx = rand(14, 58), ry = rand(5, 16);
    const cg = cc.createRadialGradient(x, y, 0, x, y, rx);
    cg.addColorStop(0, 'rgba(255,255,255,.42)');
    cg.addColorStop(.6, 'rgba(255,255,255,.18)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    cc.fillStyle = cg;
    cc.save(); cc.translate(x, y); cc.scale(1, ry / rx); cc.beginPath(); cc.arc(0, 0, rx, 0, 7); cc.fill(); cc.restore();
  }
}
buildWorldTexture();

const stars = Array.from({ length: 230 }, () => ({ x: Math.random(), y: Math.random(), s: rand(.4, 1.8), p: rand(0, 6.28), b: rand(.25, 1) }));

function drawPlanet(dt) {
  const t = performance.now() / 1000;
  // deep space
  const bg = ctx.createRadialGradient(W * .62, H * .38, 20, W * .55, H * .45, Math.max(W, H) * .85);
  bg.addColorStop(0, '#071c29'); bg.addColorStop(.45, '#030d16'); bg.addColorStop(1, '#010408');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const neb = ctx.createRadialGradient(W * .18, H * .72, 0, W * .18, H * .72, 300);
  neb.addColorStop(0, 'rgba(42,96,140,.1)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  for (const s of stars) {
    ctx.globalAlpha = s.b * (.55 + .45 * Math.sin(t * .7 + s.p));
    ctx.fillStyle = s.s > 1.3 ? '#dff7ff' : '#a8cfdf';
    ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  planetZoom = lerp(planetZoom, planetTargetZoom, Math.min(1, dt * 6));
  const r = Math.min(W * .30, H * .35) * planetZoom;
  const cx = W * .56, cy = H * .44;
  const L0 = planetLon;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  // ocean sphere base
  ctx.fillStyle = '#07334a'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // row-mapped texture (orthographic)
  const step = 2;
  for (let dy = -r; dy < r; dy += step) {
    const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
    const lat = Math.asin(clamp(-dy / r, -1, 1));
    const v = clamp((90 - lat * 180 / Math.PI) / 180, 0, 1) * TEXH;
    let u = ((L0 * 180 / Math.PI + 180 - 90) / 360) % 1;
    if (u < 0) u += 1;
    const srcX = u * TEXW;
    const sw = TEXW / 2;
    const dw = hw * 2;
    const dyDest = cy + dy;
    if (srcX + sw <= TEXW) {
      ctx.drawImage(worldTex, srcX, v, sw, 1.6, cx - hw, dyDest, dw, step + .6);
    } else {
      const first = TEXW - srcX;
      ctx.drawImage(worldTex, srcX, v, first, 1.6, cx - hw, dyDest, dw * (first / sw), step + .6);
      ctx.drawImage(worldTex, 0, v, sw - first, 1.6, cx - hw + dw * (first / sw), dyDest, dw * (1 - first / sw), step + .6);
    }
  }
  // clouds (drift)
  ctx.globalAlpha = .5;
  const cloudLon = L0 + t * .012;
  for (let dy = -r; dy < r; dy += 3) {
    const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
    const lat = Math.asin(clamp(-dy / r, -1, 1));
    const v = clamp((90 - lat * 180 / Math.PI) / 180, 0, 1) * TEXH;
    let u = ((cloudLon * 180 / Math.PI + 180 - 90) / 360) % 1;
    if (u < 0) u += 1;
    const srcX = u * TEXW, sw = TEXW / 2, dw = hw * 2;
    if (srcX + sw <= TEXW) ctx.drawImage(cloudTex, srcX, v, sw, 2.4, cx - hw, cy + dy, dw, 4);
    else {
      const first = TEXW - srcX;
      ctx.drawImage(cloudTex, srcX, v, first, 2.4, cx - hw, cy + dy, dw * (first / sw), 4);
      ctx.drawImage(cloudTex, 0, v, sw - first, 2.4, cx - hw + dw * (first / sw), cy + dy, dw * (1 - first / sw), 4);
    }
  }
  ctx.globalAlpha = 1;
  // day/night shading
  const sh = ctx.createRadialGradient(cx - r * .38, cy - r * .4, r * .08, cx, cy, r * 1.18);
  sh.addColorStop(0, 'rgba(255,255,255,.24)');
  sh.addColorStop(.32, 'rgba(140,225,255,.05)');
  sh.addColorStop(.66, 'rgba(0,10,25,.18)');
  sh.addColorStop(1, 'rgba(0,4,12,.88)');
  ctx.fillStyle = sh; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // night side terminator
  const term = ctx.createLinearGradient(cx - r * .2, 0, cx + r, 0);
  term.addColorStop(0, 'rgba(2,8,18,0)');
  term.addColorStop(.62, 'rgba(2,8,18,.22)');
  term.addColorStop(1, 'rgba(1,4,10,.78)');
  ctx.fillStyle = term; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // atmosphere
  const atm = ctx.createRadialGradient(cx, cy, r * .92, cx, cy, r * 1.16);
  atm.addColorStop(0, 'rgba(96,205,255,0)');
  atm.addColorStop(.55, 'rgba(96,205,255,.14)');
  atm.addColorStop(.78, 'rgba(96,205,255,.22)');
  atm.addColorStop(1, 'rgba(96,205,255,0)');
  ctx.fillStyle = atm;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160,236,255,.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r + .5, 0, Math.PI * 2); ctx.stroke();

  // markers
  planetMarkers = [];
  const t2 = performance.now() / 1000;
  for (const loc of LOCATIONS) {
    const lat = loc.lat * Math.PI / 180;
    const lon = loc.lon * Math.PI / 180;
    const cz = Math.cos(lat) * Math.cos(lon - L0);
    if (cz <= .06) continue;
    const mx = cx + r * Math.cos(lat) * Math.sin(lon - L0);
    const my = cy - r * Math.sin(lat);
    planetMarkers.push({ id: loc.id, x: mx, y: my, z: cz });
    const sel = loc.id === selectedLoc;
    const col = loc.unlocked ? '#ffcf5c' : '#86a9b8';
    const pulse = 1 + Math.sin(t2 * 2 + loc.lat) * .18;
    ctx.globalAlpha = sel ? 1 : .82;
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 1.6 : 1;
    ctx.beginPath(); ctx.arc(mx, my, (sel ? 13 : 8) * pulse, 0, 7); ctx.stroke();
    ctx.globalAlpha = sel ? .22 : .08;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, (sel ? 18 : 11) * pulse, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, 2.8, 0, 7); ctx.fill();
    if (sel) {
      ctx.font = '700 9px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(loc.name, mx, my - 20);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = '8px monospace';
      ctx.fillText(loc.unlocked ? 'DISPONIBLE' : 'BLOQUEADO · NV.' + loc.level, mx, my + 26);
      ctx.textAlign = 'left';
    }
  }
}

function selectLocation(id) {
  const loc = LOCATIONS.find(l => l.id === id); if (!loc) return;
  selectedLoc = id;
  $('#pKicker').textContent = 'SELECCIÓN ORBITAL · ' + (loc.unlocked ? 'ACCESO AUTORIZADO' : 'ACCESO RESTRINGIDO');
  $('#pName').textContent = loc.name;
  $('#pMeta').textContent = loc.meta;
  $('#pDesc').textContent = loc.desc;
  const btn = $('#pEnter');
  btn.textContent = loc.action;
  btn.disabled = !loc.unlocked || state.level < loc.level;
  if (loc.id === 'nyc') btn.disabled = false;
  sfx('ui');
}

function trySelectMarker(x, y) {
  let best = null, bd = 26;
  for (const m of planetMarkers) {
    const d = dist(x, y, m.x, m.y);
    if (d < bd) { bd = d; best = m; }
  }
  if (best) selectLocation(best.id);
}

/* pointer controls */
cvs.addEventListener('pointerdown', (e) => {
  if (state.mode !== 'planet') return;
  planetPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cvs.setPointerCapture(e.pointerId);
  lastPX = e.clientX; planetDragging = true; dragDist = 0;
  if (planetPointers.size === 2) {
    const p = Array.from(planetPointers.values());
    pinchStart = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    pinchZoom = planetTargetZoom;
  }
});
cvs.addEventListener('pointermove', (e) => {
  if (state.mode !== 'planet' || !planetPointers.has(e.pointerId)) return;
  planetPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (planetPointers.size === 2) {
    const p = Array.from(planetPointers.values());
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    if (pinchStart > 10) planetTargetZoom = clamp(pinchZoom * (d / pinchStart), .8, 1.55);
    return;
  }
  const dx = e.clientX - lastPX;
  dragDist += Math.abs(dx);
  planetLon -= dx * .0062;
  lastPX = e.clientX;
});
function endPlanetPointer(e) {
  if (!planetPointers.has(e.pointerId)) return;
  planetPointers.delete(e.pointerId);
  if (planetPointers.size === 0) {
    if (planetDragging && dragDist < 8) trySelectMarker(e.clientX, e.clientY);
    planetDragging = false;
  }
}
cvs.addEventListener('pointerup', endPlanetPointer);
cvs.addEventListener('pointercancel', endPlanetPointer);
cvs.addEventListener('wheel', (e) => {
  if (state.mode !== 'planet') return;
  e.preventDefault();
  planetTargetZoom = clamp(planetTargetZoom - e.deltaY * .0009, .8, 1.55);
}, { passive: false });
$('#pEnter').addEventListener('click', () => {
  const loc = LOCATIONS.find(l => l.id === selectedLoc);
  if (loc && loc.unlocked) enterCity();
  else notify('Sigue entrenando. Ese territorio aún no confía en ti.', 'bad');
});

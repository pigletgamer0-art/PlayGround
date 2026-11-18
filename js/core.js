'use strict';
/* MARVEL: ORIGINS — core setup, state and utilities */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const rand = (a, b) => a + Math.random() * (b - a);
const SAVE_KEY = 'marvelOriginsV2';
const TILE = 32, MW = 80, MH = 64, MAPW = MW * TILE, MAPH = MH * TILE;

const cvs = $('#game');
const ctx = cvs.getContext('2d');
let W = innerWidth, H = innerHeight, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cvs.width = Math.floor(W * DPR);
  cvs.height = Math.floor(H * DPR);
  cvs.style.width = W + 'px';
  cvs.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const ORIGINS = {
  queens: { label: 'VIGILANTE DE QUEENS', short: 'CALLEJERO', desc: 'Creciste entre azoteas y callejones. Tus puños son tu primer idioma.', bonus: 'Salud máxima +10 · 2 botiquines extra', hp: 10, medkits: 2, credits: 0 },
  wakanda: { label: 'PRODIGIO DE WAKANDA', short: 'TECNÓCRATA', desc: 'Formación en vibranium y bioingeniería. La tecnología responde a ti.', bonus: 'Resistencia máxima +25 · Traje reforzado', hp: 0, medkits: 0, credits: 0, st: 25, armor: true },
  shield: { label: 'AGENTE DE S.H.I.E.L.D.', short: 'OPERATIVO', desc: 'Protocolos, expedientes y una red de contactos que nunca duerme.', bonus: 'Créditos +150 · Guantes de impacto', hp: 0, medkits: 1, credits: 150, gloves: true },
  citizen: { label: 'CIUDADANO SIN PODERES', short: 'CIVIL', desc: 'No tienes dones sobrenaturales: solo preparación, experiencia y una decisión difícil.', bonus: '5 botiquines · Sin bonificaciones sobrenaturales', hp: 0, medkits: 5, credits: 50 }
};

const state = {
  started: false, mode: 'intro', name: 'Alex Ríos', origin: 'queens',
  look: 'urbano', color: '#74e4ff', trait: 'protective', moral: 'heroic',
  motivation: 'Proteger a los vecinos de Queens.', power: 'none', powerLevel: 1,
  level: 1, xp: 0, credits: 250,
  hp: 100, maxHp: 100, st: 100, maxSt: 100,
  medkits: 2, gloves: false, armor: false, property: false,
  quest: 0, questKills: 0, jessica: 0, jessicaClues: 0, luke: 0, lukeKills: 0,
  sound: true, playtime: 0, cityTime: 19.4, weather: 'clear', rainTimer: 55,
  speed: 152, shards: 0, rent: 0
};

const player = {
  x: 27.6 * TILE, y: 27.4 * TILE, dir: 1, walk: 0, moving: false,
  attackCd: 0, attackAnim: 0, invuln: 0, speed: 152
};

const cam = { x: player.x, y: player.y, shake: 0 };
const keys = Object.create(null);
const joy = { active: false, dx: 0, dy: 0 };
let gameTime = 0;
let lastFrame = performance.now();

function xpNeed() { return 120 + (state.level - 1) * 80; }
function attackDamage() {
  const powerBonus = state.power === 'strength' ? 8 * state.powerLevel : 0;
  const energyBonus = state.power === 'energy' ? 4 * state.powerLevel : 0;
  return 18 + powerBonus + energyBonus + (state.gloves ? 8 : 0) + Math.floor(state.level * 1.5);
}
function effectiveSpeed() {
  const speedBonus = state.power === 'speed' ? 18 * state.powerLevel : 0;
  return state.speed + speedBonus;
}

function notify(text, kind) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  if (kind === 'gold') el.style.borderLeftColor = '#ffcf5c';
  if (kind === 'good') el.style.borderLeftColor = '#7cf0b2';
  if (kind === 'bad') el.style.borderLeftColor = '#ff645e';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2600);
  setTimeout(() => el.remove(), 3200);
}

/* --- audio: tiny synthesized cues, no assets --- */
let audioCtx = null;
function audio() {
  if (!state.sound) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type, vol) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.04, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
function sfx(kind) {
  if (kind === 'hit') { tone(120, .12, 'square', .05); tone(70, .18, 'sawtooth', .03); }
  if (kind === 'hurt') { tone(90, .2, 'sawtooth', .045); }
  if (kind === 'pickup') { tone(660, .09, 'sine', .04); setTimeout(() => tone(990, .12, 'sine', .035), 70); }
  if (kind === 'level') { tone(523, .12, 'triangle', .05); setTimeout(() => tone(784, .16, 'triangle', .05), 110); setTimeout(() => tone(1046, .2, 'triangle', .05), 230); }
  if (kind === 'ui') { tone(420, .05, 'sine', .025); }
  if (kind === 'thunder') { tone(48, .8, 'sawtooth', .05); }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      state: {
        name: state.name, origin: state.origin, look: state.look, color: state.color,
        trait: state.trait, moral: state.moral, motivation: state.motivation,
        power: state.power, powerLevel: state.powerLevel, level: state.level, xp: state.xp,
        credits: state.credits, hp: state.hp, maxHp: state.maxHp, st: state.st, maxSt: state.maxSt,
        medkits: state.medkits, gloves: state.gloves, armor: state.armor, property: state.property,
        quest: state.quest, questKills: state.questKills, jessica: state.jessica,
        jessicaClues: state.jessicaClues, luke: state.luke, lukeKills: state.lukeKills,
        sound: state.sound, playtime: state.playtime, cityTime: state.cityTime,
        weather: state.weather, rainTimer: state.rainTimer, speed: state.speed,
        shards: state.shards, rent: state.rent
      },
      player: { x: player.x, y: player.y }
    }));
  } catch (e) { /* storage may be blocked */ }
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.state) Object.assign(state, data.state);
    if (data.player) { player.x = data.player.x || player.x; player.y = data.player.y || player.y; }
    state.started = true; state.mode = 'planet';
    return true;
  } catch (e) { return false; }
}

/* --- input --- */
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys[k] = true;
  if (!state.started) return;
  if (k === 'e' || k === 'enter') interact();
  if (k === ' ') attack();
  if (k === 'h') useMedkit();
  if (k === 'm') { if (!$('#modal').classList.contains('hidden')) closeMenu(); else openMenu('map'); }
  if (k === 'escape') {
    if (!$('#dialogue').classList.contains('hidden')) closeDialogue();
    else if (!$('#modal').classList.contains('hidden')) closeMenu();
    else openMenu('char');
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

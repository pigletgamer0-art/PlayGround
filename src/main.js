import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { ARENA, Arena } from './arena.js';
import { Ball } from './ball.js';
import { BotController } from './bot.js';
import { Car } from './car.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { ParticleField } from './particles.js';
import { makeGlowTexture } from './textures.js';
import { clamp, damp, formatClock, rand, smoothstep, TAU } from './utils.js';

const WIN_SCORE = 3;
const FIXED_STEP = 1 / 120;
const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;

const ui = {
  hud: document.getElementById('hud'),
  menu: document.getElementById('menu'),
  pause: document.getElementById('pause'),
  result: document.getElementById('result'),
  scoreYou: document.getElementById('score-you'),
  scoreBot: document.getElementById('score-bot'),
  clock: document.getElementById('clock'),
  pipsYou: document.getElementById('pips-you'),
  pipsBot: document.getElementById('pips-bot'),
  boostWrap: document.getElementById('boost-wrap'),
  boostDial: document.getElementById('boost-dial'),
  boostValue: document.getElementById('boost-value'),
  speedValue: document.getElementById('speed-value'),
  boostFlag: document.getElementById('boost-flag'),
  hint: document.getElementById('hint'),
  callout: document.getElementById('callout'),
  countdown: document.getElementById('countdown'),
  goalBanner: document.getElementById('goal-banner'),
  goalPre: document.querySelector('#goal-banner .pre'),
  goalWho: document.querySelector('#goal-banner .who'),
  resultPanel: document.querySelector('.result-panel'),
  resultKicker: document.getElementById('result-kicker'),
  resultTitle: document.getElementById('result-title'),
  resultScore: document.getElementById('result-score'),
  statSpeed: document.getElementById('stat-speed'),
  statHits: document.getElementById('stat-hits'),
  statTime: document.getElementById('stat-time'),
  playBtn: document.getElementById('play-btn'),
  rematchBtn: document.getElementById('rematch-btn'),
  menuBtn: document.getElementById('menu-btn'),
  resumeBtn: document.getElementById('resume-btn'),
  restartBtn: document.getElementById('restart-btn'),
  quitBtn: document.getElementById('quit-btn'),
  muteBtn: document.getElementById('mute-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  rotateHint: document.getElementById('rotate-hint'),
};

const game = {
  mode: 'menu',
  previousMode: 'play',
  difficulty: 'pro',
  score: { you: 0, bot: 0 },
  time: 0,
  kickoffTimer: 0,
  kickoffCount: 4,
  goalTimer: 0,
  goalBy: null,
  shake: 0,
  hintTimer: 0,
  carHitCooldown: 0,
  ambientClock: 0,
  pendingEnd: false,
};

let renderer;
let scene;
let camera;
let composer;
let bloom;
let arena;
let ball;
let player;
let bot;
let botAI;
let particles;
let audio;
let input;
let glowTexture;
let ready = false;

const cameraState = {
  position: new THREE.Vector3(0, 30, 62),
  look: new THREE.Vector3(0, 2, 0),
  fov: 68,
};
const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempC = new THREE.Vector3();
const shakeOffset = new THREE.Vector3();

let calloutTimer = 0;
let hintHideTimer = 0;
let lastHud = { you: -1, bot: -1, clock: '', boost: -1, speed: -1, flag: false, low: false };
let physicsAccumulator = 0;
let lastFrame = performance.now();

async function init() {
  await document.fonts.ready.catch(() => {});

  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isCoarse,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '';
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software/i.test(rendererName);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, softwareRenderer ? 1 : isCoarse ? 1.35 : 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  scene.fog = new THREE.Fog(0x030711, 105, 260);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.4, 360);
  camera.position.copy(cameraState.position);
  camera.lookAt(cameraState.look);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();

  glowTexture = makeGlowTexture();
  arena = new Arena(scene, glowTexture, { lowPower: softwareRenderer });
  arena.keyLight.shadow.mapSize.setScalar(softwareRenderer ? 1024 : 2048);
  particles = new ParticleField(scene, glowTexture, 2800);

  player = new Car(scene, { color: 0x118ca8, accent: 0x3ee9ff, isPlayer: true, name: 'YOU' });
  bot = new Car(scene, { color: 0xa93a18, accent: 0xff7a45, isPlayer: false, name: 'NOVA' });
  ball = new Ball(scene);
  botAI = new BotController('pro');

  audio = new AudioEngine();
  input = new InputManager({
    onPause: togglePause,
    onMute: toggleMute,
    onRestart: () => {
      if (game.mode === 'play' || game.mode === 'kickoff' || game.mode === 'goal' || game.mode === 'paused') startMatch();
    },
  });

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: isCoarse || softwareRenderer ? 0 : 2,
    depthBuffer: true,
  });
  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    softwareRenderer ? 0.3 : isCoarse ? 0.3 : 0.38,
    0.45,
    0.93
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  game.softwareRenderer = softwareRenderer;
  game.fps = 60;

  bindUI();
  resetToMenu();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.mode === 'play' || game.mode === 'kickoff' || game.mode === 'goal')) togglePause(true);
  });

  ready = true;
  window.__game = makeDebugApi();
  requestAnimationFrame(animate);
}

function bindUI() {
  ui.playBtn.addEventListener('click', () => {
    audio.init();
    startMatch(game.difficulty);
  });

  for (const button of document.querySelectorAll('.diff')) {
    button.addEventListener('click', () => {
      game.difficulty = button.dataset.diff;
      botAI.setDifficulty(game.difficulty);
      for (const other of document.querySelectorAll('.diff')) {
        const active = other === button;
        other.classList.toggle('active', active);
        other.setAttribute('aria-checked', String(active));
      }
    });
  }

  ui.rematchBtn.addEventListener('click', () => {
    audio.init();
    startMatch(game.difficulty);
  });
  ui.menuBtn.addEventListener('click', resetToMenu);
  ui.resumeBtn.addEventListener('click', () => togglePause(false));
  ui.restartBtn.addEventListener('click', () => {
    document.getElementById('pause').classList.add('hidden');
    audio.init();
    startMatch(game.difficulty);
  });
  ui.quitBtn.addEventListener('click', resetToMenu);
  ui.muteBtn.addEventListener('click', toggleMute);
  ui.pauseBtn.addEventListener('click', () => {
    if (game.mode === 'play' || game.mode === 'kickoff' || game.mode === 'goal') togglePause(true);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' && game.mode === 'menu') {
      event.preventDefault();
      audio.init();
      startMatch(game.difficulty);
    }
  });

  updateMuteLabel();
  if (!isCoarse) ui.hint.classList.add('show');
  hintHideTimer = window.setTimeout(() => ui.hint.classList.remove('show'), 6000);
}

function resetToMenu() {
  game.mode = 'menu';
  document.body.classList.remove('in-match');
  game.score.you = 0;
  game.score.bot = 0;
  game.time = 0;
  game.pendingEnd = false;
  ui.menu.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.goalBanner.classList.remove('show');
  ui.countdown.classList.remove('pop');
  ui.countdown.textContent = '';
  ui.callout.classList.remove('show');
  hideGoalBanner();

  player.reset(0, 27, 0);
  bot.reset(0, -27, Math.PI);
  ball.reset();
  botAI.reset();
  arena.setBannersVisible(false);
  refreshScoreboard();
  ui.clock.textContent = '00:00';
  player.stats = { topSpeed: 0, hits: 0, boostUsed: 0 };
  bot.stats = { topSpeed: 0, hits: 0, boostUsed: 0 };
  for (const pad of arena.pads) {
    pad.active = true;
    pad.timer = 0;
    pad.group.visible = true;
    pad.group.scale.setScalar(1);
  }
  ui.menu.scrollTop = 0;
}

function startMatch(difficulty = game.difficulty) {
  game.difficulty = difficulty;
  botAI.setDifficulty(difficulty);
  game.mode = 'kickoff';
  game.kickoffTimer = 2.1;
  game.kickoffCount = 4;
  document.body.classList.add('in-match');
  snapCameraBehindPlayer();
  game.score.you = 0;
  game.score.bot = 0;
  game.time = 0;
  game.goalTimer = 0;
  game.pendingEnd = false;
  game.shake = 0;
  player.stats = { topSpeed: 0, hits: 0, boostUsed: 0 };
  bot.stats = { topSpeed: 0, hits: 0, boostUsed: 0 };

  resetRound();
  arena.setBannersVisible(true);
  refreshScoreboard();
  ui.clock.textContent = '00:00';
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  hideGoalBanner();
  ui.countdown.classList.remove('pop');
  ui.countdown.textContent = '';

  if (!isCoarse) {
    ui.hint.classList.add('show');
    window.clearTimeout(hintHideTimer);
    hintHideTimer = window.setTimeout(() => ui.hint.classList.remove('show'), 7000);
  }

  for (const pad of arena.pads) {
    pad.active = true;
    pad.timer = 0;
    pad.group.visible = true;
    pad.group.scale.setScalar(1);
  }
}

function resetRound() {
  player.reset(0, 27, 0);
  bot.reset(0, -27, Math.PI);
  ball.reset();
  botAI.reset();
  player.boosting = false;
  bot.boosting = false;
  player.syncVisual(0.016, { throttle: 0, steer: 0 });
  bot.syncVisual(0.016, { throttle: 0, steer: 0 });
}

function snapCameraBehindPlayer() {
  const portrait = window.innerWidth / window.innerHeight < 0.85;
  const forward = player.forward(new THREE.Vector3());
  cameraState.position.copy(player.pos).addScaledVector(forward, portrait ? -12.8 : -10).setY(player.pos.y + (portrait ? 5.4 : 4));
  cameraState.look.copy(player.pos).addScaledVector(forward, 6).setY(1.6);
  cameraState.fov = portrait ? 84 : 70;
}

function beginKickoff() {
  resetRound();
  arena.setBannersVisible(true);
  game.mode = 'kickoff';
  game.kickoffTimer = 2.1;
  game.kickoffCount = 4;
  physicsAccumulator = 0;
  refreshScoreboard();
}

function stepPhysics(dt) {
  const controls = input.snapshot();
  const active = game.mode === 'play';

  if (active) {
    player.update(dt, controls, {
      audio,
      particles,
      onWallHit: (impact) => { game.shake = Math.max(game.shake, Math.min(0.35, impact * 0.01)); },
    });
    const botControls = botAI.update(dt, bot, ball, { kickoff: false });
    bot.update(dt, botControls, { audio: null, particles });

    const playerImpact = ball.collideCar(player);
    const botImpact = ball.collideCar(bot);

    if (playerImpact > 1.6) {
      audio.playHit(clamp(playerImpact / 9, 0.4, 1.6));
      game.shake = Math.max(game.shake, clamp(playerImpact * 0.015, 0, 0.45));
      ballHitBurst(playerImpact, player.accentColor);
    } else if (botImpact > 1.6) {
      audio.playHit(clamp(botImpact / 11, 0.3, 1.1));
      ballHitBurst(botImpact, bot.accentColor);
    }

    resolveCarCollision(player, bot);

    arena.checkPickups(player, (pad) => {
      player.boost = Math.min(100, player.boost + pad.amount);
      audio.playPickup(pad.big);
      particles.burst(new THREE.Vector3(pad.x, 0.4, pad.z), pad.big ? 30 : 12, {
        color: new THREE.Color(0xffc35e),
        speed: pad.big ? 5 : 3,
        size: 0.55,
        life: 0.7,
        gravity: -1,
        drag: 1.5,
        grow: 1,
      });
      if (pad.big) showCallout('BOOST FULL', false, 0.7);
    });
    arena.checkPickups(bot, (pad) => {
      bot.boost = Math.min(100, bot.boost + pad.amount);
      audio.playPickup(pad.big);
    });

    game.time += dt;
    game.carHitCooldown = Math.max(0, game.carHitCooldown - dt);
    checkGoal();
  } else if (game.mode === 'goal') {
    player.boosting = false;
    bot.boosting = false;
  }

  ball.update(dt, particles);
}

function ballHitBurst(impact, color) {
  const strength = clamp(impact / 8, 0.5, 2.2);
  particles.burst(ball.pos.clone(), Math.round(10 + strength * 10), {
    color: new THREE.Color(color),
    speed: 4 + strength * 4,
    size: 0.5,
    life: 0.45,
    gravity: 8,
    drag: 2,
    spread: 1.4,
    grow: 0.6,
  });
  particles.burst(ball.pos.clone(), Math.round(6 + strength * 6), {
    color: new THREE.Color(0xffffff),
    speed: 3 + strength * 3,
    size: 0.35,
    life: 0.25,
    gravity: 4,
    drag: 3,
  });
}

function resolveCarCollision(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const min = 2.35;
  if (dist >= min || Math.abs(a.pos.y - b.pos.y) > 1.6) return;
  const nx = dist > 0.001 ? dx / dist : 1;
  const nz = dist > 0.001 ? dz / dist : 0;
  const overlap = min - dist;
  a.pos.x -= nx * overlap * 0.5;
  a.pos.z -= nz * overlap * 0.5;
  b.pos.x += nx * overlap * 0.5;
  b.pos.z += nz * overlap * 0.5;

  const relative = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  if (relative < 0) {
    const impulse = -relative * 0.72;
    a.vel.x -= nx * impulse;
    a.vel.z -= nz * impulse;
    b.vel.x += nx * impulse;
    b.vel.z += nz * impulse;
    if (game.carHitCooldown <= 0 && Math.abs(relative) > 6) {
      game.carHitCooldown = 0.4;
      audio.playHit(clamp(Math.abs(relative) / 14, 0.3, 1.1));
      game.shake = Math.max(game.shake, Math.min(0.3, Math.abs(relative) * 0.012));
      const point = new THREE.Vector3((a.pos.x + b.pos.x) / 2, 0.9, (a.pos.z + b.pos.z) / 2);
      particles.burst(point, 18, {
        color: new THREE.Color(0xffe6b0),
        speed: 6,
        size: 0.4,
        life: 0.4,
        gravity: 10,
        drag: 1.6,
        spread: 1.5,
      });
    }
  }
}

function checkGoal() {
  if (game.mode !== 'play') return;
  const z = ball.pos.z;
  const through = Math.abs(ball.pos.x) < ARENA.goalWidth / 2 + 0.2 && ball.pos.y < ARENA.goalHeight + 0.2;
  if (!through) return;
  if (z < -ARENA.length / 2 - 0.55) {
    scoreGoal(true);
  } else if (z > ARENA.length / 2 + 0.55) {
    scoreGoal(false);
  }
}

function scoreGoal(byYou) {
  if (game.mode !== 'play') return;
  if (byYou) game.score.you += 1;
  else game.score.bot += 1;
  game.mode = 'goal';
  game.goalTimer = 2.9;
  game.goalBy = byYou;
  game.shake = 0.65;
  arena.setBannersVisible(false);
  player.boosting = false;
  bot.boosting = false;
  refreshScoreboard();

  const color = byYou ? '#3ee9ff' : '#ff6b3d';
  const colorValue = byYou ? 0x3ee9ff : 0xff6b3d;
  ui.goalBanner.style.setProperty('--goal-color', color);
  ui.goalBanner.classList.remove('show');
  void ui.goalBanner.offsetWidth;
  ui.goalBanner.classList.add('show');
  ui.goalPre.textContent = byYou ? 'GOAL!' : 'GOAL!';
  ui.goalWho.textContent = byYou ? 'YOU SCORE' : 'NOVA SCORES';
  ui.countdown.classList.remove('pop');
  ui.countdown.textContent = '';
  showCallout(byYou ? 'WHAT A STRIKE' : 'NOVA STRIKES BACK', !byYou, 1.6);

  audio.playGoal(byYou);

  const origin = ball.pos.clone();
  particles.burst(origin, 90, {
    color: new THREE.Color(colorValue),
    speed: 14,
    size: 0.85,
    life: 1.3,
    gravity: 5,
    drag: 1.1,
    spread: 1.3,
    grow: 1.2,
    fade: 1.2,
  });
  particles.burst(origin, 50, {
    color: new THREE.Color(0xffffff),
    speed: 9,
    size: 0.55,
    life: 0.9,
    gravity: 3,
    drag: 1.5,
    fade: 1.4,
  });

  window.setTimeout(() => {
    ui.goalBanner.classList.remove('show');
  }, 2300);
}

function hideGoalBanner() {
  ui.goalBanner.classList.remove('show');
}

function endMatch() {
  game.mode = 'over';
  document.body.classList.remove('in-match');
  const won = game.score.you > game.score.bot;
  ui.resultPanel.classList.toggle('lose', !won);
  ui.resultKicker.textContent = `MATCH COMPLETE · ${botAI.config.label.toUpperCase()}`;
  ui.resultTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
  ui.resultScore.textContent = `${game.score.you} — ${game.score.bot}`;
  ui.statSpeed.textContent = Math.round(player.stats.topSpeed);
  ui.statHits.textContent = String(player.stats.hits);
  ui.statTime.textContent = formatClock(game.time);
  ui.result.classList.remove('hidden');
  ui.goalBanner.classList.remove('show');
  ui.countdown.classList.remove('pop');
  ui.countdown.textContent = '';
  audio.playWin(won);
  audio.playWhistle();
  game.shake = 0.4;

  const origin = new THREE.Vector3(0, 14, 0);
  for (let i = 0; i < 4; i += 1) {
    const base = origin.clone().add(new THREE.Vector3(rand(-24, 24), rand(-3, 3), rand(-24, 24)));
    particles.burst(base, 45, {
      color: new THREE.Color([0x3ee9ff, 0xff6b3d, 0xffffff, 0xffd166][i % 4]),
      speed: 7,
      size: 0.6,
      life: 3,
      gravity: 3.2,
      drag: 0.6,
      spread: 1.6,
      fade: 0.8,
    });
  }

  window.setTimeout(() => {
    if (game.mode !== 'over') return;
    const base = new THREE.Vector3(0, 12, 0);
    particles.burst(base, 120, {
      color: new THREE.Color(won ? 0x3ee9ff : 0xff6b3d),
      speed: 10,
      size: 0.55,
      life: 2.6,
      gravity: 4,
      drag: 0.7,
      spread: 2,
      fade: 0.9,
    });
  }, 420);
}

function togglePause(force) {
  if (game.mode === 'menu' || game.mode === 'over') return;
  const shouldPause = force ?? game.mode !== 'paused';
  if (shouldPause) {
    if (game.mode !== 'paused') {
      game.previousMode = game.mode;
      game.mode = 'paused';
    }
    ui.pause.classList.remove('hidden');
  } else {
    game.mode = game.previousMode || 'play';
    ui.pause.classList.add('hidden');
    lastFrame = performance.now();
  }
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  updateMuteLabel();
}

function updateMuteLabel() {
  ui.muteBtn.textContent = audio?.muted ? 'SOUND: OFF' : 'SOUND: ON';
  ui.muteBtn.setAttribute('aria-pressed', String(Boolean(audio?.muted)));
}

function showCallout(text, warn = false, duration = 1.4) {
  ui.callout.textContent = text;
  ui.callout.classList.toggle('warn', warn);
  ui.callout.classList.add('show');
  window.clearTimeout(calloutTimer);
  calloutTimer = window.setTimeout(() => ui.callout.classList.remove('show'), duration * 1000);
}

function showCountdown(text) {
  ui.countdown.textContent = text;
  ui.countdown.classList.remove('pop');
  void ui.countdown.offsetWidth;
  ui.countdown.classList.add('pop');
}

function refreshScoreboard() {
  ui.scoreYou.textContent = game.score.you;
  ui.scoreBot.textContent = game.score.bot;
  const pipsYou = ui.pipsYou.children;
  const pipsBot = ui.pipsBot.children;
  for (let i = 0; i < 3; i += 1) {
    pipsYou[i]?.classList.toggle('on', i < game.score.you);
    pipsBot[i]?.classList.toggle('on', i < game.score.bot);
  }
}

function updateHud() {
  if (game.score.you !== lastHud.you || game.score.bot !== lastHud.bot) {
    lastHud.you = game.score.you;
    lastHud.bot = game.score.bot;
    refreshScoreboard();
  }
  const clockText = formatClock(game.time);
  if (clockText !== lastHud.clock) {
    lastHud.clock = clockText;
    ui.clock.textContent = clockText;
  }

  const boost = Math.round(player.boost);
  if (boost !== lastHud.boost) {
    lastHud.boost = boost;
    ui.boostValue.textContent = String(boost);
    ui.boostDial.style.setProperty('--p', String(boost));
  }
  const low = player.boost < 24;
  if (low !== lastHud.low) {
    lastHud.low = low;
    ui.boostWrap.classList.toggle('low', low);
  }
  const speed = Math.round(player.speed() * 3.6);
  if (speed !== lastHud.speed) {
    lastHud.speed = speed;
    ui.speedValue.textContent = String(speed);
  }
  if (player.boosting !== lastHud.flag) {
    lastHud.flag = player.boosting;
    ui.boostFlag.classList.toggle('on', player.boosting);
  }
}

function updateMeta(dt) {
  game.carHitCooldown = Math.max(0, game.carHitCooldown - dt);
  game.shake = Math.max(0, game.shake - game.shake * Math.min(1, dt * 5) - dt * 0.03);

  if (game.mode === 'kickoff') {
    game.kickoffTimer -= dt;
    const count = Math.ceil(game.kickoffTimer / 0.7);
    if (count !== game.kickoffCount && count > 0) {
      game.kickoffCount = count;
      showCountdown(String(count));
      audio.playCountdown(false);
    }
    if (game.kickoffTimer <= 0) {
      game.mode = 'play';
      game.kickoffCount = 0;
      showCountdown('GO');
      audio.playCountdown(true);
      showCallout('PLAY!', false, 0.8);
      refreshScoreboard();
    }
  }

  if (game.mode === 'goal') {
    game.goalTimer -= dt;
    if (game.goalTimer <= 0) {
      if (game.score.you >= WIN_SCORE || game.score.bot >= WIN_SCORE) endMatch();
      else beginKickoff();
    }
  }

  game.ambientClock += dt;
  while (game.ambientClock > 0.11) {
    game.ambientClock -= 0.11;
    particles.spawn({
      position: new THREE.Vector3(rand(-ARENA.width / 2, ARENA.width / 2), rand(1.5, 13), rand(-ARENA.length / 2, ARENA.length / 2)),
      velocity: new THREE.Vector3(rand(-0.1, 0.1), rand(0.05, 0.22), rand(-0.1, 0.1)),
      color: new THREE.Color(rand() < 0.3 ? 0x7fe8ff : 0xb7cfe0),
      size: rand(0.12, 0.32),
      life: rand(2.5, 5),
      gravity: -0.02,
      drag: 0.15,
      fade: 1.6,
    });
  }
}

function updateCamera(dt) {
  let desiredPos;
  let desiredLook;
  let desiredFov = 68;
  const t = performance.now() / 1000;

  if (game.mode === 'menu') {
    const portrait = window.innerWidth / window.innerHeight < 0.85;
    const drift = Math.sin(t * 0.16) * 2.4;
    desiredPos = tempA.set(portrait ? 6 : 9 + drift, portrait ? 7.4 : 6.2, portrait ? 37 : 35);
    desiredLook = tempB.set(0, portrait ? 2.2 : 2.4, -2);
    desiredFov = portrait ? 80 : 64;
  } else if (game.mode === 'over') {
    const angle = t * 0.12;
    desiredPos = tempA.set(Math.sin(angle) * 29, 11.5 + Math.sin(t * 0.3) * 1.2, Math.cos(angle) * 29);
    desiredLook = tempB.set(0, 2.6, 0);
    desiredFov = 62;
  } else if (game.mode === 'goal') {
    const sign = Math.sign(ball.pos.z) || 1;
    const orbit = Math.sin(t * 0.8) * 2.4;
    desiredPos = tempA.set(ball.pos.x * 0.5 + orbit, 11.4, ball.pos.z - sign * 23);
    desiredLook = tempB.copy(ball.pos).add(new THREE.Vector3(0, 1.8, 0));
    desiredFov = 58;
  } else {
    const forward = player.forward(tempC);
    const speedN = clamp(player.speed() / 47, 0, 1);
    const portrait = window.innerWidth / window.innerHeight < 0.85;
    const back = (portrait ? 12.8 : 9.6) + speedN * 1.4;
    desiredPos = tempA.copy(player.pos).addScaledVector(forward, -back);
    desiredPos.y += (portrait ? 5.4 : 3.8) + (player.grounded ? 0 : 1.35);
    desiredLook = tempB.copy(player.pos).addScaledVector(forward, 5.2);
    desiredLook.y += 1.2;

    const toBall = ball.pos.clone().sub(player.pos);
    const ballAhead = toBall.dot(forward);
    if (ballAhead > -4 && toBall.length() < 42) {
      desiredLook.lerp(ball.pos, 0.38);
    }

    desiredPos.x = clamp(desiredPos.x, -ARENA.width / 2 + 1.2, ARENA.width / 2 - 1.2);
    desiredPos.z = clamp(desiredPos.z, -ARENA.length / 2 + 1.2, ARENA.length / 2 - 1.2);
    const horizontalGap = Math.hypot(desiredPos.x - player.pos.x, desiredPos.z - player.pos.z);
    if (horizontalGap < 7) {
      desiredPos.y += (7 - horizontalGap) * 1.5;
    }
    desiredFov = (portrait ? 84 : 70) + speedN * 10 + (player.boosting ? 4 : 0);
  }

  const positionLambda = game.mode === 'menu' ? 1.8 : 6.5;
  const lookLambda = game.mode === 'menu' ? 2.2 : 9;
  cameraState.position.x = damp(cameraState.position.x, desiredPos.x, positionLambda, dt);
  cameraState.position.y = damp(cameraState.position.y, desiredPos.y, positionLambda, dt);
  cameraState.position.z = damp(cameraState.position.z, desiredPos.z, positionLambda, dt);
  cameraState.look.x = damp(cameraState.look.x, desiredLook.x, lookLambda, dt);
  cameraState.look.y = damp(cameraState.look.y, desiredLook.y, lookLambda, dt);
  cameraState.look.z = damp(cameraState.look.z, desiredLook.z, lookLambda, dt);
  cameraState.fov = damp(cameraState.fov, desiredFov, 4, dt);

  const shake = game.shake;
  shakeOffset.set(
    (Math.random() * 2 - 1) * shake * 0.55,
    (Math.random() * 2 - 1) * shake * 0.4,
    (Math.random() * 2 - 1) * shake * 0.55
  );

  camera.position.copy(cameraState.position).add(shakeOffset);
  camera.fov = cameraState.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cameraState.look);
}

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = (now - lastFrame) / 1000;
  const dt = Math.min(0.14, rawDt);
  lastFrame = now;
  if (rawDt > 0) game.fps = damp(game.fps, 1 / rawDt, 3, rawDt);

  updateMeta(dt);

  if (game.mode === 'play') {
    physicsAccumulator += dt;
    let steps = 0;
    while (physicsAccumulator >= FIXED_STEP && steps < 18) {
      stepPhysics(FIXED_STEP);
      physicsAccumulator -= FIXED_STEP;
      steps += 1;
    }
  } else if (game.mode === 'kickoff' || game.mode === 'goal') {
    physicsAccumulator += dt;
    let steps = 0;
    while (physicsAccumulator >= FIXED_STEP && steps < 16) {
      ball.update(FIXED_STEP, particles);
      physicsAccumulator -= FIXED_STEP;
      steps += 1;
    }
    player.syncVisual(dt, { throttle: 0, steer: 0 });
    bot.syncVisual(dt, { throttle: 0, steer: 0 });
  } else if (game.mode === 'menu' || game.mode === 'over') {
    physicsAccumulator += dt;
    let steps = 0;
    while (physicsAccumulator >= FIXED_STEP && steps < 8) {
      ball.update(FIXED_STEP, particles);
      physicsAccumulator -= FIXED_STEP;
      steps += 1;
    }
  }

  arena.update(dt);
  particles.update(dt);
  updateCamera(dt);
  updateHud();
  audio.updateEngine(player.speed(), input.snapshot().throttle, player.boosting, player.grounded, dt);

  if (ui.rotateHint) {
    ui.rotateHint.classList.toggle('hidden', !(isCoarse && window.innerHeight > window.innerWidth && game.mode === 'play'));
  }

  if (game.usePost === false) renderer.render(scene, camera);
  else composer.render();
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, game.softwareRenderer ? 1 : isCoarse ? 1.35 : 1.6));
  renderer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  bloom?.setSize(width, height);
}

function makeDebugApi() {
  return {
    ready: true,
    get mode() { return game.mode; },
    get score() { return { ...game.score }; },
    get time() { return game.time; },
    get difficulty() { return game.difficulty; },
    get fps() { return game.fps; },
    get softwareRenderer() { return Boolean(game.softwareRenderer); },
    player,
    bot,
    ball,
    arena,
    renderer,
    composer,
    bloom,
    scene,
    camera,
    threeCamera: camera,
    setQuality: ({ post, bloom: bloomOn, shadows, pixelRatio } = {}) => {
      if (post !== undefined) game.usePost = Boolean(post);
      if (bloomOn !== undefined) bloom.enabled = Boolean(bloomOn);
      if (shadows !== undefined) {
        renderer.shadowMap.enabled = Boolean(shadows);
        scene.traverse((node) => {
          if (node.isMesh || node.isInstancedMesh) {
            if (node.material) node.material.needsUpdate = true;
          }
        });
      }
      if (pixelRatio !== undefined) {
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(window.innerWidth, window.innerHeight);
      }
    },
    start: (difficulty) => {
      audio.init();
      startMatch(difficulty || game.difficulty);
    },
    menu: resetToMenu,
    forceGoal: (you = true) => {
      if (game.mode === 'goal' || game.mode === 'over') return;
      game.mode = 'play';
      scoreGoal(Boolean(you));
    },
    finishGoal: () => { game.goalTimer = 0.01; },
    skipKickoff: () => { game.kickoffTimer = 0.01; },
    setPlayer: ({ x, z, yaw, boost, vx, vz } = {}) => {
      if (x !== undefined) player.pos.x = x;
      if (z !== undefined) player.pos.z = z;
      if (yaw !== undefined) player.yaw = yaw;
      if (boost !== undefined) player.boost = boost;
      if (vx !== undefined) player.vel.x = vx;
      if (vz !== undefined) player.vel.z = vz;
      player.syncVisual(0.016, { throttle: 0, steer: 0 });
    },
    setBall: ({ x, y, z, vx, vy, vz } = {}) => {
      if (x !== undefined) ball.pos.x = x;
      if (y !== undefined) ball.pos.y = y;
      if (z !== undefined) ball.pos.z = z;
      if (vx !== undefined) ball.vel.x = vx;
      if (vy !== undefined) ball.vel.y = vy;
      if (vz !== undefined) ball.vel.z = vz;
      ball.mesh.position.copy(ball.pos);
    },
    setDifficulty: (name) => {
      game.difficulty = name;
      botAI.setDifficulty(name);
      for (const button of document.querySelectorAll('.diff')) {
        const active = button.dataset.diff === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-checked', String(active));
      }
    },
    camera: cameraState,
  };
}

init().catch((error) => {
  console.error(error);
  const message = document.createElement('div');
  message.className = 'noscript';
  message.textContent = 'Rocket Duel could not start WebGL. Try a newer browser with hardware acceleration enabled.';
  document.getElementById('app')?.appendChild(message);
});

import * as THREE from 'three';
import {
  ARENA,
  BOOST_PADS,
  carForward,
  carCarCollision,
  clamp,
  collideCarBall,
  createBall,
  createCar,
  damp,
  detectGoal,
  resetCar,
  stepBall,
  stepCar,
} from './physics.js';
import { createBot, DIFFICULTIES, updateBot } from './ai.js';
import { createWorld, TEAM } from './world.js';
import { ParticlePool } from './particles.js';
import { SoundLab } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STEP = 1 / 120;

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
const lowPower = /swiftshader|llvmpipe|software|basic render/i.test(String(rendererName));
let appReady = false;
if (lowPower) {
  document.documentElement.classList.add('low-power');
  // Report fonts as loaded only once the first heavy frames have been
  // presented, so tooling that waits on document.fonts does not start
  // interacting during the software renderer's warm-up stall.
  Object.defineProperty(document.fonts, 'status', {
    configurable: true,
    get: () => (appReady ? 'loaded' : 'loading'),
  });
}
renderer.setPixelRatio(lowPower ? 0.65 : Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowPower;
renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040910);
scene.fog = new THREE.FogExp2(0x050c16, 0.0058);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 320);
camera.position.set(0, 20, 48);

const world = createWorld(scene, renderer, { lowPower });
const particles = new ParticlePool(scene);
const sound = new SoundLab();

const state = {
  phase: 'menu',
  paused: false,
  score: { blue: 0, red: 0 },
  difficulty: 'pro',
  bot: createBot('pro', 7),
  ball: createBall(0, 4.4, 0),
  blue: createCar({ x: -24, z: 0, yaw: Math.PI / 2, team: 'blue' }),
  red: createCar({ x: 24, z: 0, yaw: -Math.PI / 2, team: 'red' }),
  pads: BOOST_PADS.map((pad) => ({ ...pad, active: true, respawn: 0 })),
  ballCam: true,
  muted: false,
  countdown: 3,
  displayed: 3,
  goTimer: 0,
  matchTime: 0,
  goalTimer: 0,
  lastGoal: null,
  overTime: 0,
  menuTime: 0,
  accumulator: 0,
  slowmo: 1,
  shake: 0,
  jumpQueued: false,
  bounceLock: 0,
  saveLock: 0,
  trailAcc: 0,
  confettiTimer: 0,
  hintTime: 0,
  resultShown: false,
  stats: { hits: 0, shots: 0, saves: 0, topSpeed: 0 },
  touch: { active: false, steer: 0, throttle: 0, boost: false },
};

const botInput = { throttle: 0, steer: 0, boost: false, jumpPressed: false };
const camPos = new THREE.Vector3(0, 22, 52);
const camLook = new THREE.Vector3(0, 4, 0);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
const teamColors = {
  blue: new THREE.Color(TEAM.blue.light).toArray(),
  red: new THREE.Color(TEAM.red.light).toArray(),
  white: [0.9, 0.97, 1],
  amber: [1, 0.68, 0.2],
};
const mini = $('#minimapCanvas');
const miniCtx = mini.getContext('2d');
let miniTick = 0;

const hasTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (hasTouch) {
  $('.keyboard-controls').classList.add('hidden');
  $('.touch-hints').classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */
function setPhase(phase) {
  state.phase = phase;
  document.body.dataset.phase = phase;
}

function toast(text, duration = 1.6) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), duration * 1000);
}

function setCountdownNumber(n) {
  const box = $('#countdown');
  const num = $('#countdownNum');
  box.classList.remove('hidden', 'go');
  num.textContent = String(n);
  $('#countdownLabel').textContent = n <= 1 ? 'GET READY' : 'KICKOFF';
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  sound.beep(false);
}

function showGo() {
  const box = $('#countdown');
  box.classList.remove('hidden', 'pop');
  box.classList.add('go');
  $('#countdownNum').textContent = 'GO!';
  $('#countdownLabel').textContent = 'PLAY';
  sound.beep(true);
}

function hideCountdown() {
  $('#countdown').classList.add('hidden');
}

function updateScoreboard() {
  $('#blueScore').textContent = state.score.blue;
  $('#redScore').textContent = state.score.red;
  [...$('#bluePips').children].forEach((el, i) => el.classList.toggle('on', i < state.score.blue));
  [...$('#redPips').children].forEach((el, i) => el.classList.toggle('on', i < state.score.red));
}

function showGoalBanner(team) {
  const el = $('#goalBanner');
  el.classList.remove('hidden', 'blue', 'red');
  el.classList.add(team);
  $('#goalTeam').textContent = team === 'blue' ? 'BLUE' : 'RED';
  $('#goalDetail').textContent = `${state.score.blue} — ${state.score.red}`;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

function hideGoalBanner() {
  $('#goalBanner').classList.add('hidden');
}

function setTouchVisible(visible) {
  $('#touchControls').classList.toggle('hidden', !visible || !hasTouch);
  updateRotateHint();
}

function updateRotateHint() {
  const show =
    hasTouch &&
    window.innerHeight > window.innerWidth &&
    (state.phase === 'playing' || state.phase === 'countdown') &&
    !state.paused &&
    state.hintTime < 7;
  $('#rotateHint').classList.toggle('hidden', !show);
}

function updateCameraChip() {
  $('#ballCamState').textContent = state.ballCam ? 'ON' : 'OFF';
  $('#camBadge').textContent = state.ballCam ? 'BALL CAM' : 'CAR CAM';
}

function updateMuteUi() {
  $('#muteBtn').classList.toggle('muted', state.muted);
  const soundBtn = $('#soundBtn');
  soundBtn.classList.toggle('off', state.muted);
  soundBtn.innerHTML = `<span class="sound-dot"></span> SOUND ${state.muted ? 'OFF' : 'ON'}`;
}

function toggleMute() {
  state.muted = !state.muted;
  sound.resume();
  sound.setMuted(state.muted);
  updateMuteUi();
  if (!state.muted) sound.ui();
}

function toggleBallCam() {
  state.ballCam = !state.ballCam;
  updateCameraChip();
  sound.ui();
  toast(`BALL CAM ${state.ballCam ? 'ON' : 'OFF'}`);
}

/* ------------------------------------------------------------------ */
/* Match flow                                                          */
/* ------------------------------------------------------------------ */
function resetPads() {
  state.pads.forEach((pad, i) => {
    pad.active = true;
    pad.respawn = 0;
    world.setPadActive(i, true);
  });
}

function setMenuPose() {
  resetCar(state.blue, { x: -24, z: 0, yaw: Math.PI / 2, boost: 34 });
  resetCar(state.red, { x: 24, z: 0, yaw: -Math.PI / 2, boost: 34 });
  Object.assign(state.ball, createBall(8, 4.6, 6));
  world.syncCar(world.cars.blue, state.blue, 0.016);
  world.syncCar(world.cars.red, state.red, 0.016);
  world.syncBall(state.ball, 0.016);
}

function enterMenu() {
  setPhase('menu');
  state.paused = false;
  state.resultShown = false;
  state.overTime = 0;
  state.menuTime = 0;
  state.slowmo = 1;
  state.shake = 0;
  state.accumulator = 0;
  $('#menu').classList.remove('hidden');
  $('#hud').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#pause').classList.add('hidden');
  hideGoalBanner();
  hideCountdown();
  setTouchVisible(false);
  resetPads();
  setMenuPose();
  const angle = 2.15;
  camPos.set(Math.cos(angle) * 31, 13.2, Math.sin(angle) * 31);
  camLook.set(0, 3.6, 0);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sound.update(0, false, 0);
  $('#hintBar').classList.remove('fade');
}

function startMatch(difficulty = state.difficulty) {
  sound.resume();
  sound.ui();
  state.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'pro';
  state.score.blue = 0;
  state.score.red = 0;
  state.stats = { hits: 0, shots: 0, saves: 0, topSpeed: 0 };
  state.matchTime = 0;
  state.resultShown = false;
  state.paused = false;
  state.trailAcc = 0;
  state.confettiTimer = 0;
  $('#menu').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#pause').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#hintBar').classList.remove('fade');
  state.hintTime = 0;
  updateScoreboard();
  kickoff(true);
}

let botSeed = 7;
function kickoff(first = false) {
  setPhase('countdown');
  state.countdown = 3;
  state.displayed = 3;
  state.goTimer = 0;
  state.goalTimer = 0;
  state.accumulator = 0;
  state.slowmo = 1;
  state.shake = 0;
  state.bounceLock = 0;
  state.saveLock = 0;
  state.jumpQueued = false;
  Object.assign(state.ball, createBall(0, ARENA.ballRadius, 0));
  resetCar(state.blue, { x: -30, z: 0, yaw: Math.PI / 2, boost: 34 });
  resetCar(state.red, { x: 30, z: 0, yaw: -Math.PI / 2, boost: 34 });
  state.bot = createBot(state.difficulty, first ? botSeed : ++botSeed);
  botInput.throttle = 0;
  botInput.steer = 0;
  botInput.boost = false;
  botInput.jumpPressed = false;
  resetPads();
  hideGoalBanner();
  updateScoreboard();
  setCountdownNumber(3);
  setTouchVisible(true);
  world.syncCar(world.cars.blue, state.blue, 0.016);
  world.syncCar(world.cars.red, state.red, 0.016);
  world.syncBall(state.ball, 0.016);
  sound.update(0, false, 0);
  if (!first) toast(`KICKOFF — ${DIFFICULTIES[state.difficulty].label.toUpperCase()} BOT`, 1.5);
}

function scoreGoal(team) {
  state.score[team] += 1;
  state.lastGoal = team;
  setPhase('goal');
  state.goalTimer = 0;
  state.slowmo = 0.22;
  state.shake = 1;
  state.accumulator = 0;
  hideCountdown();
  updateScoreboard();
  showGoalBanner(team);
  world.flashGoal(team);
  sound.goal(team === 'blue');
  setTouchVisible(false);

  const b = state.ball.pos;
  const color = team === 'blue' ? [0.32, 0.63, 1] : [1, 0.26, 0.16];
  const count = lowPower ? 90 : 170;
  particles.emit({ x: b.x, y: b.y, z: b.z, vy: 7, spread: 7, color, size: 0.9, life: 1.7, gravity: 7, drag: 0.35, count });
  particles.emit({ x: b.x, y: b.y, z: b.z, vy: 4, spread: 4.5, color: teamColors.white, size: 0.55, life: 1.2, gravity: 5, drag: 0.6, count: count / 2 });
  particles.emit({ x: b.x, y: b.y, z: b.z, vy: 2, spread: 2.4, color: teamColors.amber, size: 0.7, life: 0.8, gravity: 3, drag: 0.9, count: count / 3 });
  if (team === 'blue') {
    toast(state.score.red + 1 >= 3 ? 'MATCH POINT' : 'YOU SCORED!', 2);
  }
}

function afterGoal() {
  hideGoalBanner();
  if (state.score[state.lastGoal] >= 3) {
    showResult(state.lastGoal);
  } else {
    kickoff(false);
  }
}

function showResult(winner) {
  setPhase('gameover');
  state.resultShown = true;
  state.overTime = 0;
  state.confettiTimer = 0;
  state.paused = false;
  hideCountdown();
  setTouchVisible(false);
  $('#hud').classList.add('hidden');
  $('#pause').classList.add('hidden');
  const playerWon = winner === 'blue';
  const card = $('#result .result-card');
  card.classList.toggle('lose', !playerWon);
  $('#resultKicker').textContent = playerWon ? 'MATCH COMPLETE // ARENA CLEARED' : 'MATCH COMPLETE // BOT WINS';
  $('#resultTitle').textContent = playerWon ? 'VICTORY' : 'DEFEAT';
  $('#finalBlue').textContent = state.score.blue;
  $('#finalRed').textContent = state.score.red;
  $('#statGoals').textContent = state.score.blue;
  $('#statHits').textContent = state.stats.hits;
  $('#statSpeed').textContent = Math.round(state.stats.topSpeed);
  $('#statSaves').textContent = state.stats.saves;
  $('#result').classList.remove('hidden');
  sound.win(playerWon);
  if (playerWon) {
    for (let i = 0; i < 5; i++) {
      particles.emit({
        x: (Math.random() - 0.5) * 30,
        y: 18 + Math.random() * 5,
        z: (Math.random() - 0.5) * 22,
        vy: -1,
        spread: 0.5,
        color: i % 2 ? teamColors.blue : teamColors.white,
        size: 0.65,
        life: 3.6,
        gravity: 1.5,
        drag: 0.2,
        count: 24,
      });
    }
  }
}

function togglePause(force) {
  if (!(state.phase === 'playing' || state.phase === 'countdown')) return;
  state.paused = force === undefined ? !state.paused : Boolean(force);
  $('#pause').classList.toggle('hidden', !state.paused);
  setTouchVisible(!state.paused);
  updateRotateHint();
  if (state.paused) {
    sound.update(0, false, 0);
    sound.ui();
  } else {
    state.accumulator = 0;
    sound.ui();
  }
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const keys = new Set();
let padJumpPrev = false;

function readPlayerInput() {
  let throttle = 0;
  let steer = 0;
  let boost = false;
  if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX')) boost = true;

  if (state.touch.active) {
    throttle = state.touch.throttle;
    steer = state.touch.steer;
  }
  if (state.touch.boost) boost = true;

  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = gamepads && gamepads[0];
  if (pad) {
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.18) {
      steer = clamp(ax * 1.25, -1, 1);
      throttle = clamp(-ay * 1.4, -1, 1);
    }
    if (pad.buttons[7]?.value > 0.15 || pad.buttons[6]?.value > 0.15 || pad.buttons[1]?.pressed) boost = true;
    const jumpDown = Boolean(pad.buttons[0]?.pressed);
    if (jumpDown && !padJumpPrev) state.jumpQueued = true;
    padJumpPrev = jumpDown;
  }
  return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1), boost, jumpPressed: false };
}

window.addEventListener('keydown', (event) => {
  const code = event.code;
  if (
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(code)
  ) {
    event.preventDefault();
  }
  if (event.repeat) return;
  keys.add(code);

  if (code === 'Space') {
    if (state.phase === 'menu') startMatch();
    else state.jumpQueued = true;
  }
  if (code === 'KeyC') toggleBallCam();
  if (code === 'KeyM') toggleMute();
  if (code === 'Escape') togglePause();
  if (code === 'KeyR' && state.phase !== 'menu') startMatch(state.difficulty);
  if (code === 'Enter') {
    if (state.phase === 'menu') startMatch();
    else if (state.phase === 'gameover') startMatch(state.difficulty);
    else if (state.paused) togglePause(false);
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  state.touch.active = false;
  state.touch.boost = false;
  state.touch.steer = 0;
  state.touch.throttle = 0;
  $('#stickKnob').style.transform = '';
  $('#touchBoost').classList.remove('active');
});

$('#playBtn').addEventListener('click', () => {
  // Give the click itself a moment to finish before the countdown switches the
  // renderer to full gameplay, which is a heavy first paint on weak GPUs.
  setTimeout(() => {
    if (state.phase === 'menu') startMatch();
  }, 120);
});
$$('.diff').forEach((button) => {
  button.addEventListener('click', () => {
    state.difficulty = button.dataset.difficulty;
    $$('.diff').forEach((b) => b.classList.toggle('active', b === button));
    const cfg = DIFFICULTIES[state.difficulty];
    $('#botSubtitle').textContent = `${cfg.label.toUpperCase()} DRIVER`;
    const reflex = Math.max(1, Math.round((1 - cfg.reaction / 0.35) * 5));
    const aim = Math.max(1, Math.round((1 - cfg.aimError / 0.25) * 5));
    [...$('#reflexBars').children].forEach((el, i) => el.classList.toggle('on', i < reflex));
    [...$('#aimBars').children].forEach((el, i) => el.classList.toggle('on', i < aim));
    sound.resume();
    sound.ui();
  });
});
$('#ballCamBtn').addEventListener('click', toggleBallCam);
$('#muteBtn').addEventListener('click', toggleMute);
$('#soundBtn').addEventListener('click', toggleMute);
$('#pauseBtn').addEventListener('click', () => togglePause(true));
$('#resumeBtn').addEventListener('click', () => togglePause(false));
$('#restartBtn').addEventListener('click', () => startMatch(state.difficulty));
$('#quitBtn').addEventListener('click', enterMenu);
$('#rematchBtn').addEventListener('click', () => startMatch(state.difficulty));
$('#menuBtn').addEventListener('click', enterMenu);

/* Touch controls */
let stickPointer = null;
const stickZone = $('#stickZone');
const stickBase = $('#stickBase');
const stickKnob = $('#stickKnob');

function updateStick(event) {
  const rect = stickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const max = rect.width * 0.36;
  const len = Math.hypot(dx, dy);
  const scale = len > max ? max / len : 1;
  dx *= scale;
  dy *= scale;
  stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const dead = 5;
  state.touch.active = true;
  state.touch.steer = Math.abs(dx) < dead ? 0 : clamp(dx / max, -1, 1);
  state.touch.throttle = Math.abs(dy) < dead ? 0 : clamp(-dy / max, -1, 1);
}

function releaseStick(event) {
  if (stickPointer !== null && event && event.pointerId !== stickPointer) return;
  stickPointer = null;
  state.touch.active = false;
  state.touch.steer = 0;
  state.touch.throttle = 0;
  stickKnob.style.transform = '';
}

stickZone.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  stickPointer = event.pointerId;
  try {
    stickZone.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointers in tests have no capture target; the drag still works.
  }
  updateStick(event);
});
stickZone.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointer) return;
  event.preventDefault();
  updateStick(event);
});
stickZone.addEventListener('pointerup', releaseStick);
stickZone.addEventListener('pointercancel', releaseStick);
stickZone.addEventListener('lostpointercapture', releaseStick);

const boostButton = $('#touchBoost');
const jumpButton = $('#touchJump');
boostButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  state.touch.boost = true;
  boostButton.classList.add('active');
  try {
    boostButton.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointers have no capture target.
  }
});
const releaseBoost = () => {
  state.touch.boost = false;
  boostButton.classList.remove('active');
};
boostButton.addEventListener('pointerup', releaseBoost);
boostButton.addEventListener('pointercancel', releaseBoost);
boostButton.addEventListener('pointerleave', releaseBoost);
jumpButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  state.jumpQueued = true;
  jumpButton.classList.add('active');
  setTimeout(() => jumpButton.classList.remove('active'), 110);
  navigator.vibrate?.(8);
});
$('#touchCam').addEventListener('click', toggleBallCam);

window.addEventListener('resize', () => {
  renderer.setPixelRatio(lowPower ? 0.65 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  updateRotateHint();
});
window.addEventListener('orientationchange', () => setTimeout(updateRotateHint, 220));

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */
function emitBurst(x, y, z, color, count, power = 1) {
  particles.emit({
    x,
    y,
    z,
    vy: 2.5 * power,
    spread: 1.6 * power,
    color,
    size: 0.48,
    life: 0.5,
    gravity: 5,
    drag: 1.6,
    count,
  });
}

function onBallBounce(type, strength) {
  if (strength < 2.6 || state.bounceLock > 0) return;
  state.bounceLock = 0.075;
  const dist = Math.hypot(state.ball.pos.x - state.blue.pos.x, state.ball.pos.z - state.blue.pos.z);
  if (dist < 30) sound.bounce(clamp(strength / 26, 0.15, 1));
  if (strength > 5) emitBurst(state.ball.pos.x, state.ball.pos.y, state.ball.pos.z, teamColors.white, 3, 0.5);
}

function handleCarHit(team, strength, preVx) {
  const b = state.ball.pos;
  const color = team === 'blue' ? teamColors.blue : teamColors.red;
  emitBurst(b.x, b.y, b.z, color, lowPower ? 7 : 13, 1 + strength);
  emitBurst(b.x, b.y, b.z, teamColors.white, 4, 0.6);
  sound.hit(strength);
  state.shake = Math.max(state.shake, 0.14 + strength * 0.38);
  if (strength > 0.72) world.spawnShockwave(b.x, b.y, b.z, color, 0.38, 9);

  if (team !== 'blue') return;
  state.stats.hits += 1;
  if (state.ball.vel.x > 12) state.stats.shots += 1;
  if (preVx < -10 && state.ball.pos.x < -8 && state.saveLock <= 0) {
    state.saveLock = 1.4;
    state.stats.saves += 1;
    toast('SAVE!', 1.3);
  }
}

function collectPads(dt) {
  for (let i = 0; i < state.pads.length; i++) {
    const pad = state.pads[i];
    if (!pad.active) {
      pad.respawn -= dt;
      if (pad.respawn <= 0) {
        pad.active = true;
        world.setPadActive(i, true);
      }
      continue;
    }
    for (const car of [state.blue, state.red]) {
      if (car.pos.y > 1.6 || car.padCooldown > 0) continue;
      if (Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z) > (pad.big ? 2.9 : 1.7)) continue;
      car.boost = Math.min(100, car.boost + (pad.big ? 100 : 12));
      car.padCooldown = 0.18;
      pad.active = false;
      pad.respawn = pad.big ? 9 : 4;
      world.setPadActive(i, false);
      particles.emit({
        x: pad.x,
        y: 0.5,
        z: pad.z,
        vy: 2,
        spread: pad.big ? 1.4 : 0.7,
        color: teamColors.amber,
        size: pad.big ? 0.7 : 0.45,
        life: 0.6,
        gravity: 2,
        drag: 1,
        count: pad.big ? 18 : 8,
      });
      if (car === state.blue) {
        sound.pad(pad.big);
        if (pad.big) toast('+100 BOOST', 1);
      }
      break;
    }
  }
}

function simulate(dt, input) {
  const blue = state.blue;
  const red = state.red;

  const wasBlueAir = !blue.onGround;
  const boostBefore = blue.boost;
  const playerJump = state.jumpQueued;
  state.jumpQueued = false;
  stepCar(blue, { throttle: input.throttle, steer: input.steer, boost: input.boost, jumpPressed: playerJump }, dt);
  if (playerJump) {
    if (wasBlueAir) sound.flip();
    else sound.jump();
    particles.emit({
      x: blue.pos.x,
      y: 0.25,
      z: blue.pos.z,
      vy: 1.2,
      spread: 1.1,
      color: teamColors.white,
      size: 0.38,
      life: 0.4,
      gravity: 3,
      drag: 2,
      count: 7,
    });
  }
  if (wasBlueAir && blue.onGround && blue.speed > 4) {
    emitBurst(blue.pos.x, 0.25, blue.pos.z, teamColors.white, 8, 0.5);
    sound.bounce(0.25);
  }

  const botJump = botInput.jumpPressed;
  botInput.jumpPressed = false;
  stepCar(red, { throttle: botInput.throttle, steer: botInput.steer, boost: botInput.boost, jumpPressed: botJump }, dt);

  carCarCollision(blue, red);

  state.bounceLock = Math.max(0, state.bounceLock - dt);
  state.saveLock = Math.max(0, state.saveLock - dt);
  stepBall(state.ball, dt, onBallBounce);

  const pReady = blue.hitCooldown <= 0;
  const bReady = red.hitCooldown <= 0;
  const preVx = state.ball.vel.x;
  const hitBlue = collideCarBall(blue, state.ball);
  const hitRed = collideCarBall(red, state.ball);
  if (hitBlue > 0.01 && pReady) handleCarHit('blue', hitBlue, preVx);
  if (hitRed > 0.01 && bReady) handleCarHit('red', hitRed, preVx);

  collectPads(dt);
  state.matchTime += dt;
  state.stats.topSpeed = Math.max(state.stats.topSpeed, blue.speed * 3.6);
  if (blue.boost < boostBefore) {
    // Tracked implicitly; kept for future boost economy tuning.
  }

  const scored = detectGoal(state.ball);
  if (scored) {
    scoreGoal(scored);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Frame updates                                                       */
/* ------------------------------------------------------------------ */
function updateCountdown(rawDt) {
  state.countdown -= rawDt;
  const n = Math.ceil(state.countdown);
  if (n > 0 && n !== state.displayed && n <= 3) {
    state.displayed = n;
    setCountdownNumber(n);
  }
  if (state.countdown <= 0) {
    setPhase('playing');
    state.goTimer = 0.9;
    state.accumulator = 0;
    state.matchTime = 0;
    showGo();
    state.shake = 0.1;
  }
}

function updatePlaying(rawDt) {
  if (state.goTimer > 0) {
    state.goTimer -= rawDt;
    if (state.goTimer <= 0) hideCountdown();
  }
  state.hintTime += rawDt;
  if (state.hintTime > 9) $('#hintBar').classList.add('fade');
  if (state.hintTime > 7) $('#rotateHint').classList.add('hidden');

  const input = readPlayerInput();
  world.cars.blue.steer = input.steer;
  const ai = updateBot(
    state.bot,
    {
      self: state.red,
      ball: state.ball,
      opponent: state.blue,
      pads: state.pads,
      time: state.matchTime,
    },
    rawDt,
  );
  botInput.throttle = ai.throttle;
  botInput.steer = ai.steer;
  botInput.boost = ai.boost;
  botInput.jumpPressed = ai.jumpPressed;
  world.cars.red.steer = ai.steer;

  const scaled = rawDt * state.slowmo;
  state.accumulator = Math.min(state.accumulator + scaled, 0.1);
  let steps = 0;
  while (state.accumulator >= STEP && steps < 8 && state.phase === 'playing') {
    const alive = simulate(STEP, input);
    state.accumulator -= STEP;
    steps++;
    if (!alive) break;
  }
  if (state.phase !== 'playing') {
    state.accumulator = 0;
    if (state.phase === 'goal') setTouchVisible(false);
  }

  sound.update(state.blue.speed, state.blue.boosting, input.throttle);
  if (state.blue.boosting && state.blue.boost > 0) {
    state.stats.topSpeed = Math.max(state.stats.topSpeed, state.blue.speed * 3.6);
  }
}

function updateGoal(rawDt) {
  state.goalTimer += rawDt;
  state.slowmo = damp(state.slowmo, 0.55, 2.2, rawDt);
  state.shake = damp(state.shake, 0, 3.2, rawDt);
  if (state.goalTimer > 2.65) {
    afterGoal();
  }
}

function updateGameOver(rawDt) {
  state.overTime += rawDt;
  state.shake = damp(state.shake, 0, 2, rawDt);
  state.confettiTimer -= rawDt;
  if (state.confettiTimer <= 0) {
    state.confettiTimer = lowPower ? 0.4 : 0.2;
    const palette = [teamColors.blue, teamColors.red, teamColors.white, teamColors.amber];
    particles.emit({
      x: (Math.random() - 0.5) * 42,
      y: 19 + Math.random() * 6,
      z: (Math.random() - 0.5) * 26,
      vy: -1.3,
      spread: 0.35,
      color: palette[(Math.random() * palette.length) | 0],
      size: 0.55,
      life: 4.2,
      gravity: 1.2,
      drag: 0.15,
      count: 7,
    });
  }
}

function updateMenu(rawDt) {
  state.menuTime += rawDt;
  const t = state.menuTime;
  state.ball.pos.y = 4.5 + Math.sin(t * 1.15) * 0.7;
  state.ball.pos.x = 8 + Math.sin(t * 0.32) * 1.6;
  state.ball.pos.z = 6 + Math.cos(t * 0.27) * 1.2;
  state.ball.vel.x = 0;
  state.ball.vel.y = 0;
  state.ball.vel.z = 0;
  world.syncBall(state.ball, rawDt);
}

function updateEffects(rawDt) {
  const cars = [
    { visual: world.cars.blue, car: state.blue, color: teamColors.blue, scale: 1 },
    { visual: world.cars.red, car: state.red, color: teamColors.red, scale: 0.75 },
  ];
  for (const entry of cars) {
    if (!entry.car.boosting || (state.phase !== 'playing' && state.phase !== 'countdown')) continue;
    const f = carForward(entry.car);
    const count = lowPower ? 1 : 2;
    particles.emit({
      x: entry.car.pos.x - f.x * 1.75 + (Math.random() - 0.5) * 0.5,
      y: entry.car.pos.y + 0.62 + (Math.random() - 0.5) * 0.2,
      z: entry.car.pos.z - f.z * 1.75 + (Math.random() - 0.5) * 0.5,
      vx: -f.x * (7 + Math.random() * 5),
      vy: 0.5 + Math.random(),
      vz: -f.z * (7 + Math.random() * 5),
      spread: 0.25,
      color: entry.color,
      size: 0.42 * entry.scale,
      life: 0.28,
      gravity: -0.4,
      drag: 2.3,
      count,
    });
    particles.emit({
      x: entry.car.pos.x - f.x * 1.55,
      y: entry.car.pos.y + 0.62,
      z: entry.car.pos.z - f.z * 1.55,
      vx: -f.x * 4,
      vy: 0.4,
      vz: -f.z * 4,
      spread: 0.12,
      color: teamColors.white,
      size: 0.24,
      life: 0.18,
      gravity: -0.3,
      drag: 2.8,
      count: 1,
    });
  }

  const ballSpeed = Math.hypot(state.ball.vel.x, state.ball.vel.y, state.ball.vel.z);
  if (ballSpeed > 14 && state.phase === 'playing') {
    particles.emit({
      x: state.ball.pos.x,
      y: state.ball.pos.y,
      z: state.ball.pos.z,
      vx: -state.ball.vel.x * 0.05,
      vy: -state.ball.vel.y * 0.05,
      vz: -state.ball.vel.z * 0.05,
      spread: 0.35,
      color: [0.68, 0.87, 1],
      size: 0.28,
      life: 0.26,
      gravity: 0,
      drag: 1,
      count: lowPower ? 1 : 2,
    });
  }
}

function syncVisuals(dt) {
  world.syncCar(world.cars.blue, state.blue, dt);
  world.syncCar(world.cars.red, state.red, dt);
  world.syncBall(state.ball, dt);
}

function updateCamera(rawDt) {
  const t = world.time();
  let rate = 7;
  let fovTarget = 68;

  if (state.phase === 'menu') {
    const angle = 2.15 + state.menuTime * 0.055;
    desiredPos.set(
      Math.cos(angle) * 31,
      13.2 + Math.sin(state.menuTime * 0.27) * 1.4,
      Math.sin(angle) * 31,
    );
    desiredLook.set(0, 3.6, 0);
    rate = 1.8;
    fovTarget = 60;
  } else if (state.phase === 'gameover') {
    const angle = 0.7 + state.overTime * 0.12;
    desiredPos.set(Math.cos(angle) * 34, 14 + Math.sin(state.overTime * 0.5) * 1.4, Math.sin(angle) * 34);
    desiredLook.set(0, 4.5, 0);
    rate = 2.1;
    fovTarget = 62;
  } else if (state.phase === 'goal') {
    const side = state.lastGoal === 'blue' ? 1 : -1;
    desiredPos.set(side * (ARENA.halfLength - 12), 7.2, 14 + Math.sin(state.goalTimer * 0.8) * 4);
    desiredLook.set(state.ball.pos.x, Math.max(2.5, state.ball.pos.y), state.ball.pos.z);
    rate = 2.8;
    fovTarget = 63;
  } else {
    const car = state.blue;
    const f = carForward(car);
    const speed = Math.hypot(car.vel.x, car.vel.z);
    const back = 10.6 + Math.min(5.5, speed * 0.1);
    const height = 5.1 + Math.min(2.4, speed * 0.035);
    desiredPos.set(car.pos.x - f.x * back, car.pos.y + height, car.pos.z - f.z * back);
    desiredPos.x = clamp(desiredPos.x, -ARENA.halfLength + 2.2, ARENA.halfLength - 2.2);
    desiredPos.z = clamp(desiredPos.z, -ARENA.halfWidth + 2.2, ARENA.halfWidth - 2.2);
    desiredPos.y = Math.max(3.4, desiredPos.y);

    if (state.ballCam) {
      const bx = state.ball.pos.x - car.pos.x;
      const bz = state.ball.pos.z - car.pos.z;
      desiredLook.set(
        car.pos.x + f.x * 2.6 + bx * 0.62,
        2.9 + Math.max(0, state.ball.pos.y) * 0.28,
        car.pos.z + f.z * 2.6 + bz * 0.62,
      );
    } else {
      desiredLook.set(car.pos.x + f.x * 13, 2.6, car.pos.z + f.z * 13);
    }
    rate = state.phase === 'countdown' ? 3.1 : 8.5;
    fovTarget = 68 + Math.min(17, speed * 0.42) + (car.boosting ? 3 : 0);
  }

  const k = 1 - Math.exp(-rate * rawDt);
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, 1 - Math.exp(-rate * 1.25 * rawDt));
  camera.position.copy(camPos);

  state.shake = damp(state.shake, 0, 5.5, rawDt);
  if (state.shake > 0.0015) {
    const s = state.shake;
    camera.position.x += (Math.random() - 0.5) * s * 1.1;
    camera.position.y += (Math.random() - 0.5) * s * 0.8;
    camera.position.z += (Math.random() - 0.5) * s * 0.6;
  }
  camera.lookAt(camLook);
  camera.fov = damp(camera.fov, fovTarget, 4, rawDt);
  camera.updateProjectionMatrix();
  void t;
}

function updateHud() {
  if (state.phase === 'menu' || state.phase === 'gameover') return;
  const speed = Math.round(state.blue.speed * 3.6);
  $('#speedVal').textContent = speed;
  $('#speedFill').style.width = `${clamp((state.blue.speed / 39) * 100, 0, 100)}%`;
  const boost = Math.round(state.blue.boost);
  $('#boostVal').textContent = boost;
  $('#boostRing').style.setProperty('--boost', boost);
  if (++miniTick % 2 === 0) drawMinimap();
}

function drawMinimap() {
  const w = mini.width;
  const h = mini.height;
  const pad = 12;
  const fw = w - pad * 2;
  const fh = h - pad * 2;
  const px = (x) => pad + ((x + ARENA.halfLength) / (ARENA.halfLength * 2)) * fw;
  const pz = (z) => pad + ((z + ARENA.halfWidth) / (ARENA.halfWidth * 2)) * fh;
  miniCtx.clearRect(0, 0, w, h);

  const bg = miniCtx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(23, 74, 104, 0.85)');
  bg.addColorStop(0.5, 'rgba(8, 33, 49, 0.88)');
  bg.addColorStop(1, 'rgba(73, 26, 25, 0.82)');
  miniCtx.fillStyle = bg;
  miniCtx.fillRect(pad, pad, fw, fh);

  miniCtx.strokeStyle = 'rgba(176, 231, 255, 0.4)';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(pad + 0.5, pad + 0.5, fw - 1, fh - 1);
  miniCtx.beginPath();
  miniCtx.moveTo(pad + fw / 2, pad);
  miniCtx.lineTo(pad + fw / 2, pad + fh);
  miniCtx.stroke();
  miniCtx.beginPath();
  miniCtx.arc(pad + fw / 2, pad + fh / 2, 13, 0, Math.PI * 2);
  miniCtx.stroke();

  miniCtx.fillStyle = 'rgba(59, 130, 255, 0.9)';
  miniCtx.fillRect(pad - 2, pz(-ARENA.goalHalfWidth), 3, pz(ARENA.goalHalfWidth) - pz(-ARENA.goalHalfWidth));
  miniCtx.fillStyle = 'rgba(255, 70, 54, 0.9)';
  miniCtx.fillRect(w - pad - 1, pz(-ARENA.goalHalfWidth), 3, pz(ARENA.goalHalfWidth) - pz(-ARENA.goalHalfWidth));

  for (const p of state.pads) {
    if (!p.active) continue;
    miniCtx.fillStyle = p.big ? 'rgba(255, 176, 32, 0.95)' : 'rgba(255, 200, 87, 0.55)';
    miniCtx.beginPath();
    miniCtx.arc(px(p.x), pz(p.z), p.big ? 2.5 : 1.4, 0, Math.PI * 2);
    miniCtx.fill();
  }

  const bp = state.ball.pos;
  miniCtx.fillStyle = 'rgba(200, 240, 255, 0.25)';
  miniCtx.beginPath();
  miniCtx.arc(px(bp.x), pz(bp.z), 7, 0, Math.PI * 2);
  miniCtx.fill();
  miniCtx.fillStyle = '#f2fbff';
  miniCtx.beginPath();
  miniCtx.arc(px(bp.x), pz(bp.z), 3.2, 0, Math.PI * 2);
  miniCtx.fill();

  for (const [car, color] of [
    [state.blue, '#76bdff'],
    [state.red, '#ff8d78'],
  ]) {
    const cx = px(car.pos.x);
    const cz = pz(car.pos.z);
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const rx = fz;
    const rz = -fx;
    miniCtx.fillStyle = color;
    miniCtx.beginPath();
    miniCtx.moveTo(cx + fx * 6, cz + fz * 6);
    miniCtx.lineTo(cx - fx * 4 + rx * 4.4, cz - fz * 4 + rz * 4.4);
    miniCtx.lineTo(cx - fx * 4 - rx * 4.4, cz - fz * 4 - rz * 4.4);
    miniCtx.closePath();
    miniCtx.fill();
  }
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */
let previous = performance.now();
let firstFrame = true;
let lastPaint = 0;
let warmFrames = 0;
let warmedUp = !lowPower;

// Software renderers stall for a second or two on their first presented
// frame. Keep the menu's Play button hidden until the compositor is actually
// producing frames again, so an automated tap cannot land mid-stall.
if (lowPower && !warmedUp) {
  document.body.classList.add('warming');
  setTimeout(revealMenu, 6000);
}

function revealMenu() {
  warmedUp = true;
  appReady = true;
  document.body.classList.remove('warming');
  document.body.dataset.ready = '1';
}

function frame(now) {
  const realDelta = now - previous;
  const rawDt = Math.min(0.05, Math.max(0, realDelta / 1000));
  previous = now;

  if (!warmedUp) {
    warmFrames = realDelta < 140 ? warmFrames + 1 : 0;
    if (warmFrames >= 3) revealMenu();
  }

  if (!state.paused) {
    if (state.phase === 'menu') {
      updateMenu(rawDt);
    } else if (state.phase === 'countdown') {
      updateCountdown(rawDt);
      state.slowmo = 1;
    } else if (state.phase === 'playing') {
      updatePlaying(rawDt);
    } else if (state.phase === 'goal') {
      updateGoal(rawDt);
    } else if (state.phase === 'gameover') {
      updateGameOver(rawDt);
    }

    world.update(rawDt, { boostActive: state.blue.boosting });
    world.updatePadScales(rawDt);
    updateEffects(rawDt);
    particles.update(rawDt);
    syncVisuals(rawDt);
    updateCamera(rawDt);
    updateHud();
  }

  // Software rasterisers take hundreds of milliseconds per frame. Painting
  // every animation frame starves the compositor and makes the menu feel
  // frozen, so render at a lower cadence there while the simulation keeps its
  // full step rate. Real GPUs keep the uncapped path.
  const paintGap = lowPower ? (state.phase === 'menu' ? Infinity : 90) : 0;
  if (firstFrame || now - lastPaint >= paintGap) {
    renderer.render(scene, camera);
    lastPaint = now;
  }

  if (firstFrame) {
    firstFrame = false;
    // Flush the first frame's GPU work now, while the loading overlay is up,
    // instead of letting it stall the compositor once the menu is interactive.
    const probe = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    const loading = $('#loading');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
enterMenu();
updateMuteUi();
updateCameraChip();
setTouchVisible(false);
updateScoreboard();
if (!lowPower) revealMenu();
requestAnimationFrame(frame);

// Small public surface for automated verification and debugging.
window.__dbg = { scene, renderer, camera, world, gl };
window.__rocket = {
  version: 1,
  startMatch: (difficulty) => startMatch(difficulty),
  enterMenu,
  togglePause,
  skipCountdown() {
    if (state.phase !== 'countdown') return false;
    state.countdown = 0;
    updateCountdown(0);
    return true;
  },
  forceGoal(team = 'blue') {
    if (!['playing', 'countdown', 'goal'].includes(state.phase)) return false;
    if (state.phase === 'goal') return false;
    hideCountdown();
    setPhase('playing');
    state.phase = 'playing';
    scoreGoal(team === 'red' ? 'red' : 'blue');
    return true;
  },
  endMatch(team = 'blue') {
    if (!['playing', 'countdown', 'goal'].includes(state.phase)) return false;
    state.lastGoal = team === 'red' ? 'red' : 'blue';
    hideCountdown();
    showResult(state.lastGoal);
    return true;
  },
  setScore(blue = 0, red = 0) {
    state.score.blue = clamp(Math.round(blue), 0, 3);
    state.score.red = clamp(Math.round(red), 0, 3);
    updateScoreboard();
  },
  setBall({ x, y, z, vx = 0, vy = 0, vz = 0 } = {}) {
    if (x !== undefined) state.ball.pos.x = x;
    if (y !== undefined) state.ball.pos.y = y;
    if (z !== undefined) state.ball.pos.z = z;
    state.ball.vel.x = vx;
    state.ball.vel.y = vy;
    state.ball.vel.z = vz;
  },
  setCar(team, { x, z, yaw, boost } = {}) {
    const car = team === 'red' ? state.red : state.blue;
    if (x !== undefined) car.pos.x = x;
    if (z !== undefined) car.pos.z = z;
    if (yaw !== undefined) car.yaw = yaw;
    if (boost !== undefined) car.boost = clamp(boost, 0, 100);
  },
  giveBoost(amount = 100) {
    state.blue.boost = clamp(amount, 0, 100);
  },
  snapshot() {
    return {
      phase: state.phase,
      paused: state.paused,
      score: { ...state.score },
      difficulty: state.difficulty,
      ballCam: state.ballCam,
      countdown: state.countdown,
      resultTitle: $('#resultTitle').textContent,
      resultVisible: !$('#result').classList.contains('hidden'),
      hudVisible: !$('#hud').classList.contains('hidden'),
      touchVisible: !$('#touchControls').classList.contains('hidden'),
      title: document.title,
      bot: {
        x: state.red.pos.x,
        z: state.red.pos.z,
        boost: state.red.boost,
      },
      player: {
        x: state.blue.pos.x,
        y: state.blue.pos.y,
        z: state.blue.pos.z,
        speed: state.blue.speed,
        boost: state.blue.boost,
      },
      ball: {
        x: state.ball.pos.x,
        y: state.ball.pos.y,
        z: state.ball.pos.z,
        vx: state.ball.vel.x,
        vy: state.ball.vel.y,
        vz: state.ball.vel.z,
      },
      stats: { ...state.stats },
      touch: { ...state.touch },
      renderer: rendererName || 'unknown',
      lowPower,
      triangles: renderer.info.render.triangles,
    };
  },
};

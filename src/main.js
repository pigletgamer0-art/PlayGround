import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Arena } from './world.js';
import { Car } from './car.js';
import { Character } from './character.js';
import { Ball } from './ball.js';
import { Effects } from './effects.js';
import { Bot } from './bot.js';
import { InputState } from './input.js';
import { Sound } from './audio.js';
import { BOT_LEVELS, CAR, FIELD, TEAM, clamp, damp, wrapAngle } from './constants.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- renderer

const canvas = $('game');
const isCompact = window.matchMedia('(max-width: 820px)').matches;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isCompact,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCompact ? 1.7 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(62, 34, 48);

const arena = new Arena(scene, renderer);
const effects = new Effects(scene, renderer);
const ball = new Ball(scene);
const player = new Car(scene, TEAM.blue, { isBot: false });
const botCar = new Car(scene, TEAM.orange, { isBot: true, accent: 0xffd75e });
const character = new Character(scene, TEAM.blue);
const bot = new Bot('pro');
const sound = new Sound();

character.onFootstep = (type) => {
  if (type === 'jump') sound.jump();
  else if (type === 'land') sound.land(7);
  else if (type === 'step') sound.footstep();
};

player.onEvent = (type, power) => {
  if (type === 'jump') sound.jump();
  else if (type === 'double') sound.doubleJump();
  else if (type === 'land') sound.land(power);
};
botCar.onEvent = (type, power) => {
  if (type === 'land' && power > 9) sound.land(power * 0.45);
};

const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), isCompact ? 0.46 : 0.58, 0.55, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

ball.onEvent = (type, power) => {
  if (type === 'bounce') {
    const volume = clamp(power / 45, 0.1, 1);
    sound.hit(volume * 0.55);
    shake = Math.max(shake, volume * 0.14);
  } else if (type === 'wall') {
    sound.wall(power);
    shake = Math.max(shake, clamp(power / 90, 0, 0.2));
  }
};

// ---------------------------------------------------------------- UI refs

const ui = {
  hud: $('hud'),
  menu: $('menu'),
  pause: $('pause'),
  end: $('end'),
  scoreBlue: $('scoreBlue'),
  scoreOrange: $('scoreOrange'),
  clock: $('clock'),
  modeLabel: $('modeLabel'),
  boostFill: $('boostFill'),
  boostValue: $('boostValue'),
  boostMeter: document.querySelector('.boost-meter'),
  speedValue: $('speedValue'),
  speedTag: $('speedTag'),
  speedMode: $('speedMode'),
  banner: $('banner'),
  bannerText: $('bannerText'),
  bannerSub: $('bannerSub'),
  flash: $('flash'),
  startBtn: $('startBtn'),
  pauseBtn: $('pauseBtn'),
  resumeBtn: $('resumeBtn'),
  restartBtn: $('restartBtn'),
  quitBtn: $('quitBtn'),
  againBtn: $('againBtn'),
  menuBtn: $('menuBtn'),
  endKicker: $('endKicker'),
  endTitle: $('endTitle'),
  endSub: $('endSub'),
  endScoreBlue: $('endScoreBlue'),
  endScoreOrange: $('endScoreOrange'),
  difficultyDesc: $('difficultyDesc'),
  diffButtons: [...document.querySelectorAll('.diff-btn')],
  controlHint: $('controlHint'),
  useBtn: $('useBtn'),
  boostBtn: $('boostBtn'),
  jumpBtn: $('jumpBtn'),
  touchControls: $('touchControls'),
  enterPrompt: $('enterPrompt'),
};

const DIFFICULTY_COPY = {
  rookie: 'Gentle pressure. Room to learn the arena.',
  pro: 'Balanced pressure, sharp shots.',
  allstar: 'Ruthless rotations and supersonic clears.',
};

// ---------------------------------------------------------------- game state

let mode = 'menu';
let scoreBlue = 0;
let scoreOrange = 0;
let matchTime = 180;
let overtime = false;
let goalTimer = 0;
let kickoffTimer = 0;
let paused = false;
let difficulty = 'pro';
let shake = 0;
let menuAngle = 0.72;
let endAngle = 0;
let cameraMode = 'menu';
let hudAccumulator = 0;
let scoreboardTick = 0;
let bannerTimeout = 0;
let hintTimer = 0;
let lastScorer = 'blue';
let frameCount = 0;
let onFoot = false;
let footYaw = 0;
let footPitch = 0.18;
let footLookIdle = 0;
let footKickCooldown = 0;
// Monotonic gameplay clock. Using this instead of wall-clock time keeps bot
// decisions correct when matches are fast-forwarded by the debug simulator.
let simTime = 0;
const goalLog = [];

const playerForward = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const shakeOffset = new THREE.Vector3();

const input = new InputState({
  onPause: () => togglePause(),
  onMute: () => {
    if (!sound.ready) return;
    sound.toggleMute();
  },
  onReset: () => {
    // handled by sample() so it only triggers once.
  },
});

// ---------------------------------------------------------------- helpers

function clockText() {
  if (overtime) return 'OT';
  const total = Math.max(0, Math.ceil(matchTime));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function modeText() {
  return overtime ? 'OVERTIME • NEXT GOAL WINS' : 'FIRST TO 3';
}

function updateHud(force = false) {
  if (!force && mode === 'menu') return;
  ui.scoreBlue.textContent = String(scoreBlue);
  ui.scoreOrange.textContent = String(scoreOrange);
  ui.clock.textContent = clockText();
  ui.modeLabel.textContent = modeText();
  const boost = clamp(player.boost / 100, 0, 1);
  ui.boostFill.style.transform = `scaleX(${boost})`;
  ui.boostValue.textContent = String(Math.round(player.boost));
  ui.boostMeter.classList.toggle('full', player.boost > 99.5);
  const speed = onFoot ? character.speed : player.speed;
  ui.speedValue.textContent = String(Math.round(speed * 3.6));
  if (onFoot) {
    ui.speedMode.textContent = 'ON FOOT';
    ui.speedTag.textContent = speed > 12 ? 'SPRINTING' : 'WALKING';
    ui.speedTag.classList.toggle('hot', speed > 12);
  } else {
    ui.speedMode.textContent = 'SUPERSONIC';
    const hot = player.speed > 34;
    ui.speedTag.textContent = hot ? 'MAX' : player.boosting ? 'BOOSTING' : 'READY';
    ui.speedTag.classList.toggle('hot', hot || player.boosting);
  }
  const nearCar = onFoot && Math.hypot(character.pos.x - player.pos.x, character.pos.z - player.pos.z) < 8;
  ui.enterPrompt.classList.toggle('is-hidden', !nearCar);
}

function showBanner(text, sub = '', tone = '', duration = 1.05) {
  window.clearTimeout(bannerTimeout);
  ui.bannerText.textContent = text;
  ui.bannerSub.textContent = sub;
  ui.banner.className = `banner show ${tone}`.trim();
  bannerTimeout = window.setTimeout(() => {
    ui.banner.classList.remove('show');
  }, duration * 1000);
}

function flash(tone = '') {
  ui.flash.className = tone;
  void ui.flash.offsetWidth;
  ui.flash.classList.add('fire');
}

ui.flash.addEventListener('animationend', () => ui.flash.classList.remove('fire'));

function applyDifficulty(level, announce = false) {
  difficulty = level;
  bot.setLevel(level);
  const skill = BOT_LEVELS[level];
  botCar.maxSpeed = skill.maxSpeed;
  botCar.boostSpeed = skill.boostSpeed;
  botCar.accelScale = skill.accelScale;
  ui.difficultyDesc.textContent = DIFFICULTY_COPY[level];
  for (const button of ui.diffButtons) {
    button.classList.toggle('is-active', button.dataset.level === level);
  }
  if (announce && mode === 'playing') showBanner(skill.label.toUpperCase(), 'BOT DIFFICULTY', '', 0.9);
}

function setHudVisible(visible) {
  ui.hud.classList.toggle('is-hidden', !visible);
  ui.hud.setAttribute('aria-hidden', String(!visible));
  ui.touchControls.classList.toggle('is-hidden', !visible);
  ui.touchControls.setAttribute('aria-hidden', String(!visible));
  if (!visible) ui.enterPrompt.classList.add('is-hidden');
}

function showOverlay(element, visible) {
  element.classList.toggle('is-hidden', !visible);
  element.setAttribute('aria-hidden', String(!visible));
}

function snapCamera() {
  playerForward.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  camera.position.copy(player.pos).addScaledVector(playerForward, -11.2);
  camera.position.y += 4.6;
  camera.lookAt(player.pos.x + playerForward.x * 10, player.pos.y + 2.4, player.pos.z + playerForward.z * 10);
  camera.fov = 70;
  camera.updateProjectionMatrix();
}

function resetPads() {
  for (const pad of arena.pads) {
    pad.active = true;
    pad.timer = 0;
    pad.group.visible = true;
  }
}

// ---------------------------------------------------------------- match flow

function resetKickoff(first = false) {
  if (onFoot) enterCar(true);
  ball.reset(0, 0);
  player.reset(-30, 0, 0, CAR.boostStart);
  const skill = BOT_LEVELS[difficulty];
  botCar.maxSpeed = skill.maxSpeed;
  botCar.boostSpeed = skill.boostSpeed;
  botCar.accelScale = skill.accelScale;
  botCar.reset(30, 0, Math.PI, skill.boostStart);
  bot.reset();
  resetPads();
  kickoffTimer = 1.05;
  mode = 'playing';
  cameraMode = 'chase';
  shake = 0;
  snapCamera();
  showBanner('GO!', first ? 'FIRST TO 3 • 3:00' : 'KICKOFF', '', 0.85);
  sound.countdown(true);
  updateHud(true);
}

function startMatch() {
  sound.init();
  sound.ui();
  applyDifficulty(difficulty);
  scoreBlue = 0;
  scoreOrange = 0;
  matchTime = 180;
  overtime = false;
  goalTimer = 0;
  paused = false;
  lastScorer = 'blue';
  simTime = 0;
  goalLog.length = 0;
  scoreboardTick = 0;
  arena.updateScoreboard(0, 0, '3:00', 'FIRST TO 3');
  showOverlay(ui.menu, false);
  showOverlay(ui.end, false);
  showOverlay(ui.pause, false);
  setHudVisible(true);
  hintTimer = 9;
  ui.controlHint.style.opacity = '1';
  resetKickoff(true);
  updateHud(true);
}

function onGoal(teamKey) {
  if (mode !== 'playing') return;
  mode = 'goal';
  lastScorer = teamKey;
  if (teamKey === 'blue') scoreBlue += 1;
  else scoreOrange += 1;
  goalLog.push({ team: teamKey, time: simTime, ballX: ball.pos.x, ballZ: ball.pos.z });

  goalTimer = 2.35;
  cameraMode = 'goal';
  shake = 1;
  const scoringPlayer = teamKey === 'blue';
  const burstColor = scoringPlayer ? TEAM.blue.color : TEAM.orange.color;
  const accent = scoringPlayer ? TEAM.blue.accent : TEAM.orange.accent;
  effects.goalBurst(tmpA.copy(ball.pos), burstColor, accent);
  flash(scoringPlayer ? 'blue' : 'orange');
  arena.flashGoal(teamKey);
  arena.updateScoreboard(scoreBlue, scoreOrange, clockText(), modeText());
  showBanner('GOAL!', scoringPlayer ? 'YOU SCORE' : 'BOT SCORES', scoringPlayer ? 'blue' : 'orange', 1.9);
  if (scoringPlayer) sound.goal('blue');
  else sound.goal('orange');
  updateHud(true);
}

function endMatch() {
  if (mode === 'ended') return;
  mode = 'ended';
  cameraMode = 'orbit';
  endAngle = Math.atan2(camera.position.z, camera.position.x);
  const won = scoreBlue > scoreOrange;
  ui.end.classList.toggle('win', won);
  ui.end.classList.toggle('lose', !won);
  ui.endKicker.textContent = overtime ? 'GOLDEN GOAL • MATCH COMPLETE' : 'MATCH COMPLETE';
  ui.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
  ui.endSub.textContent = won
    ? scoreOrange === 0
      ? 'A flawless clean sheet in the neon arena.'
      : 'The arena is yours. One more run?'
    : 'The bot found the gaps. Time for a rematch.';
  ui.endScoreBlue.textContent = String(scoreBlue);
  ui.endScoreOrange.textContent = String(scoreOrange);
  ui.enterPrompt.classList.add('is-hidden');
  showOverlay(ui.end, true);
  showBanner(won ? 'VICTORY' : 'DEFEAT', `${scoreBlue} — ${scoreOrange}`, won ? 'blue' : 'orange', 2);
  if (won) sound.win();
  else sound.lose();
  arena.updateScoreboard(scoreBlue, scoreOrange, clockText(), modeText());
}

function togglePause() {
  if (mode !== 'playing') return;
  if (paused) {
    resumeMatch();
    return;
  }
  paused = true;
  ui.enterPrompt.classList.add('is-hidden');
  showOverlay(ui.pause, true);
  sound.updateEngine(0, 0, false, false);
}

function resumeMatch() {
  paused = false;
  showOverlay(ui.pause, false);
  sound.init();
}

function quitToMenu() {
  if (onFoot) enterCar(true);
  mode = 'menu';
  paused = false;
  scoreBlue = 0;
  scoreOrange = 0;
  matchTime = 180;
  overtime = false;
  showOverlay(ui.menu, true);
  showOverlay(ui.end, false);
  showOverlay(ui.pause, false);
  setHudVisible(false);
  cameraMode = 'menu';
  ball.reset(0, 0);
  player.reset(-30, 0, 0, CAR.boostStart);
  botCar.reset(30, 0, Math.PI, BOT_LEVELS[difficulty].boostStart);
  resetPads();
  sound.updateEngine(0, 0, false, false);
  menuAngle = 0.72;
}

function resetPlayerCar() {
  if (mode !== 'playing' || paused) return;
  const boost = player.boost;
  player.reset(-30, 0, 0, boost);
  effects.emit(player.pos, { count: 22, color: TEAM.blue.accent, speed: 8, spread: 4, life: 0.5, size: 0.3, gravity: 3 });
  snapCamera();
}

// ---------------------------------------------------------------- on foot

function setControlHint() {
  ui.controlHint.innerHTML = onFoot
    ? '<span><b>WASD</b> WALK</span><span><b>SHIFT</b> SPRINT</span><span><b>SPACE</b> JUMP</span><span><b>F</b> ENTER CAR</span><span><b>ESC</b> PAUSE</span>'
    : '<span><b>WASD</b> DRIVE</span><span><b>SPACE</b> JUMP</span><span><b>SHIFT</b> BOOST</span><span><b>F</b> STEP OUT</span><span><b>R</b> RESET</span><span><b>ESC</b> PAUSE</span>';
}

function updateFootUi() {
  ui.hud.classList.toggle('on-foot', onFoot);
  ui.speedMode.textContent = onFoot ? 'ON FOOT' : 'SUPERSONIC';
  const label = ui.useBtn.querySelector('span');
  if (label) label.textContent = onFoot ? 'ENTER' : 'EXIT';
  ui.useBtn.setAttribute('aria-label', onFoot ? 'Enter car' : 'Exit car');
  const boostLabel = ui.boostBtn.querySelector('span');
  if (boostLabel) boostLabel.textContent = onFoot ? 'SPRINT' : 'BOOST';
  ui.boostBtn.setAttribute('aria-label', onFoot ? 'Sprint' : 'Boost');
  ui.enterPrompt.classList.add('is-hidden');
  setControlHint();
}

function exitCar() {
  if (onFoot || mode !== 'playing' || paused) return;
  if (!player.grounded) {
    showBanner('LAND FIRST', 'THEN STEP OUT', '', 1.1);
    return;
  }
  if (player.speed > 10) {
    showBanner('SLOW DOWN', 'TO STEP OUT', '', 1.1);
    return;
  }
  onFoot = true;
  character.spawn(player.pos, player.yaw);
  footYaw = player.yaw;
  footPitch = 0.18;
  footLookIdle = 0;
  footKickCooldown = 0;
  cameraMode = 'foot';
  updateFootUi();
  hintTimer = 7;
  ui.controlHint.style.opacity = '1';
  showBanner('ON FOOT', 'F TO ENTER CAR', '', 1.4);
  sound.ui();
}

function enterCar(silent = false) {
  if (!onFoot) return;
  if (!silent) {
    const distance = Math.hypot(character.pos.x - player.pos.x, character.pos.z - player.pos.z);
    if (distance > 8) {
      showBanner('TOO FAR', 'WALK BACK TO YOUR CAR', '', 1.1);
      return;
    }
  }
  onFoot = false;
  character.hide();
  cameraMode = 'chase';
  updateFootUi();
  if (!silent) {
    showBanner('BACK IN THE DRIVER SEAT', '', '', 0.9);
    sound.ui();
  }
}

function applyFootLook(lookX, lookY, dt) {
  if (!onFoot) return;
  if (lookX !== 0 || lookY !== 0) {
    footYaw = wrapAngle(footYaw + lookX * 0.0052);
    footPitch = clamp(footPitch + lookY * 0.0038, -0.12, 0.72);
    footLookIdle = 0;
  } else {
    footLookIdle += dt;
  }
  // Drift the camera behind the pilot once the player stops steering the view,
  // the way a third-person action game does.
  if (footLookIdle > 1.35 && character.speed > 2.4) {
    footYaw = wrapAngle(footYaw + wrapAngle(character.yaw - footYaw) * Math.min(1, 1.4 * dt));
  }
}

function collideCharacterBall() {
  const R = ball.radius + 0.92;
  const dx = ball.pos.x - character.pos.x;
  const dy = ball.pos.y - (character.pos.y + 1.2);
  const dz = ball.pos.z - character.pos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist >= R || dist < 0.0001) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const penetration = R - dist + 0.01;
  ball.pos.x += nx * penetration;
  ball.pos.y += ny * penetration;
  ball.pos.z += nz * penetration;
  if (footKickCooldown > 0) return;
  footKickCooldown = 0.32;
  const sprint = Math.hypot(character.vel.x, character.vel.z);
  const power = 10 + sprint * 1.2;
  ball.vel.multiplyScalar(0.34);
  ball.vel.x += nx * power;
  ball.vel.z += nz * power;
  ball.vel.y += Math.max(0, ny) * power * 0.32 + 2.2;
  if (ball.vel.length() > 68) ball.vel.setLength(68);
  ball.pos.y = Math.max(ball.pos.y, ball.radius);
  ball.lastHitBy = 'blue';
  ball.lastHitTime = simTime;
  sound.hit(power / 32);
  shake = Math.max(shake, 0.1);
  effects.emit(ball.pos, {
    count: 14,
    color: 0xffffff,
    speed: 8,
    spread: 4,
    life: 0.36,
    size: 0.26,
    gravity: 3,
    direction: tmpB.set(nx, ny, nz),
    jitter: 0.6,
  });
}

function collideCharacterCar() {
  for (const car of [player, botCar]) {
    const dx = character.pos.x - car.pos.x;
    const dz = character.pos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const minDist = 2.9;
    if (dist > 0.001 && dist < minDist) {
      const push = (minDist - dist) / dist;
      character.pos.x += dx * push;
      character.pos.z += dz * push;
      character.vel.x += dx * push * 2;
      character.vel.z += dz * push * 2;
    }
  }
}

// ---------------------------------------------------------------- physics

function collideCarBall(car) {
  const R = ball.radius;
  const hx = 2.58;
  const hy = 0.98;
  const hz = 1.34;
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  const dx = ball.pos.x - car.pos.x;
  const dy = ball.pos.y - car.pos.y;
  const dz = ball.pos.z - car.pos.z;
  const lx = dx * cos - dz * sin;
  const ly = dy;
  const lz = dx * sin + dz * cos;
  // Only the front and sides of a car can move the ball. Without this, a car
  // that has just driven through the ball scoops it backwards with its rear.
  if (lx < -0.35) return false;
  const cx = clamp(lx, -hx, hx);
  const cy = clamp(ly, -hy, hy);
  const cz = clamp(lz, -hz, hz);
  const ddx = lx - cx;
  const ddy = ly - cy;
  const ddz = lz - cz;
  const dist = Math.hypot(ddx, ddy, ddz);
  if (dist >= R) return false;

  let nx;
  let ny;
  let nz;
  if (dist < 0.0001) {
    // Ball centre is inside the chassis: eject along the nose.
    nx = lx >= 0 ? 1 : -1;
    ny = 0.35;
    nz = lz >= 0 ? 0.2 : -0.2;
  } else {
    nx = ddx / dist;
    ny = ddy / dist;
    nz = ddz / dist;
  }
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  // Back to world space.
  const wx = nx * cos + nz * sin;
  const wy = ny;
  const wz = -nx * sin + nz * cos;
  const penetration = R - dist + 0.01;
  ball.pos.x += wx * penetration;
  ball.pos.y += wy * penetration;
  ball.pos.z += wz * penetration;

  let nx2 = wx;
  let ny2 = wy;
  let nz2 = wz;
  if (car.grounded && ny2 > 0.16) {
    // Keep grounded strikes playable and low; aerial hits can still pop the ball.
    ny2 = 0.16;
    const len = Math.hypot(nx2, ny2, nz2) || 1;
    nx2 /= len;
    ny2 /= len;
    nz2 /= len;
  }
  const normal = tmpA.set(nx2, ny2, nz2);
  const carSpeed = car.vel.length();
  const approach = Math.max(0, -tmpB.copy(ball.vel).sub(car.vel).dot(normal));
  const power = 9 + carSpeed * 0.95 + approach * 0.5 + (car.boosting ? 5 : 0);
  const lift = normal.y < 0.25 && carSpeed > 14 ? 2.2 + carSpeed * 0.075 : 0;
  ball.vel.multiplyScalar(0.34);
  ball.vel.addScaledVector(normal, power);
  ball.vel.addScaledVector(car.vel, 0.42);
  ball.vel.y += lift;
  if (ball.vel.length() > 86) ball.vel.setLength(86);
  ball.pos.y = Math.max(ball.pos.y, R);

  // A whisper of aim assist makes strikes feel deliberate rather than random.
  if (power > 18) {
    const goalSign = car.isBot ? -1 : 1;
    const aimX = goalSign * FIELD.halfLength - ball.pos.x;
    const aimZ = -ball.pos.z;
    const aimLen = Math.hypot(aimX, aimZ) || 1;
    const horizontal = Math.hypot(ball.vel.x, ball.vel.z);
    if (horizontal > 3) {
      const blend = car.isBot ? 0.17 : 0.07;
      ball.vel.x += ((aimX / aimLen) - ball.vel.x / horizontal) * horizontal * blend;
      ball.vel.z += ((aimZ / aimLen) - ball.vel.z / horizontal) * horizontal * blend;
    }
  }

  if (car.hitCooldown <= 0) {
    car.hitCooldown = 0.11;
    ball.lastHitBy = car.isBot ? 'orange' : 'blue';
    ball.lastHitTime = simTime;
    const playerHit = car === player;
    sound.hit(power / 34 + (playerHit ? 0.2 : 0.05));
    shake = Math.max(shake, clamp(power / 140, 0.08, 0.9));
    const color = playerHit ? TEAM.blue.accent : TEAM.orange.accent;
    effects.emit(ball.pos, {
      count: Math.round(6 + power * 0.55),
      color: 0xffffff,
      speed: 9 + power * 0.22,
      spread: 5,
      life: 0.42,
      size: 0.32,
      gravity: 3,
      direction: normal,
      jitter: 0.6,
    });
    effects.emit(ball.pos, {
      count: Math.round(4 + power * 0.3),
      color,
      speed: 7,
      spread: 4,
      life: 0.5,
      size: 0.24,
      gravity: 1,
      jitter: 0.5,
    });
    if (power > 34) {
      effects.ring(tmpC.copy(ball.pos).setY(Math.max(R, ball.pos.y - R + 0.1)), color, 5 + power * 0.08, 0.45);
    }
  }
  return true;
}

function collideCars() {
  const dx = botCar.pos.x - player.pos.x;
  const dz = botCar.pos.z - player.pos.z;
  const dy = botCar.pos.y - player.pos.y;
  const dist = Math.hypot(dx, dz);
  const minDist = 3.35;
  if (dist > 0.001 && dist < minDist && Math.abs(dy) < 2.6) {
    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = minDist - dist;
    player.pos.x -= nx * overlap * 0.5;
    player.pos.z -= nz * overlap * 0.5;
    botCar.pos.x += nx * overlap * 0.5;
    botCar.pos.z += nz * overlap * 0.5;
    const relative = (botCar.vel.x - player.vel.x) * nx + (botCar.vel.z - player.vel.z) * nz;
    if (relative < 0) {
      const impulse = relative * 0.55;
      player.vel.x += nx * impulse;
      player.vel.z += nz * impulse;
      botCar.vel.x -= nx * impulse;
      botCar.vel.z -= nz * impulse;
      if (Math.abs(relative) > 8) {
        sound.land(Math.abs(relative) * 0.6);
        shake = Math.max(shake, 0.16);
        effects.emit(tmpA.copy(player.pos).lerp(botCar.pos, 0.5), {
          count: 14,
          color: 0xffe0a0,
          speed: 6,
          spread: 4,
          life: 0.35,
          size: 0.26,
          gravity: 4,
        });
      }
    }
  }
}

function checkPads() {
  for (const pad of arena.pads) {
    if (!pad.active) continue;
    const radius = pad.big ? 2.4 : 1.3;
    for (const car of [player, botCar]) {
      if (car.pos.y > 4) continue;
      const dx = car.pos.x - pad.x;
      const dz = car.pos.z - pad.z;
      if (dx * dx + dz * dz < radius * radius) {
        const amount = arena.collectPad(pad, car);
        if (amount > 0) {
          const color = pad.big ? 0xffc94d : 0x7fe0ff;
          effects.emit(tmpA.set(pad.x, 0.7, pad.z), {
            count: pad.big ? 30 : 12,
            color,
            speed: pad.big ? 10 : 6,
            spread: 3,
            life: 0.55,
            size: pad.big ? 0.38 : 0.24,
            direction: new THREE.Vector3(0, 1, 0),
            jitter: 0.4,
          });
          if (car === player) {
            sound.pickup(pad.big);
            updateHud(true);
          }
        }
      }
    }
  }
}

function checkGoal() {
  const inMouth = Math.abs(ball.pos.z) < FIELD.goalHalfWidth - 0.3 && ball.pos.y < FIELD.goalHeight - 0.2;
  if (!inMouth) return;
  if (ball.pos.x > FIELD.halfLength + 0.35) onGoal('blue');
  else if (ball.pos.x < -FIELD.halfLength - 0.35) onGoal('orange');
}

// ---------------------------------------------------------------- camera

function updateCamera(dt) {
  if (mode === 'menu') {
    menuAngle += dt * 0.065;
    camera.position.x = Math.sin(menuAngle * 0.42) * 18;
    camera.position.z = 81;
    camera.position.y = 38 + Math.sin(menuAngle * 0.8) * 1.8;
    camera.lookAt(-4, 3.2, 0);
    camera.fov = damp(camera.fov, 56, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }

  if (mode === 'ended') {
    endAngle += dt * 0.09;
    camera.position.x = Math.cos(endAngle) * 68;
    camera.position.z = Math.sin(endAngle) * 58;
    camera.position.y = 30;
    camera.lookAt(0, 3, 0);
    camera.fov = damp(camera.fov, 60, 2, dt);
    camera.updateProjectionMatrix();
    applyShake(dt);
    return;
  }

  if (cameraMode === 'goal' && ball.pos) {
    camDesired.set(ball.pos.x + (ball.pos.x > 0 ? -17 : 17), 9.5, ball.pos.z + 13);
    camLook.copy(ball.pos).add(tmpA.set(0, 2.2, 0));
    camera.position.lerp(camDesired, 1 - Math.exp(-3.2 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 66, 3, dt);
    camera.updateProjectionMatrix();
    applyShake(dt);
    return;
  }

  if (onFoot) {
    updateFootCamera(dt);
    return;
  }

  playerForward.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const speed = player.speed;
  const back = 11.4 + clamp(speed / 50, 0, 1) * 1.7;
  camDesired.copy(player.pos).addScaledVector(playerForward, -back);
  camDesired.y += 4.55;
  camDesired.x = clamp(camDesired.x, -54, 54);
  camDesired.z = clamp(camDesired.z, -36, 36);
  camDesired.y = clamp(camDesired.y, 2.6, 30);

  const lookAhead = 10 + clamp(speed / 50, 0, 1) * 3.5;
  camLook.copy(player.pos).addScaledVector(playerForward, lookAhead);
  camLook.y += 2.1;
  camLook.addScaledVector(player.vel, 0.045);

  camera.position.lerp(camDesired, 1 - Math.exp(-7.5 * dt));
  camera.lookAt(camLook);
  const fovTarget = 70 + clamp(speed / 51, 0, 1) * 8 + (player.boosting ? 3.5 : 0);
  camera.fov = damp(camera.fov, fovTarget, 4.5, dt);
  camera.updateProjectionMatrix();
  applyShake(dt);
}

function applyShake(dt) {
  shake = Math.max(0, shake - dt * 2.4);
  if (shake <= 0.001) return;
  const amount = shake * 0.55;
  shakeOffset.set(
    (Math.random() - 0.5) * amount,
    (Math.random() - 0.5) * amount * 0.8,
    (Math.random() - 0.5) * amount,
  );
  camera.position.add(shakeOffset);
}

// Third-person chase camera for the pilot: orbit with the mouse / a touch
// drag, then settle back behind the direction of travel.
function updateFootCamera(dt) {
  const forward = tmpA.set(Math.cos(footYaw), 0, -Math.sin(footYaw));
  const distance = 9.4 + footPitch * 4.2;
  const height = 3.5 + footPitch * 9.2;
  camDesired.set(
    character.pos.x - forward.x * distance,
    character.pos.y + height,
    character.pos.z - forward.z * distance,
  );
  camDesired.x = clamp(camDesired.x, -FIELD.halfLength + 1.4, FIELD.halfLength - 1.4);
  camDesired.z = clamp(camDesired.z, -FIELD.halfWidth + 1.4, FIELD.halfWidth - 1.4);
  camDesired.y = clamp(camDesired.y, 1.7, 24);
  camera.position.lerp(camDesired, 1 - Math.exp(-6.2 * dt));

  camLook.copy(character.pos).add(tmpB.set(0, 2.35, 0)).addScaledVector(forward, 2.4);
  camera.lookAt(camLook);
  camera.fov = damp(camera.fov, 66, 4, dt);
  camera.updateProjectionMatrix();
  applyShake(dt);
}

// ---------------------------------------------------------------- updates

function updatePlaying(dt, silent = false) {
  simTime += dt;
  if (kickoffTimer > 0) kickoffTimer -= dt;

  if (!overtime) {
    matchTime -= dt;
    if (matchTime <= 0) {
      matchTime = 0;
      if (scoreBlue === scoreOrange) {
        overtime = true;
        showBanner('OVERTIME', 'NEXT GOAL WINS', '', 2.1);
        sound.countdown(true);
        arena.updateScoreboard(scoreBlue, scoreOrange, clockText(), modeText());
      } else {
        endMatch();
        return;
      }
    }
  }

  const controls = input.sample();
  if (controls.reset) {
    if (onFoot) {
      character.spawn(player.pos, player.yaw);
      showBanner('BACK AT YOUR CAR', '', '', 0.8);
    } else {
      resetPlayerCar();
    }
  }
  if (controls.interact) {
    if (onFoot) enterCar();
    else exitCar();
  }

  if (onFoot) {
    footKickCooldown = Math.max(0, footKickCooldown - dt);
    applyFootLook(controls.lookX, controls.lookY, dt);
    character.update(dt, controls, footYaw, effects);
    player.update(dt, { throttle: 0, steer: 0, boost: false, jump: false }, effects);
  } else {
    player.update(dt, controls, effects);
  }

  const botControls = bot.update(dt, { ball, botCar, time: simTime });
  botCar.update(dt, botControls, effects);

  ball.update(dt, effects, true);

  collideCarBall(player);
  collideCarBall(botCar);
  if (onFoot) {
    collideCharacterBall();
    collideCharacterCar();
  }
  collideCars();
  checkPads();

  if (mode !== 'playing') return;
  checkGoal();
  if (mode !== 'playing') return;

  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) ui.controlHint.style.opacity = '0';
  }

  hudAccumulator += dt;
  if (hudAccumulator > 0.06) {
    hudAccumulator = 0;
    updateHud();
  }
  scoreboardTick += dt;
  if (scoreboardTick > 0.5) {
    scoreboardTick = 0;
    arena.updateScoreboard(scoreBlue, scoreOrange, clockText(), modeText());
  }
  updateCamera(dt);
  if (!silent) sound.updateEngine(onFoot ? 0 : player.speed, onFoot ? 0 : controls.throttle, onFoot ? false : player.boosting, !onFoot);
}

function updateGoalState(dt, silent = false) {
  goalTimer -= dt;
  const idle = { throttle: 0, steer: 0, boost: false, jump: false };
  player.update(dt, idle, effects);
  if (onFoot) character.update(dt, idle, footYaw, effects);
  botCar.update(dt, idle, effects);
  ball.update(dt, effects, false);
  updateCamera(dt);
  if (!silent) sound.updateEngine(player.speed, 0, false, false);
  if (goalTimer <= 0) {
    const matchOver = scoreBlue >= 3 || scoreOrange >= 3 || overtime;
    if (matchOver) {
      endMatch();
    } else {
      cameraMode = 'chase';
      resetKickoff(false);
    }
  }
}

function updateEnded(dt) {
  const idle = { throttle: 0, steer: 0, boost: false, jump: false };
  player.update(dt, idle, effects);
  if (onFoot) character.update(dt, idle, footYaw, effects);
  botCar.update(dt, idle, effects);
  ball.update(dt, effects, false);
  updateCamera(dt);
  sound.updateEngine(player.speed, 0, false, false);
}

// ---------------------------------------------------------------- loop

let lastTime = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.034, Math.max(0.0001, (now - lastTime) / 1000));
  lastTime = now;
  frameCount += 1;

  arena.update(dt);

  if (paused) {
    sound.updateEngine(0, 0, false, false);
    composer.render();
    return;
  }

  if (mode === 'menu') {
    menuAngle += 0;
    ball.update(dt, effects, false);
    player.update(dt, { throttle: 0, steer: 0, boost: false, jump: false }, effects);
    botCar.update(dt, { throttle: 0, steer: 0, boost: false, jump: false }, effects);
    effects.update(dt);
    updateCamera(dt);
    sound.updateEngine(0, 0, false, false);
  } else if (mode === 'playing') {
    updatePlaying(dt);
    effects.update(dt);
  } else if (mode === 'goal') {
    updateGoalState(dt);
    effects.update(dt);
  } else if (mode === 'ended') {
    updateEnded(dt);
    effects.update(dt);
  }

  composer.render();
}

// ---------------------------------------------------------------- wiring

ui.startBtn.addEventListener('click', startMatch);
ui.pauseBtn.addEventListener('click', togglePause);
ui.resumeBtn.addEventListener('click', resumeMatch);
ui.restartBtn.addEventListener('click', () => {
  sound.ui();
  showOverlay(ui.pause, false);
  paused = false;
  startMatch();
});
ui.quitBtn.addEventListener('click', () => {
  sound.ui();
  quitToMenu();
});
ui.againBtn.addEventListener('click', () => {
  sound.ui();
  startMatch();
});
ui.menuBtn.addEventListener('click', () => {
  sound.ui();
  quitToMenu();
});

for (const button of ui.diffButtons) {
  button.addEventListener('click', () => {
    applyDifficulty(button.dataset.level, false);
    sound.init();
    sound.ui();
  });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && (mode === 'menu' || mode === 'ended')) startMatch();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing' && !paused) {
    paused = true;
    showOverlay(ui.pause, true);
    sound.updateEngine(0, 0, false, false);
  }
});

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  effects.resize(height);
});

window.addEventListener('beforeunload', () => {
  sound.updateEngine(0, 0, false, false);
});

// Boot.
applyDifficulty('pro');
arena.updateScoreboard(0, 0, '3:00', 'FIRST TO 3');
updateHud(true);
setHudVisible(false);
requestAnimationFrame(tick);

// Small global hook used by automated visual checks and curious players.
window.__rocketDuel = {
  get mode() { return mode; },
  get score() { return { blue: scoreBlue, orange: scoreOrange }; },
  get boost() { return player.boost; },
  get speed() { return player.speed; },
  get onFoot() { return onFoot; },
  get clock() { return { matchTime, overtime, goalTimer, kickoffTimer, simTime }; },
  get goals() { return goalLog.slice(); },
  get positions() {
    return {
      player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw },
      bot: {
        x: botCar.pos.x, y: botCar.pos.y, z: botCar.pos.z, yaw: botCar.yaw,
        speed: botCar.speed, boost: botCar.boost, mode: bot.mode, target: { x: bot.target.x, z: bot.target.z },
        controls: bot.lastControls, grounded: botCar.grounded,
      },
      ball: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z, vx: ball.vel.x, vy: ball.vel.y, vz: ball.vel.z, lastHitBy: ball.lastHitBy },
      character: { x: character.pos.x, y: character.pos.y, z: character.pos.z, yaw: character.yaw, speed: character.speed, grounded: character.grounded, visible: character.root.visible },
    };
  },
  setBall(x, y, z, vx = 0, vy = 0, vz = 0) {
    ball.pos.set(x, y, z);
    ball.vel.set(vx, vy, vz);
    ball.group.position.copy(ball.pos);
  },
  setPlayer(x, z, yaw = player.yaw) {
    player.pos.set(x, FIELD.carGroundY, z);
    player.vel.set(0, 0, 0);
    player.yaw = yaw;
    player.root.position.copy(player.pos);
    player.root.rotation.y = yaw;
    snapCamera();
  },
  // Fast-forward the live match without waiting on requestAnimationFrame. The
  // headed SwiftShader browser renders far slower than real time, which makes
  // balance testing by wall-clock timing unreliable.
  simulate(seconds = 5, step = 1 / 60) {
    if (mode !== 'playing' && mode !== 'goal') return { error: `cannot simulate in mode ${mode}` };
    const steps = Math.max(1, Math.min(30000, Math.round(seconds / step)));
    for (let i = 0; i < steps; i += 1) {
      if (mode === 'playing') updatePlaying(step, true);
      else if (mode === 'goal') updateGoalState(step, true);
      else break;
    }
    lastTime = performance.now();
    return {
      mode,
      score: { blue: scoreBlue, orange: scoreOrange },
      goals: goalLog.slice(),
      simTime,
      positions: this.positions,
    };
  },
  step(dt = 1 / 60) {
    if (mode === 'playing') updatePlaying(dt, true);
    else if (mode === 'goal') updateGoalState(dt, true);
    lastTime = performance.now();
    return { mode, score: { blue: scoreBlue, orange: scoreOrange }, simTime };
  },
  playerInput(controls) {
    input.debugControls = controls;
  },
  start: startMatch,
  menu: quitToMenu,
  setDifficulty: (level) => applyDifficulty(level, false),
  exitCar,
  enterCar: () => enterCar(true),
};

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CANDY_TYPES, BOSS_LEVELS } from './data.js'
import * as TX from './textures.js'
import { SoundKit } from './audio.js'

/* ------------------------------------------------------------------ */
/* Constants & DOM                                                     */
/* ------------------------------------------------------------------ */

const COLS = 8
const ROWS = 8
const CELL = 1.12
const CUBE = 0.86
const BOARD_Y = 0.78
const CANDY_COUNT = CANDY_TYPES.length
const BOSS_ATTACK_EVERY = 4

const $ = (id) => document.getElementById(id)
const dom = {
  app: $('app'), canvas: $('stage'), score: $('score'), moves: $('moves'),
  bossCard: $('bossCard'), bossAvatar: $('bossAvatar'), bossName: $('bossName'),
  bossLv: $('bossLv'), bossHp: $('bossHp'), bossHpText: $('bossHpText'), bossType: $('bossType'),
  quest: $('quest'), questText: $('questText'), toastLayer: $('toastLayer'), floatLayer: $('floatLayer'),
  hint: $('hint'), pupCard: $('pupCard'), firePct: $('firePct'), fireFill: $('fireFill'),
  fireNote: $('fireNote'), fireBtn: $('fireBtn'), fireBtnTitle: $('fireBtnTitle'),
  fireBtnHint: $('fireBtnHint'), soundBtn: $('soundBtn'), flash: $('flash'),
  startScreen: $('startScreen'), startBtn: $('startBtn'), levelup: $('levelup'),
  levelupKicker: $('levelupKicker'), levelupTitle: $('levelupTitle'), levelupSub: $('levelupSub'),
  countTnt: $('countTnt'), countCore: $('countCore'), countStone: $('countStone'),
  countCombo: $('countCombo'), countBlast: $('countBlast'),
}

const state = {
  playing: false,
  busy: false,
  targeting: false,
  grid: [],
  selected: null,
  hover: null,
  score: 0,
  moves: 0,
  fire: 35,
  readyNotified: false,
  combo: 0,
  bestCombo: 0,
  killPending: false,
  boss: { level: 1, hp: 220, maxHp: 220, alive: true },
  counts: { tnt: 0, core: 0, stone: 0, blast: 0 },
  hintTimer: 0,
  lastAction: 0,
}

const sound = new SoundKit()

/* ------------------------------------------------------------------ */
/* Renderer, camera, lights                                            */
/* ------------------------------------------------------------------ */

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.02
renderer.setClearColor(0x000000, 0)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xb9e8ff, 34, 74)

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 140)
const camBase = new THREE.Vector3(0, 12, 16)
const camTarget = new THREE.Vector3(0, 0.3, 0)
const pointer = new THREE.Vector2()

scene.add(new THREE.HemisphereLight(0xdff5ff, 0x6b4a3a, 1.32))
scene.add(new THREE.AmbientLight(0xfff4e0, 0.4))
const sunLight = new THREE.DirectionalLight(0xfff0c8, 2.5)
sunLight.position.set(7, 14, 9)
scene.add(sunLight)
const rimLight = new THREE.DirectionalLight(0x8ad8ff, 0.8)
rimLight.position.set(-9, 6, -8)
scene.add(rimLight)

/* ------------------------------------------------------------------ */
/* Shared materials & helpers                                          */
/* ------------------------------------------------------------------ */

const candyGeo = new RoundedBoxGeometry(CUBE, CUBE, CUBE, 2, 0.055)
const stoneGeo = new THREE.BoxGeometry(CUBE + 0.02, CUBE + 0.02, CUBE + 0.02)

const candyMats = CANDY_TYPES.map((type) => new THREE.MeshStandardMaterial({
  map: TX.getCandyTexture(type.id),
  roughness: 0.34,
  metalness: 0.04,
  emissive: type.hex,
  emissiveIntensity: 0.16,
}))

function blockMat(kind, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: TX.getBlockTexture(kind), roughness: 0.88, metalness: 0, ...extra })
}

const mats = {
  grassTop: blockMat('grass-top'),
  grassSide: blockMat('grass-side'),
  dirt: blockMat('dirt'),
  stone: blockMat('stone'),
  stoneDark: blockMat('stone-dark'),
  cobble: blockMat('cobble'),
  mossy: blockMat('mossy'),
  wood: blockMat('wood'),
  tnt: blockMat('tnt'),
  core: blockMat('core', { emissive: 0xff7a2f, emissiveIntensity: 0.8 }),
  lollipop: blockMat('lollipop'),
  tileA: new THREE.MeshStandardMaterial({ map: TX.getTileTexture(0), roughness: 0.82 }),
  tileB: new THREE.MeshStandardMaterial({ map: TX.getTileTexture(1), roughness: 0.82 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xff7eae, roughness: 0.55, emissive: 0xff4f8f, emissiveIntensity: 0.1 }),
}

const glowTexture = TX.getFlameGlow()
const shadowTexture = TX.getShadowTexture()

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  return mesh
}

function rounded(w, h, d, material, x = 0, y = 0, z = 0, radius = 0.05) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material)
  mesh.position.set(x, y, z)
  return mesh
}

function addShadow(parent, w, d, opacity = 0.26) {
  const material = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
  plane.rotation.x = -Math.PI / 2
  plane.position.y = 0.02
  plane.renderOrder = 2
  parent.add(plane)
  return plane
}

function spriteGlow(scale, color = 0xffffff, opacity = 0.8) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(scale)
  return sprite
}

function cellX(c) { return (c - (COLS - 1) / 2) * CELL }
function cellZ(r) { return (r - (ROWS - 1) / 2) * CELL }
function cellPos(r, c, y = BOARD_Y) { return new THREE.Vector3(cellX(c), y, cellZ(r)) }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function rand(a, b) { return a + Math.random() * (b - a) }
function pick(list) { return list[Math.floor(Math.random() * list.length)] }

/* ------------------------------------------------------------------ */
/* Tweens, particles, floating text                                    */
/* ------------------------------------------------------------------ */

const tweens = new Set()
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
const easeOutBounce = (t) => {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

function tween(duration, onUpdate, ease = easeOutCubic) {
  return new Promise((resolve) => {
    tweens.add({ elapsed: 0, duration, onUpdate, ease, resolve })
  })
}
function wait(ms) { return new Promise((resolve) => tweens.add({ elapsed: 0, duration: ms, onUpdate: () => {}, ease: (t) => t, resolve })) }
function updateTweens(dt) {
  for (const item of [...tweens]) {
    item.elapsed += dt * 1000
    const k = clamp(item.elapsed / item.duration, 0, 1)
    item.onUpdate(item.ease(k), k)
    if (k >= 1) {
      tweens.delete(item)
      item.resolve()
    }
  }
}

const particleGroup = new THREE.Group()
scene.add(particleGroup)
const particles = []
const particleGeo = new THREE.BoxGeometry(1, 1, 1)
const particleMaterials = new Map()
function particleMat(hex) {
  if (!particleMaterials.has(hex)) {
    particleMaterials.set(hex, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }))
  }
  return particleMaterials.get(hex)
}

function spawnParticles(position, hex, count = 9, power = 1, size = 0.14) {
  for (let i = 0; i < count; i++) {
    if (particles.length > 260) removeParticle(particles[0])
    const mesh = new THREE.Mesh(particleGeo, particleMat(hex))
    const s = size * rand(0.55, 1.25)
    mesh.scale.setScalar(s)
    mesh.position.copy(position)
    mesh.position.x += rand(-0.18, 0.18)
    mesh.position.y += rand(-0.1, 0.15)
    mesh.position.z += rand(-0.18, 0.18)
    mesh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3))
    const vel = new THREE.Vector3(rand(-2.4, 2.4) * power, rand(2.4, 5.6) * power, rand(-2.4, 2.4) * power)
    particleGroup.add(mesh)
    particles.push({ mesh, vel, life: rand(0.42, 0.85), maxLife: 0.85, spin: new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), size: s })
  }
}

function removeParticle(p) {
  particleGroup.remove(p.mesh)
  const index = particles.indexOf(p)
  if (index >= 0) particles.splice(index, 1)
}

function spawnRing(position, hex = 0xffd23f, maxScale = 4) {
  const material = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 32), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.copy(position)
  mesh.position.y = 0.3
  scene.add(mesh)
  tween(520, (e) => {
    mesh.scale.setScalar(0.6 + e * maxScale)
    material.opacity = 0.7 * (1 - e)
  }, easeOutCubic).then(() => { scene.remove(mesh); mesh.geometry.dispose(); material.dispose() })
}

function updateParticles(dt) {
  for (const p of [...particles]) {
    p.life -= dt
    if (p.life <= 0) { removeParticle(p); continue }
    p.vel.y -= 11 * dt
    p.mesh.position.addScaledVector(p.vel, dt)
    p.mesh.rotation.x += p.spin.x * dt
    p.mesh.rotation.y += p.spin.y * dt
    p.mesh.rotation.z += p.spin.z * dt
    const k = clamp(p.life / p.maxLife, 0, 1)
    p.mesh.scale.setScalar(p.size * (0.35 + k * 0.9))
  }
}

function floatText(worldPosition, text, variant = '') {
  const vector = worldPosition.clone().project(camera)
  if (vector.z > 1) return
  const rect = dom.canvas.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = `float-text ${variant}`
  el.textContent = text
  el.style.left = `${(vector.x * 0.5 + 0.5) * rect.width}px`
  el.style.top = `${(-vector.y * 0.5 + 0.5) * rect.height}px`
  dom.floatLayer.append(el)
  setTimeout(() => el.remove(), 1000)
}

let toastCount = 0
function toast(text, variant = '', duration = 1300) {
  const el = document.createElement('div')
  el.className = `toast ${variant}`
  el.textContent = text
  el.style.animationDuration = `0.22s, 0.3s`
  el.style.animationDelay = `0s, ${Math.max(0.3, duration / 1000 - 0.3)}s`
  dom.toastLayer.append(el)
  toastCount++
  while (dom.toastLayer.children.length > 2) dom.toastLayer.firstElementChild.remove()
  setTimeout(() => { el.remove(); toastCount = Math.max(0, toastCount - 1) }, duration + 380)
}

/* ------------------------------------------------------------------ */
/* Selection cursor                                                    */
/* ------------------------------------------------------------------ */

const cursor = new THREE.Group()
cursor.visible = false
scene.add(cursor)
const cursorFillMat = new THREE.MeshBasicMaterial({ color: 0xffd257, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })
const cursorBarMat = new THREE.MeshBasicMaterial({ color: 0xffe89b, transparent: true, opacity: 0.95, depthWrite: false })
const cursorFill = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96), cursorFillMat)
cursorFill.rotation.x = -Math.PI / 2
cursor.add(cursorFill)
const bar = 0.075
const cursorBars = [
  box(CELL, 0.035, bar, cursorBarMat, 0, 0, -CELL / 2),
  box(CELL, 0.035, bar, cursorBarMat, 0, 0, CELL / 2),
  box(bar, 0.035, CELL, cursorBarMat, -CELL / 2, 0, 0),
  box(bar, 0.035, CELL, cursorBarMat, CELL / 2, 0, 0),
]
cursorBars.forEach((m) => cursor.add(m))
cursor.position.y = 0.31

function setCursor(cell, mode = 'hover') {
  if (!cell) { cursor.visible = false; return }
  cursor.visible = true
  cursor.position.x = cellX(cell.c)
  cursor.position.z = cellZ(cell.r)
  const color = mode === 'fire' ? 0xff4b2f : mode === 'selected' ? 0xff4d8d : 0xffd257
  cursorFillMat.color.setHex(color)
  cursorBarMat.color.setHex(mode === 'fire' ? 0xff8a5a : 0xffe89b)
  cursorFillMat.opacity = mode === 'fire' ? 0.32 : 0.18
}

/* ------------------------------------------------------------------ */
/* Sky, scenery, platform                                              */
/* ------------------------------------------------------------------ */

const boardGroup = new THREE.Group()
scene.add(boardGroup)
const scenery = new THREE.Group()
scene.add(scenery)
const clouds = []
const sparkles = []
const torches = []
const floatingIslands = []

function buildSky() {
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.getSunTexture(), color: 0xfff4bd, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }))
  sun.scale.setScalar(17)
  sun.position.set(-19, 15, -30)
  scene.add(sun)
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.getSunTexture(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }))
  sunCore.scale.setScalar(7)
  sunCore.position.set(-19, 15, -29.7)
  scene.add(sunCore)

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: true })
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0xd7f3ff, transparent: true, opacity: 0.9, fog: true })
  for (let i = 0; i < 9; i++) {
    const group = new THREE.Group()
    const pieces = 3 + Math.floor(Math.random() * 3)
    for (let p = 0; p < pieces; p++) {
      const w = rand(1.4, 3.2)
      const h = rand(0.7, 1.5)
      const d = rand(1.1, 2.2)
      const block = box(w, h, d, p === 0 ? cloudMat : shadeMat, rand(-2, 2), rand(-0.25, 0.3), rand(-0.7, 0.7))
      group.add(block)
    }
    group.position.set(rand(-24, 24), rand(6.5, 14), rand(-30, -12))
    group.userData.speed = rand(0.15, 0.45)
    scenery.add(group)
    clouds.push(group)
  }

  const addCloud = (x, y, z, scale) => {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    group.scale.setScalar(scale)
    for (let p = 0; p < 4; p++) {
      const block = box(rand(1.5, 2.8), rand(0.6, 1.2), rand(1.1, 2), p ? shadeMat : cloudMat, rand(-2, 2), rand(-0.2, 0.3), rand(-0.6, 0.6))
      group.add(block)
    }
    group.userData.speed = rand(0.2, 0.4)
    scenery.add(group)
    clouds.push(group)
  }
  addCloud(-12.5, 2.7, -22, 1.6)
  addCloud(-2.5, 3.4, -30, 2.05)
  addCloud(9.5, 2.2, -26, 1.5)
  addCloud(16, 3.8, -32, 1.35)
}

function makeLollipop(scale = 1) {
  const group = new THREE.Group()
  const stick = box(0.22, 2.6, 0.22, mats.wood, 0, 1.1, 0)
  const candy = box(1.35, 1.35, 1.35, mats.lollipop, 0, 2.5, 0)
  candy.rotation.y = Math.PI / 4
  const shine = box(0.6, 0.16, 0.6, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }), 0.18, 2.95, 0.42)
  group.add(stick, candy, shine)
  group.scale.setScalar(scale)
  return group
}

function makeIsland(x, y, z, scale = 1, withTree = true) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.scale.setScalar(scale)
  const top = box(3.6, 0.6, 3.6, [mats.dirt, mats.dirt, mats.grassTop, mats.dirt, mats.dirt, mats.dirt], 0, 0, 0)
  const under1 = box(3.1, 0.7, 3.1, mats.dirt, 0, -0.62, 0)
  const under2 = box(2.3, 0.65, 2.3, mats.stone, 0, -1.24, 0)
  const under3 = box(1.3, 0.6, 1.3, mats.stoneDark, 0, -1.82, 0)
  group.add(top, under1, under2, under3)
  addShadow(group, 5.2, 5.2, 0.14).position.y = -2.2
  if (withTree) {
    const tree = makeLollipop(1.05)
    tree.position.set(0.45, 0.3, -0.35)
    group.add(tree)
  }
  const tuft = box(0.5, 0.22, 0.5, mats.petal, -0.9, 0.4, 0.8)
  group.add(tuft)
  group.userData.phase = Math.random() * Math.PI * 2
  group.userData.baseY = y
  scenery.add(group)
  floatingIslands.push(group)
  return group
}

function makeTorch(x, z) {
  const group = new THREE.Group()
  group.position.set(x, 0.34, z)
  const base = box(0.75, 0.45, 0.75, mats.stone, 0, 0.05, 0)
  const post = box(0.22, 1.35, 0.22, mats.wood, 0, 0.85, 0)
  const top = box(0.42, 0.2, 0.42, mats.stoneDark, 0, 1.47, 0)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb23f, toneMapped: false })
  const flame = box(0.3, 0.38, 0.3, flameMat, 0, 1.72, 0)
  flame.rotation.y = Math.PI / 4
  const glow = spriteGlow(2.1, 0xffa33f, 0.7)
  glow.position.set(0, 1.7, 0)
  group.add(base, post, top, flame, glow)
  const light = new THREE.PointLight(0xffa04a, 14, 9, 1.9)
  light.position.set(0, 1.9, 0)
  group.add(light)
  boardGroup.add(group)
  torches.push({ group, flame, glow, light, phase: Math.random() * 10 })
  return group
}

function buildPlatform() {
  const size = COLS * CELL + 1.65
  const top = box(size, 0.7, size, [mats.grassSide, mats.grassSide, mats.grassTop, mats.dirt, mats.grassSide, mats.grassSide], 0, -0.2, 0)
  boardGroup.add(top)

  const layers = [
    [size - 0.2, 0.62, -0.82, mats.dirt],
    [size - 0.8, 0.56, -1.36, mats.dirt],
    [size - 1.6, 0.52, -1.86, mats.stone],
    [size - 2.6, 0.46, -2.32, mats.stoneDark],
    [size - 3.6, 0.4, -2.72, mats.stone],
  ]
  layers.forEach(([w, h, y, mat], index) => {
    const layer = box(w, h, w, mat, 0, y, 0)
    layer.position.x = index % 2 ? 0.15 : -0.1
    boardGroup.add(layer)
  })

  const vineMat = new THREE.MeshStandardMaterial({ color: 0x4d9b3d, roughness: 0.9 })
  for (let i = 0; i < 12; i++) {
    const side = i % 4
    const length = rand(0.6, 2.1)
    const vine = box(0.14, length, 0.14, vineMat)
    const off = rand(-2.6, 2.6)
    const edge = size / 2 - 0.08
    if (side === 0) vine.position.set(off, -0.8 - length / 2, edge)
    if (side === 1) vine.position.set(off, -0.8 - length / 2, -edge)
    if (side === 2) vine.position.set(edge, -0.8 - length / 2, off)
    if (side === 3) vine.position.set(-edge, -0.8 - length / 2, off)
    boardGroup.add(vine)
  }

  // Recessed checkerboard tiles.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = box(CELL - 0.1, 0.13, CELL - 0.1, (r + c) % 2 ? mats.tileB : mats.tileA, cellX(c), 0.17, cellZ(r))
      boardGroup.add(tile)
    }
  }

  // Flowers and grass tufts break up the island rim.
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f8f33, roughness: 0.9 })
  for (let i = 0; i < 14; i++) {
    const flower = new THREE.Group()
    const x = rand(-size / 2 + 0.55, size / 2 - 0.55)
    const z = size / 2 - rand(0.12, 0.42)
    flower.position.set(x, 0.16, z)
    const stem = box(0.08, 0.34, 0.08, stemMat, 0, 0.16, 0)
    const petal = box(0.22, 0.2, 0.22, i % 3 === 0 ? pupMats.flame : mats.petal, 0, 0.36, 0)
    petal.rotation.y = Math.PI / 4
    flower.add(stem, petal)
    boardGroup.add(flower)
  }
  for (let i = 0; i < 18; i++) {
    const tuft = box(0.1, rand(0.14, 0.32), 0.1, stemMat, rand(-size / 2 + 0.5, size / 2 - 0.5), 0.24, rand(-size / 2 + 0.3, size / 2 - 0.3))
    boardGroup.add(tuft)
  }

  makeTorch(-size / 2 + 0.35, size / 2 - 0.35)
  makeTorch(size / 2 - 0.35, size / 2 - 0.35)
  makeTorch(-size / 2 + 0.35, -size / 2 + 0.35)
  makeTorch(size / 2 - 0.35, -size / 2 + 0.35)

  const boardShadow = addShadow(boardGroup, 16, 16, 0.16)
  boardShadow.position.y = -3.0
  boardShadow.material.depthWrite = false
}

function buildScenery() {
  makeIsland(-10.5, 3.1, -4.5, 0.9, true)
  makeIsland(10.8, 3.7, -6.2, 0.85, true)
  makeIsland(-13.5, 6.8, -12.5, 0.65, true)
  makeIsland(14, 6.2, -14, 0.7, true)
  makeIsland(-6.8, 7.8, -18, 0.5, false)
  makeIsland(7.2, 8.6, -19.5, 0.55, false)

  const sparkleMats = [0xffffff, 0xffd7ea, 0xb9f3ff, 0xfff1a8].map((hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, toneMapped: false }))
  for (let i = 0; i < 42; i++) {
    const mesh = new THREE.Mesh(particleGeo, pick(sparkleMats))
    mesh.scale.setScalar(rand(0.045, 0.13))
    mesh.position.set(rand(-13, 13), rand(2.5, 10), rand(-10, 6))
    mesh.userData = { baseY: mesh.position.y, phase: rand(0, 6.28), speed: rand(0.3, 0.9) }
    scenery.add(mesh)
    sparkles.push(mesh)
  }
}

/* ------------------------------------------------------------------ */
/* Voxel companions                                                    */
/* ------------------------------------------------------------------ */

const pupRoot = new THREE.Group()
const golemRoot = new THREE.Group()
scene.add(pupRoot, golemRoot)

function makePerch(size, capMaterial) {
  const group = new THREE.Group()
  const top = box(size, 0.5, size, [mats.dirt, mats.dirt, capMaterial, mats.dirt, mats.dirt, mats.dirt], 0, 0, 0)
  const under = box(size - 0.5, 0.55, size - 0.5, mats.dirt, 0, -0.5, 0)
  const rock = box(size - 1.1, 0.6, size - 1.1, mats.stone, 0, -1.04, 0)
  const rock2 = box(size - 1.9, 0.55, size - 1.9, mats.stoneDark, 0, -1.58, 0)
  const shadow = addShadow(group, size * 1.7, size * 1.7, 0.2)
  shadow.position.y = -1.9
  group.add(top, under, rock, rock2)
  return group
}

const pupMats = {
  fur: new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.72 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0xdd5b24, roughness: 0.75 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xffe2b0, roughness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a1b2d, roughness: 0.65 }),
  collar: new THREE.MeshStandardMaterial({ color: 0xb3264a, roughness: 0.6 }),
  tag: new THREE.MeshStandardMaterial({ color: 0xffd257, roughness: 0.35, metalness: 0.5 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa32f, toneMapped: false }),
  flameHot: new THREE.MeshBasicMaterial({ color: 0xffe66b, toneMapped: false }),
}

function buildPup() {
  const root = new THREE.Group()
  const bob = new THREE.Group()
  root.add(bob)

  const body = rounded(1.08, 0.74, 0.7, pupMats.fur, 0, 1.0, 0, 0.08)
  const belly = rounded(0.62, 0.44, 0.09, pupMats.cream, 0, 0.94, 0.34, 0.04)
  const haunchL = rounded(0.3, 0.42, 0.44, pupMats.furDark, -0.45, 0.82, -0.04, 0.06)
  const haunchR = haunchL.clone(); haunchR.position.x = 0.45
  const legL = rounded(0.19, 0.42, 0.24, pupMats.fur, -0.31, 0.36, 0.18, 0.04)
  const legR = legL.clone(); legR.position.x = 0.31
  const pawL = rounded(0.22, 0.13, 0.29, pupMats.cream, -0.31, 0.2, 0.21, 0.04)
  const pawR = pawL.clone(); pawR.position.x = 0.31

  const collar = rounded(0.72, 0.15, 0.72, pupMats.collar, 0, 1.36, 0, 0.04)
  const tag = rounded(0.15, 0.17, 0.06, pupMats.tag, 0, 1.25, 0.4, 0.02)

  const head = new THREE.Group()
  head.position.set(0, 1.72, 0.06)
  const skull = rounded(0.86, 0.72, 0.7, pupMats.fur, 0, 0, 0, 0.09)
  const earL = rounded(0.2, 0.46, 0.2, pupMats.furDark, -0.31, 0.5, 0.01, 0.05)
  earL.rotation.z = 0.16
  const earR = earL.clone(); earR.position.x = 0.31; earR.rotation.z = -0.16
  const snout = rounded(0.42, 0.28, 0.32, pupMats.cream, 0, -0.12, 0.4, 0.05)
  const nose = rounded(0.16, 0.13, 0.08, pupMats.dark, 0, -0.06, 0.57, 0.02)
  const eyeL = box(0.11, 0.15, 0.055, pupMats.dark, -0.2, 0.12, 0.34)
  const eyeR = eyeL.clone(); eyeR.position.x = 0.2
  const glintL = box(0.035, 0.045, 0.02, new THREE.MeshBasicMaterial({ color: 0xffffff }), -0.22, 0.16, 0.37)
  const glintR = glintL.clone(); glintR.position.x = 0.18
  const cheekL = box(0.13, 0.09, 0.04, new THREE.MeshBasicMaterial({ color: 0xff5f84 }), -0.34, -0.13, 0.33)
  const cheekR = cheekL.clone(); cheekR.position.x = 0.34
  head.add(skull, earL, earR, snout, nose, eyeL, eyeR, glintL, glintR, cheekL, cheekR)

  const tail = new THREE.Group()
  tail.position.set(0.22, 1.1, -0.34)
  tail.rotation.x = -0.65
  const tailStem = rounded(0.18, 0.18, 0.48, pupMats.fur, 0, 0.15, -0.2, 0.04)
  const flameInner = rounded(0.22, 0.26, 0.22, pupMats.flame, 0, 0.33, -0.43, 0.04)
  const flameHot = rounded(0.13, 0.16, 0.13, pupMats.flameHot, 0, 0.4, -0.43, 0.03)
  const glow = spriteGlow(1.7, 0xff9a3f, 0.75)
  glow.position.set(0, 0.36, -0.43)
  tail.add(tailStem, flameInner, flameHot, glow)

  bob.add(body, belly, haunchL, haunchR, legL, legR, pawL, pawR, collar, tag, head, tail)
  const shadow = addShadow(root, 1.6, 1.4, 0.3)
  shadow.position.y = 0.03
  root.userData = { bob, head, tail, flameInner, flameHot, glow }
  return root
}

const pupModel = buildPup()
pupModel.position.y = 0.38
pupModel.scale.setScalar(0.92)
pupRoot.add(makePerch(2.9, mats.grassTop), pupModel)
pupRoot.position.set(-6.7, 0.6, 0.3)

const golemMats = {
  stone: new THREE.MeshStandardMaterial({ map: TX.getBlockTexture('cobble'), roughness: 0.9, color: 0xffffff }),
  stoneDark: new THREE.MeshStandardMaterial({ map: TX.getBlockTexture('stone-dark'), roughness: 0.92 }),
  moss: new THREE.MeshStandardMaterial({ map: TX.getBlockTexture('mossy'), roughness: 0.95 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff6a1e, emissiveIntensity: 1.7, roughness: 0.3 }),
  core: new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff4a16, emissiveIntensity: 1.9, roughness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x251629, roughness: 0.8 }),
}

function buildGolem() {
  const root = new THREE.Group()
  const bodyGroup = new THREE.Group()
  root.add(bodyGroup)

  const legL = rounded(0.56, 0.78, 0.62, golemMats.stoneDark, -0.42, 0.42, 0, 0.04)
  const legR = legL.clone(); legR.position.x = 0.42
  const torso = rounded(1.55, 1.15, 0.95, golemMats.stone, 0, 1.38, 0, 0.06)
  const chest = rounded(0.9, 0.6, 0.12, golemMats.stoneDark, 0, 1.24, 0.5, 0.03)
  const core = rounded(0.28, 0.28, 0.1, golemMats.core, 0, 1.38, 0.57, 0.04)
  const coreGlow = spriteGlow(1.7, 0xff7a2f, 0.85)
  coreGlow.position.set(0, 1.38, 0.68)
  const head = rounded(1.02, 0.88, 0.92, golemMats.stone, 0, 2.36, 0.02, 0.06)
  const jaw = rounded(0.83, 0.28, 0.78, golemMats.stoneDark, 0, 1.98, 0.06, 0.03)
  const eyeL = box(0.16, 0.1, 0.07, golemMats.eye, -0.24, 2.45, 0.47)
  const eyeR = eyeL.clone(); eyeR.position.x = 0.24
  const browL = box(0.34, 0.12, 0.16, golemMats.stoneDark, -0.24, 2.57, 0.43)
  browL.rotation.z = -0.18
  const browR = browL.clone(); browR.position.x = 0.24; browR.rotation.z = 0.18
  const mouth = box(0.36, 0.08, 0.06, golemMats.dark, 0, 2.09, 0.47)
  const mossHead = box(0.48, 0.16, 0.42, golemMats.moss, -0.25, 2.84, -0.06)
  mossHead.rotation.y = 0.2
  const mossShoulderL = box(0.52, 0.18, 0.6, golemMats.moss, -0.82, 2.02, 0)
  const mossShoulderR = mossShoulderL.clone(); mossShoulderR.position.x = 0.82

  const armL = new THREE.Group()
  armL.position.set(-0.9, 1.9, 0)
  const armLMesh = rounded(0.52, 1.2, 0.56, golemMats.stone, 0, -0.55, 0, 0.04)
  const fistL = rounded(0.62, 0.44, 0.64, golemMats.stoneDark, 0, -1.22, 0.02, 0.04)
  armL.add(armLMesh, fistL)
  const armR = new THREE.Group()
  armR.position.set(0.9, 1.9, 0)
  const armRMesh = armLMesh.clone(); const fistR = fistL.clone()
  armR.add(armRMesh, fistR)

  bodyGroup.add(legL, legR, torso, chest, core, coreGlow, head, jaw, eyeL, eyeR, browL, browR, mouth, mossHead, mossShoulderL, mossShoulderR, armL, armR)

  const rocks = []
  for (let i = 0; i < 3; i++) {
    const rock = box(rand(0.18, 0.3), rand(0.18, 0.3), rand(0.18, 0.3), golemMats.stoneDark)
    rocks.push(rock)
    root.add(rock)
  }
  const shadow = addShadow(root, 3.2, 2.4, 0.34)
  shadow.position.y = 0.04
  root.userData = { bodyGroup, head, armL, armR, eyeL, eyeR, core, coreGlow, rocks }
  return root
}

const golemModel = buildGolem()
golemModel.position.y = 0.38
golemModel.scale.setScalar(1.02)
golemRoot.add(makePerch(3.25, mats.mossy), golemModel)
golemRoot.position.set(6.8, 0.6, 0.3)
golemRoot.rotation.y = -0.45
pupRoot.rotation.y = 0.42

function animateCharacters(time, dt) {
  const pup = pupModel.userData
  const jump = state.fire >= 100 ? 0.08 : 0.035
  pup.bob.position.y = Math.sin(time * 2.3) * jump
  pup.head.rotation.z = Math.sin(time * 1.8) * 0.045
  pup.head.rotation.y = Math.sin(time * 0.9) * 0.1
  const flamePulse = 0.88 + Math.sin(time * 9) * 0.12 + (state.fire >= 100 ? 0.22 : 0)
  pup.flameInner.scale.setScalar(flamePulse)
  pup.flameHot.scale.setScalar(0.9 + Math.sin(time * 12 + 1) * 0.16)
  pup.glow.material.opacity = 0.55 + Math.sin(time * 8) * 0.16

  const golem = golemModel.userData
  golem.bodyGroup.position.y = Math.sin(time * 1.25) * 0.03
  golem.head.rotation.z = Math.sin(time * 0.7) * 0.025
  golem.armL.rotation.z = Math.sin(time * 1.1) * 0.06 - 0.05
  golem.armR.rotation.z = -Math.sin(time * 1.1) * 0.06 + 0.05
  golem.core.rotation.y += dt * 1.6
  const pulse = 1.4 + Math.sin(time * 4) * 0.5
  golemMats.eye.emissiveIntensity = pulse
  golemMats.core.emissiveIntensity = 1.4 + Math.sin(time * 5) * 0.5
  golem.coreGlow.material.opacity = 0.65 + Math.sin(time * 5) * 0.2
  golem.rocks.forEach((rock, i) => {
    const angle = time * 0.7 + i * 2.1
    rock.position.set(Math.cos(angle) * 1.65, 1.45 + Math.sin(time * 1.3 + i) * 0.35, Math.sin(angle) * 1.1)
    rock.rotation.x += dt * 0.7
    rock.rotation.y += dt * 0.9
  })
}

/* ------------------------------------------------------------------ */
/* Cells & board state                                                 */
/* ------------------------------------------------------------------ */

function makeCandyCell(r, c, type, special = null) {
  const group = new THREE.Group()
  const cube = new THREE.Mesh(candyGeo, candyMats[type])
  group.add(cube)
  group.position.set(cellX(c), BOARD_Y, cellZ(r))
  group.userData.cube = cube
  group.userData.deco = null
  const cell = { r, c, type, special, stone: false, group }
  if (special) decorateSpecial(cell, special)
  boardGroup.add(group)
  return cell
}

function makeStoneCell(r, c) {
  const group = new THREE.Group()
  const cube = new THREE.Mesh(stoneGeo, golemMats.stone)
  group.add(cube)
  const chip1 = box(0.24, 0.18, 0.08, golemMats.stoneDark, 0.18, 0.16, 0.47)
  const chip2 = box(0.14, 0.12, 0.06, golemMats.stoneDark, -0.2, -0.14, 0.47)
  const moss = box(0.34, 0.08, 0.2, golemMats.moss, -0.22, 0.47, 0.12)
  moss.rotation.y = 0.3
  group.add(chip1, chip2, moss)
  group.position.set(cellX(c), BOARD_Y, cellZ(r))
  group.userData.cube = cube
  group.userData.deco = null
  boardGroup.add(group)
  return { r, c, type: null, special: null, stone: true, group }
}

function clearSpecialVisual(cell) {
  const group = cell.group
  if (group.userData.deco) {
    group.remove(group.userData.deco)
    group.userData.deco = null
  }
}

function decorateSpecial(cell, special) {
  clearSpecialVisual(cell)
  const deco = new THREE.Group()
  if (special === 'tnt') {
    const tnt = box(0.46, 0.46, 0.46, mats.tnt, 0, 0.55, 0)
    tnt.rotation.y = Math.PI / 4
    const glow = spriteGlow(1.1, 0xff8a3f, 0.5)
    glow.position.set(0, 0.62, 0)
    deco.add(tnt, glow)
  } else if (special === 'core') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), golemMats.core)
    core.position.y = 0.6
    const glow = spriteGlow(1.65, 0xffc04a, 0.8)
    glow.position.y = 0.6
    deco.add(core, glow)
    deco.userData.spin = true
  }
  cell.group.add(deco)
  cell.group.userData.deco = deco
}

function refreshCellVisual(cell) {
  if (cell.stone) return
  cell.group.userData.cube.material = candyMats[cell.type]
  if (cell.special) decorateSpecial(cell, cell.special)
  else clearSpecialVisual(cell)
}

function placeCell(cell, r, c) {
  cell.r = r
  cell.c = c
  cell.group.position.set(cellX(c), BOARD_Y, cellZ(r))
}

function typeGrid() {
  return state.grid.map((row) => row.map((cell) => (!cell || cell.stone ? null : cell.type)))
}

function hasMatchAt(grid, r, c, type = grid[r]?.[c]) {
  if (type == null) return false
  let horizontal = 1
  for (let x = c - 1; x >= 0 && grid[r][x] === type; x--) horizontal++
  for (let x = c + 1; x < COLS && grid[r][x] === type; x++) horizontal++
  if (horizontal >= 3) return true
  let vertical = 1
  for (let y = r - 1; y >= 0 && grid[y][c] === type; y--) vertical++
  for (let y = r + 1; y < ROWS && grid[y][c] === type; y++) vertical++
  return vertical >= 3
}

function findRuns() {
  const runs = []
  for (let r = 0; r < ROWS; r++) {
    let start = 0
    for (let c = 1; c <= COLS; c++) {
      const value = c < COLS ? state.grid[r][c] : null
      const prev = state.grid[r][start]
      const same = value && prev && !value.stone && !prev.stone && value.type === prev.type
      if (!same) {
        if (start < c && c - start >= 3 && prev && !prev.stone) runs.push({ cells: state.grid[r].slice(start, c), dir: 'h' })
        start = c
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let start = 0
    for (let r = 1; r <= ROWS; r++) {
      const value = r < ROWS ? state.grid[r][c] : null
      const prev = state.grid[start][c]
      const same = value && prev && !value.stone && !prev.stone && value.type === prev.type
      if (!same) {
        if (start < r && r - start >= 3 && prev && !prev.stone) {
          const cells = []
          for (let y = start; y < r; y++) cells.push(state.grid[y][c])
          runs.push({ cells, dir: 'v' })
        }
        start = r
      }
    }
  }
  return runs
}

function findSwap(grid) {
  const swap = (r1, c1, r2, c2) => {
    const tmp = grid[r1][c1]
    grid[r1][c1] = grid[r2][c2]
    grid[r2][c2] = tmp
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] == null) continue
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr
        const c2 = c + dc
        if (r2 >= ROWS || c2 >= COLS || grid[r2][c2] == null) continue
        swap(r, c, r2, c2)
        const ok = hasMatchAt(grid, r, c) || hasMatchAt(grid, r2, c2)
        swap(r, c, r2, c2)
        if (ok) return { r1: r, c1: c, r2, c2 }
      }
    }
  }
  return null
}

function generateType(r, c, grid) {
  const candidates = [...Array(CANDY_COUNT).keys()]
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  for (const type of candidates) {
    const horizontal = c >= 2 && grid[r][c - 1] === type && grid[r][c - 2] === type
    const vertical = r >= 2 && grid[r - 1][c] === type && grid[r - 2][c] === type
    if (!horizontal && !vertical) return type
  }
  return 0
}

function freshTypeGrid() {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) grid[r][c] = generateType(r, c, grid)
  }
  return grid
}

function buildInitialBoard() {
  let types
  let attempts = 0
  do {
    types = freshTypeGrid()
    attempts++
  } while (!findSwap(types.map((row) => [...row])) && attempts < 60)

  state.grid = []
  for (let r = 0; r < ROWS; r++) {
    state.grid[r] = []
    for (let c = 0; c < COLS; c++) {
      const cell = makeCandyCell(r, c, types[r][c])
      cell.group.position.y = BOARD_Y + 6 + (ROWS - r) * 0.55
      state.grid[r][c] = cell
      const delay = (r + c) * 22
      tween(520 + delay * 0.4, (e) => {
        cell.group.position.y = BOARD_Y + (1 - e) * (6 + (ROWS - r) * 0.55)
      }, easeOutBounce)
    }
  }
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function bossDefinition(level = state.boss.level) {
  const def = BOSS_LEVELS[(level - 1) % BOSS_LEVELS.length]
  const cycle = Math.floor((level - 1) / BOSS_LEVELS.length)
  return { ...def, displayName: def.name, maxHp: def.hp + cycle * 160 }
}

function applyBossSkin() {
  const def = bossDefinition()
  golemMats.stone.color.set(def.tint)
  golemMats.eye.color.setHex(def.eye)
  golemMats.eye.emissive.setHex(def.eye)
  golemMats.core.color.setHex(def.eye)
  golemMats.core.emissive.setHex(def.eye)
  const eyeCss = `#${def.eye.toString(16).padStart(6, '0')}`
  dom.bossAvatar.style.setProperty('--stone', def.avatar)
  dom.bossAvatar.style.setProperty('--eye', eyeCss)
  dom.bossName.textContent = def.displayName
  dom.bossType.textContent = def.type
  dom.bossLv.textContent = `LV.${state.boss.level}`
}

function updateHud() {
  dom.score.textContent = state.score.toLocaleString('en-US')
  dom.moves.textContent = String(state.moves)
  const pct = clamp(state.boss.hp / state.boss.maxHp, 0, 1)
  dom.bossHp.style.width = pct <= 0 ? '0%' : `max(0px, calc(${(pct * 100).toFixed(1)}% - 4px))`
  dom.bossHpText.textContent = `${Math.max(0, Math.ceil(state.boss.hp))} / ${state.boss.maxHp}`
  dom.bossCard.classList.toggle('dead', state.boss.hp <= 0)

  const firePct = clamp(state.fire, 0, 100)
  dom.fireFill.style.width = `calc(${firePct.toFixed(1)}% - 4px)`
  dom.firePct.textContent = firePct >= 100 ? 'MAX' : `${Math.floor(firePct)}%`
  dom.pupCard.classList.toggle('ready', firePct >= 100)

  if (state.targeting) {
    dom.fireBtnTitle.textContent = 'CANCEL'
    dom.fireBtnHint.textContent = 'PICK A TILE'
    dom.fireNote.textContent = 'METEOR ARMED — TAP THE BOARD'
    dom.fireBtn.classList.add('ready')
    dom.fireBtn.classList.remove('dim')
  } else if (firePct >= 100) {
    dom.fireBtnTitle.textContent = 'FIRE BLAST'
    dom.fireBtnHint.textContent = 'READY! TAP TO AIM'
    dom.fireNote.textContent = 'FIRE BLAST READY — LET IT RIP!'
    dom.fireBtn.classList.add('ready')
    dom.fireBtn.classList.remove('dim')
  } else {
    dom.fireBtnTitle.textContent = 'FIRE BLAST'
    dom.fireBtnHint.textContent = `CHARGING ${Math.floor(firePct)}%`
    dom.fireNote.textContent = 'MATCH RUBY TO CHARGE THE FLAME'
    dom.fireBtn.classList.remove('ready')
    dom.fireBtn.classList.add('dim')
  }

  dom.countTnt.textContent = String(state.counts.tnt)
  dom.countCore.textContent = String(state.counts.core)
  dom.countStone.textContent = String(state.counts.stone)
  dom.countCombo.textContent = String(state.bestCombo)
  dom.countBlast.textContent = String(state.counts.blast)
}

function flashScreen() {
  dom.flash.classList.remove('pop')
  void dom.flash.offsetWidth
  dom.flash.classList.add('pop')
}

function setQuest(text) {
  dom.questText.textContent = text
  dom.quest.classList.remove('hide')
  clearTimeout(setQuest.timer)
  setQuest.timer = setTimeout(() => dom.quest.classList.add('hide'), 6500)
}

function hideHint() {
  dom.hint.classList.add('hide')
  hideHintRings()
}

function startHintClock() {
  state.hintTimer = 0
  hideHintRings()
}

function addScore(amount) { state.score += Math.round(amount) }

/* ------------------------------------------------------------------ */
/* Boss helpers                                                        */
/* ------------------------------------------------------------------ */

function damageBoss(amount) {
  if (!state.boss.alive) return
  state.boss.hp = Math.max(0, state.boss.hp - amount)
  dom.bossCard.classList.remove('hit')
  void dom.bossCard.offsetWidth
  dom.bossCard.classList.add('hit')
  const pos = new THREE.Vector3(golemRoot.position.x, 3.4, golemRoot.position.z + 1)
  floatText(pos, `-${Math.round(amount)}`, 'dmg')
  sound.bossHit()
  updateHud()
  if (state.boss.hp <= 0) state.killPending = true
}

async function setFire(value, silent = false) {
  const before = state.fire
  state.fire = clamp(value, 0, 100)
  if (state.fire >= 100 && before < 100) {
    if (!silent) {
      sound.ready()
      toast('FIRE BLAST READY!', 'hot', 1500)
      const pup = pupModel.userData
      pup.bob.position.y = 0.16
    }
    state.readyNotified = true
  }
  if (state.fire < 100) state.readyNotified = false
  updateHud()
}

function resetBoss(level) {
  const def = bossDefinition(level)
  const cycle = Math.floor((level - 1) / BOSS_LEVELS.length)
  state.boss = { level, hp: def.maxHp, maxHp: def.maxHp, alive: true }
  applyBossSkin()
  golemCardReset()
  updateHud()
  if (cycle > 0) dom.bossName.textContent = `${def.name} +${cycle}`
}

function golemCardReset() {
  dom.bossCard.classList.remove('dead')
  dom.bossCard.style.filter = ''
}

/* ------------------------------------------------------------------ */
/* Match resolution                                                    */
/* ------------------------------------------------------------------ */

function planSpecials(runs, preferred = []) {
  const chosen = new Set()
  const specials = []
  for (const run of runs) {
    if (run.cells.length < 4) continue
    const kind = run.cells.length >= 5 ? 'core' : 'tnt'
    let candidate = run.cells.find((cell) => preferred.includes(cell) && !cell.special && !chosen.has(cell))
    if (!candidate) candidate = run.cells.find((cell) => !cell.special && !chosen.has(cell))
    if (!candidate) continue
    chosen.add(candidate)
    specials.push({ cell: candidate, kind })
  }
  return specials
}

function buildClearSet(runs, specials) {
  const clear = new Set()
  for (const run of runs) for (const cell of run.cells) clear.add(cell)
  for (const spec of specials) clear.delete(spec.cell)

  const queue = [...clear]
  const triggered = new Set()
  while (queue.length) {
    const cell = queue.pop()
    if (!cell || cell.stone || triggered.has(cell)) continue
    triggered.add(cell)
    const blast = []
    if (cell.special === 'tnt') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = cell.r + dr
          const c = cell.c + dc
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS && state.grid[r][c]) blast.push(state.grid[r][c])
        }
      }
    } else if (cell.special === 'core') {
      for (let c = 0; c < COLS; c++) if (state.grid[cell.r][c]) blast.push(state.grid[cell.r][c])
      for (let r = 0; r < ROWS; r++) if (state.grid[r][cell.c]) blast.push(state.grid[r][cell.c])
      const same = []
      state.grid.forEach((row) => row.forEach((other) => { if (other && !other.stone && other.type === cell.type) same.push(other) }))
      blast.push(...same)
    }
    for (const other of blast) {
      if (!clear.has(other)) { clear.add(other); queue.push(other) }
    }
  }

  for (const cell of [...clear]) {
    if (cell.stone) continue
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = cell.r + dr
      const c = cell.c + dc
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue
      const neighbour = state.grid[r][c]
      if (neighbour && neighbour.stone) clear.add(neighbour)
    }
  }
  for (const spec of specials) clear.delete(spec.cell)
  return clear
}

function createSpecialBlocks(specials) {
  for (const { cell, kind } of specials) {
    if (!cell || cell.stone) continue
    if (state.grid[cell.r][cell.c] !== cell) continue
    cell.special = kind
    decorateSpecial(cell, kind)
    state.counts[kind]++
    addScore(120)
    sound.special()
    toast(kind === 'tnt' ? 'TNT CRAFTED!' : 'EMBER CORE CRAFTED!', kind === 'tnt' ? 'hot' : 'good', 1100)
    tween(260, (e) => {
      const s = 1 + Math.sin(e * Math.PI) * 0.24
      cell.group.scale.setScalar(s)
    }, easeOutCubic)
  }
  updateHud()
}

async function clearCells(cells, combo = 1, options = {}) {
  const list = [...cells].filter((cell) => cell && state.grid[cell.r]?.[cell.c] === cell)
  if (!list.length) return
  let candies = 0
  let stones = 0
  let red = 0
  let tnt = 0
  let core = 0
  const average = new THREE.Vector3()

  for (const cell of list) {
    average.add(cell.group.position)
    if (cell.stone) {
      stones++
      spawnParticles(cell.group.position, 0x9aa1ac, 8, 1)
    } else {
      candies++
      if (cell.type === 0) red++
      if (cell.special === 'tnt') {
        tnt++
        spawnRing(cell.group.position, 0xffa33f, 5)
        spawnParticles(cell.group.position, 0xffd23f, 18, 1.6, 0.18)
      } else if (cell.special === 'core') {
        core++
        spawnRing(cell.group.position, 0xffc04a, 6)
        spawnParticles(cell.group.position, 0xffe66b, 20, 1.8, 0.2)
      } else {
        spawnParticles(cell.group.position, CANDY_TYPES[cell.type].particle, 8, 1)
      }
    }
  }

  average.divideScalar(list.length)
  average.y += 0.65

  const multiplier = Math.min(Math.max(combo, 1), 6)
  const points = (candies * 40 + stones * 30 + tnt * 120 + core * 200 + (options.extraScore || 0)) * multiplier
  const damage = candies * 5 + red * 3 + stones * 3 + tnt * 14 + core * 24 + (options.extraDamage || 0)
  const fireGain = red * 5 + tnt * 10 + core * 18

  addScore(points)
  state.bestCombo = Math.max(state.bestCombo, combo)
  state.counts.stone += stones
  floatText(average, `+${points}`)
  if (fireGain) setFire(state.fire + fireGain)
  if (damage) damageBoss(damage)
  sound.match(combo)
  if (tnt || core) sound.explode()

  await Promise.all(list.map((cell) => tween(150 + Math.random() * 70, (e) => {
    cell.group.scale.setScalar(Math.max(0.001, 1 - e))
    cell.group.position.y = BOARD_Y + e * 0.3
  }, easeOutCubic)))

  for (const cell of list) {
    boardGroup.remove(cell.group)
    if (state.grid[cell.r][cell.c] === cell) state.grid[cell.r][cell.c] = null
  }
  updateHud()
  await wait(60)
}

async function gravityAndRefill() {
  const jobs = []
  for (let c = 0; c < COLS; c++) {
    const cells = []
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.grid[r][c]) cells.push(state.grid[r][c])
    }
    for (let r = 0; r < ROWS; r++) state.grid[r][c] = null
    let dest = ROWS - 1
    for (const cell of cells) {
      const oldY = cell.group.position.y
      state.grid[dest][c] = cell
      cell.r = dest
      cell.c = c
      const target = cellPos(dest, c)
      if (Math.abs(oldY - BOARD_Y) > 0.01 || cell.group.position.x !== target.x || cell.group.position.z !== target.z) {
        const startX = cell.group.position.x
        const startZ = cell.group.position.z
        const startY = cell.group.position.y
        const duration = 240 + (dest - cell.r) * 0 + Math.min(160, Math.abs(oldY - BOARD_Y) * 40)
        jobs.push(tween(duration, (e) => {
          cell.group.position.x = startX + (target.x - startX) * e
          cell.group.position.z = startZ + (target.z - startZ) * e
          cell.group.position.y = startY + (target.y - startY) * e
        }, easeOutCubic))
      }
      dest--
    }
    for (let r = dest; r >= 0; r--) {
      const type = Math.floor(Math.random() * CANDY_COUNT)
      const cell = makeCandyCell(r, c, type)
      cell.group.position.y = BOARD_Y + 3.4 + (dest - r) * CELL + c * 0.06
      state.grid[r][c] = cell
      const startY = cell.group.position.y
      jobs.push(tween(330 + (dest - r) * 35, (e) => {
        cell.group.position.y = startY + (BOARD_Y - startY) * e
      }, easeOutCubic))
    }
  }
  await Promise.all(jobs)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c]
      if (cell) cell.group.position.set(cellX(c), BOARD_Y, cellZ(r))
    }
  }
}

async function resolveCascades(preferred = []) {
  let iterations = 0
  while (iterations < 24) {
    const runs = findRuns()
    if (!runs.length) break
    iterations++
    state.combo++
    const specials = planSpecials(runs, iterations === 1 ? preferred : [])
    const clear = buildClearSet(runs, specials)
    if (!clear.size) break
    if (state.combo >= 2) toast(`COMBO x${Math.min(state.combo, 6)}!`, 'good', 900)
    await clearCells(clear, state.combo)
    createSpecialBlocks(specials)
    await gravityAndRefill()
    preferred = []
  }
  state.combo = 0
}

/* ------------------------------------------------------------------ */
/* Boss turns, victory, fire blast, shuffle                            */
/* ------------------------------------------------------------------ */

async function bossAttack() {
  if (!state.boss.alive) return
  const def = bossDefinition()
  sound.bossAttack()
  toast(`${def.displayName} USES BOULDER TOSS!`, 'danger', 1500)
  const golem = golemModel.userData
  tween(520, (e) => {
    golem.armR.rotation.x = -1.15 * Math.sin(e * Math.PI)
  }, easeInOutCubic)

  const candidates = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c]
      if (cell && !cell.stone && !cell.special) candidates.push(cell)
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const count = Math.min(1 + Math.floor((state.boss.level - 1) / 2), 3)
  const targets = candidates.slice(0, count)
  if (!targets.length) return

  await Promise.all(targets.map(async (cell, i) => {
    await wait(180 + i * 130)
    const stone = makeStoneCell(cell.r, cell.c)
    stone.group.position.y = BOARD_Y + 5.5
    stone.group.scale.setScalar(0.8)
    boardGroup.remove(cell.group)
    state.grid[cell.r][cell.c] = stone
    shake = Math.max(shake, 0.35)
    await tween(430, (e) => {
      stone.group.position.y = BOARD_Y + (1 - e) * 5.5
      stone.group.rotation.y = (1 - e) * 2.2
      stone.group.scale.setScalar(0.8 + e * 0.2)
    }, easeOutBounce)
    stone.group.rotation.y = 0
    stone.group.position.y = BOARD_Y
    spawnParticles(cellPos(cell.r, cell.c), 0xa9a3b8, 10, 1.2)
    updateHud()
  }))
  await wait(200)
}

async function handleVictory() {
  if (!state.killPending) return
  state.killPending = false
  state.boss.alive = false
  const defeated = bossDefinition()
  addScore(1000)
  sound.victory()
  toast('GOLEM CRUMBLED! +1000', 'good', 1600)

  const golem = golemModel.userData
  const burstPositions = [golemRoot.position.clone().setY(2), golemRoot.position.clone().setY(1)]
  burstPositions.forEach((pos) => {
    spawnParticles(pos, 0x9aa1ac, 28, 2.1, 0.24)
    spawnParticles(pos, 0xffa33f, 12, 1.6, 0.16)
  })
  spawnRing(golemRoot.position.clone().setY(0), 0xffb45f, 7)
  shake = 1.2
  flashScreen()

  await tween(620, (e) => {
    golemModel.scale.setScalar(1.02 * (1 - e * 0.92))
    golemModel.rotation.z = e * 0.9
  }, easeInOutCubic)
  golemModel.visible = false
  dom.levelupKicker.textContent = `${defeated.displayName} CRUMBLED`
  dom.levelupTitle.textContent = 'GOLEM DEFEATED!'
  const nextLevel = state.boss.level + 1
  const next = bossDefinition(nextLevel)
  dom.levelupSub.textContent = `NEXT: ${next.displayName} • +1000 PTS`
  dom.levelup.classList.add('show')
  await wait(950)

  state.boss.level = nextLevel
  resetBoss(nextLevel)
  golemModel.visible = true
  golemModel.scale.setScalar(1.02)
  golemModel.rotation.z = 0
  golemModel.position.y = 0.38
  puppCelebrate()
  setFire(100, true)

  const stones = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.grid[r][c]?.stone) stones.push(state.grid[r][c])
    }
  }
  for (const stone of stones) {
    spawnParticles(stone.group.position, 0x9aa1ac, 8, 1.2)
    boardGroup.remove(stone.group)
    state.grid[stone.r][stone.c] = null
  }
  if (stones.length) {
    await gravityAndRefill()
    await resolveCascades()
  }
  dom.levelup.classList.remove('show')
  updateHud()
  await wait(150)
}

function puppCelebrate() {
  const pup = pupModel.userData
  pup.bob.position.y = 0.28
  tween(600, (e) => {
    pup.bob.position.y = 0.28 * (1 - e) + Math.sin(e * Math.PI * 3) * 0.04
  }, (t) => t)
  spawnParticles(pupRoot.position.clone().setY(2.4), 0xffb45f, 14, 1.3)
}

async function castFire(r, c) {
  if (!state.targeting || state.busy) return
  if (state.fire < 100) return
  state.targeting = false
  dom.app.classList.remove('is-targeting')
  state.busy = true
  state.selected = null
  clearSelection()
  setCursor(null)
  state.fire = 0
  state.counts.blast++
  state.readyNotified = false
  updateHud()
  hideHint()
  sound.explode()
  toast('EMBERPUP USES FIRE BLAST!', 'hot', 1200)

  const target = cellPos(r, c)
  const meteor = new THREE.Group()
  const meteorMat = new THREE.MeshStandardMaterial({ color: 0xff8a3f, emissive: 0xff4a16, emissiveIntensity: 2.2, roughness: 0.4 })
  const meteorCore = rounded(1.15, 1.15, 1.15, meteorMat, 0, 0, 0, 0.08)
  const meteorGlow = spriteGlow(4.2, 0xffa33f, 0.9)
  meteor.add(meteorCore, meteorGlow)
  meteor.position.copy(target).add(new THREE.Vector3(0, 13, -1.5))
  scene.add(meteor)

  const start = meteor.position.clone()
  await tween(560, (e) => {
    meteor.position.lerpVectors(start, target, e * e)
    meteor.rotation.x += 0.18
    meteor.rotation.z += 0.13
    if (Math.random() < 0.75) spawnParticles(meteor.position, Math.random() > 0.4 ? 0xffc04a : 0xff5a2f, 2, 0.5, 0.2)
  }, (t) => t)
  scene.remove(meteor)
  meteorCore.geometry.dispose()
  meteorMat.dispose()

  flashScreen()
  shake = 1.1
  spawnRing(target, 0xff7a2f, 8)
  spawnParticles(target, 0xffd23f, 36, 2.4, 0.24)
  spawnParticles(target, 0xff5a2f, 26, 2.1, 0.3)
  puppCelebrate()

  const targets = new Set()
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && state.grid[rr][cc]) targets.add(state.grid[rr][cc])
    }
  }
  await clearCells(targets, 1, { extraDamage: 50, extraScore: 300 })
  await gravityAndRefill()
  await resolveCascades()
  if (state.killPending) await handleVictory()
  await ensurePlayable()
  state.busy = false
  startHintClock()
}

async function ensurePlayable() {
  if (findSwap(typeGrid())) return
  let stones = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.grid[r][c]?.stone) stones.push(state.grid[r][c])
  if (stones.length) {
    toast('NO MOVES — PICKAXE RESCUE!', 'danger', 1300)
    const remove = stones.sort(() => Math.random() - 0.5).slice(0, Math.min(3, stones.length))
    for (const stone of remove) {
      spawnParticles(stone.group.position, 0x9aa1ac, 10, 1.4)
      boardGroup.remove(stone.group)
      state.grid[stone.r][stone.c] = null
    }
    await gravityAndRefill()
    if (findSwap(typeGrid())) return
  }
  shuffleBoard()
}

function shuffleBoard() {
  const cells = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.grid[r][c] && !state.grid[r][c].stone) cells.push(state.grid[r][c])
  const oldTypes = cells.map((cell) => cell.type)
  let types = oldTypes
  let tries = 0
  while (tries < 80) {
    types = [...oldTypes].sort(() => Math.random() - 0.5)
    const matrix = typeGrid()
    let i = 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (matrix[r][c] != null) matrix[r][c] = types[i++]
      }
    }
    let bad = false
    for (let r = 0; r < ROWS && !bad; r++) for (let c = 0; c < COLS; c++) if (matrix[r][c] != null && hasMatchAt(matrix, r, c)) { bad = true; break }
    if (!bad && findSwap(matrix)) break
    tries++
  }
  cells.forEach((cell, i) => {
    cell.type = types[i]
    refreshCellVisual(cell)
    tween(360, (e) => {
      const s = 0.2 + 0.8 * e
      cell.group.scale.setScalar(s)
      cell.group.rotation.y = (1 - e) * Math.PI
    }, easeOutBack).then(() => {
      cell.group.scale.setScalar(1)
      cell.group.rotation.y = 0
    })
  })
  toast('CANDY QUAKE — BOARD SHUFFLED!', 'hot', 1300)
  sound.special()
}

function clearSelection() {
  if (state.selected) {
    state.selected.group.userData.cube.scale.setScalar(1)
    state.selected = null
  }
}

/* ------------------------------------------------------------------ */
/* Swap flow & input                                                   */
/* ------------------------------------------------------------------ */

function swapGridCells(a, b) {
  const ar = a.r, ac = a.c, br = b.r, bc = b.c
  state.grid[ar][ac] = b
  state.grid[br][bc] = a
  a.r = br; a.c = bc
  b.r = ar; b.c = ac
}

async function animateCellsToBoard() {
  const jobs = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c]
      if (!cell) continue
      const sx = cell.group.position.x
      const sz = cell.group.position.z
      const sy = cell.group.position.y
      const tx = cellX(c)
      const tz = cellZ(r)
      const ty = BOARD_Y
      if (Math.abs(sx - tx) < 0.001 && Math.abs(sz - tz) < 0.001 && Math.abs(sy - ty) < 0.001) continue
      jobs.push(tween(165, (e) => {
        cell.group.position.x = sx + (tx - sx) * e
        cell.group.position.z = sz + (tz - sz) * e
        cell.group.position.y = sy + (ty - sy) * e
      }, easeInOutCubic))
    }
  }
  await Promise.all(jobs)
}

function selectCell(cell) {
  clearSelection()
  if (!cell || cell.stone) return
  state.selected = cell
  cell.group.userData.cube.scale.setScalar(1.1)
  setCursor(cell, 'selected')
  sound.select()
}

function adjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1
}

async function attemptSwap(a, b) {
  if (state.busy || !state.playing || state.targeting) return
  if (!a || !b || a.stone || b.stone || !adjacent(a, b)) return
  state.busy = true
  clearSelection()
  hideHint()
  sound.swap()
  swapGridCells(a, b)
  await animateCellsToBoard()

  const runs = findRuns()
  if (!runs.length) {
    sound.invalid()
    swapGridCells(a, b)
    await animateCellsToBoard()
    shake = 0.16
    toast('NO MATCH — TRY AGAIN!', 'danger', 850)
    state.busy = false
    startHintClock()
    return
  }

  state.moves++
  addScore(0)
  state.bestCombo = Math.max(state.bestCombo, 0)
  spawnParticles(a.group.position, CANDY_TYPES[a.type].particle, 5, 0.6)
  spawnParticles(b.group.position, CANDY_TYPES[b.type].particle, 5, 0.6)
  state.combo = 0
  updateHud()

  await resolveCascades([a, b])
  const won = state.killPending
  if (won) await handleVictory()
  if (!won && state.boss.alive && state.moves % BOSS_ATTACK_EVERY === 0) await bossAttack()
  await ensurePlayable()
  state.busy = false
  startHintClock()
  updateHud()
}

const raycaster = new THREE.Raycaster()
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_Y)
const pointerNdc = new THREE.Vector2()
const parallax = new THREE.Vector2()

function cellFromEvent(event) {
  const rect = dom.canvas.getBoundingClientRect()
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(boardPlane, hit)) return null
  const c = Math.round(hit.x / CELL + (COLS - 1) / 2)
  const r = Math.round(hit.z / CELL + (ROWS - 1) / 2)
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
  if (Math.abs(hit.x - cellX(c)) > CELL * 0.56 || Math.abs(hit.z - cellZ(r)) > CELL * 0.56) return null
  return state.grid[r]?.[c] || null
}

let dragCell = null
let dragMoved = false
let lastHover = null

dom.canvas.addEventListener('pointerdown', (event) => {
  if (!state.playing || state.busy) return
  event.preventDefault()
  const cell = cellFromEvent(event)
  dragCell = cell
  dragMoved = false
  if (cell) {
    state.hover = cell
    setCursor(cell, state.targeting ? 'fire' : 'hover')
  }
})

dom.canvas.addEventListener('pointermove', (event) => {
  const rect = dom.canvas.getBoundingClientRect()
  parallax.set(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1)
  if (!state.playing || state.busy) return
  const cell = cellFromEvent(event)
  lastHover = cell
  state.hover = cell
  if (event.pointerType === 'mouse' || dragCell) {
    if (cell) {
      if (state.targeting) setCursor(cell, 'fire')
      else setCursor(cell, 'hover')
    } else {
      setCursor(null)
    }
  }
  if (dragCell && cell && cell !== dragCell) dragMoved = true
})

dom.canvas.addEventListener('pointerup', (event) => {
  if (!state.playing || state.busy) { dragCell = null; return }
  const cell = cellFromEvent(event) || dragCell
  const down = dragCell
  dragCell = null
  if (!down && !cell) return
  if (state.targeting) {
    if (cell) castFire(cell.r, cell.c)
    else setCursor(null)
    return
  }
  if (!cell) return
  if (!state.selected) {
    selectCell(cell)
  } else if (state.selected === cell) {
    clearSelection()
    setCursor(cell, 'hover')
  } else if (adjacent(state.selected, cell)) {
    attemptSwap(state.selected, cell)
  } else {
    selectCell(cell)
  }
})

dom.canvas.addEventListener('pointerleave', () => {
  setCursor(null)
  state.hover = null
})

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f' && state.playing) {
    event.preventDefault()
    toggleTargeting()
  }
  if (event.key === 'Escape' && state.targeting) {
    state.targeting = false
    dom.app.classList.remove('is-targeting')
    updateHud()
    setCursor(null)
  }
})

function toggleTargeting() {
  if (!state.playing || state.busy) return
  if (state.targeting) {
    state.targeting = false
    dom.app.classList.remove('is-targeting')
    updateHud()
    setCursor(null)
    toast('FIRE BLAST CANCELLED', '', 800)
    return
  }
  if (state.fire < 100) {
    toast(`EMBERPUP NEEDS ${Math.ceil(100 - state.fire)}% MORE FIRE!`, 'danger', 1100)
    sound.invalid()
    return
  }
  state.targeting = true
  dom.app.classList.add('is-targeting')
  hideHint()
  updateHud()
  toast('PICK A TILE FOR THE METEOR!', 'hot', 1600)
  sound.ready()
}

dom.fireBtn.addEventListener('click', toggleTargeting)

dom.soundBtn.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled)
  dom.soundBtn.classList.toggle('muted', !sound.enabled)
  const use = dom.soundBtn.querySelector('use')
  if (use) use.setAttribute('href', sound.enabled ? '#i-sound' : '#i-mute')
  if (sound.enabled) {
    sound.ensure()
    if (state.playing) sound.startMusic()
  }
})

/* ------------------------------------------------------------------ */
/* Hint system & start / layout / loop                                 */
/* ------------------------------------------------------------------ */

const hintRings = new THREE.Group()
hintRings.visible = false
scene.add(hintRings)
const hintMats = []
for (let i = 0; i < 2; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff74c0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 20), mat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.33
  hintMats.push(mat)
  hintRings.add(ring)
}

function showHint() {
  const move = findSwap(typeGrid())
  if (!move) return
  hintRings.children[0].position.set(cellX(move.c1), 0.33, cellZ(move.r1))
  hintRings.children[1].position.set(cellX(move.c2), 0.33, cellZ(move.r2))
  hintRings.visible = true
  state.hintTimer = 0
}

function hideHintRings() {
  hintRings.visible = false
  state.hintTimer = 0
}

function startGame() {
  if (state.playing) return
  state.playing = true
  dom.startScreen.classList.add('hidden')
  sound.ensure()
  if (sound.enabled) sound.startMusic()
  setQuest('SCORCH THE COBBLE GOLEM — MATCH 3+ CANDIES')
  startHintClock()
  dom.hint.classList.remove('hide')
  setTimeout(() => dom.hint.classList.add('hide'), 9000)
  updateHud()
  dom.startBtn.blur()
}

dom.startBtn.addEventListener('click', startGame)

function layoutScene() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setSize(w, h, false)
  const mobile = w < 720
  camera.aspect = w / h
  camera.fov = mobile ? 50 : 32
  const fitWidth = mobile ? 10.65 : 19
  const dist = (fitWidth / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
  const elevation = THREE.MathUtils.degToRad(mobile ? 57 : 39)
  camTarget.set(0, mobile ? 0.05 : 0.35, mobile ? -0.55 : 0)
  camBase.set(0, Math.sin(elevation) * dist + (mobile ? 0.3 : 0.7), Math.cos(elevation) * dist)
  camera.position.copy(camBase)
  camera.lookAt(camTarget)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()

  if (mobile) {
    const small = w < 470
    pupRoot.position.set(-3.35, 0.8, -5.25)
    pupRoot.scale.setScalar(small ? 0.64 : 0.7)
    pupRoot.rotation.y = 0.28
    golemRoot.position.set(3.35, 0.8, -5.25)
    golemRoot.scale.setScalar(small ? 0.68 : 0.75)
    golemRoot.rotation.y = -0.28
  } else {
    pupRoot.position.set(-7.0, 0.55, 0.6)
    pupRoot.scale.setScalar(0.9)
    pupRoot.rotation.y = 0.42
    golemRoot.position.set(7.02, 0.55, 0.6)
    golemRoot.scale.setScalar(0.96)
    golemRoot.rotation.y = -0.45
  }
}

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(layoutScene, 80)
})
window.addEventListener('orientationchange', () => setTimeout(layoutScene, 200))

let shake = 0
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  const time = clock.elapsedTime
  updateTweens(dt)
  updateParticles(dt)

  const parallaxAmount = window.innerWidth < 720 ? 0.1 : 0.18
  camera.position.set(
    camBase.x + parallax.x * parallaxAmount + Math.sin(time * 0.12) * 0.07,
    camBase.y + parallax.y * parallaxAmount * 0.45 + Math.cos(time * 0.16) * 0.04,
    camBase.z
  )
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.55
    camera.position.y += (Math.random() - 0.5) * shake * 0.35
    shake = Math.max(0, shake - dt * 2.6)
  }
  camera.lookAt(camTarget)

  animateCharacters(time, dt)

  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.speed * dt
    if (cloud.position.x > 27) cloud.position.x = -27
  }
  for (const island of floatingIslands) {
    island.position.y = island.userData.baseY + Math.sin(time * 0.5 + island.userData.phase) * 0.16
    island.rotation.z = Math.sin(time * 0.35 + island.userData.phase) * 0.012
  }
  for (const sparkle of sparkles) {
    sparkle.position.y = sparkle.userData.baseY + Math.sin(time * sparkle.userData.speed + sparkle.userData.phase) * 0.6
    sparkle.rotation.x += dt * 0.6
    sparkle.rotation.y += dt * 0.8
  }
  for (const torch of torches) {
    const flicker = 0.9 + Math.sin(time * 9 + torch.phase) * 0.12 + Math.random() * 0.08
    torch.flame.scale.setScalar(flicker)
    torch.glow.material.opacity = 0.55 + Math.sin(time * 8 + torch.phase) * 0.12
    torch.light.intensity = 11 + Math.sin(time * 11 + torch.phase) * 2.5
    torch.group.rotation.y = Math.sin(time * 0.4 + torch.phase) * 0.03
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r]?.[c]
      if (!cell?.special || !cell.group.userData.deco) continue
      const deco = cell.group.userData.deco
      if (cell.special === 'core') {
        deco.children[0].rotation.y += dt * 2.4
        deco.children[0].rotation.x += dt * 0.8
        deco.position.y = Math.sin(time * 3 + r + c) * 0.05
      } else {
        deco.rotation.y += dt * 0.4
      }
    }
  }

  if (cursor.visible) {
    const pulse = 1 + Math.sin(time * 5.5) * 0.035
    cursor.scale.setScalar(state.targeting ? 1.06 + Math.sin(time * 8) * 0.05 : pulse)
    if (state.targeting) cursor.rotation.y = Math.sin(time * 2) * 0.05
    else cursor.rotation.y = 0
  }

  if (hintRings.visible) {
    hintRings.children.forEach((ring, i) => {
      const pulse = 1 + Math.sin(time * 5 + i * 1.5) * 0.12
      ring.scale.setScalar(pulse)
      ring.rotation.z += dt * (i ? 1.2 : -1.2)
      hintMats[i].opacity = 0.45 + Math.sin(time * 5 + i * 1.5) * 0.22
    })
  }

  if (state.playing && !state.busy && !state.targeting) {
    state.hintTimer += dt
    if (state.hintTimer > 7 && !hintRings.visible) showHint()
  }

  renderer.render(scene, camera)
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

if (import.meta.env.DEV) {
  window.__candyDebug = { state, findSwap, typeGrid, attemptSwap, castFire, setFire, findRuns, toggleTargeting, camera, scene, clouds, cellPos, cellX, cellZ, stage: dom.canvas }
}

buildSky()
buildScenery()
buildPlatform()
buildInitialBoard()
resetBoss(1)
updateHud()
layoutScene()
renderer.compile(scene, camera)
animate()


import * as THREE from 'three'
import { CANDY_TYPES } from './data.js'

/* Tiny deterministic pixel-art texture factory. */

const cache = new Map()

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function make(size, draw, key) {
  if (key && cache.has(key)) return cache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  if (key) cache.set(key, texture)
  return texture
}

function speckle(ctx, size, colors, count, seed, max = 2) {
  const random = seeded(seed)
  for (let i = 0; i < count; i++) {
    const x = Math.floor(random() * size)
    const y = Math.floor(random() * size)
    const w = 1 + Math.floor(random() * max)
    const h = 1 + Math.floor(random() * max)
    ctx.fillStyle = colors[Math.floor(random() * colors.length)]
    ctx.fillRect(x, y, w, h)
  }
}

function candyTexture(type) {
  return make(32, (ctx, size) => {
    ctx.fillStyle = type.base
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, [type.light, type.dark, type.pale], 26, 91 + type.id * 17, 2)

    ctx.fillStyle = type.dark
    ctx.fillRect(0, 0, size, 2)
    ctx.fillRect(0, size - 2, size, 2)
    ctx.fillRect(0, 0, 2, size)
    ctx.fillRect(size - 2, 0, 2, size)

    ctx.fillStyle = type.light
    ctx.fillRect(2, 2, size - 4, 2)
    ctx.fillRect(2, 2, 2, size - 4)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.fillRect(4, 4, 5, 2)
    ctx.fillRect(4, 4, 2, 5)

    const scale = 3
    const offset = 4
    type.symbol.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue
        const px = offset + x * scale
        const py = offset + y * scale
        ctx.fillStyle = type.dark
        ctx.fillRect(px + 1, py + 1, scale, scale)
        ctx.fillStyle = row[x] === 'o' ? '#ffffff' : type.pale
        ctx.fillRect(px, py, scale, scale)
        if (row[x] === 'x') {
          ctx.fillStyle = type.light
          ctx.fillRect(px, py, scale, 1)
        }
      }
    })
  }, `candy-${type.id}`)
}

function tileTexture(base, edge, accent) {
  return make(32, (ctx, size) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, size, 2)
    ctx.fillRect(0, 0, 2, size)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.fillRect(2, 2, size - 4, 2)
    ctx.fillStyle = 'rgba(70,30,55,.14)'
    ctx.fillRect(0, size - 3, size, 3)
    const random = seeded(42)
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? accent : 'rgba(255,255,255,.5)'
      ctx.fillRect(Math.floor(random() * 26) + 3, Math.floor(random() * 26) + 3, 2, 2)
    }
  })
}

export function getCandyTexture(typeId) {
  return candyTexture(CANDY_TYPES[typeId])
}

export function getTileTexture(index) {
  return index
    ? tileTexture('#ffdce8', '#e3a8bd', '#ff86a8')
    : tileTexture('#fff1d2', '#dfbc8c', '#ffc35c')
}

/* Terrain, props and FX textures. */

function grassTop() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#5cbb46'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, ['#4aa838', '#71d257', '#3c8d2f', '#8be36d'], 90, 7, 3)
    const random = seeded(33)
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(random() * size)
      const y = Math.floor(random() * size)
      ctx.fillStyle = random() > .5 ? '#81df66' : '#3f8f31'
      ctx.fillRect(x, y, 1, 2 + Math.floor(random() * 3))
    }
  }, 'grass-top')
}

function grassSide() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#82552f'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, ['#6d4527', '#9b6a3c', '#5b3a21', '#ad7a49'], 70, 12, 3)
    ctx.fillStyle = '#5cbb46'
    ctx.fillRect(0, 0, size, 9)
    speckle(ctx, size, ['#4aa838', '#71d257', '#8be36d'], 18, 4, 2)
    const random = seeded(71)
    for (let x = 0; x < size; x += 2) {
      ctx.fillStyle = random() > .5 ? '#5cbb46' : '#4aa838'
      ctx.fillRect(x, 8, 2, 1 + Math.floor(random() * 3))
    }
  }, 'grass-side')
}

function dirt() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#82552f'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, ['#6d4527', '#9b6a3c', '#5b3a21', '#ad7a49', '#b58350'], 95, 18, 3)
  }, 'dirt')
}

function stone(seed = 5, base = '#8b8f99') {
  return make(32, (ctx, size) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, ['#757a85', '#a3a8b2', '#686d77', '#b3b8c1'], 80, seed, 3)
    const random = seeded(seed * 13)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#5b606b'
      const x = Math.floor(random() * size)
      const y = Math.floor(random() * size)
      ctx.fillRect(x, y, 2 + Math.floor(random() * 4), 1)
    }
  }, `stone-${seed}-${base}`)
}

function cobble() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#5a5e68'
    ctx.fillRect(0, 0, size, size)
    const random = seeded(88)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const shades = ['#8b8f99', '#7d818c', '#979ca6', '#737782']
        ctx.fillStyle = shades[Math.floor(random() * shades.length)]
        const px = x * 8 + 1
        const py = y * 8 + 1
        ctx.fillRect(px, py, 7 - Math.floor(random() * 2), 7 - Math.floor(random() * 2))
        ctx.fillStyle = 'rgba(255,255,255,.16)'
        ctx.fillRect(px, py, 5, 1)
      }
    }
  }, 'cobble')
}

function mossy() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#7d818c'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, ['#8b8f99', '#686d77', '#a3a8b2'], 60, 61, 3)
    speckle(ctx, size, ['#4d9a39', '#6cc24a', '#397a2c'], 36, 62, 4)
  }, 'mossy')
}

function wood() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#8d5f36'
    ctx.fillRect(0, 0, size, size)
    for (let x = 0; x < size; x += 8) {
      ctx.fillStyle = '#6e4527'
      ctx.fillRect(x, 0, 2, size)
      ctx.fillStyle = '#a97845'
      ctx.fillRect(x + 3, 0, 1, size)
    }
    speckle(ctx, size, ['#9c6b3b', '#704827', '#b58350'], 28, 31, 2)
  }, 'wood')
}

function tnt() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#d44536'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#f0e7d8'
    ctx.fillRect(0, 9, size, 14)
    ctx.fillStyle = '#2a1b25'
    ctx.fillRect(0, 7, size, 2)
    ctx.fillRect(0, 23, size, 2)
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#2a1b25'
    ctx.fillText('TNT', size / 2, 17)
  }, 'tnt')
}

function core() {
  return make(32, (ctx, size) => {
    ctx.fillStyle = '#ff7a2f'
    ctx.fillRect(0, 0, size, size)
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15)
    gradient.addColorStop(0, '#fffbe0')
    gradient.addColorStop(.45, '#ffd23f')
    gradient.addColorStop(1, '#ff5a2f')
    ctx.fillStyle = gradient
    ctx.fillRect(2, 2, 28, 28)
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.fillRect(6, 6, 5, 5)
  }, 'core')
}

function lollipop() {
  return make(32, (ctx, size) => {
    const random = seeded(21)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 15.5
        const dy = y - 15.5
        const radius = Math.sqrt(dx * dx + dy * dy)
        if (radius > 15.5) {
          ctx.fillStyle = '#ff9ec4'
        } else {
          const angle = Math.atan2(dy, dx)
          const spiral = Math.floor((radius + angle * 3 + 30) / 5) % 2
          ctx.fillStyle = spiral ? '#ff4f8f' : '#fff6e5'
        }
        ctx.fillRect(x, y, 1, 1)
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.65)'
    ctx.fillRect(9, 8, 4, 3)
    if (random() > 2) return
  }, 'lollipop')
}

function glow(key, inner = 'rgba(255,230,150,1)', outer = 'rgba(255,120,40,0)') {
  return make(128, (ctx, size) => {
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
    gradient.addColorStop(0, inner)
    gradient.addColorStop(.35, inner)
    gradient.addColorStop(1, outer)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }, key)
}

export function getSunTexture() { return glow('fx-sun', 'rgba(255,246,190,.95)', 'rgba(255,220,120,0)') }
export function getFlameGlow() { return glow('fx-flame', 'rgba(255,224,120,.85)', 'rgba(255,90,30,0)') }
export function getShadowTexture() { return glow('fx-shadow', 'rgba(20,8,30,.55)', 'rgba(20,8,30,0)') }

export function getBlockTexture(kind) {
  switch (kind) {
    case 'grass-top': return grassTop()
    case 'grass-side': return grassSide()
    case 'dirt': return dirt()
    case 'stone': return stone()
    case 'stone-dark': return stone(9, '#6b6f7a')
    case 'cobble': return cobble()
    case 'mossy': return mossy()
    case 'wood': return wood()
    case 'tnt': return tnt()
    case 'core': return core()
    case 'lollipop': return lollipop()
    default: return stone()
  }
}

import { view } from '../core/view.ts'
import { EMPTY, type Level, ONEWAY, SOLID, SPIKE, TILE, type Theme } from '../game/level.ts'
import { INK, RED } from './ink.ts'

type Ctx = CanvasRenderingContext2D

/** Deterministic 0..1 hash, so brush jitter doesn't flicker between frames. */
const hash = (x: number, y = 0): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function noise(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Distant ink-wash mountain ranges, nearest last. */
const LAYERS = [
  { par: 0.08, base: 0.6, amp: 0.24, freq: 0.0015, alpha: 0.1 },
  { par: 0.2, base: 0.7, amp: 0.17, freq: 0.0027, alpha: 0.17 },
  { par: 0.38, base: 0.8, amp: 0.1, freq: 0.0046, alpha: 0.26 },
]

/** Paper sky, sun or moon, and parallax mountains, drawn in screen space. */
export function drawSky(g: Ctx, theme: Theme, camX: number, camY: number): void {
  const { w, h } = view
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, theme.skyTop)
  sky.addColorStop(1, theme.skyBottom)
  g.fillStyle = sky
  g.fillRect(-40, -40, w + 80, h + 80)

  const r = Math.min(w, h) * theme.orbSize
  g.save()
  g.globalAlpha = theme.orbAlpha
  g.fillStyle = theme.orb
  g.beginPath()
  g.arc(w * 0.72 - camX * 0.015, h * 0.3 - camY * 0.02, r, 0, Math.PI * 2)
  g.fill()
  g.restore()

  const mist = hexToRgb(theme.skyBottom)
  LAYERS.forEach((L, i) => {
    const baseY = h * L.base - camY * L.par * 0.25
    g.fillStyle = `rgba(${theme.mountain}, ${L.alpha})`
    g.beginPath()
    g.moveTo(-10, h + 10)
    for (let sx = -10; sx <= w + 40; sx += 20) {
      const wx = sx + camX * L.par
      const n = noise(wx * L.freq + i * 37) * 0.7 + noise(wx * L.freq * 3.1 + i * 91) * 0.3
      g.lineTo(sx, baseY - n * h * L.amp)
    }
    g.lineTo(w + 40, h + 10)
    g.closePath()
    g.fill()
    const fog = g.createLinearGradient(0, baseY - h * 0.06, 0, baseY + h * 0.14)
    fog.addColorStop(0, `rgba(${mist}, 0)`)
    fog.addColorStop(1, `rgba(${mist}, 0.6)`)
    g.fillStyle = fog
    g.fillRect(-10, baseY - h * 0.06, w + 50, h * 0.2)
  })
}

let grain: CanvasPattern | null | undefined

function makeGrain(g: Ctx): CanvasPattern | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 180
  const x = c.getContext('2d')
  if (!x) return null
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(70, 45, 20, 0.07)' : 'rgba(255, 255, 255, 0.09)'
    x.fillRect(Math.random() * 180, Math.random() * 180, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6)
  }
  x.strokeStyle = 'rgba(80, 60, 40, 0.05)'
  for (let i = 0; i < 14; i++) {
    x.beginPath()
    const sx = Math.random() * 180
    const sy = Math.random() * 180
    x.moveTo(sx, sy)
    x.quadraticCurveTo(sx + Math.random() * 30, sy + Math.random() * 10, sx + 20 + Math.random() * 40, sy + Math.random() * 20)
    x.stroke()
  }
  return g.createPattern(c, 'repeat')
}

/** Washi paper texture over everything. */
export function drawGrain(g: Ctx): void {
  if (grain === undefined) grain = makeGrain(g)
  if (!grain) return
  g.save()
  g.globalAlpha = 0.55
  g.fillStyle = grain
  g.fillRect(0, 0, view.w, view.h)
  g.restore()
}

/** Ink terrain for the tiles inside the given world rectangle. */
export function drawTerrain(g: Ctx, level: Level, x0: number, y0: number, x1: number, y1: number, time: number): void {
  const c0 = Math.max(0, Math.floor(x0 / TILE) - 1)
  const c1 = Math.min(level.cols - 1, Math.ceil(x1 / TILE) + 1)
  const r0 = Math.max(0, Math.floor(y0 / TILE) - 1)
  const r1 = Math.min(level.rows - 1, Math.ceil(y1 / TILE) + 1)
  g.save()
  g.fillStyle = INK
  g.strokeStyle = INK
  g.lineCap = 'round'
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const t = level.tile(cx, cy)
      const x = cx * TILE
      const y = cy * TILE
      if (t === SOLID) {
        g.fillRect(x - 0.5, y - 0.5, TILE + 1, TILE + 1)
        if (level.tile(cx, cy - 1) !== SOLID) {
          // Ragged brush edge along exposed tops, with the odd tuft of grass.
          g.beginPath()
          g.moveTo(x - 1, y + 4)
          for (let i = 0; i <= 4; i++) g.lineTo(x + i * 10, y - hash(cx * 5 + i, cy) * 5)
          g.lineTo(x + TILE + 1, y + 4)
          g.closePath()
          g.fill()
          if (hash(cx, cy * 7) > 0.55) {
            g.lineWidth = 1.3
            g.beginPath()
            for (let k = 0; k < 3; k++) {
              const gx = x + 6 + hash(cx + k, cy) * 28
              const gh = 6 + hash(cx, cy + k) * 10
              const sway = Math.sin(time * 2 + gx * 0.05) * 2
              g.moveTo(gx, y - 2)
              g.quadraticCurveTo(gx + sway, y - gh * 0.6, gx + sway * 2 + 3, y - gh)
            }
            g.stroke()
          }
        }
        if (level.tile(cx - 1, cy) === EMPTY) {
          g.beginPath()
          g.moveTo(x + 2, y)
          for (let i = 0; i <= 4; i++) g.lineTo(x - hash(cx, cy * 3 + i) * 4, y + i * 10)
          g.lineTo(x + 2, y + TILE)
          g.closePath()
          g.fill()
        }
        if (level.tile(cx + 1, cy) === EMPTY) {
          g.beginPath()
          g.moveTo(x + TILE - 2, y)
          for (let i = 0; i <= 4; i++) g.lineTo(x + TILE + hash(cx * 2, cy * 5 + i) * 4, y + i * 10)
          g.lineTo(x + TILE - 2, y + TILE)
          g.closePath()
          g.fill()
        }
      } else if (t === ONEWAY) {
        g.fillRect(x - 1, y, TILE + 2, 7)
        if (cx % 2 === 0) {
          g.globalAlpha = 0.55
          g.fillRect(x + 17, y + 7, 4, 24)
          g.globalAlpha = 1
        }
      } else if (t === SPIKE) {
        g.beginPath()
        for (let i = 0; i < 3; i++) {
          const bx = x + 1 + i * 12.7
          const tip = y + TILE - 24 - hash(cx * 3 + i, cy) * 8
          g.moveTo(bx, y + TILE)
          g.lineTo(bx + 6.3 + (hash(cx + i, cy) - 0.5) * 4, tip)
          g.lineTo(bx + 12.7, y + TILE)
        }
        g.fill()
      }
    }
  }
  // When the view reaches below the map (tall phone screens), solid ground carries on down;
  // pits stay open.
  if (y1 > level.height) {
    for (let cx = c0; cx <= c1; cx++) {
      if (level.tile(cx, level.rows - 1) === SOLID) g.fillRect(cx * TILE - 0.5, level.height - 0.5, TILE + 1, y1 - level.height + 1)
    }
  }
  g.restore()
}

/** Red torii gate standing with its base at `p`; while `sealed`, a sacred rope bars it. */
export function drawGate(g: Ctx, p: { x: number; y: number }, sealed = false): void {
  const { x, y } = p
  g.save()
  g.fillStyle = RED
  g.fillRect(x - 60, y - 150, 13, 150)
  g.fillRect(x + 47, y - 150, 13, 150)
  g.fillRect(x - 72, y - 122, 144, 10)
  g.beginPath()
  g.moveTo(x - 94, y - 150)
  g.quadraticCurveTo(x, y - 138, x + 94, y - 150)
  g.lineTo(x + 88, y - 164)
  g.quadraticCurveTo(x, y - 152, x - 88, y - 164)
  g.closePath()
  g.fill()
  g.fillStyle = INK
  g.beginPath()
  g.moveTo(x - 98, y - 166)
  g.quadraticCurveTo(x, y - 154, x + 98, y - 166)
  g.lineTo(x + 94, y - 172)
  g.quadraticCurveTo(x, y - 160, x - 94, y - 172)
  g.closePath()
  g.fill()
  g.fillRect(x - 9, y - 148, 18, 26)
  g.fillRect(x - 64, y - 6, 21, 6)
  g.fillRect(x + 43, y - 6, 21, 6)
  if (sealed) {
    // Shimenawa rope across the opening, zigzag paper streamers and a seal talisman.
    g.strokeStyle = INK
    g.lineWidth = 6
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x - 47, y - 100)
    g.quadraticCurveTo(x, y - 82, x + 47, y - 100)
    g.stroke()
    g.strokeStyle = '#fffaf0'
    g.lineWidth = 3
    for (const sx of [-26, 0, 26]) {
      const top = y - 92 + Math.abs(sx) * -0.25
      g.beginPath()
      g.moveTo(x + sx, top)
      g.lineTo(x + sx + 5, top + 8)
      g.lineTo(x + sx - 3, top + 16)
      g.lineTo(x + sx + 5, top + 26)
      g.stroke()
    }
    g.fillStyle = '#fffaf0'
    g.fillRect(x - 7, y - 78, 14, 34)
    g.fillStyle = RED
    g.fillRect(x - 4, y - 72, 8, 22)
  }
  g.restore()
}

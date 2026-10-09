import { type Vec, fromAngle, lerp, rand } from '../core/math.ts'
import { view } from '../core/view.ts'
import { FONT_BRUSH, INK, PETAL, brushPath, circle, ring, text } from './ink.ts'

type Ctx = CanvasRenderingContext2D

interface Blot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  max: number
  color: string
  grav: number
}
interface Smoke {
  x: number
  y: number
  r: number
  life: number
  max: number
}
interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  size: number
  life: number
}
interface FloatText {
  x: number
  y: number
  text: string
  color: string
  size: number
  life: number
  max: number
}
interface Trail {
  pts: Vec[]
  width: number
  life: number
  max: number
}
interface InkRing {
  x: number
  y: number
  r0: number
  r1: number
  color: string
  life: number
  max: number
}
interface Flash {
  color: string
  alpha: number
  life: number
  max: number
}

const MAX_BLOTS = 700

/** Ink splatter, smoke, petals, lingering brush strokes, text, screen flash and shake. */
export class Fx {
  shakeX = 0
  shakeY = 0
  private shakeAmt = 0
  private blots: Blot[] = []
  private smokes: Smoke[] = []
  private petals: Petal[] = []
  private texts: FloatText[] = []
  private trails: Trail[] = []
  private rings: InkRing[] = []
  private flash: Flash | null = null

  get petalCount(): number {
    return this.petals.length
  }

  /** Ink thrown in a cone along `dir`. */
  splatter(p: Vec, dir: Vec, color: string, count: number, speed = 380, size = 4): void {
    const base = Math.atan2(dir.y, dir.x)
    for (let i = 0; i < count; i++) {
      const v = fromAngle(base + rand(-0.8, 0.8), rand(0.3, 1) * speed)
      const life = rand(0.4, 0.9)
      this.blots.push({ x: p.x, y: p.y, vx: v.x, vy: v.y, r: rand(0.4, 1) * size, life, max: life, color, grav: 700 })
    }
    this.trim()
  }

  burst(p: Vec, color: string, count: number, speed: number, size = 3): void {
    for (let i = 0; i < count; i++) {
      const v = fromAngle(rand(0, Math.PI * 2), rand(0.2, 1) * speed)
      const life = rand(0.3, 0.7)
      this.blots.push({ x: p.x, y: p.y, vx: v.x, vy: v.y, r: rand(0.4, 1) * size, life, max: life, color, grav: 300 })
    }
    this.trim()
  }

  smoke(p: Vec, count: number, size = 14): void {
    for (let i = 0; i < count; i++) {
      const life = rand(0.35, 0.6)
      this.smokes.push({ x: p.x + rand(-10, 10), y: p.y + rand(-10, 10), r: size * rand(0.6, 1.2), life, max: life })
    }
  }

  petal(x: number, y: number): void {
    this.petals.push({ x, y, vx: rand(-70, -25), vy: rand(20, 55), rot: rand(0, Math.PI * 2), spin: rand(-3, 3), size: rand(3, 5), life: 9 })
  }

  text(p: Vec, str: string, color: string, size = 20): void {
    this.texts.push({ x: p.x + rand(-5, 5), y: p.y, text: str, color, size, life: 1, max: 1 })
  }

  /** A finished cut that lingers on the paper and fades. */
  trail(pts: Vec[], width: number): void {
    if (pts.length >= 2) this.trails.push({ pts, width, life: 0.8, max: 0.8 })
  }

  ring(p: Vec, r0: number, r1: number, color = INK, life = 0.4): void {
    this.rings.push({ x: p.x, y: p.y, r0, r1, color, life, max: life })
  }

  flashScreen(color: string, life: number, alpha = 1): void {
    this.flash = { color, alpha, life, max: life }
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(28, Math.max(this.shakeAmt, amount))
  }

  /** Readable in slow-mo and during hit-stop. */
  updateReal(dt: number): void {
    this.shakeAmt *= Math.exp(-dt * 10)
    if (this.shakeAmt < 0.3) this.shakeAmt = 0
    this.shakeX = rand(-1, 1) * this.shakeAmt
    this.shakeY = rand(-1, 1) * this.shakeAmt
    for (const t of this.texts) {
      t.life -= dt
      t.y -= 32 * dt
    }
    this.texts = this.texts.filter((t) => t.life > 0)
    if (this.flash) {
      this.flash.life -= dt
      if (this.flash.life <= 0) this.flash = null
    }
  }

  /** Game time: slows down with the world. */
  update(dt: number): void {
    const drag = Math.exp(-dt * 2.5)
    for (const b of this.blots) {
      b.vy += b.grav * dt
      b.vx *= drag
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
    }
    this.blots = this.blots.filter((b) => b.life > 0)
    for (const p of this.petals) {
      p.x += p.vx * dt + Math.sin(p.life * 2 + p.rot) * 24 * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
      p.life -= dt
    }
    this.petals = this.petals.filter((p) => p.life > 0)
    for (const list of [this.smokes, this.trails, this.rings]) for (const item of list) item.life -= dt
    this.smokes = this.smokes.filter((s) => s.life > 0)
    this.trails = this.trails.filter((t) => t.life > 0)
    this.rings = this.rings.filter((r) => r.life > 0)
  }

  /** Behind characters: lingering cut strokes. */
  renderBack(g: Ctx): void {
    for (const t of this.trails) brushPath(g, t.pts, t.width, INK, Math.min(1, (t.life / t.max) * 1.6))
  }

  render(g: Ctx): void {
    for (const s of this.smokes) {
      const k = s.life / s.max
      circle(g, s.x, s.y, s.r * (1.6 - k * 0.6), INK, 0.16 * k)
    }
    for (const b of this.blots) circle(g, b.x, b.y, b.r * (0.5 + 0.5 * (b.life / b.max)), b.color, Math.min(1, (b.life / b.max) * 2))
    for (const r of this.rings) {
      const k = 1 - r.life / r.max
      ring(g, r.x, r.y, lerp(r.r0, r.r1, 1 - (1 - k) * (1 - k)), 5 * (1 - k) + 1, r.color, 1 - k)
    }
    for (const p of this.petals) {
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot)
      g.globalAlpha = Math.min(1, p.life) * 0.85
      g.fillStyle = PETAL
      g.beginPath()
      g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
    for (const t of this.texts) text(g, t.text, t.x, t.y, t.size, t.color, { font: FONT_BRUSH, alpha: Math.min(1, (t.life / t.max) * 3) })
  }

  /** Full-screen flash, in screen space. */
  renderFlash(g: Ctx): void {
    if (!this.flash) return
    g.save()
    g.globalAlpha = this.flash.alpha * (this.flash.life / this.flash.max)
    g.fillStyle = this.flash.color
    g.fillRect(0, 0, view.w, view.h)
    g.restore()
  }

  private trim(): void {
    if (this.blots.length > MAX_BLOTS) this.blots.splice(0, this.blots.length - MAX_BLOTS)
  }
}

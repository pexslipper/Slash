import { type Vec, add, clamp, dist, fromAngle, mul, norm, rand, sub, vec } from '../core/math.ts'
import { hitstop } from '../core/time.ts'
import { view } from '../core/view.ts'
import type { Fx } from '../render/fx.ts'
import { INK, RED, WHITE, circle, line, polyline, ring } from '../render/ink.ts'
import type { Enemy } from './enemies/base.ts'
import type { Player } from './player.ts'
import type { Bounds, ShapeKind, ShapeMatch } from './shapes.ts'
import type { PlayerStats } from './stats.ts'

export type MoveKind = 'void' | 'rising' | 'still' | 'thousand'

export interface SpecialDef {
  name: string
  kanji: string
  /** Spirit cost (the meter runs 0 to 100). 0 = free. */
  cost: number
  /** False when the dash along the drawn shape should not hurt anything (a pure setup move). */
  pathCuts: boolean
}

export const SPECIALS: Record<MoveKind, SpecialDef> = {
  void: { name: 'Void Cut', kanji: '円', cost: 0, pathCuts: true },
  rising: { name: 'Rising Cut', kanji: '昇', cost: 0, pathCuts: false },
  still: { name: 'Still Cut', kanji: '静', cost: 0, pathCuts: true },
  thousand: { name: 'Thousand Cuts', kanji: '星', cost: 100, pathCuts: true },
}

/** Which move each drawn shape casts. Triangles and rectangles both launch. */
const MOVE_OF: Record<ShapeKind, MoveKind> = {
  circle: 'void',
  triangle: 'rising',
  rectangle: 'rising',
  zigzag: 'still',
  star: 'thousand',
}

export const moveOf = (shape: ShapeKind): MoveKind => MOVE_OF[shape]
export const specialFor = (shape: ShapeKind): SpecialDef => SPECIALS[MOVE_OF[shape]]

export const MOVE_ORDER: MoveKind[] = ['void', 'rising', 'still', 'thousand']

/** What the special moves may see and do in the world. */
export interface SpecialCtx {
  readonly enemies: Enemy[]
  readonly player: Player
  readonly fx: Fx
  readonly cam: Vec
  readonly stats: PlayerStats
  /** Damage that bypasses guards, with flinch, splatter and kill handling. */
  damageEnemy(e: Enemy, amount: number, dir: Vec): void
}

interface Strike {
  e: Enemy
  wait: number
  damage: number
  dir: Vec
  kind: 'void' | 'star'
}

interface Visual {
  life: number
  max: number
}
/** The circle cut: a sphere of slashes that holds enemies in the air. */
interface VoidSphere extends Visual {
  center: Vec
  radius: number
  spawnT: number
}
/** Streaks shooting up through the launch area. */
interface Sweep extends Visual {
  box: Bounds
}
interface ScreenSlash extends Visual {
  a: Vec
  b: Vec
  color: string
}

const VOID_TIME = 0.95
const VOID_HITS = 6
/** Void Cut damage per hit, as a fraction of base cut damage (no combo bonus): it is mostly a control move. */
const VOID_DAMAGE = 0.45
const LAUNCH_SPEED = 900
/** Rising Cut: how long launched enemies hang at the top, waiting for a follow-up. */
const LAUNCH_HOVER = 1.5
const STAR_TIME = 0.75

const overlapsCircle = (e: Enemy, c: Vec, r: number): boolean => {
  const nx = clamp(c.x, e.pos.x - e.hw, e.pos.x + e.hw)
  const ny = clamp(c.y, e.pos.y - e.hh, e.pos.y + e.hh)
  return dist({ x: nx, y: ny }, c) <= r
}

const overlapsBox = (e: Enemy, b: Bounds): boolean =>
  e.pos.x + e.hw >= b.x0 && e.pos.x - e.hw <= b.x1 && e.pos.y + e.hh >= b.y0 && e.pos.y - e.hh <= b.y1

/** Shape-drawn special moves: scheduling, area effects and their visuals. */
export class Specials {
  private strikes: Strike[] = []
  private voids: VoidSphere[] = []
  private sweeps: Sweep[] = []
  private slashes: ScreenSlash[] = []
  private starT = 0

  /** Fires the special at the end of the cut. Still Cut's release is handled by the world. */
  cast(ctx: SpecialCtx, m: ShapeMatch, mult: number): void {
    const move = moveOf(m.shape)
    const def = SPECIALS[move]
    ctx.fx.text(add(m.center, vec(0, -m.radius - 20)), `${def.kanji} ${def.name}`, RED, 30)
    const alive = ctx.enemies.filter((e) => e.alive)
    switch (move) {
      case 'void': {
        // Everything inside is lifted and held in the air while the sphere cuts it to ribbons.
        const r = m.radius * 1.1
        this.voids.push({ center: m.center, radius: r, life: VOID_TIME, max: VOID_TIME, spawnT: 0 })
        for (const e of alive.filter((e) => overlapsCircle(e, m.center, r))) {
          e.suspend(VOID_TIME + 0.35)
          for (let i = 0; i < VOID_HITS; i++) {
            this.strikes.push({
              e,
              wait: 0.08 + (i * (VOID_TIME - 0.15)) / VOID_HITS,
              damage: ctx.stats.damage * VOID_DAMAGE,
              dir: norm(fromAngle(rand(0, Math.PI * 2))),
              kind: 'void',
            })
          }
        }
        ctx.fx.flashScreen(INK, 0.12, 0.35)
        ctx.fx.shake(6)
        break
      }
      case 'rising': {
        // No damage: throws everyone in the shape's box into the air, bunched together and
        // hanging at the top, as the setup for a Void Cut or a Still Cut.
        this.sweeps.push({ box: m.box, life: 0.4, max: 0.4 })
        const midX = (m.box.x0 + m.box.x1) / 2
        for (const e of alive.filter((e) => overlapsBox(e, m.box))) {
          e.launch(-LAUNCH_SPEED, LAUNCH_HOVER, midX)
          ctx.fx.smoke({ x: e.pos.x, y: e.pos.y + e.hh }, 4, 14)
          this.slashes.push({ a: add(e.pos, vec(rand(-8, 8), 60)), b: add(e.pos, vec(rand(-8, 8), -90)), color: WHITE, life: 0.25, max: 0.25 })
        }
        ctx.fx.shake(8)
        hitstop(0.06)
        break
      }
      case 'still':
        break
      case 'thousand': {
        const visible = alive.filter(
          (e) => e.pos.x > ctx.cam.x - 40 && e.pos.x < ctx.cam.x + view.w + 40 && e.pos.y > ctx.cam.y - 40 && e.pos.y < ctx.cam.y + view.h + 40,
        )
        const dmg = ctx.stats.damage * mult
        for (const e of visible) {
          for (let i = 0; i < 5; i++) {
            this.strikes.push({ e, wait: 0.15 + i * 0.12 + rand(0, 0.04), damage: dmg * 2, dir: norm(fromAngle(rand(0, Math.PI * 2))), kind: 'star' })
          }
        }
        this.starT = STAR_TIME
        ctx.fx.flashScreen(INK, 0.3, 0.85)
        ctx.fx.shake(10)
        hitstop(0.15)
        break
      }
    }
  }

  update(dt: number, ctx: SpecialCtx): void {
    for (const s of this.strikes) {
      s.wait -= dt
      if (s.wait > 0 || !s.e.alive) continue
      const at = { ...s.e.pos }
      const reach = s.kind === 'void' ? 55 : 70
      this.slashes.push({ a: sub(at, mul(s.dir, reach)), b: add(at, mul(s.dir, reach)), color: s.kind === 'star' ? WHITE : INK, life: 0.22, max: 0.22 })
      ctx.damageEnemy(s.e, s.damage, s.dir)
      // Each cut of the sphere bumps its victim back up, keeping it juggled in the air.
      if (s.kind === 'void') s.e.suspend(0.25)
    }
    this.strikes = this.strikes.filter((s) => s.wait > 0)

    for (const v of this.voids) {
      // Slashes flicker across the sphere, chord after chord.
      v.spawnT -= dt
      while (v.spawnT <= 0 && v.life > 0.1) {
        v.spawnT += 0.035
        const a0 = rand(0, Math.PI * 2)
        const a1 = a0 + rand(1.6, 3.6)
        this.slashes.push({
          a: add(v.center, fromAngle(a0, v.radius)),
          b: add(v.center, fromAngle(a1, v.radius)),
          color: Math.random() < 0.55 ? INK : WHITE,
          life: 0.16,
          max: 0.16,
        })
      }
      v.life -= dt
      if (v.life <= 0) {
        // The sphere shatters.
        ctx.fx.ring(v.center, v.radius * 0.6, v.radius * 1.4, INK, 0.35)
        ctx.fx.splatter(v.center, vec(0, -1), INK, 22, 360, 5)
        ctx.fx.shake(10)
      }
    }
    this.voids = this.voids.filter((v) => v.life > 0)

    if (this.starT > 0) {
      this.starT -= dt
      for (let i = 0; i < 2; i++) {
        const c = { x: ctx.cam.x + rand(0, view.w), y: ctx.cam.y + rand(0, view.h) }
        const d = norm(fromAngle(rand(0, Math.PI * 2)))
        const len = rand(200, 500)
        this.slashes.push({ a: sub(c, mul(d, len)), b: add(c, mul(d, len)), color: Math.random() < 0.5 ? WHITE : INK, life: 0.2, max: 0.2 })
      }
    }
    for (const list of [this.sweeps, this.slashes]) for (const v of list) v.life -= dt
    this.sweeps = this.sweeps.filter((v) => v.life > 0)
    this.slashes = this.slashes.filter((v) => v.life > 0)
  }

  /** A bright slash line, e.g. when a Still Cut lets go. */
  flashSlash(a: Vec, b: Vec): void {
    this.slashes.push({ a, b, color: WHITE, life: 0.35, max: 0.35 })
  }

  render(g: CanvasRenderingContext2D, time: number): void {
    for (const v of this.voids) {
      const k = 1 - v.life / v.max
      // A dark, faintly pulsing sphere with a thin rim.
      circle(g, v.center.x, v.center.y, v.radius, INK, 0.1 + 0.05 * Math.sin(time * 30))
      ring(g, v.center.x, v.center.y, v.radius * (1 + 0.04 * Math.sin(time * 25)), 1.5, INK, 0.7 * (1 - k * 0.5))
    }
    for (const r of this.sweeps) {
      const k = 1 - r.life / r.max
      const { x0, y0, x1, y1 } = r.box
      polyline(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }], 2, RED, 1 - k)
      // Streaks shooting up out of the box.
      for (let i = 0; i < 7; i++) {
        const x = x0 + ((i + 0.5) / 7) * (x1 - x0)
        const top = y1 - (y1 - y0 + 80) * Math.min(1, k * 1.6 + (i % 3) * 0.1)
        line(g, { x, y: y1 }, { x, y: top }, 2.5 * (1 - k) + 0.5, i % 2 ? WHITE : INK, 1 - k)
      }
    }
    for (const s of this.slashes) {
      const a = s.life / s.max
      if (s.color === WHITE) line(g, s.a, s.b, 5 * a, INK, a * 0.5)
      line(g, s.a, s.b, 3 * a + 0.5, s.color, a)
    }
  }
}

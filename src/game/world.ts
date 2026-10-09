import { type Vec, add, clamp, copy, dist, distToSeg, len, lerp, lerpVec, mul, norm, rand, segSeg, sub, vec } from '../core/math.ts'
import type { InputHandler } from '../core/input.ts'
import { clock, hitstop } from '../core/time.ts'
import { DEBUG, view } from '../core/view.ts'
import { Fx } from '../render/fx.ts'
import { renderHud } from '../render/hud.ts'
import { FONT_BRUSH, INK, INK_SOFT, RED, WHITE, brushPath, circle, limb, line, mon, polyline, ring, text } from '../render/ink.ts'
import { drawGate, drawGrain, drawSky, drawTerrain } from '../render/scenery.ts'
import { COMBO_MULTS, comboMult, comboTier } from './combo.ts'
import type { Difficulty, Enemy, HitResult, ProjectileSpec, StrokeHit, WorldCtx } from './enemies/base.ts'
import { createEnemy } from './enemies/index.ts'
import { type Body, GRAVITY, Level, type LevelDef, ONEWAY, SOLID, TILE, moveBody, unstick } from './level.ts'
import { getLevel } from './levels.ts'
import { type ShapeMatch, recognize } from './shapes.ts'
import { type SpecialCtx, Specials, moveOf, specialFor } from './specials.ts'
import { Player } from './player.ts'
import type { PlayerStats } from './stats.ts'
import { Stroke } from './stroke.ts'

interface Projectile extends ProjectileSpec {
  life: number
}

interface Coin extends Body {
  value: number
  /** Placed in the level (floats) rather than dropped (falls). */
  placed: boolean
  attract: boolean
  life: number
}

/** A killed enemy frozen mid-cut, waiting to fall apart. */
interface PendingCut {
  e: Enemy
  point: Vec
  dir: Vec
  wait: number
}

interface Half {
  e: Enemy
  point: Vec
  dir: Vec
  side: 1 | -1
  off: Vec
  vel: Vec
  rot: number
  spin: number
  life: number
}

/** A foe held by a Still Cut: the cuts it has taken so far, released all at once. */
interface StillMark {
  damage: number
  /** In the air when frozen: the release kills it outright. */
  inAir: boolean
  dir: Vec
  marks: { a: Vec; b: Vec }[]
}

interface Banner {
  title: string
  sub: string
  t: number
  max: number
}

export interface StageResult {
  cleared: boolean
  spirit: number
  gold: number
  kills: number
  bestMult: number
  hp: number
}

/** Pointer travel (screen units) before a press turns into drawing instead of a click. */
const DRAG_START = 10
const MIN_STROKE = 14
const CUT_WAIT = 0.14
const HALF_LIFE = 1.1
/** Pause between the end of a Still Cut and the moment its stored cuts land. */
const STILL_DELAY = 0.35
/** While drawing, the camera pans when the cursor is within this fraction of the screen edge. */
const PAN_EDGE = 0.16
/** Pan speed (world units per real second) with the cursor right at the edge. */
const PAN_SPEED = 1100
/** Every map's main ground is its bottom 3 rows. */
const GROUND_ROWS = 3
/** On screens taller than the level, the ground surface sits this far down the screen. */
const TALL_GROUND_AT = 0.58

export class World implements WorldCtx, SpecialCtx, InputHandler {
  readonly level: Level
  readonly def: LevelDef
  readonly player: Player
  readonly fx = new Fx()
  readonly stats: PlayerStats
  readonly diff: Difficulty
  readonly stage: number
  time = 0
  bankGold: number
  runGold = 0
  kills = 0
  bestMult = 1
  combo = 0
  comboShow = 0
  enemies: Enemy[] = []
  stroke: Stroke | null = null
  finisherQueued = false
  banner: Banner | null = null
  outcome: 'clear' | 'dead' | null = null
  cam = vec()
  /** Spirit (0..100): earned by landing hits, spent on shape specials. */
  spirit: number
  /** Shape the current drawing would cast, refreshed while drawing. */
  preview: ShapeMatch | null = null
  specialsCast = 0
  private readonly specials = new Specials()
  private pendingSpecial: ShapeMatch | null = null
  private previewT = 0
  /** Every point the mouse traced, including through rock; shapes are read from this. */
  private drawn: Vec[] = []
  private press: { screen: Vec; world: Vec } | null = null
  /** Last pointer position on screen, so the stroke keeps extending while the camera pans. */
  private pointerScreen: Vec | null = null
  /** Real seconds spent drawing the current (or most recent) cut. */
  drawTime = 0
  private approachTo: Vec | null = null
  private slashAfter = false
  private lastDir = vec(1, 0)
  private projectiles: Projectile[] = []
  private coins: Coin[] = []
  private cuts: PendingCut[] = []
  /** Enemies frozen by the current Still Cut, with the damage stored up for them. */
  private stilled = new Map<Enemy, StillMark>()
  /** Countdown to the Still Cut letting go (negative when none is pending). */
  private stillRelease = -1
  private gateOpen = false
  private gateNagT = 0
  private halves: Half[] = []
  private strokeKills = 0
  private endTimer = 0
  private ended = false
  private clickMark: { p: Vec; life: number } | null = null
  private readonly onEnd: (r: StageResult) => void

  constructor(
    stage: number,
    stats: PlayerStats,
    hp: number,
    spirit: number,
    bankGold: number,
    onEnd: (r: StageResult) => void,
  ) {
    this.spirit = spirit
    const info = getLevel(stage)
    this.stage = stage
    this.def = info.def
    this.diff = info.diff
    this.stats = stats
    this.bankGold = bankGold
    this.onEnd = onEnd
    this.level = new Level(info.def)
    const start = this.level.start
    this.player = new Player({ x: start.x, y: start.y - 22 }, hp)
    for (const s of this.level.spawns) this.enemies.push(createEnemy(s.kind, { x: s.x, y: s.y }, this.diff))
    for (const c of this.level.coins) this.coins.push(this.makeCoin(c, vec(), 2, true))
    clock.scale = 1
    clock.hitstop = 0
    this.updateCamera(1, true)
    this.showBanner(this.def.kanji, `${this.def.name}${info.cycle > 0 ? `  ·  Trial ${info.cycle + 1}` : ''}`, 2.2)
  }

  get boss(): Enemy | undefined {
    return this.enemies.find((e) => e.isBoss)
  }

  get plannedPath(): Vec[] | null {
    return this.stroke ? this.stroke.points : null
  }

  /** Longest path one cut may follow on this stage. */
  get maxLength(): number {
    return this.stats.maxInk / this.diff.inkCostMul
  }

  /** Path length still available in the current cut (the full length between cuts). */
  get inkLeft(): number {
    return this.stroke ? Math.max(0, this.maxLength - this.stroke.length) : this.maxLength
  }

  /** Remaining focus (0..1) while drawing. */
  get focus(): number {
    return this.player.action === 'drawing' ? Math.max(0, 1 - this.drawTime / this.stats.focusTime) : 0
  }

  // ---- WorldCtx ----

  hurtPlayer(amount: number, from: Vec, ignoreIframes = false): void {
    const p = this.player
    if (p.dead || this.outcome) return
    if (!ignoreIframes && p.invulnerable) return
    p.hp -= amount
    p.iframes = Math.max(p.iframes, 0.8)
    p.hurtFlash = 0.25
    if (p.action === 'free') {
      p.vel = { x: (p.pos.x >= from.x ? 1 : -1) * 220, y: -280 }
      p.grounded = false
      p.runTarget = null
    }
    this.fx.splatter(p.pos, norm(sub(p.pos, from)), RED, 12)
    this.fx.text(add(p.pos, vec(0, -40)), `-${Math.round(amount)}`, RED, 22)
    this.fx.shake(9)
    hitstop(0.05)
    if (p.hp <= 0) this.die()
  }

  executePlayer(from: Vec): void {
    const p = this.player
    if (p.dead || this.outcome) return
    // Only being mid-cut (invulnerable) saves you; earlier hit-invulnerability doesn't.
    if (p.action === 'approach' || p.action === 'slash') return
    this.fx.text(add(p.pos, vec(0, -80)), '滅', RED, 72)
    this.fx.flashScreen(RED, 0.45, 0.6)
    this.hurtPlayer(p.hp + 1, from, true)
  }

  spawnEnemy(e: Enemy): void {
    this.enemies.push(e)
  }

  spawnProjectile(spec: ProjectileSpec): void {
    this.projectiles.push({ ...spec, pos: copy(spec.pos), life: 5 })
  }

  canSee(a: Vec, b: Vec): boolean {
    return this.level.segmentBlocked(a, b) === null
  }

  // ---- Input (screen coordinates) ----

  private toWorld(s: Vec): Vec {
    return add(s, this.cam)
  }

  pointerDown(s: Vec): void {
    this.pointerScreen = copy(s)
    if (this.outcome || this.player.dead) return
    const a = this.player.action
    if (a === 'approach' || a === 'slash') this.queueFinisher()
    else if (a === 'free') this.press = { screen: copy(s), world: this.toWorld(s) }
  }

  pointerMove(s: Vec): void {
    this.pointerScreen = copy(s)
    const p = this.player
    if (p.action === 'free' && this.press && dist(this.press.screen, s) > DRAG_START) {
      this.beginDraw(this.press.world)
      this.press = null
    }
    if (p.action === 'drawing') this.extendStroke(this.toWorld(s))
  }

  pointerUp(): void {
    if (this.player.action === 'drawing') this.release()
    else if (this.press && this.player.action === 'free') this.moveCommand(this.press.world)
    this.press = null
  }

  /** Called when the game pauses: drop any half-made press or drawing so nothing is stuck on resume. */
  interrupt(): void {
    this.press = null
    if (this.player.action === 'drawing') this.cancelStroke()
  }

  keyDown(code: string): void {
    if (!DEBUG) return
    if (code === 'KeyN' && !this.outcome) this.clear()
  }

  // ---- Movement ----

  private moveCommand(target: Vec): void {
    const p = this.player
    const t = copy(target)
    if (this.level.solidAt(t.x, t.y)) {
      let cy = Math.floor(t.y / TILE)
      while (cy > 0 && this.level.tile(Math.floor(t.x / TILE), cy - 1) === SOLID) cy--
      t.y = cy * TILE - 1
    }
    this.clickMark = { p: t, life: 0.4 }
    const rise = p.feetY - t.y
    if (p.grounded) {
      const below = this.level.tileAt(p.pos.x, p.feetY + 2)
      if (rise < -60 && below === ONEWAY) p.dropTimer = 0.3
      if (rise < 45) p.runTarget = t.x
      else p.jumpTo(t)
    } else if (p.airJumps > 0) {
      p.airJumps--
      p.jumpTo(t)
      this.fx.smoke({ x: p.pos.x, y: p.feetY }, 4, 10)
    }
  }

  // ---- Drawing & cutting ----

  private beginDraw(start: Vec): void {
    const p = this.player
    if (this.level.solidAt(start.x, start.y)) return
    if (dist(p.pos, start) > this.stats.approachRange) {
      this.fx.text(add(p.pos, vec(0, -46)), 'Too far', INK_SOFT, 18)
      this.fx.ring(p.pos, 20, this.stats.approachRange, INK, 0.45)
      return
    }
    this.stroke = new Stroke(start)
    this.drawn = [copy(start)]
    p.action = 'drawing'
    p.runTarget = null
    this.drawTime = 0
    for (const e of this.enemies) e.onDrawStart(this)
  }

  private extendStroke(w: Vec): void {
    const stroke = this.stroke
    if (!stroke) return
    // The mouse trail is always recorded, so a shape can be finished even after the ink
    // runs out or the line dips into the ground. The cut itself stops at the ink limit
    // and can't pass through rock (points behind a wall wait until the cursor comes back).
    const lastDrawn = this.drawn[this.drawn.length - 1]
    if (!lastDrawn || dist(lastDrawn, w) >= 6) this.drawn.push(copy(w))
    if (this.level.segmentBlocked(stroke.last, w) !== null) return
    stroke.extend(w, this.inkLeft)
  }

  private cancelStroke(): void {
    const p = this.player
    this.stroke = null
    this.preview = null
    if (p.action === 'drawing') p.action = 'free'
  }

  private release(): void {
    const stroke = this.stroke
    const p = this.player
    if (!stroke || p.action !== 'drawing') return
    if (stroke.length < MIN_STROKE) {
      const start = stroke.points[0]
      this.cancelStroke()
      this.moveCommand(start)
      return
    }
    const start = stroke.points[0]
    const blocked = this.level.segmentBlocked(p.pos, start)
    this.combo = 0
    this.strokeKills = 0
    this.finisherQueued = false
    clock.scale = 1
    if (blocked !== null) {
      // Can't reach the start: flash-step as far as the wall instead.
      this.approachTo = lerpVec(p.pos, start, blocked)
      this.slashAfter = false
      this.stroke = null
      this.fx.text(add(p.pos, vec(0, -46)), 'Blocked', INK_SOFT, 18)
    } else {
      this.approachTo = start
      this.slashAfter = true
      for (const e of this.enemies) e.onSlashStart(this)
      this.armSpecial(this.drawn)
    }
    this.preview = null
    p.action = 'approach'
    p.vel = vec()
  }

  /** If the drawn path is a known shape and there is enough spirit, the special fires when the cut ends. */
  private armSpecial(points: Vec[]): void {
    const m = recognize(points)
    if (!m) return
    const def = specialFor(m.shape)
    if (!this.stats.arts[moveOf(m.shape)]) {
      // Not learned yet: the shape is just an ordinary cut.
      this.fx.text(add(m.center, vec(0, -m.radius - 20)), `${def.kanji} locked · learn it at the Dojo`, INK_SOFT, 18)
      return
    }
    if (this.spirit < def.cost) {
      this.fx.text(add(m.center, vec(0, -m.radius - 20)), 'Not enough spirit', INK_SOFT, 18)
      return
    }
    this.spirit -= def.cost
    this.pendingSpecial = m
  }

  private gainSpirit(amount: number): void {
    const was = this.spirit
    this.spirit = Math.min(100, this.spirit + amount)
    if (was < 100 && this.spirit >= 100) this.fx.text(add(this.player.pos, vec(0, -70)), '気 Spirit full', RED, 22)
  }

  /** Special-move damage: ignores guards, still flinches, splatters and splits on a kill. */
  damageEnemy(e: Enemy, amount: number, dir: Vec): void {
    if (!e.alive) return
    const killed = e.applyDamage(amount, this)
    if (!killed) e.flinch(dir)
    this.combo++
    this.comboShow = 1.4
    this.fx.splatter(e.pos, dir, INK, 10)
    this.fx.splatter(e.pos, dir, RED, 6, 300, 3)
    this.fx.text(add(e.pos, vec(0, -e.hh - 16)), String(Math.round(amount)), RED, 20)
    hitstop(0.02)
    if (killed) this.onKill(e, 1, copy(e.pos), dir)
  }

  private queueFinisher(): void {
    if (this.slashAfter) this.finisherQueued = true
  }

  private approachStep(dt: number): void {
    const p = this.player
    const target = this.approachTo
    if (!target) {
      this.endCut()
      return
    }
    const to = sub(target, p.pos)
    const d = len(to)
    const step = this.stats.approachSpeed * dt
    p.addGhost()
    if (Math.abs(to.x) > 1) p.facing = to.x > 0 ? 1 : -1
    if (d > 1e-3) p.slashDir = norm(to)
    if (d <= step) {
      p.pos = copy(target)
      this.approachTo = null
      if (this.slashAfter && this.stroke) p.action = 'slash'
      else this.endCut()
    } else {
      p.pos = add(p.pos, mul(norm(to), step))
    }
  }

  private slashStep(dt: number): void {
    const stroke = this.stroke
    const p = this.player
    if (!stroke) {
      this.endCut()
      return
    }
    p.addGhost()
    for (const { a, b } of stroke.advance(this.stats.dashSpeed * dt)) {
      if (dist(a, b) <= 1e-3) continue
      const dir = norm(sub(b, a))
      this.lastDir = dir
      p.slashDir = dir
      if (Math.abs(dir.x) > 0.1) p.facing = dir.x > 0 ? 1 : -1
      if (this.cutSegment(a, b, dir)) return
      p.pos = copy(b)
    }
    if (stroke.finished) this.endCut()
  }

  /** Resolves one swept segment of the cut. Returns true if the cut had to stop. */
  private cutSegment(a: Vec, b: Vec, dir: Vec): boolean {
    for (const e of this.enemies) {
      if (!e.alive) continue
      const lines = e.parryLines()
      const i = lines.findIndex(([c, d]) => segSeg(a, b, c, d) !== null)
      if (i < 0) continue
      const t = segSeg(a, b, lines[i][0], lines[i][1]) ?? 0
      const at = lerpVec(a, b, t)
      e.onParried(this, i)
      this.gainSpirit(12)
      this.combo++
      this.comboShow = 1.4
      this.fx.text(add(at, vec(0, -30)), 'PARRY', RED, 34)
      this.fx.burst(at, WHITE, 24, 420, 3)
      this.fx.splatter(at, dir, INK, 16)
      this.fx.flashScreen(INK, 0.18, 0.75)
      this.fx.shake(14)
      hitstop(0.25)
    }

    const hits: { e: Enemy; h: StrokeHit }[] = []
    const harmless = this.pendingSpecial !== null && !specialFor(this.pendingSpecial.shape).pathCuts
    const stilling = this.pendingSpecial !== null && moveOf(this.pendingSpecial.shape) === 'still'
    if (!harmless) for (const e of this.enemies) for (const h of e.strokeTest(a, b, 6)) hits.push({ e, h })
    hits.sort((x, y) => x.h.t - y.h.t)
    for (const { e, h } of hits) {
      if (!e.alive) continue
      if (stilling && !e.isBoss) {
        this.stillHit(e, h, dir)
        continue
      }
      const r = this.resolveHit(e, h, dir, this.stats.damage * comboMult(this.combo))
      if (this.player.dead) return true
      if (r.outcome === 'blocked') {
        const p = this.player
        p.pos = sub(h.point, mul(dir, p.hw + 8))
        this.endCut()
        p.vel = { x: -dir.x * 260, y: -220 }
        return true
      }
    }

    for (const pr of this.projectiles) {
      if (pr.life > 0 && distToSeg(pr.pos, a, b) < 16) {
        pr.life = 0
        this.fx.burst(pr.pos, INK, 6, 180, 2)
      }
    }
    for (const c of this.coins) if (!c.attract && distToSeg(c.pos, a, b) < this.stats.magnetRadius) c.attract = true
    return false
  }

  private resolveHit(e: Enemy, h: StrokeHit, dir: Vec, damage: number): HitResult {
    const tierBefore = comboTier(this.combo)
    const r = e.receiveStroke(h, dir, damage, this)
    if (r.outcome === 'hit') {
      this.gainSpirit(r.killed ? 10 : 4)
      this.combo++
      this.comboShow = 1.4
      const tier = comboTier(this.combo)
      this.bestMult = Math.max(this.bestMult, COMBO_MULTS[tier])
      this.fx.splatter(h.point, dir, INK, 10)
      this.fx.splatter(h.point, dir, RED, 6, 300, 3)
      if (r.damage > 0) this.fx.text(add(h.point, vec(0, -16)), String(Math.round(r.damage)), h.crit ? RED : INK, h.crit ? 24 : 17)
      if (h.crit) {
        this.fx.text(add(h.point, vec(0, -44)), '会心', RED, 22)
        this.fx.shake(5)
      }
      if (tier > tierBefore) this.fx.text(add(this.player.pos, vec(0, -56)), `×${COMBO_MULTS[tier]}`, RED, 26)
      hitstop(r.killed ? 0.06 : 0.035)
      if (r.killed) this.onKill(e, COMBO_MULTS[tierBefore], h.point, dir)
    } else if (r.outcome === 'blocked') {
      this.fx.burst(h.point, WHITE, 14, 300, 2.5)
      this.fx.burst(h.point, INK, 8, 200, 2.5)
      this.fx.text(add(h.point, vec(0, -30)), 'Guarded', INK, 20)
      this.fx.shake(7)
      hitstop(0.08)
    }
    return r
  }

  private onKill(e: Enemy, mult: number, point: Vec, dir: Vec): void {
    if (e.illusion) {
      // An illusion: it just dissolves.
      this.fx.smoke(e.pos, 10, 18)
      this.fx.text(add(e.pos, vec(0, -e.hh - 20)), '幻', INK, 26)
      return
    }
    this.kills++
    this.strokeKills++
    this.dropCoins(e.pos, Math.round(e.gold * mult * this.diff.goldMul))
    this.cuts.push({ e, point: copy(point), dir: copy(dir), wait: e.isBoss ? 0.5 : CUT_WAIT })
    if (e.isBoss) {
      this.fx.flashScreen(WHITE, 0.6, 0.8)
      hitstop(0.35)
    }
  }

  /** Ends the flash-step/cut and hands the samurai back to gravity. */
  private endCut(): void {
    const p = this.player
    const stroke = this.stroke
    const cut = this.slashAfter && stroke !== null
    p.action = 'free'
    p.vel = cut ? { x: this.lastDir.x * 240, y: Math.min(this.lastDir.y * 240, -80) } : mul(p.slashDir, 120)
    p.hang = cut ? 0.25 : 0.1
    p.iframes = Math.max(p.iframes, 0.3)
    p.grounded = false
    p.runTarget = null
    unstick(this.level, p)
    if (cut && stroke) this.fx.trail(stroke.traveled(), 11)
    if (cut && this.finisherQueued) this.finisher()
    if (cut && this.stats.vampHeal > 0 && this.strokeKills >= 5 && !p.dead) {
      const heal = this.stats.maxHp * this.stats.vampHeal
      p.hp = Math.min(this.stats.maxHp, p.hp + heal)
      this.fx.text(add(p.pos, vec(0, -60)), `+${Math.round(heal)}`, RED, 22)
    }
    if (cut && this.pendingSpecial && !p.dead) {
      this.specials.cast(this, this.pendingSpecial, comboMult(this.combo))
      this.specialsCast++
    }
    if (this.stilled.size > 0) this.stillRelease = STILL_DELAY
    this.pendingSpecial = null
    this.finisherQueued = false
    this.slashAfter = false
    this.approachTo = null
    this.stroke = null
  }

  /**
   * Still Cut: the blade passes through without visible effect and the enemy freezes in place,
   * storing every cut. They all land when the samurai finishes (see releaseStill).
   */
  private stillHit(e: Enemy, h: StrokeHit, dir: Vec): void {
    e.noteHit(h.key)
    let s = this.stilled.get(e)
    if (!s) {
      s = { damage: 0, inAir: e.airborne || !e.grounded, dir, marks: [] }
      this.stilled.set(e, s)
      e.freeze()
    }
    s.damage += this.stats.damage * comboMult(this.combo) * (h.crit ? this.stats.critMult : 1)
    s.dir = dir
    s.marks.push({ a: sub(h.point, mul(dir, 34)), b: add(h.point, mul(dir, 34)) })
    this.combo++
    this.comboShow = 1.4
    this.bestMult = Math.max(this.bestMult, comboMult(this.combo))
    this.gainSpirit(4)
    this.fx.burst(h.point, WHITE, 6, 160, 2)
    hitstop(0.02)
  }

  /** The stored cuts land all at once. Anything frozen in mid-air dies outright. */
  private releaseStill(): void {
    this.stillRelease = -1
    if (this.stilled.size === 0) return
    this.fx.flashScreen(WHITE, 0.15, 0.6)
    this.fx.shake(12)
    hitstop(0.12)
    for (const [e, s] of this.stilled) {
      e.unfreeze()
      if (!e.alive) continue
      for (const m of s.marks) this.specials.flashSlash(m.a, m.b)
      if (s.inAir) {
        this.fx.text(add(e.pos, vec(0, -e.hh - 40)), '斬', RED, 34)
        this.damageEnemy(e, e.hp + 1, s.dir)
      } else {
        this.damageEnemy(e, s.damage, s.dir)
      }
    }
    this.stilled.clear()
  }

  /** Enemies still standing that must fall before the gate opens (bamboo doesn't count). */
  get foesLeft(): number {
    return this.enemies.filter((e) => e.alive && e.kind !== 'bamboo').length
  }

  /** Circular cut around the landing point. */
  private finisher(): void {
    const p = this.player
    const s = this.stats
    this.fx.ring(p.pos, 12, s.finisherRadius, INK, 0.35)
    this.fx.ring(p.pos, 8, s.finisherRadius * 0.8, RED, 0.3)
    this.fx.shake(8)
    hitstop(0.06)
    const damage = s.damage * 1.5 * comboMult(this.combo)
    for (const e of [...this.enemies]) {
      if (!e.alive || dist(e.pos, p.pos) > s.finisherRadius + Math.max(e.hw, e.hh)) continue
      const dir = norm(sub(e.pos, p.pos))
      this.resolveHit(e, { key: 'finisher', point: copy(e.pos), t: 0, crit: false }, dir, damage)
      if (p.dead) return
    }
  }

  // ---- Simulation ----

  update(realDt: number): void {
    this.fx.updateReal(realDt)
    if (this.banner) {
      this.banner.t -= realDt
      if (this.banner.t <= 0) this.banner = null
    }
    this.comboShow = Math.max(0, this.comboShow - realDt)
    if (this.clickMark && (this.clickMark.life -= realDt) <= 0) this.clickMark = null

    if (this.outcome && !this.ended) {
      this.endTimer -= realDt
      if (this.endTimer <= 0) {
        this.finish()
        return
      }
    }
    if (clock.hitstop > 0) {
      clock.hitstop = Math.max(0, clock.hitstop - realDt)
      return
    }

    const p = this.player
    const target = p.action === 'drawing' ? this.stats.slowFactor : this.outcome === 'dead' ? 0.3 : 1
    clock.scale = lerp(clock.scale, target, 1 - Math.exp(-realDt * 14))
    const dt = realDt * clock.scale
    this.time += dt

    if (p.action === 'drawing') {
      this.drawTime += realDt
      this.previewT -= realDt
      if (this.previewT <= 0 && this.stroke) {
        this.previewT = 0.1
        this.preview = recognize(this.drawn)
      }
      if (this.drawTime >= this.stats.focusTime) this.release()
    }
    if (p.action === 'approach') this.approachStep(dt)
    else if (p.action === 'slash') this.slashStep(dt)
    else if (!p.dead) p.physics(dt, this.level)
    p.tick(dt)
    this.checkHazards()

    const cx = this.cam.x + view.w / 2
    this.specials.update(dt, this)
    if (this.stillRelease >= 0 && p.action !== 'slash' && p.action !== 'approach') {
      this.stillRelease -= dt
      if (this.stillRelease < 0) this.releaseStill()
    }
    for (const e of this.enemies) if (e.isBoss || Math.abs(e.pos.x - cx) < view.w) e.update(dt, this)
    this.checkContacts()
    this.updateProjectiles(dt)
    this.updateCoins(dt)
    this.updateCuts(dt)
    this.fx.update(dt)
    this.spawnPetals(dt)
    this.enemies = this.enemies.filter((e) => e.alive)

    const gate = this.level.gate
    this.gateNagT = Math.max(0, this.gateNagT - realDt)
    if (gate && !this.def.boss && !this.outcome) {
      if (!this.gateOpen && this.foesLeft === 0) {
        this.gateOpen = true
        this.showBanner('開', 'Every foe has fallen. The gate is open.', 1.8)
      }
      if (!p.dead && p.pos.x > gate.x - 40) {
        if (this.gateOpen) this.clear()
        else if (this.gateNagT <= 0) {
          // Sealed until the stage is cleared: say how many are left.
          this.fx.text(add(p.pos, vec(0, -60)), `${this.foesLeft} foes remain`, RED, 22)
          this.gateNagT = 1.5
        }
      }
    }
    this.updateCamera(realDt)
  }

  private finish(): void {
    this.ended = true
    for (const c of this.coins) if (c.attract) this.runGold += c.value
    this.coins = []
    this.onEnd({
      cleared: this.outcome === 'clear',
      gold: this.runGold,
      kills: this.kills,
      bestMult: this.bestMult,
      hp: Math.max(0, this.player.hp),
      spirit: this.spirit,
    })
  }

  private clear(): void {
    this.outcome = 'clear'
    this.endTimer = 2.2
    this.showBanner('勝', 'The path is cut', 2.2)
    if (this.player.action === 'drawing') this.cancelStroke()
    for (const c of this.coins) c.attract = true
    this.projectiles = []
  }

  private die(): void {
    const p = this.player
    p.hp = 0
    p.dead = true
    if (p.action === 'drawing') this.cancelStroke()
    p.action = 'free'
    this.stroke = null
    // A dead samurai's Still Cut never lands: let the frozen enemies go.
    for (const e of this.stilled.keys()) e.unfreeze()
    this.stilled.clear()
    this.stillRelease = -1
    this.outcome = 'dead'
    this.endTimer = 2.2
    this.fx.splatter(p.pos, vec(0, -1), RED, 30, 420, 5)
    this.fx.splatter(p.pos, vec(0, -1), INK, 30, 380, 5)
    this.fx.shake(18)
    this.showBanner('敗', 'Your blade falls silent', 2.2)
  }

  private showBanner(title: string, sub: string, seconds: number): void {
    this.banner = { title, sub, t: seconds, max: seconds }
  }

  private checkHazards(): void {
    const p = this.player
    if (p.dead) return
    const box = [p.pos.x - p.hw, p.pos.y - p.hh, p.pos.x + p.hw, p.pos.y + p.hh] as const
    const fell = p.pos.y - p.hh > this.level.height + 60
    const spiked = !fell && !p.invulnerable && this.level.touchesSpike(...box)
    if (fell || spiked) {
      // Pits and spikes cost health and send you back to the last safe footing.
      if (p.action === 'drawing') this.cancelStroke()
      if (spiked) this.fx.splatter(p.pos, vec(0, -1), RED, 14)
      this.hurtPlayer(fell ? 25 : 15, { x: p.pos.x, y: p.pos.y + 40 }, true)
      if (p.dead) return
      p.pos = copy(p.lastSafe)
      p.vel = vec()
      p.action = 'free'
      p.runTarget = null
      p.iframes = 1.2
      this.fx.smoke(p.pos, 8, 16)
      return
    }
    if (p.grounded && p.action === 'free' && !this.level.touchesSpike(box[0] - 40, box[1], box[2] + 40, box[3] + 12)) {
      p.lastSafe = copy(p.pos)
    }
  }

  private checkContacts(): void {
    const p = this.player
    if (p.dead || p.invulnerable) return
    for (const e of this.enemies) {
      const dmg = e.touchDamage(p)
      if (dmg > 0) {
        this.hurtPlayer(dmg, e.pos)
        return
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player
    for (const pr of this.projectiles) {
      pr.vel.y += pr.gravity * dt
      pr.pos = add(pr.pos, mul(pr.vel, dt))
      pr.life -= dt
      if (this.level.solidAt(pr.pos.x, pr.pos.y)) {
        pr.life = 0
        this.fx.burst(pr.pos, INK, 4, 90, 2)
      } else if (
        !p.invulnerable &&
        Math.abs(pr.pos.x - p.pos.x) < p.hw + 4 &&
        Math.abs(pr.pos.y - p.pos.y) < p.hh + 4
      ) {
        pr.life = 0
        this.hurtPlayer(pr.damage, sub(pr.pos, pr.vel))
      }
      if (pr.pos.y > this.level.height + 200) pr.life = 0
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0)
  }

  private makeCoin(pos: Vec, vel: Vec, value: number, placed: boolean): Coin {
    return { pos: copy(pos), vel, hw: 6, hh: 6, grounded: false, dropTimer: 0, value, placed, attract: false, life: 16 }
  }

  private dropCoins(at: Vec, total: number): void {
    if (total <= 0) return
    const n = clamp(Math.ceil(total / 5), 1, 8)
    const base = Math.floor(total / n)
    let extra = total - base * n
    for (let i = 0; i < n; i++) {
      const value = base + (extra-- > 0 ? 1 : 0)
      this.coins.push(this.makeCoin(at, vec(rand(-160, 160), rand(-380, -180)), value, false))
    }
  }

  private updateCoins(dt: number): void {
    const p = this.player
    for (const c of this.coins) {
      const to = sub(p.pos, c.pos)
      const d = len(to)
      if (!p.dead && (c.attract || d < this.stats.magnetRadius)) {
        c.attract = true
        c.vel = add(c.vel, mul(sub(mul(norm(to), 900), c.vel), Math.min(1, dt * 9)))
        c.pos = add(c.pos, mul(c.vel, dt))
      } else if (!c.placed) {
        c.vel.y = Math.min(900, c.vel.y + GRAVITY * 0.8 * dt)
        if (c.grounded) c.vel.x *= Math.exp(-dt * 6)
        moveBody(this.level, c, dt)
        c.life -= dt
      }
      if (!p.dead && d < 24) {
        this.runGold += c.value
        c.life = -1
        this.fx.burst(c.pos, '#b8862b', 4, 110, 2)
      }
    }
    this.coins = this.coins.filter((c) => c.life > 0 && c.pos.y < this.level.height + 200)
  }

  private updateCuts(dt: number): void {
    const busy = this.player.action === 'approach' || this.player.action === 'slash'
    for (const c of this.cuts) {
      if (!busy) c.wait -= dt
      if (c.wait > 0) continue
      const n = { x: -c.dir.y, y: c.dir.x }
      for (const side of [1, -1] as const) {
        this.halves.push({
          e: c.e,
          point: c.point,
          dir: c.dir,
          side,
          off: vec(),
          vel: add(mul(n, side * rand(70, 130)), add(mul(c.dir, 90), vec(0, -140))),
          rot: 0,
          spin: side * rand(0.8, 2.2),
          life: HALF_LIFE,
        })
      }
      this.fx.splatter(c.point, c.dir, INK, c.e.isBoss ? 40 : 14, 420, 5)
      this.fx.splatter(c.point, mul(c.dir, -1), RED, c.e.isBoss ? 30 : 8, 320, 4)
      if (c.e.isBoss && !this.outcome) this.clear()
    }
    this.cuts = this.cuts.filter((c) => c.wait > 0)
    for (const h of this.halves) {
      h.vel.y += 1300 * dt
      h.off = add(h.off, mul(h.vel, dt))
      h.rot += h.spin * dt
      h.life -= dt
    }
    this.halves = this.halves.filter((h) => h.life > 0)
  }

  private spawnPetals(dt: number): void {
    if (!this.def.theme.petals || this.fx.petalCount > 40) return
    if (Math.random() < dt * 6) this.fx.petal(this.cam.x + view.w * rand(0.2, 1.15), this.cam.y - 10 + rand(0, view.h * 0.3))
  }

  private updateCamera(realDt: number, snap = false): void {
    const p = this.player
    if (p.action === 'drawing' && !snap) {
      this.panWhileDrawing(realDt)
      return
    }
    const tx = p.pos.x - view.w / 2 + p.facing * 80
    const ty = p.pos.y - view.h * 0.55
    const k = snap ? 1 : 1 - Math.exp(-realDt * 5)
    this.cam.x = lerp(this.cam.x, tx, k)
    this.cam.y = lerp(this.cam.y, ty, k)
    this.clampCamera()
  }

  /**
   * Edge panning while drawing: holding the cursor near a screen edge scrolls the view that way
   * (faster the closer it is), and the sword path keeps following the cursor as the scene moves,
   * so a cut can be drawn across more than one screen. Away from the edges the view holds still.
   */
  private panWhileDrawing(realDt: number): void {
    const s = this.pointerScreen
    if (!s) return
    const push = (v: number, size: number): number => {
      const m = size * PAN_EDGE
      if (v < m) return -(1 - Math.max(0, v) / m)
      if (v > size - m) return Math.min(1, (v - (size - m)) / m)
      return 0
    }
    const vx = push(s.x, view.w)
    const vy = push(s.y, view.h)
    if (vx === 0 && vy === 0) return
    const before = { ...this.cam }
    this.cam.x += vx * PAN_SPEED * realDt
    this.cam.y += vy * PAN_SPEED * realDt
    this.clampCamera()
    if (this.cam.x !== before.x || this.cam.y !== before.y) this.extendStroke(this.toWorld(s))
  }

  private clampCamera(): void {
    const L = this.level
    this.cam.x = L.width <= view.w ? (L.width - view.w) / 2 : clamp(this.cam.x, 0, L.width - view.w)
    if (L.height <= view.h) {
      // Taller screen than the level (a phone held upright): put the main ground just below
      // the middle of the screen, where drawing is comfortable, without hiding the level's top.
      // The ground is drawn continuing below the level.
      const desired = L.height - GROUND_ROWS * TILE - view.h * TALL_GROUND_AT
      this.cam.y = clamp(desired, L.height - view.h, 0)
    } else {
      this.cam.y = clamp(this.cam.y, 0, L.height - view.h)
    }
  }

  // ---- Rendering ----

  render(g: CanvasRenderingContext2D): void {
    const { w, h } = view
    drawSky(g, this.def.theme, this.cam.x, this.cam.y)
    g.save()
    g.translate(-this.cam.x + this.fx.shakeX, -this.cam.y + this.fx.shakeY)
    drawTerrain(g, this.level, this.cam.x, this.cam.y, this.cam.x + w, this.cam.y + h, this.time)
    if (this.level.gate) drawGate(g, this.level.gate, !this.gateOpen)
    for (const c of this.coins) {
      const bob = c.placed && !c.attract ? Math.sin(this.time * 3 + c.pos.x * 0.05) * 3 : 0
      mon(g, c.pos.x, c.pos.y + bob, 7)
    }
    this.fx.renderBack(g)
    const left = this.cam.x - 120
    const right = this.cam.x + w + 120
    for (const e of this.enemies) if (e.pos.x > left && e.pos.x < right) e.render(g, this.time)
    for (const c of this.cuts) {
      c.e.draw(g, this.time)
      const n = 40
      line(g, sub(c.point, mul(c.dir, n)), add(c.point, mul(c.dir, n)), 1.5, WHITE, 0.9)
    }
    for (const half of this.halves) this.renderHalf(g, half)
    for (const [e, s] of this.stilled) {
      // Frozen cuts hang in the air until the release; a red 斬 marks the ones that will die outright.
      for (const m of s.marks) {
        line(g, m.a, m.b, 4, INK, 0.5)
        line(g, m.a, m.b, 1.8, WHITE, 0.95)
      }
      if (s.inAir) text(g, '斬', e.pos.x, e.pos.y - e.hh - 20, 20, RED, { font: FONT_BRUSH })
    }
    for (const pr of this.projectiles) this.renderProjectile(g, pr)
    this.specials.render(g, this.time)
    this.player.render(g)
    this.renderStroke(g)
    if (this.clickMark) ring(g, this.clickMark.p.x, this.clickMark.p.y, 4 + (0.4 - this.clickMark.life) * 30, 1.5, INK, this.clickMark.life * 2)
    this.fx.render(g)
    if (DEBUG) this.renderDebug(g)
    g.restore()
    drawGrain(g)
    const slow = 1 - clock.scale
    if (slow > 0.05) {
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
      vg.addColorStop(0, 'rgba(22, 18, 15, 0)')
      vg.addColorStop(1, `rgba(22, 18, 15, ${0.35 * slow})`)
      g.fillStyle = vg
      g.fillRect(0, 0, w, h)
    }
    this.fx.renderFlash(g)
    renderHud(g, this)
  }

  private renderHalf(g: CanvasRenderingContext2D, h: Half): void {
    const { point: c, dir: d, side } = h
    const n = { x: -d.y * side, y: d.x * side }
    const L = 400
    g.save()
    g.globalAlpha = Math.min(1, h.life / 0.4)
    g.translate(h.off.x, h.off.y)
    g.translate(c.x, c.y)
    g.rotate(h.rot)
    g.translate(-c.x, -c.y)
    g.beginPath()
    g.moveTo(c.x - d.x * L, c.y - d.y * L)
    g.lineTo(c.x + d.x * L, c.y + d.y * L)
    g.lineTo(c.x + d.x * L + n.x * L, c.y + d.y * L + n.y * L)
    g.lineTo(c.x - d.x * L + n.x * L, c.y - d.y * L + n.y * L)
    g.closePath()
    g.clip()
    h.e.draw(g, this.time)
    g.restore()
  }

  private renderProjectile(g: CanvasRenderingContext2D, pr: Projectile): void {
    const { x, y } = pr.pos
    if (pr.kind === 'arrow') {
      const d = norm(pr.vel)
      const tail = sub(pr.pos, mul(d, 22))
      line(g, tail, pr.pos, 1.8, INK)
      line(g, tail, add(tail, { x: -d.x * 5 - d.y * 4, y: -d.y * 5 + d.x * 4 }), 1.4, RED)
      line(g, tail, add(tail, { x: -d.x * 5 + d.y * 4, y: -d.y * 5 - d.x * 4 }), 1.4, RED)
    } else {
      g.save()
      g.translate(x, y)
      g.rotate(this.time * 20)
      g.fillStyle = INK
      g.strokeStyle = INK
      g.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2)
        limb(g, 0, 0, 7, 2, 2.4)
      }
      g.restore()
    }
  }

  private renderStroke(g: CanvasRenderingContext2D): void {
    const s = this.stroke
    const p = this.player
    if (p.action === 'drawing' && s) {
      const start = s.points[0]
      const blocked = this.level.segmentBlocked(p.pos, start) !== null
      polyline(g, [p.pos, start], 2, blocked ? RED : INK_SOFT, blocked ? 0.8 : 1, [3, 7])
      // Faint full mouse trail: shows what the shape reader sees beyond the ink and the ground.
      polyline(g, this.drawn, 1.5, INK, 0.25)
      ring(g, start.x, start.y, 8, 2, RED)
      brushPath(g, s.points, 3.5, RED, 0.9, false)
      const reach = this.inkLeft
      if (reach > 4) ring(g, s.last.x, s.last.y, Math.min(reach, 420), 1, INK, 0.12)
      circle(g, s.last.x, s.last.y, 3, RED)
      if (this.preview) {
        // The shape is being read: say which special it will cast, and whether you can afford it.
        const def = specialFor(this.preview.shape)
        const learned = this.stats.arts[moveOf(this.preview.shape)]
        const ready = learned && this.spirit >= def.cost
        ring(g, this.preview.center.x, this.preview.center.y, this.preview.radius, 1.5, ready ? RED : INK, 0.35, 0, Math.PI * 2)
        text(g, `${def.kanji} ${def.name}`, s.last.x + 18, s.last.y - 22, 22, ready ? RED : INK_SOFT, { align: 'left', font: FONT_BRUSH })
        if (!learned) text(g, 'locked: learn it at the Dojo', s.last.x + 18, s.last.y, 13, INK_SOFT, { align: 'left' })
        else if (!ready) text(g, `needs ${def.cost} spirit`, s.last.x + 18, s.last.y, 13, INK_SOFT, { align: 'left' })
      }
      ring(g, p.pos.x, p.pos.y, 36, 3, RED, 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.focus)
    } else if (p.action === 'approach' && s) {
      polyline(g, s.points, 2, RED, 0.5, [6, 6])
    } else if (p.action === 'slash' && s) {
      polyline(g, s.remaining(), 2, RED, 0.35, [6, 6])
      const done = s.traveled()
      brushPath(g, done, 12, INK)
      brushPath(g, done, 2.5, WHITE, 0.9)
      if (this.finisherQueued) ring(g, s.last.x, s.last.y, 22 + Math.sin(this.time * 40) * 3, 2, RED)
    }
  }

  private renderDebug(g: CanvasRenderingContext2D): void {
    g.save()
    g.strokeStyle = 'rgba(179, 18, 27, 0.6)'
    g.lineWidth = 1
    for (const e of this.enemies) g.strokeRect(e.pos.x - e.hw, e.pos.y - e.hh, e.hw * 2, e.hh * 2)
    const p = this.player
    g.strokeRect(p.pos.x - p.hw, p.pos.y - p.hh, p.hw * 2, p.hh * 2)
    g.restore()
  }
}

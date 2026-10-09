import { type Vec, closestOnSeg, dist, dot, lerpVec, norm, segAABB, sub, vec } from '../../core/math.ts'
import type { Fx } from '../../render/fx.ts'
import { INK, RED, WHITE, circle, line } from '../../render/ink.ts'
import { type Body, GRAVITY, type Level, MAX_FALL, ONEWAY, SOLID, type SpawnKind, moveBody } from '../level.ts'
import type { Player } from '../player.ts'
import type { PlayerStats } from '../stats.ts'

export type EnemyKind = SpawnKind

export interface Difficulty {
  hpMul: number
  speedMul: number
  /** >1 makes attack wind-ups shorter. */
  chargeMul: number
  /** >1 shortens the longest cut you can draw. */
  inkCostMul: number
  goldMul: number
  armorBonus: number
}

export interface ProjectileSpec {
  pos: Vec
  vel: Vec
  damage: number
  kind: 'arrow' | 'shuriken'
  gravity: number
}

/** What enemies may see and do in the world. */
export interface WorldCtx {
  readonly player: Player
  readonly stats: PlayerStats
  readonly diff: Difficulty
  readonly level: Level
  readonly fx: Fx
  readonly time: number
  /** Real seconds spent drawing the current (or most recent) cut. */
  readonly drawTime: number
  /** The path the samurai is about to cut along, once the drawing is released. */
  readonly plannedPath: Vec[] | null
  hurtPlayer(amount: number, from: Vec, ignoreIframes?: boolean): void
  /** One-shot kill: only a samurai mid-cut (invulnerable) survives it. */
  executePlayer(from: Vec): void
  spawnProjectile(spec: ProjectileSpec): void
  spawnEnemy(e: Enemy): void
  canSee(a: Vec, b: Vec): boolean
}

export interface StrokeHit {
  /** Which part was struck; a key is hit once per pass of the blade through it. */
  key: string
  point: Vec
  /** Position along the swept segment, for ordering hits. */
  t: number
  crit: boolean
}

export interface HitResult {
  outcome: 'hit' | 'blocked' | 'none'
  damage: number
  killed: boolean
}

/** Critical node in local coordinates (negative x = behind the enemy). */
export interface WeakNode {
  x: number
  y: number
  r: number
}

/** How far past the hitbox the cut must travel before the same enemy can be hit again. */
const REHIT_MARGIN = 14
/** Minimum blade travel inside an enemy before turning back counts as a fresh slash. */
const REHIT_TRAVEL = 14
const FLINCH_TIME = 0.3
const FLINCH_PUSH = 90
/** Gravity scale while held floating, plus the upward speed of the first lift and of each juggle hit. */
const FLOAT_GRAVITY = 0.35
const FLOAT_POP = 320
const FLOAT_BUMP = 150
/** Near-weightless hover at the top of a launch, so there is time to draw a circle around it. */
const HOVER_GRAVITY = 0.06
/** How strongly a launch pulls enemies toward its center while they rise. */
const GATHER = 2.2

export abstract class Enemy implements Body {
  abstract readonly kind: EnemyKind
  pos: Vec
  vel: Vec = vec()
  readonly hw: number
  readonly hh: number
  grounded = false
  dropTimer = 0
  hp = 1
  maxHp = 1
  armor = 0
  gold = 5
  facing: 1 | -1 = -1
  alive = true
  isBoss = false
  /** Shown over the boss health bar. */
  bossName = ''
  /** Illusions vanish in smoke when cut: no corpse, no coins, no kill credit. */
  illusion = false
  flash = 0
  weakNode: WeakNode | null = null
  /** Kinematic enemies move themselves and skip gravity/collision. */
  protected kinematic = false
  protected hitWall = false
  protected contactDamage = 6
  /** Poised enemies don't flinch when slashed. */
  protected poise = false
  /** Remaining flinch time; the enemy can't act while it lasts. */
  protected hurtT = 0
  /** Knocked into the air: helpless (no attacks, no contact damage) until it lands. */
  airborne = false
  /** Held floating in the air (light gravity) by a circle cut. */
  private floatT = 0
  private floatGrav = FLOAT_GRAVITY
  /** After a launch: hover this long once the rise tops out. */
  private hoverAtApex = 0
  /** Frozen mid-motion by a Still Cut until the cut is released. */
  frozen = false
  /** Flying enemies ignore gravity while they are in control of themselves. */
  protected flies = false
  /** Heavier enemies are launched and juggled less high. */
  protected weight = 1
  protected readonly struck = new Set<string>()
  /** Blade travel since this enemy was last hit, within the current cut. */
  private sinceHit = 0
  /** Direction of the blade when it last hit. */
  private hitDir: Vec = vec(1, 0)

  constructor(feet: Vec, hw: number, hh: number) {
    this.hw = hw
    this.hh = hh
    this.pos = { x: feet.x, y: feet.y - hh }
  }

  protected setHp(hp: number): void {
    this.hp = this.maxHp = hp
  }

  get facingVec(): Vec {
    return { x: this.facing, y: 0 }
  }

  weakNodePos(): Vec | null {
    if (!this.weakNode) return null
    return { x: this.pos.x + this.weakNode.x * this.facing, y: this.pos.y + this.weakNode.y }
  }

  /** Shown under the boss health bar. */
  bossLabel(): string {
    return ''
  }

  /** When true the boss label is shown in red (staggered, or a deadly move charging). */
  bossAlert(): boolean {
    return false
  }

  /** Red attack lines a cut can parry right now (crossing one with the blade parries it). */
  parryLines(): [Vec, Vec][] {
    return []
  }

  /** The player's cut crossed parryLines()[index]. */
  onParried(_ctx: WorldCtx, _index: number): void {}

  onDrawStart(_ctx: WorldCtx): void {}

  onSlashStart(_ctx: WorldCtx): void {
    this.struck.clear()
  }

  /** Tests one swept cut segment against this enemy. */
  strokeTest(a: Vec, b: Vec, tol: number): StrokeHit[] {
    if (!this.alive) return []
    const { x, y } = this.pos
    const dir = norm(sub(b, a))
    if (this.struck.has('body')) {
      // Every pass of the blade counts. A new hit is allowed once the line has clearly left
      // the body (past a margin, so edge jitter doesn't count), or when it turns back inside
      // it, e.g. down-then-up on an enemy standing on the ground.
      const m = tol + REHIT_MARGIN
      this.sinceHit += dist(a, b)
      const left = segAABB(a, b, x - this.hw - m, y - this.hh - m, x + this.hw + m, y + this.hh + m) === null
      const turned = this.sinceHit >= REHIT_TRAVEL && dot(dir, this.hitDir) < -0.2
      if (left || turned) this.struck.delete('body')
      return []
    }
    this.sinceHit = 0
    this.hitDir = dir
    const node = this.weakNodePos()
    if (node && this.weakNode) {
      const c = closestOnSeg(node, a, b)
      if (dist(c.point, node) <= this.weakNode.r + 3) return [{ key: 'body', point: c.point, t: c.t, crit: true }]
    }
    const t = segAABB(a, b, x - this.hw - tol, y - this.hh - tol, x + this.hw + tol, y + this.hh + tol)
    return t === null ? [] : [{ key: 'body', point: lerpVec(a, b, t), t, crit: false }]
  }

  receiveStroke(hit: StrokeHit, dir: Vec, damage: number, ctx: WorldCtx): HitResult {
    this.struck.add(hit.key)
    const dealt = damage * (hit.crit ? ctx.stats.critMult : 1)
    const killed = this.applyDamage(dealt, ctx)
    if (!killed) this.flinch(dir)
    return { outcome: 'hit', damage: dealt, killed }
  }

  /** Knocked back a little along the cut, breaking whatever attack was coming (unless poised). */
  flinch(dir: Vec): void {
    if (this.poise || !this.alive) return
    this.hurtT = FLINCH_TIME
    this.vel.x = dir.x * FLINCH_PUSH
    this.onFlinch()
  }

  /** Called when a slash staggers this enemy; cancel any attack in progress. */
  protected onFlinch(): void {}

  /** Bosses keep their footing; everyone else can be thrown into the air. */
  get liftable(): boolean {
    return this.alive && !this.isBoss && !this.kinematic
  }

  /**
   * Knocks the enemy up (negative `vy`); it stays helpless until it lands. With `hover`, it hangs
   * near the top of the rise for that long. With `gatherX`, it drifts toward that x as it rises,
   * so a group bunches up.
   */
  launch(vy: number, hover = 0, gatherX?: number): void {
    if (!this.liftable) return
    this.vel.y = Math.min(this.vel.y, vy / this.weight)
    this.vel.x = gatherX === undefined ? this.vel.x * 0.3 : (gatherX - this.pos.x) * GATHER
    this.hoverAtApex = hover
    this.airborne = true
    this.grounded = false
    this.onFlinch()
  }

  /**
   * Holds the enemy floating for `t` seconds, staggering in the air. Calling it again while
   * floating bumps it back up, so repeated hits keep it juggled.
   */
  suspend(t: number): void {
    if (!this.liftable) return
    const fresh = this.floatT <= 0
    this.floatT = Math.max(this.floatT, t)
    this.floatGrav = FLOAT_GRAVITY
    this.hoverAtApex = 0
    this.vel.y = Math.min(this.vel.y, (fresh ? -FLOAT_POP : -FLOAT_BUMP) / this.weight)
    this.vel.x *= 0.3
    this.airborne = true
    this.grounded = false
    this.onFlinch()
  }

  /** Stops the enemy dead in place (Still Cut). Bosses can't be frozen. */
  freeze(): void {
    if (!this.liftable) return
    this.frozen = true
    this.vel = { x: 0, y: 0 }
    this.onFlinch()
  }

  unfreeze(): void {
    this.frozen = false
  }

  /** Records a blade pass without dealing damage yet (a Still Cut stores its hits). */
  noteHit(key: string): void {
    this.struck.add(key)
  }

  /** Returns true if this blow killed the enemy. */
  applyDamage(amount: number, _ctx: WorldCtx): boolean {
    this.hp -= amount
    this.flash = 0.12
    if (this.hp <= 0 && this.alive) {
      this.alive = false
      return true
    }
    return false
  }

  overlaps(b: Body, pad = 0): boolean {
    return (
      Math.abs(this.pos.x - b.pos.x) < this.hw + b.hw + pad && Math.abs(this.pos.y - b.pos.y) < this.hh + b.hh + pad
    )
  }

  /** Damage dealt to the player touching this enemy right now (0 = harmless). */
  touchDamage(p: Player): number {
    return this.alive && !this.airborne && !this.frozen && this.contactDamage > 0 && this.overlaps(p) ? this.contactDamage : 0
  }

  update(dt: number, ctx: WorldCtx): void {
    this.flash = Math.max(0, this.flash - dt)
    if (this.frozen) return
    if (this.hurtT > 0) {
      this.hurtT -= dt
      this.vel.x *= Math.exp(-dt * 8)
      if (this.flies && !this.airborne) this.vel.y *= Math.exp(-dt * 6)
    } else if (!this.airborne) {
      this.think(dt, ctx)
    }
    if (this.kinematic) return
    if (this.airborne) this.vel.x *= Math.exp(-dt * 3)
    if (this.hoverAtApex > 0 && this.vel.y >= 0) {
      // Top of a launch: hang here, barely sinking.
      this.floatT = this.hoverAtApex
      this.floatGrav = HOVER_GRAVITY
      this.hoverAtApex = 0
      this.vel.y = 0
    }
    this.floatT = Math.max(0, this.floatT - dt)
    const selfPowered = this.flies && !this.airborne
    const gravity = this.floatT > 0 ? this.floatGrav : selfPowered ? 0 : 1
    this.vel.y = Math.min(MAX_FALL, this.vel.y + GRAVITY * gravity * dt)
    this.hitWall = moveBody(ctx.level, this, dt)
    if (this.airborne && this.grounded && this.floatT <= 0 && this.hoverAtApex <= 0) {
      // Landed hard: a moment to recover before fighting again.
      this.airborne = false
      this.hurtT = Math.max(this.hurtT, 0.35)
    }
    if (this.pos.y - this.hh > ctx.level.height + 100) this.alive = false
  }

  protected abstract think(dt: number, ctx: WorldCtx): void

  /** Walks along `facing`, turning around at walls and ledges. */
  protected patrol(ctx: WorldCtx, speed: number): void {
    if (this.hitWall || (this.grounded && !this.groundAhead(ctx.level))) {
      this.facing = this.facing === 1 ? -1 : 1
      this.hitWall = false
    }
    this.vel.x = this.facing * speed
  }

  protected groundAhead(level: Level): boolean {
    const t = level.tileAt(this.pos.x + this.facing * (this.hw + 6), this.pos.y + this.hh + 4)
    return t === SOLID || t === ONEWAY
  }

  /** Player is in front-ish range with a clear line of sight. */
  protected sees(ctx: WorldCtx, rangeX: number, rangeY: number): boolean {
    const p = ctx.player
    if (p.dead) return false
    const dx = p.pos.x - this.pos.x
    const dy = p.pos.y - this.pos.y
    return Math.abs(dx) < rangeX && Math.abs(dy) < rangeY && ctx.canSee(this.pos, p.pos)
  }

  protected facePlayer(ctx: WorldCtx): void {
    this.facing = ctx.player.pos.x >= this.pos.x ? 1 : -1
  }

  render(g: CanvasRenderingContext2D, time: number): void {
    this.draw(g, time)
    const node = this.weakNodePos()
    if (node && this.weakNode && this.alive) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 9)
      circle(g, node.x, node.y, this.weakNode.r * pulse, RED)
      circle(g, node.x, node.y, this.weakNode.r * 0.35, WHITE)
    }
    if (!this.isBoss && this.alive && this.hp < this.maxHp) {
      const w = Math.max(24, this.hw * 2.4)
      const y = this.pos.y - this.hh - 16
      line(g, { x: this.pos.x - w / 2, y }, { x: this.pos.x + w / 2, y }, 3, INK, 0.2)
      line(g, { x: this.pos.x - w / 2, y }, { x: this.pos.x - w / 2 + w * (this.hp / this.maxHp), y }, 3, RED)
    }
  }

  /** Draws the body only. Also used to draw the two halves of a cut corpse. */
  abstract draw(g: CanvasRenderingContext2D, time: number): void

  protected bodyColor(): string {
    return this.flash > 0 ? RED : INK
  }

  /** Moves the origin to the body center with +x pointing forward. Wrap in save/restore. */
  protected local(g: CanvasRenderingContext2D): void {
    g.translate(this.pos.x, this.pos.y)
    g.scale(this.facing, 1)
  }
}

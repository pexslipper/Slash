import type { Vec } from '../../core/math.ts'
import { FONT_BRUSH, INK, RED, WHITE, circle, limb, line, polyline, ring, shape, text } from '../../render/ink.ts'
import { type Difficulty, Enemy, type HitResult, type StrokeHit, type WorldCtx } from '../enemies/base.ts'

type State = 'advance' | 'sweepWindup' | 'sweep' | 'stompWindup' | 'kaizan' | 'recover' | 'stagger'

const SWEEP_REACH = 175
/** 滅 Kaizan: the killing zone reaches this far in front of him. */
const KAIZAN_REACH = 520
/** The Great Parry window: the last part of the Kaizan charge. */
const GREAT_PARRY_WINDOW = 0.6
const WAVE_SPEED = 450

interface Wave {
  x: number
  dir: 1 | -1
  life: number
}

/**
 * 鬼将 Gōki, the Oni Warlord: an offensive duel.
 * Sweeps show the club's red arc and can be parried. Stomps send shockwaves along the ground
 * (jump them). 滅 Kaizan is a one-shot: a red zone marks the ground in front of him while he
 * raises the club. Be out of the zone, be mid-cut when it lands, or cut across the raised club
 * in the last moment (Great Parry) to leave him wide open. Enraged below 40%.
 */
export class Warlord extends Enemy {
  readonly kind = 'warlord'
  state: State = 'advance'
  private enraged = false
  private timer = 1.5
  private windup = 1
  private attacks = 0
  private greatParry = false
  private waves: Wave[] = []
  private groundY = 0
  private levelH = 720
  private readonly diff: Difficulty

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 30, 46)
    this.diff = diff
    this.isBoss = true
    this.bossName = 'Gōki, the Oni Warlord'
    this.setHp(650 * diff.hpMul)
    this.gold = 350
    this.contactDamage = 12
    this.poise = true
    this.weakNode = { x: -33, y: -18, r: 9 }
    this.groundY = feet.y
  }

  private get pace(): number {
    return (this.enraged ? 1.3 : 1) * this.diff.chargeMul
  }

  /** Zone of the one-shot, while it is charging. */
  private get zone(): { x0: number; x1: number } | null {
    if (this.state !== 'kaizan') return null
    const a = this.pos.x + this.facing * 10
    const b = this.pos.x + this.facing * KAIZAN_REACH
    return { x0: Math.min(a, b), x1: Math.max(a, b) }
  }

  /** The raised club, overhead during Kaizan. */
  private get clubLine(): [Vec, Vec] {
    const f = this.facing
    return [
      { x: this.pos.x + f * 12, y: this.pos.y - this.hh + 6 },
      { x: this.pos.x - f * 26, y: this.pos.y - this.hh - 92 },
    ]
  }

  /** The arc the club sweeps through, shown during a sweep wind-up. */
  private get sweepLine(): [Vec, Vec] {
    const f = this.facing
    return [
      { x: this.pos.x - f * 10, y: this.pos.y - this.hh - 40 },
      { x: this.pos.x + f * SWEEP_REACH, y: this.pos.y + this.hh - 6 },
    ]
  }

  private get greatParryOpen(): boolean {
    return this.state === 'kaizan' && this.timer <= GREAT_PARRY_WINDOW
  }

  bossLabel(): string {
    if (this.state === 'stagger') return this.greatParry ? 'GREAT PARRY: he is wide open!' : 'STAGGERED: strike now'
    if (this.state === 'kaizan') return '滅 KAIZAN: leave the red zone, be mid-cut, or parry the raised club'
    return this.enraged ? 'Enraged: faster, and Kaizan comes sooner' : 'Parry his swings; get behind him for the red seal'
  }

  bossAlert(): boolean {
    return this.state === 'kaizan' || this.state === 'stagger'
  }

  parryLines(): [Vec, Vec][] {
    if (this.state === 'sweepWindup') return [this.sweepLine]
    if (this.greatParryOpen) return [this.clubLine]
    return []
  }

  onParried(ctx: WorldCtx): void {
    const great = this.state === 'kaizan'
    this.greatParry = great
    this.state = 'stagger'
    this.timer = great ? 4 : 1.5
    if (great) {
      ctx.fx.text({ x: this.pos.x, y: this.pos.y - this.hh - 60 }, '大返し GREAT PARRY', RED, 32)
      ctx.fx.flashScreen(WHITE, 0.3, 0.8)
      ctx.fx.shake(20)
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    const p = ctx.player
    const dx = p.pos.x - this.pos.x
    this.levelH = ctx.level.height
    if (this.grounded) this.groundY = this.pos.y + this.hh
    this.updateWaves(dt, ctx)

    if (!this.enraged && this.hp <= this.maxHp * 0.4) {
      this.enraged = true
      ctx.fx.text({ x: this.pos.x, y: this.pos.y - this.hh - 50 }, '激怒 ENRAGED', RED, 30)
      ctx.fx.flashScreen(RED, 0.3, 0.4)
    }

    this.timer -= dt
    switch (this.state) {
      case 'advance': {
        this.facePlayer(ctx)
        this.vel.x = Math.abs(dx) > 160 ? this.facing * 60 * (this.enraged ? 1.3 : 1) : 0
        if (this.timer <= 0 && !p.dead) {
          this.attacks++
          // Every third attack (every other when enraged) is the one-shot.
          const kaizanEvery = this.enraged ? 2 : 3
          if (this.attacks % kaizanEvery === 0) this.begin('kaizan', (this.enraged ? 1.5 : 2.2) / this.diff.chargeMul)
          else if (Math.abs(dx) < SWEEP_REACH + 60) this.begin('sweepWindup', 0.8 / this.pace)
          else this.begin('stompWindup', 0.6 / this.pace)
        }
        break
      }
      case 'sweepWindup':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'sweep'
          this.timer = 0.2
          const ahead = dx * this.facing
          if (!p.invulnerable && ahead > -20 && ahead < SWEEP_REACH + 20 && Math.abs(p.pos.y - this.pos.y) < this.hh + 30) ctx.hurtPlayer(25, this.pos)
          ctx.fx.splatter({ x: this.pos.x + this.facing * 100, y: this.pos.y + 20 }, { x: this.facing, y: 0 }, INK, 16, 360, 5)
          ctx.fx.shake(8)
        }
        break
      case 'sweep':
        if (this.timer <= 0) {
          if (this.enraged) this.begin('stompWindup', 0.45 / this.pace)
          else this.recover(1)
        }
        break
      case 'stompWindup':
        this.vel.x = 0
        if (this.timer <= 0) {
          // Shockwaves roll out both ways along the ground.
          this.waves.push({ x: this.pos.x, dir: 1, life: 2.2 }, { x: this.pos.x, dir: -1, life: 2.2 })
          ctx.fx.smoke({ x: this.pos.x, y: this.groundY }, 12, 24)
          ctx.fx.shake(12)
          this.recover(0.9)
        }
        break
      case 'kaizan': {
        this.vel.x = 0
        if (this.timer <= 0) {
          // The mountain splits: everything in the zone not mid-cut dies.
          const z = this.zone
          if (z && p.pos.x + p.hw > z.x0 && p.pos.x - p.hw < z.x1) ctx.executePlayer(this.pos)
          ctx.fx.flashScreen(WHITE, 0.35, 0.9)
          ctx.fx.shake(28)
          for (let i = 0; i < 6; i++) ctx.fx.smoke({ x: this.pos.x + this.facing * (60 + i * 80), y: this.groundY }, 4, 26)
          ctx.fx.splatter({ x: this.pos.x + this.facing * 80, y: this.groundY }, { x: this.facing, y: -1 }, INK, 30, 480, 6)
          this.recover(1.6)
        }
        break
      }
      case 'recover':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'advance'
          this.timer = (this.enraged ? 0.6 : 1.1) / this.diff.chargeMul
        }
        break
      case 'stagger':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'advance'
          this.timer = 0.8
          this.greatParry = false
        }
        break
    }
  }

  private begin(state: State, windup: number): void {
    this.state = state
    this.windup = this.timer = windup
    this.vel.x = 0
  }

  private recover(t: number): void {
    this.state = 'recover'
    this.timer = t / this.pace
  }

  private updateWaves(dt: number, ctx: WorldCtx): void {
    const p = ctx.player
    for (const w of this.waves) {
      w.x += w.dir * WAVE_SPEED * dt
      w.life -= dt
      const onGround = p.grounded && Math.abs(p.feetY - this.groundY) < 12
      if (onGround && Math.abs(p.pos.x - w.x) < p.hw + 14) {
        ctx.hurtPlayer(18, { x: w.x, y: this.groundY })
        w.life = 0
      }
      if (ctx.level.solidAt(w.x, this.groundY - 10)) w.life = 0
    }
    this.waves = this.waves.filter((w) => w.life > 0)
  }

  receiveStroke(hit: StrokeHit, dir: Vec, damage: number, ctx: WorldCtx): HitResult {
    const mult = this.state === 'stagger' ? (this.greatParry ? 2.5 : 2) : this.state === 'recover' ? 1.2 : 1
    return super.receiveStroke(hit, dir, damage * mult, ctx)
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    const { x, y } = this.pos
    const z = this.zone
    if (z) {
      // The killing zone: hatched red band, full height, with the countdown.
      const k = 1 - Math.max(0, this.timer) / this.windup
      g.save()
      g.globalAlpha = 0.1 + 0.12 * k
      g.fillStyle = RED
      g.fillRect(z.x0, 0, z.x1 - z.x0, this.levelH)
      g.globalAlpha = 0.25 + 0.3 * k
      g.strokeStyle = RED
      g.lineWidth = 2
      g.beginPath()
      for (let sx = z.x0 - this.levelH; sx < z.x1; sx += 36) {
        g.moveTo(Math.max(z.x0, sx), Math.max(0, z.x0 - sx))
        g.lineTo(Math.min(z.x1, sx + this.levelH), Math.min(this.levelH, z.x1 - sx))
      }
      g.stroke()
      g.restore()
      line(g, { x: z.x0, y: 0 }, { x: z.x0, y: this.levelH }, 3, RED, 0.8)
      line(g, { x: z.x1, y: 0 }, { x: z.x1, y: this.levelH }, 3, RED, 0.8)
      const cx = (z.x0 + z.x1) / 2
      text(g, '滅', cx, this.groundY - 160, 64 + 20 * k, RED, { font: FONT_BRUSH, alpha: 0.5 + 0.5 * k })
      ring(g, cx, this.groundY - 160, 54, 4, RED, 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
      // Raised club glows white while the Great Parry window is open.
      if (this.greatParryOpen) polyline(g, this.clubLine, 6, WHITE, 0.6 + 0.4 * Math.sin(time * 40))
    }
    if (this.state === 'sweepWindup') {
      const k = 1 - Math.max(0, this.timer) / this.windup
      polyline(g, this.sweepLine, 2 + 3 * k, RED, 0.35 + 0.55 * k, [10, 7])
    }
    for (const w of this.waves) {
      const a = Math.min(1, w.life)
      shape(g, [w.x - 18 * w.dir, this.groundY, w.x, this.groundY - 26, w.x + 10 * w.dir, this.groundY])
      line(g, { x: w.x - 30 * w.dir, y: this.groundY - 2 }, { x: w.x, y: this.groundY - 24 }, 2, WHITE, a * 0.6)
    }

    const c = this.bodyColor()
    const raise = this.state === 'kaizan' ? 1 : this.state === 'sweepWindup' ? 1 - Math.max(0, this.timer) / this.windup : this.state === 'stompWindup' ? 0.4 : 0
    g.save()
    g.translate(x, y)
    g.scale(this.facing, 1)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const crouch = this.state === 'stompWindup' ? 8 : 0
    limb(g, -10, 16 + crouch, -16, 46, 14)
    limb(g, 10, 16 + crouch, 16, 46, 14)
    // Armored bulk, horned helmet with a red crest.
    shape(g, [-30, 22, 28, 22, 34, -22 + crouch, 0, -40 + crouch, -30, -26 + crouch])
    shape(g, [-34, -24 + crouch, -18, -36 + crouch, -10, -18 + crouch])
    shape(g, [30, -24 + crouch, 16, -36 + crouch, 10, -18 + crouch])
    g.beginPath()
    g.arc(10, -36 + crouch, 12, 0, Math.PI * 2)
    g.fill()
    shape(g, [2, -44 + crouch, -8, -66 + crouch, 8, -46 + crouch])
    shape(g, [16, -44 + crouch, 28, -64 + crouch, 20, -44 + crouch])
    // Kanabo: overhead in Kaizan, swung low in a sweep.
    const ang = this.state === 'sweep' ? 0.6 : -0.3 - raise * 2.3
    const hx = 16
    const hy = -14 + crouch
    limb(g, -4, -20 + crouch, hx, hy, 10)
    limb(g, hx, hy, hx + Math.cos(ang) * 92, hy + Math.sin(ang) * 92, 13)
    g.restore()
    circle(g, x + this.facing * 15, y - 37 + crouch, 2.6, RED)
    if (this.state === 'stagger') {
      ring(g, x, y - this.hh - 30, 12, 2, INK, 0.7, time * 6, time * 6 + Math.PI * 1.4)
      ring(g, x, y - this.hh - 30, 6, 2, INK, 0.7, -time * 8, -time * 8 + Math.PI)
    }
  }
}

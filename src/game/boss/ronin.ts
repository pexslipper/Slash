import { type Vec, add, copy, dist, dot, lerpVec, mul, norm, rand, segAABB, sub } from '../../core/math.ts'
import { FONT_BRUSH, INK, RED, WHITE, circle, limb, polyline, ring, shape, text } from '../../render/ink.ts'
import { type Difficulty, Enemy, type HitResult, type StrokeHit, type WorldCtx } from '../enemies/base.ts'
import { unstick } from '../level.ts'

type State = 'stalk' | 'stance' | 'dash' | 'recover' | 'stagger'

const DASH_SPEED = 1700
const LINE_LEN = 560
const FRONTAL_DOT = -0.5
/** Phase 3 flurry: lines per stance, pause between them, and stagger per line parried. */
const FLURRY_LINES = 3
const FLURRY_GAP = 0.14
const FLURRY_STAGGER_PER_PARRY = 0.9
const NUMERALS = ['一', '二', '三']

/**
 * Final duel. He shows his iaido dash as a red line before striking: cut across
 * the line to parry and stagger him.
 * Phase 2 (half health): he mirrors you, starting his stance the moment you draw.
 * Phase 3 (quarter health): a flurry of three dashes in a row. Each line can be parried;
 * the more you parry, the longer he is left staggered.
 */
export class Ronin extends Enemy {
  readonly kind = 'ronin'
  phase: 1 | 2 | 3 = 1
  state: State = 'stalk'
  /** Telegraphed dashes still to come; the first is the current one. */
  private lines: [Vec, Vec][] = []
  private timer = 1.6
  private stanceDur = 1
  /** In a mirrored stance he waits for the player's cut to begin. */
  private mirrored = false
  private progress = 0
  private flurryParried = 0
  private ghosts: { x: number; y: number; life: number }[] = []
  private readonly diff: Difficulty

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 13, 27)
    this.diff = diff
    this.isBoss = true
    this.bossName = 'Kagemaru, the Mirror Ronin'
    this.setHp(520 * diff.hpMul)
    this.gold = 400
    this.contactDamage = 8
    this.poise = true
  }

  get guarding(): boolean {
    return this.state === 'stalk' || this.state === 'stance' || this.state === 'dash'
  }

  bossLabel(): string {
    if (this.state === 'stagger') return 'STAGGERED: STRIKE NOW'
    if (this.phase === 3) return 'Flurry: parry every line for a long stagger'
    if (this.phase === 2) return 'He mirrors your draw: cross his line, then strike'
    return 'Cut across his red line to parry'
  }

  bossAlert(): boolean {
    return this.state === 'stagger'
  }

  parryLines(): [Vec, Vec][] {
    return this.state === 'stance' || this.state === 'dash' ? this.lines : []
  }

  onParried(ctx: WorldCtx, index: number): void {
    if (this.phase === 3 && this.lines.length > 1) {
      // In a flurry each parried line is struck out; he carries on with the rest.
      this.flurryParried++
      if (index === 0 && this.state === 'dash') {
        this.lines.shift()
        this.lines[0] = [copy(this.pos), this.lines[0][1]]
        this.progress = 0
      } else {
        this.lines.splice(index, 1)
      }
      ctx.fx.text({ x: this.pos.x, y: this.pos.y - 70 }, `${this.flurryParried}/${FLURRY_LINES}`, RED, 26)
      return
    }
    this.endDash(ctx)
    this.state = 'stagger'
    this.timer = this.phase === 3 ? FLURRY_STAGGER_PER_PARRY * (this.flurryParried + 1) : 2.2
    this.flurryParried = 0
  }

  protected think(dt: number, ctx: WorldCtx): void {
    const p = ctx.player
    const dx = p.pos.x - this.pos.x
    for (const gh of this.ghosts) gh.life -= dt
    this.ghosts = this.ghosts.filter((gh) => gh.life > 0)

    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this.enterPhase(ctx, 2, 'He mirrors your stance')
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.25) this.enterPhase(ctx, 3, 'Flurry of the Mirror')

    if (!(this.state === 'stance' && this.mirrored)) this.timer -= dt
    switch (this.state) {
      case 'stalk': {
        this.facePlayer(ctx)
        const ad = Math.abs(dx)
        this.vel.x = ad > 320 ? this.facing * 120 : ad < 170 ? -this.facing * 90 : 0
        if (this.timer <= 0 && !p.dead) this.beginStance(ctx, false)
        break
      }
      case 'stance':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'dash'
          this.kinematic = true
          this.progress = 0
        }
        break
      case 'dash': {
        const line = this.lines[0]
        if (!line) {
          this.finishDashes(ctx)
          break
        }
        const [a, b] = line
        const total = dist(a, b)
        const prev = copy(this.pos)
        this.progress = Math.min(total, this.progress + DASH_SPEED * dt)
        this.pos = lerpVec(a, b, total > 0 ? this.progress / total : 1)
        this.facing = b.x >= a.x ? 1 : -1
        this.ghosts.push({ x: this.pos.x, y: this.pos.y, life: 0.2 })
        if (!p.invulnerable && segAABB(prev, this.pos, p.pos.x - p.hw, p.pos.y - p.hh, p.pos.x + p.hw, p.pos.y + p.hh) !== null) {
          ctx.hurtPlayer(22, prev)
          ctx.fx.splatter(p.pos, norm(sub(b, a)), RED, 14)
        }
        if (this.progress >= total) {
          this.lines.shift()
          if (this.lines.length > 0) {
            // Next line of the flurry after a breath.
            this.lines[0] = [copy(this.pos), this.lines[0][1]]
            this.state = 'stance'
            this.stanceDur = this.timer = FLURRY_GAP
            this.progress = 0
          } else {
            this.finishDashes(ctx)
          }
        }
        break
      }
      case 'recover':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'stalk'
          this.timer = (rand(1, 1.8) * (this.phase >= 2 ? 0.8 : 1)) / this.diff.chargeMul
        }
        break
      case 'stagger':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'stalk'
          this.timer = 0.8
        }
        break
    }
  }

  private enterPhase(ctx: WorldCtx, phase: 2 | 3, title: string): void {
    this.phase = phase
    this.endDash(ctx)
    this.state = 'recover'
    this.timer = 1.2
    ctx.fx.text({ x: this.pos.x, y: this.pos.y - 60 }, title, RED, 24)
    ctx.fx.flashScreen(INK, 0.25, 0.5)
  }

  /** A dash line from `from` toward `to`, cut short by walls. */
  private dashLine(ctx: WorldCtx, from: Vec, to: Vec, length: number): [Vec, Vec] {
    let dir = norm(sub(to, from))
    if (dir.x === 0 && dir.y === 0) dir = this.facingVec
    let end = add(from, mul(dir, length))
    const blocked = ctx.level.segmentBlocked(from, end)
    if (blocked !== null) end = lerpVec(from, end, Math.max(0, blocked - 0.02))
    return [copy(from), end]
  }

  private beginStance(ctx: WorldCtx, mirror: boolean): void {
    const target = ctx.player.pos
    this.lines = [this.dashLine(ctx, this.pos, target, LINE_LEN)]
    if (this.phase === 3 && !mirror) {
      // Flurry: each following line swings back through where the player is, from a new angle.
      for (let i = 1; i < FLURRY_LINES; i++) {
        const from = this.lines[i - 1][1]
        const aim = { x: target.x + rand(-120, 120), y: target.y + rand(-80, 10) }
        this.lines.push(this.dashLine(ctx, from, aim, LINE_LEN * 0.8))
      }
      this.flurryParried = 0
    }
    this.state = 'stance'
    this.mirrored = mirror
    this.stanceDur = this.timer = mirror ? 0.3 : (this.phase === 3 ? 1.1 : 1) / this.diff.chargeMul
    this.facing = this.lines[0][1].x >= this.pos.x ? 1 : -1
    this.vel = { x: 0, y: 0 }
  }

  private finishDashes(ctx: WorldCtx): void {
    this.endDash(ctx)
    if (this.flurryParried > 0) {
      // Parried part of the flurry: left open in proportion.
      this.state = 'stagger'
      this.timer = FLURRY_STAGGER_PER_PARRY * this.flurryParried
    } else {
      this.state = 'recover'
      this.timer = (this.phase >= 2 ? 0.9 : 1.2) / this.diff.chargeMul
    }
    this.flurryParried = 0
  }

  private endDash(ctx: WorldCtx): void {
    this.lines = []
    this.mirrored = false
    if (this.kinematic) {
      this.kinematic = false
      this.vel = { x: 0, y: 0 }
      unstick(ctx.level, this)
    }
  }

  onDrawStart(ctx: WorldCtx): void {
    if (this.alive && this.phase === 2 && this.state === 'stalk') this.beginStance(ctx, true)
  }

  onSlashStart(ctx: WorldCtx): void {
    super.onSlashStart(ctx)
    this.mirrored = false
  }

  receiveStroke(hit: StrokeHit, dir: Vec, damage: number, ctx: WorldCtx): HitResult {
    if (this.guarding && dot(dir, this.facingVec) < FRONTAL_DOT) {
      this.struck.add(hit.key)
      return { outcome: 'blocked', damage: 0, killed: false }
    }
    const mult = this.state === 'stagger' ? 2 : this.state === 'recover' ? 1.3 : 1
    return super.receiveStroke(hit, dir, damage * mult, ctx)
  }

  touchDamage(): number {
    return 0
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    this.lines.forEach((line, i) => {
      const current = i === 0
      const k = current ? (this.state === 'dash' ? 1 : 1 - Math.max(0, this.timer) / this.stanceDur) : 0.4
      const pulse = this.mirrored ? 0.5 + 0.5 * Math.sin(time * 30) : 1
      polyline(g, line, 2 + 3 * k, RED, (0.35 + 0.55 * k) * pulse, current && this.state === 'dash' ? undefined : [10, 7])
      if (this.lines.length > 1 || this.phase === 3) {
        const mid = lerpVec(line[0], line[1], 0.5)
        text(g, NUMERALS[FLURRY_LINES - this.lines.length + i] ?? '', mid.x, mid.y - 14, 18, RED, { font: FONT_BRUSH })
      }
    })
    for (const gh of this.ghosts) {
      g.save()
      g.globalAlpha = (gh.life / 0.2) * 0.3
      this.figure(g, gh.x, gh.y, INK, time)
      g.restore()
    }
    this.figure(g, this.pos.x, this.pos.y, this.bodyColor(), time)
    if (this.state === 'stagger') {
      ring(g, this.pos.x, this.pos.y - 40, 9, 1.5, INK, 0.7, time * 6, time * 6 + Math.PI * 1.4)
      ring(g, this.pos.x, this.pos.y - 40, 4, 1.5, INK, 0.7, -time * 8, -time * 8 + Math.PI)
    }
  }

  private figure(g: CanvasRenderingContext2D, x: number, y: number, c: string, time: number): void {
    const crouch = this.state === 'stance' ? 7 : this.state === 'dash' ? 4 : 0
    const hip = 6 + crouch
    g.save()
    g.translate(x, y)
    g.scale(this.facing, 1)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const wide = this.state === 'stance' || this.state === 'dash'
    limb(g, 0, hip, wide ? -15 : -6, 27, 6)
    limb(g, 0, hip, wide ? 16 : 7, 27, 6)
    shape(g, [-10, hip - 2, 10, hip - 2, 14, hip + 13, -14, hip + 13])
    shape(g, [-8, hip, 8, hip, 9, -13 + crouch, -8, -15 + crouch])
    g.beginPath()
    g.arc(1, -20 + crouch, 6, 0, Math.PI * 2)
    g.fill()
    // Unbound hair streaming behind.
    g.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(time * 3 + i) * 4
      g.beginPath()
      g.moveTo(-2, -22 + crouch + i * 2)
      g.quadraticCurveTo(-14, -20 + crouch + sway, -24 - i * 3, -14 + crouch + sway + i * 3)
      g.stroke()
    }
    if (this.state === 'dash' || this.state === 'recover') {
      limb(g, 4, -6 + crouch, 44, this.state === 'dash' ? -8 : 18, 3)
    } else if (this.state === 'stagger') {
      limb(g, -2, -4, -30, -20, 3)
    } else {
      limb(g, -4, hip - 4, -30, hip + 6, 3.5)
      limb(g, -4, hip - 4, 8, hip - 9, 4)
      if (this.state === 'stance') limb(g, 4, -8 + crouch, 7, hip - 8, 4)
    }
    g.restore()
    const ex = x + this.facing * 4
    circle(g, ex, y - 21 + crouch, 1.6, RED)
    if (this.state === 'dash') circle(g, ex, y - 21 + crouch, 3.5, WHITE, 0.4)
  }
}

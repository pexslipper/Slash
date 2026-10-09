import { type Vec, add, copy, dist, fromAngle, lerpVec, mul, norm, rand, segAABB, sub } from '../../core/math.ts'
import { FONT_BRUSH, INK, RED, WHITE, circle, limb, polyline, ring, shape, text } from '../../render/ink.ts'
import { type Difficulty, Enemy, type HitResult, type StrokeHit, type WorldCtx } from '../enemies/base.ts'
import { TILE, unstick } from '../level.ts'

type State = 'stalk' | 'throw' | 'stance' | 'dash' | 'recover' | 'stagger'

/** Real seconds of drawing she needs to read your cut (phase 1, phase 2). */
const READ_TIME = [0.9, 0.65]
const DASH_SPEED = 1800
const LINE_LEN = 480
const KUNAI_SPEED = 420
const CLONE_OFFSETS = [-170, 170]

/**
 * 狐 Kuzunoha, the Shadow Fox: an evasive duel.
 * While you draw, her eye fills; draw for too long and she reads the cut (読), blinking away
 * from your path the moment you release and throwing kunai where you will land. Quick,
 * decisive cuts can't be read. Her shadow dash shows a red line that can be parried.
 * Below half health she splits into illusions; only the real one has a red eye and a shadow.
 */
export class Kitsune extends Enemy {
  readonly kind = 'kitsune'
  phase: 1 | 2 = 1
  state: State = 'stalk'
  /** 0..1: how much of the player's current drawing she has read. */
  readFill = 0
  private line: [Vec, Vec] | null = null
  private timer = 1.4
  private windup = 0.5
  private progress = 0
  private throwAt: Vec | null = null
  private clones: KitsuneClone[] = []
  private ghosts: { x: number; y: number; life: number }[] = []
  private readonly diff: Difficulty

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 11, 24)
    this.diff = diff
    this.isBoss = true
    this.bossName = 'Kuzunoha, the Shadow Fox'
    this.setHp(380 * diff.hpMul)
    this.gold = 280
    this.contactDamage = 6
    this.poise = true
  }

  private get readTime(): number {
    return READ_TIME[this.phase - 1] / this.diff.chargeMul
  }

  bossLabel(): string {
    if (this.state === 'stagger') return 'STAGGERED: she cannot read you now'
    if (this.phase === 2) return 'Illusions: only the real fox has a red eye and a shadow'
    return 'Draw too long and she reads your cut. Strike fast, parry her dash.'
  }

  bossAlert(): boolean {
    return this.state === 'stagger' || this.readFill >= 1
  }

  parryLines(): [Vec, Vec][] {
    return (this.state === 'stance' || this.state === 'dash') && this.line ? [this.line] : []
  }

  onParried(ctx: WorldCtx): void {
    this.endDash(ctx)
    this.state = 'stagger'
    this.timer = 2
    this.readFill = 0
  }

  protected think(dt: number, ctx: WorldCtx): void {
    const p = ctx.player
    for (const gh of this.ghosts) gh.life -= dt
    this.ghosts = this.ghosts.filter((gh) => gh.life > 0)
    this.clones = this.clones.filter((c) => c.alive)

    // Foresight: her eye fills while the player keeps drawing.
    if (p.action === 'drawing' && this.state !== 'stagger') {
      const was = this.readFill
      this.readFill = Math.min(1, ctx.drawTime / this.readTime)
      if (was < 1 && this.readFill >= 1) ctx.fx.text({ x: this.pos.x, y: this.pos.y - 70 }, '読', RED, 34)
    } else if (p.action === 'free') {
      this.readFill = Math.max(0, this.readFill - dt * 2)
    }

    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2
      this.endDash(ctx)
      this.state = 'recover'
      this.timer = 1
      this.splitIllusions(ctx)
      ctx.fx.text({ x: this.pos.x, y: this.pos.y - 70 }, '分身 She splits', RED, 26)
      ctx.fx.flashScreen(INK, 0.25, 0.5)
    }

    this.timer -= dt
    switch (this.state) {
      case 'stalk': {
        // Keep a wary distance, circling.
        this.facePlayer(ctx)
        const dx = p.pos.x - this.pos.x
        const ad = Math.abs(dx)
        this.vel.x = ad > 340 ? this.facing * 150 : ad < 200 ? -this.facing * 160 : 0
        if (this.timer <= 0 && !p.dead) {
          if (Math.random() < 0.55) this.beginThrow(0.5, null)
          else this.beginStance(ctx)
        }
        break
      }
      case 'throw':
        this.vel.x = 0
        this.facePlayer(ctx)
        if (this.timer <= 0) {
          this.throwKunai(ctx, this.throwAt ?? p.pos)
          for (const c of this.clones) c.mimicThrow(ctx, this.throwAt ?? p.pos)
          this.throwAt = null
          this.state = 'recover'
          this.timer = 0.6
        }
        break
      case 'stance':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'dash'
          this.kinematic = true
          this.progress = 0
        }
        break
      case 'dash': {
        const line = this.line
        if (!line) {
          this.endDash(ctx)
          break
        }
        const [a, b] = line
        const total = dist(a, b)
        const prev = copy(this.pos)
        this.progress = Math.min(total, this.progress + DASH_SPEED * dt)
        this.pos = lerpVec(a, b, total > 0 ? this.progress / total : 1)
        this.ghosts.push({ x: this.pos.x, y: this.pos.y, life: 0.18 })
        if (!p.invulnerable && segAABB(prev, this.pos, p.pos.x - p.hw, p.pos.y - p.hh, p.pos.x + p.hw, p.pos.y + p.hh) !== null) {
          ctx.hurtPlayer(18, prev)
        }
        if (this.progress >= total) {
          this.endDash(ctx)
          this.state = 'recover'
          this.timer = 0.9 / this.diff.chargeMul
        }
        break
      }
      case 'recover':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'stalk'
          this.timer = rand(0.8, 1.5) / this.diff.chargeMul
        }
        break
      case 'stagger':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'stalk'
          this.timer = 0.6
          if (this.phase === 2 && this.clones.length === 0) this.splitIllusions(ctx)
        }
        break
    }
  }

  private beginThrow(windup: number, at: Vec | null): void {
    this.state = 'throw'
    this.windup = this.timer = windup
    this.throwAt = at
  }

  private beginStance(ctx: WorldCtx): void {
    let dir = norm(sub(ctx.player.pos, this.pos))
    if (dir.x === 0 && dir.y === 0) dir = this.facingVec
    let end = add(this.pos, mul(dir, LINE_LEN))
    const blocked = ctx.level.segmentBlocked(this.pos, end)
    if (blocked !== null) end = lerpVec(this.pos, end, Math.max(0, blocked - 0.02))
    this.line = [copy(this.pos), end]
    this.state = 'stance'
    this.windup = this.timer = 0.8 / this.diff.chargeMul
    this.facing = dir.x >= 0 ? 1 : -1
    this.vel = { x: 0, y: 0 }
  }

  private endDash(ctx: WorldCtx): void {
    this.line = null
    if (this.kinematic) {
      this.kinematic = false
      this.vel = { x: 0, y: 0 }
      unstick(ctx.level, this)
    }
  }

  /** Throws a fan of kunai at a point. */
  throwKunai(ctx: WorldCtx, at: Vec): void {
    const base = Math.atan2(at.y - this.pos.y, at.x - this.pos.x)
    for (let i = -2; i <= 2; i++) {
      ctx.spawnProjectile({ pos: { x: this.pos.x, y: this.pos.y - 8 }, vel: fromAngle(base + i * 0.13, KUNAI_SPEED * this.diff.speedMul), damage: 9, kind: 'arrow', gravity: 0 })
    }
  }

  private splitIllusions(ctx: WorldCtx): void {
    for (const off of CLONE_OFFSETS) {
      const clone = new KitsuneClone({ x: this.pos.x + off, y: this.pos.y + this.hh }, this.diff, this, off)
      this.clones.push(clone)
      ctx.spawnEnemy(clone)
      ctx.fx.smoke(clone.pos, 6, 16)
    }
  }

  /** On release: if she has read the cut, she is already gone. */
  onSlashStart(ctx: WorldCtx): void {
    super.onSlashStart(ctx)
    const path = ctx.plannedPath
    if (!this.alive || this.state === 'stagger' || this.readFill < 1 || !path) return
    this.readFill = 0
    const from = copy(this.pos)
    this.endDash(ctx)
    this.pos = this.safestSpot(ctx, path)
    this.vel = { x: 0, y: 0 }
    ctx.fx.smoke(from, 8, 18)
    ctx.fx.smoke(this.pos, 8, 18)
    ctx.fx.text({ x: from.x, y: from.y - 60 }, '読 Read!', RED, 28)
    // Counter: kunai at where the cut will end.
    this.beginThrow(0.25, copy(path[path.length - 1]))
  }

  /** The standing spot in the arena farthest from every point of the planned cut. */
  private safestSpot(ctx: WorldCtx, path: Vec[]): Vec {
    const L = ctx.level
    let best = copy(this.pos)
    let bestD = -1
    const sample = path.filter((_, i) => i % 4 === 0)
    for (let x = TILE * 1.5; x < L.width - TILE; x += TILE) {
      for (let y = TILE; y < L.height; y += TILE * 3) {
        const ground = L.findGround(x, y)
        if (ground === null) continue
        const spot = { x, y: ground - this.hh }
        const d = Math.min(...sample.map((q) => dist(q, spot)))
        if (d > bestD) {
          bestD = d
          best = spot
        }
      }
    }
    return best
  }

  receiveStroke(hit: StrokeHit, dir: Vec, damage: number, ctx: WorldCtx): HitResult {
    const mult = this.state === 'stagger' ? 2 : 1
    return super.receiveStroke(hit, dir, damage * mult, ctx)
  }

  applyDamage(amount: number, ctx: WorldCtx): boolean {
    const killed = super.applyDamage(amount, ctx)
    if (killed) for (const c of this.clones) c.alive = false
    return killed
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    if (this.line) {
      const k = this.state === 'dash' ? 1 : 1 - Math.max(0, this.timer) / this.windup
      polyline(g, this.line, 2 + 3 * k, RED, 0.35 + 0.55 * k, this.state === 'dash' ? undefined : [10, 7])
    }
    for (const gh of this.ghosts) {
      g.save()
      g.globalAlpha = (gh.life / 0.18) * 0.3
      drawFox(g, gh.x, gh.y, this.facing, INK, time, 'dash', false)
      g.restore()
    }
    // The tell: only the real fox casts a shadow and has a red eye.
    g.save()
    g.globalAlpha = 0.25
    g.fillStyle = INK
    g.beginPath()
    g.ellipse(this.pos.x, this.pos.y + this.hh + 2, 16, 4, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
    drawFox(g, this.pos.x, this.pos.y, this.facing, this.bodyColor(), time, this.state, true)
    if (this.state === 'stagger') {
      ring(g, this.pos.x, this.pos.y - 42, 9, 1.5, INK, 0.7, time * 6, time * 6 + Math.PI * 1.4)
    } else if (this.readFill > 0) {
      // Foresight eye: fills while you draw.
      const ex = this.pos.x
      const ey = this.pos.y - 52
      ring(g, ex, ey, 9, 1.5, INK, 0.5)
      ring(g, ex, ey, 9, 3, RED, 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.readFill)
      circle(g, ex, ey, 3, this.readFill >= 1 ? RED : INK)
      if (this.readFill >= 1) text(g, '読', ex + 20, ey, 18, RED, { font: FONT_BRUSH })
    }
  }
}

/** An illusion of the fox: shadows her, throws when she throws, and dissolves when cut. */
export class KitsuneClone extends Enemy {
  readonly kind = 'foxclone'
  private readonly owner: Kitsune | null
  private readonly offset: number

  constructor(feet: Vec, _diff: Difficulty, owner: Kitsune | null = null, offset = 0) {
    super(feet, 11, 24)
    this.owner = owner
    this.offset = offset
    this.illusion = true
    this.poise = true
    this.setHp(1)
    this.gold = 0
    this.contactDamage = 0
    this.kinematic = true
  }

  protected think(dt: number, ctx: WorldCtx): void {
    const o = this.owner
    if (!o || !o.alive) {
      this.alive = false
      return
    }
    // Hover beside her, mirroring her stance.
    const L = ctx.level
    const target = { x: Math.max(TILE, Math.min(L.width - TILE, o.pos.x + this.offset)), y: o.pos.y }
    this.pos = lerpVec(this.pos, target, Math.min(1, dt * 6))
    this.facing = ctx.player.pos.x >= this.pos.x ? 1 : -1
  }

  mimicThrow(ctx: WorldCtx, at: Vec): void {
    const base = Math.atan2(at.y - this.pos.y, at.x - this.pos.x)
    for (let i = -1; i <= 1; i++) {
      ctx.spawnProjectile({ pos: { x: this.pos.x, y: this.pos.y - 8 }, vel: fromAngle(base + i * 0.16, KUNAI_SPEED), damage: 7, kind: 'arrow', gravity: 0 })
    }
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    drawFox(g, this.pos.x, this.pos.y, this.facing, this.bodyColor(), time, this.owner?.state ?? 'stalk', false)
  }
}

/** Fox-spirit silhouette: masked head with ears, kimono, and three sweeping tails. */
function drawFox(g: CanvasRenderingContext2D, x: number, y: number, facing: 1 | -1, c: string, time: number, state: State, redEye: boolean): void {
  const crouch = state === 'stance' || state === 'throw' ? 6 : state === 'dash' ? 4 : 0
  g.save()
  g.translate(x, y)
  g.scale(facing, 1)
  g.fillStyle = c
  g.strokeStyle = c
  g.lineCap = 'round'
  // Tails.
  g.lineWidth = 5
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(time * 4 + i * 1.3) * 6
    g.beginPath()
    g.moveTo(-6, 8)
    g.quadraticCurveTo(-26 - i * 4, 4 + sway, -34 - i * 6, -14 - i * 8 + sway)
    g.stroke()
  }
  limb(g, -2, 10 + crouch, state === 'dash' ? -14 : -6, 24, 4)
  limb(g, 2, 10 + crouch, 6, 24, 4)
  // Kimono with flared sleeves.
  shape(g, [-9, 14, 9, 14, 7, -8 + crouch, -7, -10 + crouch])
  shape(g, [4, -6 + crouch, 18, 0 + crouch, 6, 2 + crouch])
  g.beginPath()
  g.arc(1, -15 + crouch, 5.5, 0, Math.PI * 2)
  g.fill()
  // Ears.
  shape(g, [-3, -19 + crouch, -1, -28 + crouch, 2, -20 + crouch])
  shape(g, [3, -19 + crouch, 6, -27 + crouch, 7, -18 + crouch])
  if (state === 'throw' || state === 'dash') limb(g, 6, -4 + crouch, 22, -8 + crouch, 2)
  g.restore()
  if (redEye) circle(g, x + facing * 4, y - 16 + crouch, 1.6, RED)
  else circle(g, x + facing * 4, y - 16 + crouch, 1.4, WHITE, 0.6)
}

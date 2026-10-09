import { type Vec, add, clamp, copy, dist, mul, sub, vec } from '../core/math.ts'
import { INK, RED, WHITE, limb, shape } from '../render/ink.ts'
import { type Body, GRAVITY, type Level, MAX_FALL, moveBody } from './level.ts'

export type Action = 'free' | 'drawing' | 'approach' | 'slash'
export type Pose = 'idle' | 'run' | 'air' | 'stance' | 'dash'

const RUN_SPEED = 280
const MAX_JUMP_H = 230
const MAX_JUMP_VX = 430
const SCARF_SEG = 6

interface Ghost {
  x: number
  y: number
  facing: 1 | -1
  life: number
}

export class Player implements Body {
  pos: Vec
  vel: Vec = vec()
  readonly hw = 10
  readonly hh = 22
  grounded = false
  dropTimer = 0
  hp: number
  action: Action = 'free'
  facing: 1 | -1 = 1
  iframes = 0
  hurtFlash = 0
  dead = false
  airJumps = 1
  /** X the player is running toward, set by a click. */
  runTarget: number | null = null
  /** Low-gravity time after a cut, so cuts can be chained in the air. */
  hang = 0
  slashDir: Vec = vec(1, 0)
  /** Last spot standing on safe ground, for respawning after a fall. */
  lastSafe: Vec
  private runPhase = 0
  private readonly scarf: Vec[]
  private ghosts: Ghost[] = []

  constructor(pos: Vec, hp: number) {
    this.pos = copy(pos)
    this.hp = hp
    this.lastSafe = copy(pos)
    this.scarf = Array.from({ length: 7 }, (_, i) => ({ x: pos.x - i * SCARF_SEG, y: pos.y - 12 }))
  }

  get invulnerable(): boolean {
    return this.dead || this.action === 'approach' || this.action === 'slash' || this.iframes > 0
  }

  get feetY(): number {
    return this.pos.y + this.hh
  }

  get pose(): Pose {
    if (this.action === 'approach' || this.action === 'slash') return 'dash'
    if (this.action === 'drawing') return 'stance'
    if (!this.grounded) return 'air'
    return Math.abs(this.vel.x) > 20 ? 'run' : 'idle'
  }

  /** Running, gravity and collision while not dashing. */
  physics(dt: number, level: Level): void {
    if (this.runTarget !== null && this.grounded) {
      const dx = this.runTarget - this.pos.x
      if (Math.abs(dx) < 6) {
        this.runTarget = null
        this.vel.x = 0
      } else {
        this.vel.x = Math.sign(dx) * RUN_SPEED
        this.facing = dx > 0 ? 1 : -1
      }
    } else if (this.grounded) {
      this.vel.x *= Math.exp(-dt * 16)
    }
    this.hang = Math.max(0, this.hang - dt)
    this.dropTimer = Math.max(0, this.dropTimer - dt)
    this.vel.y = Math.min(MAX_FALL, this.vel.y + GRAVITY * (this.hang > 0 ? 0.25 : 1) * dt)
    if (moveBody(level, this, dt)) this.runTarget = null
    if (this.grounded) this.airJumps = 1
  }

  /** Ballistic jump that lands on (or as close as possible to) `t`. */
  jumpTo(t: Vec): void {
    const rise = this.feetY - t.y
    const h = clamp(rise + 50, 60, MAX_JUMP_H)
    const vy = -Math.sqrt(2 * GRAVITY * h)
    const tUp = -vy / GRAVITY
    const tDown = Math.sqrt((2 * Math.max(0, h - rise)) / GRAVITY)
    const dx = t.x - this.pos.x
    this.vel = { x: clamp(dx / (tUp + tDown), -MAX_JUMP_VX, MAX_JUMP_VX), y: vy }
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1
    this.runTarget = null
    this.grounded = false
    this.hang = 0
  }

  tick(dt: number): void {
    this.iframes = Math.max(0, this.iframes - dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.runPhase += Math.abs(this.vel.x) * dt * 0.06
    for (const g of this.ghosts) g.life -= dt
    this.ghosts = this.ghosts.filter((g) => g.life > 0)
    this.updateScarf(dt)
  }

  /** Leaves a fading afterimage at the current position (called while dashing). */
  addGhost(): void {
    this.ghosts.push({ x: this.pos.x, y: this.pos.y, facing: this.facing, life: 0.22 })
  }

  private updateScarf(dt: number): void {
    const crouch = this.pose === 'stance' ? 6 : 0
    this.scarf[0] = { x: this.pos.x - 3 * this.facing, y: this.pos.y - 12 + crouch }
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i]
      p.x -= this.facing * 40 * dt
      p.y += (18 + Math.sin(performance.now() / 180 + i) * 14) * dt
      const prev = this.scarf[i - 1]
      const d = dist(p, prev)
      if (d > SCARF_SEG) this.scarf[i] = add(prev, mul(sub(p, prev), SCARF_SEG / d))
    }
  }

  render(g: CanvasRenderingContext2D): void {
    if (this.dead) return
    for (const gh of this.ghosts) drawSamurai(g, gh.x, gh.y, gh.facing, 'dash', 0, INK, (gh.life / 0.22) * 0.3)
    g.save()
    if (this.iframes > 0 && this.action === 'free' && Math.floor(this.iframes * 18) % 2 === 0) g.globalAlpha = 0.4
    g.strokeStyle = RED
    g.lineCap = 'round'
    for (let i = 1; i < this.scarf.length; i++) limb(g, this.scarf[i - 1].x, this.scarf[i - 1].y, this.scarf[i].x, this.scarf[i].y, 4 - i * 0.45)
    drawSamurai(g, this.pos.x, this.pos.y, this.facing, this.pose, this.runPhase, this.hurtFlash > 0 ? RED : INK, 1)
    if (this.pose === 'dash') {
      const hand = { x: this.pos.x + 6 * this.facing, y: this.pos.y - 4 }
      const tip = add(hand, mul(this.slashDir, 38))
      g.strokeStyle = INK
      limb(g, hand.x, hand.y, tip.x, tip.y, 4.5)
      g.strokeStyle = WHITE
      limb(g, hand.x, hand.y, tip.x, tip.y, 1.8)
    }
    g.restore()
  }
}

/** Ink silhouette of a samurai in a straw kasa hat. Origin is the body center; feet at +22. */
export function drawSamurai(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: 1 | -1,
  pose: Pose,
  phase: number,
  color: string,
  alpha: number,
): void {
  g.save()
  g.globalAlpha *= alpha
  g.translate(x, y)
  g.scale(facing, 1)
  g.fillStyle = color
  g.strokeStyle = color
  g.lineCap = 'round'
  const crouch = pose === 'stance' ? 6 : pose === 'dash' ? 3 : 0
  const lean = pose === 'dash' ? 6 : pose === 'run' ? 3 : 0
  const hip = 4 + crouch

  const s = Math.sin(phase)
  const feet: number[][] =
    pose === 'run'
      ? [
          [s * 11, 22],
          [-s * 11, 22],
        ]
      : pose === 'air'
        ? [
            [-7, 15],
            [9, 13],
          ]
        : pose === 'stance'
          ? [
              [-13, 22],
              [14, 22],
            ]
          : pose === 'dash'
            ? [
                [-16, 17],
                [5, 20],
              ]
            : [
                [-5, 22],
                [6, 22],
              ]
  for (const [fx, fy] of feet) limb(g, 0, hip, fx, fy, 5)

  shape(g, [-8, hip - 2, 8, hip - 2, 11, hip + 10, -11, hip + 10])
  shape(g, [-6, hip, 6, hip, 7 + lean, -10 + crouch, -6 + lean, -12 + crouch])
  g.beginPath()
  g.arc(1 + lean, -16 + crouch, 5, 0, Math.PI * 2)
  g.fill()
  shape(g, [-14 + lean, -17 + crouch, 16 + lean, -17 + crouch, 1 + lean, -27 + crouch])

  if (pose !== 'dash') {
    limb(g, -3, hip - 4, -25, hip + 4, 3)
    limb(g, -3, hip - 4, 6, hip - 8, 3.5)
    if (pose === 'stance') limb(g, 3 + lean, -8 + crouch, 5, hip - 7, 3.5)
  } else {
    limb(g, -3, hip - 4, -22, hip + 6, 3)
  }
  g.restore()
}

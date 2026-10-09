import { type Vec, segAABB } from '../../core/math.ts'
import { RED, limb, polyline, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy, type WorldCtx } from './base.ts'

type State = 'patrol' | 'windup' | 'thrust' | 'recover'

const REACH = 64

/** Spearman: patrols, sets his feet, then thrusts forward. */
export class Ashigaru extends Enemy {
  readonly kind = 'ashigaru'
  private state: State = 'patrol'
  private timer = 0
  private step = 0
  private readonly speed: number
  private readonly windup: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 12, 22)
    this.setHp(45 * diff.hpMul)
    this.gold = 8
    this.weakNode = { x: -14, y: -4, r: 6 }
    this.speed = 55 * diff.speedMul
    this.windup = 0.7 / diff.chargeMul
  }

  private get spearOffset(): number {
    return this.state === 'windup' ? -12 : this.state === 'thrust' ? 22 : 0
  }

  protected onFlinch(): void {
    if (this.state === 'windup' || this.state === 'thrust') {
      this.state = 'recover'
      this.timer = 0.5
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.timer -= dt
    this.step += Math.abs(this.vel.x) * dt * 0.12
    switch (this.state) {
      case 'patrol':
        this.patrol(ctx, this.speed)
        if (this.sees(ctx, 230, 50)) {
          this.facePlayer(ctx)
          this.state = 'windup'
          this.timer = this.windup
        }
        break
      case 'windup':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'thrust'
          this.timer = 0.25
        }
        break
      case 'thrust': {
        this.vel.x = this.groundAhead(ctx.level) ? this.facing * 420 : 0
        const p = ctx.player
        const a = { x: this.pos.x + this.facing * 8, y: this.pos.y - 4 }
        const b = { x: this.pos.x + this.facing * REACH, y: this.pos.y - 4 }
        if (segAABB(a, b, p.pos.x - p.hw, p.pos.y - p.hh, p.pos.x + p.hw, p.pos.y + p.hh) !== null) ctx.hurtPlayer(12, this.pos)
        if (this.timer <= 0) {
          this.state = 'recover'
          this.timer = 0.8
        }
        break
      }
      case 'recover':
        this.vel.x = 0
        if (this.timer <= 0) this.state = 'patrol'
        break
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    const off = this.spearOffset
    const c = this.bodyColor()
    g.save()
    this.local(g)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const s = Math.sin(this.step)
    limb(g, -2, 6, -4 + s * 7, 22, 5)
    limb(g, 2, 6, 5 - s * 7, 22, 5)
    shape(g, [-7, 9, 7, 9, 6, -10, -6, -10])
    g.beginPath()
    g.arc(0, -14, 4.5, 0, Math.PI * 2)
    g.fill()
    shape(g, [-13, -15, 13, -15, 0, -23])
    limb(g, 2, -6, 8 + off * 0.5, -4, 3.5)
    limb(g, -24 + off, -4, 30 + off, -4, 2.5)
    shape(g, [30 + off, -8, 42 + off, -4, 30 + off, 0])
    g.restore()
    if (this.state === 'windup') {
      const k = 1 - Math.max(0, this.timer) / this.windup
      const tip = { x: this.pos.x + this.facing * (42 + off), y: this.pos.y - 4 }
      polyline(g, [tip, { x: tip.x + this.facing * (REACH - 8), y: tip.y }], 2, RED, 0.3 + 0.6 * k, [4, 5])
    }
  }
}

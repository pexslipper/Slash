import type { Vec } from '../../core/math.ts'
import { INK, RED, circle, limb, ring, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy, type WorldCtx } from './base.ts'

type State = 'advance' | 'windup' | 'slam' | 'recover'

const SLAM_REACH = 140

/**
 * Oni brute: huge, slow and poised. Telegraphs a club slam that shakes the ground in front of it.
 * Too heavy to launch far: freeze it with a zigzag Still Cut, or cut it apart on the ground.
 */
export class Oni extends Enemy {
  readonly kind = 'oni'
  private state: State = 'advance'
  private timer = 0
  private step = 0
  private readonly speed: number
  private readonly windup: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 22, 34)
    this.setHp(170 * diff.hpMul)
    this.gold = 30
    this.contactDamage = 10
    this.poise = true
    this.weight = 1.8
    this.weakNode = { x: -25, y: -14, r: 8 }
    this.speed = 45 * diff.speedMul
    this.windup = 1 / diff.chargeMul
  }

  /** Poise ignores ordinary slashes, but a launch or a freeze still breaks the swing. */
  protected onFlinch(): void {
    if (this.state === 'windup' || this.state === 'slam') {
      this.state = 'recover'
      this.timer = 0.8
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.timer -= dt
    this.step += Math.abs(this.vel.x) * dt * 0.08
    const p = ctx.player
    const dx = p.pos.x - this.pos.x
    const dy = p.pos.y - this.pos.y
    switch (this.state) {
      case 'advance': {
        const near = this.sees(ctx, 520, 160)
        if (near) this.facePlayer(ctx)
        this.vel.x = near && Math.abs(dx) > 90 && this.groundAhead(ctx.level) ? this.facing * this.speed : 0
        if (near && Math.abs(dx) < 120 && Math.abs(dy) < 70) {
          this.state = 'windup'
          this.timer = this.windup
          this.vel.x = 0
        }
        break
      }
      case 'windup':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'slam'
          this.timer = 0.2
          // The club hits the ground: a shockwave along the floor in front of it.
          const ahead = dx * this.facing
          if (!p.dead && ahead > -20 && ahead < SLAM_REACH + 20 && Math.abs(dy) < 60) ctx.hurtPlayer(18, this.pos)
          const at = { x: this.pos.x + this.facing * 70, y: this.pos.y + this.hh }
          ctx.fx.smoke(at, 10, 22)
          ctx.fx.splatter(at, { x: this.facing, y: -1 }, INK, 14, 300, 4)
          ctx.fx.shake(10)
        }
        break
      case 'slam':
        if (this.timer <= 0) {
          this.state = 'recover'
          this.timer = 1.1
        }
        break
      case 'recover':
        if (this.timer <= 0) this.state = 'advance'
        break
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    const c = this.bodyColor()
    const raise = this.state === 'windup' ? 1 - Math.max(0, this.timer) / this.windup : this.state === 'slam' ? -0.4 : 0
    g.save()
    g.translate(this.pos.x, this.pos.y)
    g.scale(this.facing, 1)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const s = Math.sin(this.step)
    limb(g, -7, 12, -11 + s * 6, 34, 10)
    limb(g, 7, 12, 11 - s * 6, 34, 10)
    // Hunched, broad torso and a horned head thrust forward.
    shape(g, [-20, 16, 18, 16, 22, -14, 4, -26, -18, -18])
    g.beginPath()
    g.arc(12, -24, 9, 0, Math.PI * 2)
    g.fill()
    shape(g, [8, -31, 6, -44, 13, -32])
    shape(g, [15, -31, 21, -42, 19, -30])
    // Kanabo club: raised overhead in the wind-up, slammed down after.
    const ang = -0.2 - raise * 2.2
    const hand = { x: 14, y: -8 }
    const end = { x: hand.x + Math.cos(ang) * 50, y: hand.y + Math.sin(ang) * 50 }
    limb(g, -2, -10, hand.x, hand.y, 7)
    limb(g, hand.x, hand.y, end.x, end.y, 9)
    g.restore()
    const eye = { x: this.pos.x + this.facing * 15, y: this.pos.y - 25 }
    circle(g, eye.x, eye.y, 2, RED)
    if (this.state === 'windup') {
      const k = 1 - Math.max(0, this.timer) / this.windup
      ring(g, this.pos.x + this.facing * 70, this.pos.y + this.hh, SLAM_REACH * 0.55, 2, RED, 0.2 + 0.6 * k, Math.PI, Math.PI * 2)
    }
  }
}

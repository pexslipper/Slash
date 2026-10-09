import { type Vec, add, mul, norm, sub } from '../../core/math.ts'
import { RED, limb, polyline, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy, type WorldCtx } from './base.ts'

const ARROW_SPEED = 560
const ARROW_GRAVITY = 320

/** Stands its ground, draws the bow with a visible aim line, and looses an arrow. */
export class Archer extends Enemy {
  readonly kind = 'archer'
  private state: 'watch' | 'draw' | 'recover' = 'watch'
  private timer = 0
  private aim: Vec = { x: -1, y: 0 }
  private readonly drawTime: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 11, 22)
    this.setHp(32 * diff.hpMul)
    this.gold = 9
    this.contactDamage = 4
    this.weakNode = { x: -13, y: -6, r: 6 }
    this.drawTime = 1.3 / diff.chargeMul
  }

  private get bow(): Vec {
    return { x: this.pos.x + this.facing * 8, y: this.pos.y - 8 }
  }

  /** Aims a little high to make up for the arrow's drop. */
  private aimAt(target: Vec): Vec {
    const d = sub(target, this.bow)
    const lift = Math.abs(d.x) * 0.22
    return norm({ x: d.x, y: d.y - lift })
  }

  protected onFlinch(): void {
    if (this.state === 'draw') {
      this.state = 'recover'
      this.timer = 0.6
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.vel.x = 0
    this.timer -= dt
    switch (this.state) {
      case 'watch':
        if (this.sees(ctx, 760, 420)) {
          this.facePlayer(ctx)
          this.state = 'draw'
          this.timer = this.drawTime
        }
        break
      case 'draw':
        this.facePlayer(ctx)
        this.aim = this.aimAt(ctx.player.pos)
        if (this.timer <= 0) {
          ctx.spawnProjectile({ pos: this.bow, vel: mul(this.aim, ARROW_SPEED), damage: 10, kind: 'arrow', gravity: ARROW_GRAVITY })
          this.state = 'recover'
          this.timer = 1.1
        }
        break
      case 'recover':
        if (this.timer <= 0) this.state = 'watch'
        break
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    const c = this.bodyColor()
    const pull = this.state === 'draw' ? 1 - Math.max(0, this.timer) / this.drawTime : 0
    g.save()
    this.local(g)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    limb(g, -2, 6, -8, 22, 5)
    limb(g, 2, 6, 7, 22, 5)
    shape(g, [-7, 9, 7, 9, 6, -10, -6, -10])
    g.beginPath()
    g.arc(0, -14, 4.5, 0, Math.PI * 2)
    g.fill()
    limb(g, -4, -16, -12, -13, 2)
    g.translate(8, -8)
    g.rotate(Math.atan2(this.aim.y, this.aim.x * this.facing))
    g.lineWidth = 2.5
    g.beginPath()
    g.arc(-6, 0, 18, -1.15, 1.15)
    g.stroke()
    const bx = -6 + Math.cos(1.15) * 18
    const by = Math.sin(1.15) * 18
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(bx, -by)
    g.lineTo(-pull * 14, 0)
    g.lineTo(bx, by)
    g.stroke()
    if (this.state === 'draw') limb(g, -pull * 14, 0, 16, 0, 1.6)
    g.restore()
    if (this.state === 'draw') polyline(g, [this.bow, add(this.bow, mul(this.aim, 150))], 1.5, RED, 0.25 + 0.6 * pull, [3, 6])
  }
}

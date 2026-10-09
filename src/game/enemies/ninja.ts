import { type Vec, mul, norm, rand, sub } from '../../core/math.ts'
import { INK, RED, limb, ring, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy, type WorldCtx } from './base.ts'

/**
 * Picks a blink destination the moment you start drawing (shown as a shadow)
 * and vanishes there when your cut begins, so aim for the shadow.
 */
export class Ninja extends Enemy {
  readonly kind = 'ninja'
  private ghost: Vec | null = null
  private shotT: number
  private step = 0
  private readonly speed: number
  private readonly shotEvery: number
  private readonly shotSpeed: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 10, 20)
    this.setHp(32 * diff.hpMul)
    this.gold = 16
    this.contactDamage = 5
    this.speed = 120 * diff.speedMul
    this.shotEvery = 2.4 / diff.chargeMul
    this.shotT = rand(1, this.shotEvery)
    this.shotSpeed = 400 * diff.speedMul
  }

  onDrawStart(ctx: WorldCtx): void {
    if (!this.alive || Math.abs(ctx.player.pos.x - this.pos.x) > 900) return
    for (let i = 0; i < 20; i++) {
      const x = this.pos.x + rand(150, 320) * (Math.random() < 0.5 ? -1 : 1)
      const ground = ctx.level.findGround(x, this.pos.y - 160)
      if (ground === null || Math.abs(x - ctx.player.pos.x) < 80) continue
      this.ghost = { x, y: ground - this.hh }
      return
    }
  }

  onSlashStart(ctx: WorldCtx): void {
    super.onSlashStart(ctx)
    if (!this.ghost) return
    ctx.fx.smoke(this.pos, 6, 16)
    this.pos = this.ghost
    this.vel = { x: 0, y: 0 }
    this.ghost = null
    ctx.fx.smoke(this.pos, 6, 16)
  }

  protected onFlinch(): void {
    this.shotT = Math.max(this.shotT, 0.8)
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.step += Math.abs(this.vel.x) * dt * 0.12
    const sees = this.sees(ctx, 620, 260)
    if (sees) {
      this.facePlayer(ctx)
      this.vel.x = 0
    } else {
      this.patrol(ctx, this.speed)
    }
    this.shotT -= dt
    if (this.shotT <= 0) {
      this.shotT = this.shotEvery
      if (sees) {
        const dir = norm(sub(ctx.player.pos, this.pos))
        ctx.spawnProjectile({ pos: { x: this.pos.x, y: this.pos.y - 6 }, vel: mul(dir, this.shotSpeed), damage: 8, kind: 'shuriken', gravity: 0 })
      }
    }
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    if (this.ghost) {
      g.save()
      g.globalAlpha = 0.28 + 0.12 * Math.sin(time * 14)
      this.figure(g, this.ghost.x, this.ghost.y, INK)
      g.restore()
      ring(g, this.ghost.x, this.ghost.y + this.hh, 16, 1.5, RED, 0.6, Math.PI, Math.PI * 2)
    }
    this.figure(g, this.pos.x, this.pos.y, this.bodyColor())
    if (this.shotT < 0.4) ring(g, this.pos.x + this.facing * 8, this.pos.y - 6, 5 + (0.4 - this.shotT) * 10, 1.5, RED, 0.8)
  }

  private figure(g: CanvasRenderingContext2D, x: number, y: number, c: string): void {
    g.save()
    g.translate(x, y)
    g.scale(this.facing, 1)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const s = Math.sin(this.step)
    limb(g, -1, 6, -6 + s * 8, 20, 4)
    limb(g, 1, 6, 7 - s * 8, 20, 4)
    shape(g, [-5, 8, 5, 8, 7, -9, -5, -9])
    g.beginPath()
    g.arc(2, -13, 4.5, 0, Math.PI * 2)
    g.fill()
    limb(g, -2, -14, -13, -10, 1.6)
    limb(g, -2, -14, -12, -16, 1.6)
    limb(g, 3, -6, 12, -2, 3)
    g.restore()
  }
}

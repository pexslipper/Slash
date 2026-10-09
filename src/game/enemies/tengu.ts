import { type Vec, add, copy, fromAngle, len, mul, norm, sub } from '../../core/math.ts'
import { RED, limb, polyline, shape } from '../../render/ink.ts'
import type { Player } from '../player.ts'
import { type Difficulty, Enemy, type WorldCtx } from './base.ts'

type State = 'hover' | 'windup' | 'dive' | 'rise'

const DIVE_SPEED = 620
const DIVE_TIME = 0.55

/**
 * Crow tengu: flies above the fight, then telegraphs and dives at you. It is always in the
 * air, so a zigzag Still Cut through it kills it outright; a circle also holds it.
 */
export class Tengu extends Enemy {
  readonly kind = 'tengu'
  private state: State = 'hover'
  private timer: number
  private flap = 0
  private diveDir: Vec = { x: 0, y: 1 }
  private readonly home: Vec
  private readonly speed: number
  private readonly windup: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 14, 14)
    this.setHp(30 * diff.hpMul)
    this.gold = 14
    this.contactDamage = 6
    this.weakNode = { x: -15, y: -3, r: 6 }
    this.flies = true
    this.home = copy(this.pos)
    this.speed = 150 * diff.speedMul
    this.windup = 0.6 / diff.chargeMul
    this.timer = 1 + Math.random() * 2
  }

  protected onFlinch(): void {
    if (this.state === 'windup' || this.state === 'dive') {
      this.state = 'rise'
      this.timer = 0.6
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.flap += dt * (this.state === 'dive' ? 4 : 12)
    this.timer -= dt
    const p = ctx.player
    const sees = this.sees(ctx, 560, 460)
    switch (this.state) {
      case 'hover': {
        // Circle above the player, keeping to one side; otherwise drift around home.
        let target: Vec
        if (sees) {
          const side = this.pos.x >= p.pos.x ? 1 : -1
          target = { x: p.pos.x + side * 150, y: p.pos.y - 170 + Math.sin(this.flap * 0.2) * 20 }
          this.facePlayer(ctx)
        } else {
          target = { x: this.home.x + Math.sin(this.flap * 0.08) * 70, y: this.home.y + Math.cos(this.flap * 0.11) * 20 }
        }
        const to = sub(target, this.pos)
        this.vel = mul(norm(to), Math.min(this.speed, len(to) * 3))
        if (sees && this.timer <= 0) {
          this.state = 'windup'
          this.timer = this.windup
          this.diveDir = norm(sub(p.pos, this.pos))
        }
        break
      }
      case 'windup':
        this.vel = mul(this.vel, Math.exp(-dt * 8))
        this.diveDir = norm(sub(p.pos, this.pos))
        this.facing = this.diveDir.x >= 0 ? 1 : -1
        if (this.timer <= 0) {
          this.state = 'dive'
          this.timer = DIVE_TIME
        }
        break
      case 'dive':
        this.vel = mul(this.diveDir, DIVE_SPEED * ctx.diff.speedMul)
        if (this.timer <= 0 || this.hitWall || this.grounded) {
          this.state = 'rise'
          this.timer = 0.7
        }
        break
      case 'rise':
        this.vel = { x: this.vel.x * Math.exp(-dt * 4), y: -200 }
        if (this.timer <= 0) {
          this.state = 'hover'
          this.timer = (1.8 + Math.random() * 1.4) / ctx.diff.chargeMul
        }
        break
    }
  }

  touchDamage(p: Player): number {
    const dmg = super.touchDamage(p)
    return dmg > 0 && this.state === 'dive' ? 12 : dmg
  }

  draw(g: CanvasRenderingContext2D): void {
    if (this.state === 'windup' && this.alive) {
      const k = 1 - Math.max(0, this.timer) / this.windup
      polyline(g, [this.pos, add(this.pos, mul(this.diveDir, DIVE_SPEED * DIVE_TIME))], 2, RED, 0.25 + 0.6 * k, [5, 6])
    }
    const c = this.bodyColor()
    const wing = Math.sin(this.flap) * 0.9
    g.save()
    g.translate(this.pos.x, this.pos.y)
    g.scale(this.facing, 1)
    if (this.state === 'dive') g.rotate(0.6)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    // Body, head with the long tengu nose, tail feathers.
    g.beginPath()
    g.ellipse(-2, 2, 12, 9, 0, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.arc(9, -6, 6, 0, Math.PI * 2)
    g.fill()
    shape(g, [13, -8, 26, -5, 13, -3])
    shape(g, [-12, 0, -24, -4, -22, 6])
    // Wings beating.
    const tip = fromAngle(-Math.PI / 2 - 0.4 + wing, 30)
    shape(g, [-6, -2, -6 + tip.x, -2 + tip.y, 8, -2])
    shape(g, [-4, 0, -4 - tip.x * 0.6, tip.y * 0.8, 6, 2])
    limb(g, 0, 10, -2, 16, 2)
    limb(g, 4, 10, 4, 16, 2)
    g.restore()
  }
}

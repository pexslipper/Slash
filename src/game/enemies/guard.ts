import { type Vec, dot } from '../../core/math.ts'
import { RED, WHITE, circle, limb, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy, type HitResult, type StrokeHit, type WorldCtx } from './base.ts'

/** Cuts within 60° of head-on are caught by the shield. */
const FRONTAL_DOT = -0.5

/** Armored samurai with a tower shield. Cut from above or from behind. */
export class Guard extends Enemy {
  readonly kind = 'guard'
  private state: 'advance' | 'windup' | 'strike' | 'recover' = 'advance'
  private timer = 0
  private turnT = 0
  private shieldFlash = 0
  private step = 0
  private readonly speed: number
  private readonly windup: number

  constructor(feet: Vec, diff: Difficulty) {
    super(feet, 15, 26)
    this.setHp(110 * diff.hpMul)
    this.armor = 1 + diff.armorBonus
    this.poise = true
    this.gold = 18
    this.contactDamage = 8
    this.weakNode = { x: -17, y: -8, r: 7 }
    this.speed = 38 * diff.speedMul
    this.windup = 0.6 / diff.chargeMul
  }

  /** Poise means ordinary slashes don't stagger him, but being thrown into the air still breaks his swing. */
  protected onFlinch(): void {
    if (this.state === 'windup' || this.state === 'strike') {
      this.state = 'recover'
      this.timer = 0.6
    }
  }

  protected think(dt: number, ctx: WorldCtx): void {
    this.timer -= dt
    this.shieldFlash = Math.max(0, this.shieldFlash - dt)
    this.step += Math.abs(this.vel.x) * dt * 0.1
    const p = ctx.player
    const dx = p.pos.x - this.pos.x
    // Slow to turn around: slipping behind him is the point.
    if ((dx > 0 ? 1 : -1) !== this.facing && this.state !== 'strike') {
      this.turnT += dt
      if (this.turnT > 0.55) {
        this.facing = this.facing === 1 ? -1 : 1
        this.turnT = 0
      }
    } else {
      this.turnT = 0
    }
    switch (this.state) {
      case 'advance': {
        const near = this.sees(ctx, 420, 90)
        const facingPlayer = (dx > 0 ? 1 : -1) === this.facing
        this.vel.x = near && facingPlayer && Math.abs(dx) > 60 && this.groundAhead(ctx.level) ? this.facing * this.speed : 0
        if (near && facingPlayer && Math.abs(dx) < 80 && Math.abs(p.pos.y - this.pos.y) < 50) {
          this.state = 'windup'
          this.timer = this.windup
        }
        break
      }
      case 'windup':
        this.vel.x = 0
        if (this.timer <= 0) {
          this.state = 'strike'
          this.timer = 0.15
        }
        break
      case 'strike': {
        this.vel.x = 0
        const x0 = this.facing === 1 ? this.pos.x + this.hw : this.pos.x - this.hw - 60
        if (
          p.pos.x + p.hw > x0 &&
          p.pos.x - p.hw < x0 + 60 &&
          Math.abs(p.pos.y - this.pos.y) < this.hh + p.hh
        ) {
          ctx.hurtPlayer(14, this.pos)
        }
        if (this.timer <= 0) {
          this.state = 'recover'
          this.timer = 0.9
        }
        break
      }
      case 'recover':
        if (this.timer <= 0) this.state = 'advance'
        break
    }
  }

  receiveStroke(hit: StrokeHit, dir: Vec, damage: number, ctx: WorldCtx): HitResult {
    const frontal = dot(dir, this.facingVec) < FRONTAL_DOT
    if (!frontal) return super.receiveStroke(hit, dir, damage, ctx)
    this.struck.add(hit.key)
    this.shieldFlash = 0.25
    if (ctx.stats.armorPen >= this.armor) {
      const dealt = damage * 0.5
      return { outcome: 'hit', damage: dealt, killed: this.applyDamage(dealt, ctx) }
    }
    return { outcome: 'blocked', damage: 0, killed: false }
  }

  draw(g: CanvasRenderingContext2D): void {
    const c = this.bodyColor()
    const raise = this.state === 'windup' ? 1 - Math.max(0, this.timer) / this.windup : this.state === 'strike' ? -0.6 : 0
    g.save()
    this.local(g)
    g.fillStyle = c
    g.strokeStyle = c
    g.lineCap = 'round'
    const s = Math.sin(this.step)
    limb(g, -4, 8, -7 + s * 5, 26, 7)
    limb(g, 4, 8, 7 - s * 5, 26, 7)
    shape(g, [-13, 12, 13, 12, 11, -12, -11, -14])
    shape(g, [-15, -12, 15, -12, 12, -2, -12, -2])
    g.beginPath()
    g.arc(0, -19, 7, Math.PI, 0)
    g.fill()
    shape(g, [-11, -18, 11, -18, 13, -14, -13, -14])
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, -24)
    g.quadraticCurveTo(-8, -32, -12, -38)
    g.moveTo(0, -24)
    g.quadraticCurveTo(8, -32, 12, -38)
    g.stroke()
    // Katana raised overhead during the wind-up.
    const ang = -0.4 - raise * 1.8
    limb(g, 2, -10, 2 + Math.cos(ang) * 34, -10 + Math.sin(ang) * 34, 2.5)
    // Tower shield in front.
    g.fillStyle = this.shieldFlash > 0 ? RED : c
    g.fillRect(14, -26, 9, 44)
    g.restore()
    const mx = this.pos.x + this.facing * 18.5
    circle(g, mx, this.pos.y - 6, 4.5, this.shieldFlash > 0 ? WHITE : RED)
    if (this.armor >= 2) circle(g, mx, this.pos.y + 8, 3, RED)
  }
}

import type { Vec } from '../../core/math.ts'
import { RED, limb, shape } from '../../render/ink.ts'
import { type Difficulty, Enemy } from './base.ts'

const STALK = '#2b3326'

/** Harmless bamboo stalk: practice target, combo fodder, a coin or two. */
export class Bamboo extends Enemy {
  readonly kind = 'bamboo'
  private readonly lean: number

  constructor(feet: Vec, _diff: Difficulty) {
    super(feet, 7, 42)
    this.setHp(1)
    this.gold = 2
    this.contactDamage = 0
    this.lean = (feet.x % 7) - 3
  }

  protected think(): void {
    this.vel.x = 0
  }

  draw(g: CanvasRenderingContext2D): void {
    const c = this.flash > 0 ? RED : STALK
    const { x, y } = this.pos
    const top = { x: x + this.lean, y: y - this.hh }
    g.save()
    g.strokeStyle = c
    g.fillStyle = c
    g.lineCap = 'butt'
    for (let i = 0; i < 4; i++) {
      const k0 = i / 4
      const k1 = (i + 1) / 4 - 0.02
      limb(g, x + this.lean * k0, y + this.hh - k0 * this.hh * 2, x + this.lean * k1, y + this.hh - k1 * this.hh * 2, 6)
      const ny = y + this.hh - (i + 1) * (this.hh / 2)
      limb(g, x + this.lean * (k1 + 0.02) - 4.5, ny, x + this.lean * (k1 + 0.02) + 4.5, ny, 2)
    }
    shape(g, [top.x, top.y + 6, top.x + 20, top.y - 2, top.x + 6, top.y + 9])
    shape(g, [top.x, top.y + 14, top.x - 18, top.y + 8, top.x - 4, top.y + 17])
    shape(g, [top.x + 1, top.y + 26, top.x + 16, top.y + 24, top.x + 3, top.y + 29])
    g.restore()
  }
}

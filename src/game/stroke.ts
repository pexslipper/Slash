import { type Vec, copy, dist, lerpVec } from '../core/math.ts'

/** Minimum distance between captured points. */
const MIN_SPACING = 6

export interface DashStep {
  a: Vec
  b: Vec
}

/** One drawn path: captured while drawing, then traversed by the dash. */
export class Stroke {
  readonly points: Vec[]
  length = 0
  private seg = 0
  private segPos = 0

  constructor(start: Vec) {
    this.points = [copy(start)]
  }

  get last(): Vec {
    return this.points[this.points.length - 1]
  }

  get finished(): boolean {
    return this.seg >= this.points.length - 1
  }

  /** Current dash position. */
  get pos(): Vec {
    if (this.finished) return copy(this.last)
    const a = this.points[this.seg]
    const b = this.points[this.seg + 1]
    const l = dist(a, b)
    return l > 0 ? lerpVec(a, b, this.segPos / l) : copy(a)
  }

  /** Extends the path toward `p`, adding at most `budget` length. Returns the length added. */
  extend(p: Vec, budget: number): number {
    const last = this.last
    let d = dist(last, p)
    if (d < MIN_SPACING || budget <= 0) return 0
    let target = copy(p)
    if (d > budget) {
      target = lerpVec(last, p, budget / d)
      d = budget
    }
    this.points.push(target)
    this.length += d
    return d
  }

  /** Moves the dash forward by `distance` and returns the swept sub-segments in order. */
  advance(distance: number): DashStep[] {
    const steps: DashStep[] = []
    while (distance > 0 && !this.finished) {
      const a = this.points[this.seg]
      const b = this.points[this.seg + 1]
      const l = dist(a, b)
      const start = l > 0 ? lerpVec(a, b, this.segPos / l) : copy(a)
      const remain = l - this.segPos
      if (distance >= remain) {
        distance -= remain
        this.seg++
        this.segPos = 0
        steps.push({ a: start, b: copy(b) })
      } else {
        this.segPos += distance
        distance = 0
        steps.push({ a: start, b: lerpVec(a, b, this.segPos / l) })
      }
    }
    return steps
  }

  traveled(): Vec[] {
    return [...this.points.slice(0, this.seg + 1), this.pos]
  }

  remaining(): Vec[] {
    return [this.pos, ...this.points.slice(this.seg + 1)]
  }
}

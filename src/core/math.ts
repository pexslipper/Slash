export interface Vec {
  x: number
  y: number
}

export const vec = (x = 0, y = 0): Vec => ({ x, y })
export const copy = (a: Vec): Vec => ({ x: a.x, y: a.y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
export const len = (a: Vec): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x)
export const fromAngle = (angle: number, length = 1): Vec => ({
  x: Math.cos(angle) * length,
  y: Math.sin(angle) * length,
})

export function norm(a: Vec): Vec {
  const l = len(a)
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Signed shortest angle from a to b, in [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Rotates angle `cur` toward `target` by at most `step` radians. */
export function turnToward(cur: number, target: number, step: number): number {
  const d = angleDiff(cur, target)
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step
}

/** Closest point on segment ab to p, with its parameter t in [0, 1]. */
export function closestOnSeg(p: Vec, a: Vec, b: Vec): { point: Vec; t: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 > 0 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0
  return { point: { x: a.x + ab.x * t, y: a.y + ab.y * t }, t }
}

export const distToSeg = (p: Vec, a: Vec, b: Vec): number => dist(p, closestOnSeg(p, a, b).point)

/** Parameter t along ab where it crosses segment cd, or null. */
export function segSeg(a: Vec, b: Vec, c: Vec, d: Vec): number | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-9) return null
  const ac = sub(c, a)
  const t = (ac.x * s.y - ac.y * s.x) / den
  const u = (ac.x * r.y - ac.y * r.x) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}

/** Parameter t where segment ab enters the box [x0,x1]×[y0,y1], or null if it misses. */
export function segAABB(a: Vec, b: Vec, x0: number, y0: number, x1: number, y1: number): number | null {
  let tmin = 0
  let tmax = 1
  const d = sub(b, a)
  for (const [p, dp, lo, hi] of [
    [a.x, d.x, x0, x1],
    [a.y, d.y, y0, y1],
  ]) {
    if (Math.abs(dp) < 1e-9) {
      if (p < lo || p > hi) return null
      continue
    }
    let t1 = (lo - p) / dp
    let t2 = (hi - p) / dp
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  return tmin
}

export const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1)

export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

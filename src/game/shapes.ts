import { type Vec, dist } from '../core/math.ts'

/**
 * Shape recognition with the $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007):
 * resample → rotate to the indicative angle → scale to a square → translate to the origin,
 * then compare with templates, searching ±45° of rotation for the best fit.
 *
 * Open strokes are checked separately for a zigzag (several sharp reversals), and closed
 * angular strokes that miss every template fall back to 'triangle' by counting corners.
 */

export type ShapeKind = 'circle' | 'triangle' | 'rectangle' | 'star' | 'zigzag'

/** Axis-aligned box in world units. */
export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ShapeMatch {
  shape: ShapeKind
  score: number
  /** Geometry of the stroke as drawn, in world units. */
  center: Vec
  radius: number
  box: Bounds
}

const N = 64
const SIZE = 250
const HALF_DIAGONAL = 0.5 * Math.sqrt(2 * SIZE * SIZE)
const ANGLE_RANGE = (45 * Math.PI) / 180
const ANGLE_PRECISION = (2 * Math.PI) / 180
const PHI = 0.5 * (-1 + Math.sqrt(5))

/** Strokes must close up and be big enough, so ordinary cuts never trigger a special. */
const MIN_SCORE = 0.82
const MIN_DIAGONAL = 140
const MAX_GAP = 0.25
/**
 * Zigzag: at least this many direction reversals sharper than ZIG_ANGLE, over a long enough path.
 * 4 turns = 5 strokes, so a quick Z or N is still an ordinary cut.
 */
const ZIG_TURNS = 4
const ZIG_ANGLE = (100 * Math.PI) / 180
const ZIG_MIN_LENGTH = 150
/** Corner detection: spacing of the samples, and the smallest turn that counts as a corner. */
const CORNER_STEP = 14
const CORNER_ANGLE = (55 * Math.PI) / 180
/** Corners of a rough polygon turn less than this (a star's tips turn more). */
const POLY_MAX_ANGLE = (140 * Math.PI) / 180

function pathLength(pts: Vec[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i])
  return d
}

function resample(points: Vec[], n: number): Vec[] {
  const pts = points.map((p) => ({ ...p }))
  const interval = pathLength(pts) / (n - 1)
  const out: Vec[] = [{ ...pts[0] }]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) }
      out.push(q)
      pts.splice(i, 0, q)
      acc = 0
    } else {
      acc += d
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  return out.slice(0, n)
}

function centroid(pts: Vec[]): Vec {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

function rotateBy(pts: Vec[], angle: number): Vec[] {
  const c = centroid(pts)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }))
}

function bounds(pts: Vec[]): Bounds {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1 }
}

function scaleToSquare(pts: Vec[]): Vec[] {
  const b = bounds(pts)
  const w = Math.max(b.x1 - b.x0, 1e-6)
  const h = Math.max(b.y1 - b.y0, 1e-6)
  return pts.map((p) => ({ x: (p.x * SIZE) / w, y: (p.y * SIZE) / h }))
}

function translateToOrigin(pts: Vec[]): Vec[] {
  const c = centroid(pts)
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }))
}

function normalize(points: Vec[]): Vec[] {
  let pts = resample(points, N)
  const c = centroid(pts)
  pts = rotateBy(pts, -Math.atan2(c.y - pts[0].y, c.x - pts[0].x))
  return translateToOrigin(scaleToSquare(pts))
}

function pathDistance(a: Vec[], b: Vec[]): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += dist(a[i], b[i])
  return d / a.length
}

function distanceAtBestAngle(pts: Vec[], tpl: Vec[]): number {
  let a = -ANGLE_RANGE
  let b = ANGLE_RANGE
  let x1 = PHI * a + (1 - PHI) * b
  let f1 = pathDistance(rotateBy(pts, x1), tpl)
  let x2 = (1 - PHI) * a + PHI * b
  let f2 = pathDistance(rotateBy(pts, x2), tpl)
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) {
      b = x2
      x2 = x1
      f2 = f1
      x1 = PHI * a + (1 - PHI) * b
      f1 = pathDistance(rotateBy(pts, x1), tpl)
    } else {
      a = x1
      x1 = x2
      f1 = f2
      x2 = (1 - PHI) * a + PHI * b
      f2 = pathDistance(rotateBy(pts, x2), tpl)
    }
  }
  return Math.min(f1, f2)
}

// ---- Templates, generated as closed outlines ----

/** Closed polyline through `verts` (back to the first), densely sampled along each edge. */
function outline(verts: Vec[]): Vec[] {
  const pts: Vec[] = []
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    for (let k = 0; k < 16; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / 16, y: a.y + ((b.y - a.y) * k) / 16 })
  }
  pts.push({ ...verts[0] })
  return pts
}

/** Every start vertex, in both drawing directions. */
function variants(verts: Vec[]): Vec[][] {
  const out: Vec[][] = []
  for (const order of [verts, [...verts].reverse()]) {
    for (let s = 0; s < order.length; s++) out.push(outline([...order.slice(s), ...order.slice(0, s)]))
  }
  return out
}

const polygon = (n: number, start: number, r = 100): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: Math.cos(start + (i * Math.PI * 2) / n) * r, y: Math.sin(start + (i * Math.PI * 2) / n) * r }))

function buildTemplates(): { shape: ShapeKind; points: Vec[] }[] {
  const t: { shape: ShapeKind; points: Vec[] }[] = []
  // A 32-gon reads as a circle; four start points cover where people tend to begin.
  for (const start of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const circle = polygon(32, start)
    t.push({ shape: 'circle', points: outline(circle) }, { shape: 'circle', points: outline([...circle].reverse()) })
  }
  for (const v of variants(polygon(3, -Math.PI / 2))) t.push({ shape: 'triangle', points: v })
  for (const v of variants([{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }])) {
    t.push({ shape: 'rectangle', points: v })
  }
  // Pentagram: connect every second tip of a pentagon.
  const tips = polygon(5, -Math.PI / 2)
  for (const v of variants([0, 2, 4, 1, 3].map((i) => tips[i]))) t.push({ shape: 'star', points: v })
  return t.map((x) => ({ shape: x.shape, points: normalize(x.points) }))
}

const TEMPLATES = buildTemplates()

/**
 * Turn angles (radians) at the corners of a stroke: the path is resampled evenly, the heading
 * change is measured across a short window at every point, and only the peak of each
 * corner is kept.
 */
function corners(points: Vec[]): number[] {
  const n = Math.max(8, Math.round(pathLength(points) / CORNER_STEP))
  const pts = resample(points, n)
  const k = 2
  const turn: number[] = new Array(pts.length).fill(0)
  for (let i = k; i < pts.length - k; i++) {
    const ax = pts[i].x - pts[i - k].x
    const ay = pts[i].y - pts[i - k].y
    const bx = pts[i + k].x - pts[i].x
    const by = pts[i + k].y - pts[i].y
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < 1e-6 || lb < 1e-6) continue
    turn[i] = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))))
  }
  const out: number[] = []
  for (let i = k; i < pts.length - k; i++) {
    if (turn[i] < CORNER_ANGLE) continue
    let peak = true
    for (let j = i - 2 * k; j <= i + 2 * k; j++) if (j !== i && j >= 0 && j < turn.length && turn[j] > turn[i]) peak = false
    if (peak) out.push(turn[i])
  }
  return out
}

/** Recognizes a drawn stroke as one of the special shapes, or returns null for an ordinary cut. */
export function recognize(points: Vec[]): ShapeMatch | null {
  if (points.length < 10) return null
  const box = bounds(points)
  const diagonal = Math.hypot(box.x1 - box.x0, box.y1 - box.y0)
  const center = centroid(points)
  const radius = points.reduce((s, p) => s + dist(p, center), 0) / points.length
  const match = (shape: ShapeKind, score: number): ShapeMatch => ({ shape, score, center, radius, box })
  const closed = diagonal >= MIN_DIAGONAL && dist(points[0], points[points.length - 1]) <= diagonal * MAX_GAP

  // Closed shapes: compare with the templates.
  if (closed) {
    const pts = normalize(points)
    let best = Infinity
    let shape: ShapeKind = 'circle'
    for (const tpl of TEMPLATES) {
      const d = distanceAtBestAngle(pts, tpl.points)
      if (d < best) {
        best = d
        shape = tpl.shape
      }
    }
    const score = 1 - best / HALF_DIAGONAL
    if (score >= MIN_SCORE) return match(shape, score)
  }

  const turns = corners(points)
  // A rough closed polygon (3 to 5 ordinary corners) still counts as angular.
  if (closed && turns.length >= 3 && turns.length <= 5 && turns.every((a) => a < POLY_MAX_ANGLE)) return match('triangle', MIN_SCORE)
  // Zigzag: back and forth with sharp turns.
  if (pathLength(points) >= ZIG_MIN_LENGTH && turns.filter((a) => a >= ZIG_ANGLE).length >= ZIG_TURNS) return match('zigzag', 1)
  return null
}

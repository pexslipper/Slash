import type { Vec } from '../core/math.ts'

type Ctx = CanvasRenderingContext2D

export const INK = '#16120f'
export const INK_SOFT = 'rgba(22, 18, 15, 0.45)'
export const RED = '#b3121b'
export const PAPER = '#efe5cf'
export const GOLD = '#b8862b'
export const WHITE = '#fffaf0'
export const PETAL = '#e8a1b0'

export const FONT_BRUSH = '"Yuji Syuku", "Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif'
export const FONT_TEXT = '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif'

export function line(g: Ctx, a: Vec, b: Vec, width: number, color: string, alpha = 1): void {
  g.save()
  g.globalAlpha *= alpha
  g.strokeStyle = color
  g.lineWidth = width
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(a.x, a.y)
  g.lineTo(b.x, b.y)
  g.stroke()
  g.restore()
}

export function polyline(g: Ctx, pts: Vec[], width: number, color: string, alpha = 1, dash?: number[]): void {
  if (pts.length < 2) return
  g.save()
  g.globalAlpha *= alpha
  g.strokeStyle = color
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (dash) g.setLineDash(dash)
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.stroke()
  g.restore()
}

export function circle(g: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  g.save()
  g.globalAlpha *= alpha
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
  g.fill()
  g.restore()
}

export function ring(
  g: Ctx,
  x: number,
  y: number,
  r: number,
  width: number,
  color: string,
  alpha = 1,
  a0 = 0,
  a1 = Math.PI * 2,
): void {
  g.save()
  g.globalAlpha *= alpha
  g.strokeStyle = color
  g.lineWidth = width
  g.lineCap = 'round'
  g.beginPath()
  g.arc(x, y, Math.max(0, r), a0, a1)
  g.stroke()
  g.restore()
}

/** A brush stroke: thick in the middle, tapering to points at both ends. */
export function brushPath(g: Ctx, pts: Vec[], width: number, color: string, alpha = 1, taper = true): void {
  if (pts.length < 2) return
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = lens[lens.length - 1] || 1
  g.save()
  g.globalAlpha *= alpha
  g.strokeStyle = color
  g.lineCap = 'round'
  for (let i = 1; i < pts.length; i++) {
    const s = (lens[i] + lens[i - 1]) / 2 / total
    g.lineWidth = taper ? Math.max(0.8, width * Math.pow(Math.sin(Math.PI * s), 0.6)) : width
    g.beginPath()
    g.moveTo(pts[i - 1].x, pts[i - 1].y)
    g.lineTo(pts[i].x, pts[i].y)
    g.stroke()
  }
  g.restore()
}

export interface TextOpts {
  align?: CanvasTextAlign
  font?: string
  weight?: number
  alpha?: number
}

export function text(g: Ctx, str: string, x: number, y: number, size: number, color: string, o: TextOpts = {}): void {
  g.save()
  g.globalAlpha *= o.alpha ?? 1
  g.font = `${o.weight ?? 700} ${size}px ${o.font ?? FONT_TEXT}`
  g.textAlign = o.align ?? 'center'
  g.textBaseline = 'middle'
  g.fillStyle = color
  g.fillText(str, x, y)
  g.restore()
}

/** Line segment in the current transform; set strokeStyle and lineCap first. */
export function limb(g: Ctx, ax: number, ay: number, bx: number, by: number, w: number): void {
  g.lineWidth = w
  g.beginPath()
  g.moveTo(ax, ay)
  g.lineTo(bx, by)
  g.stroke()
}

/** Filled polygon from flat [x0, y0, x1, y1, ...] coordinates; set fillStyle first. */
export function shape(g: Ctx, c: number[]): void {
  g.beginPath()
  g.moveTo(c[0], c[1])
  for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1])
  g.closePath()
  g.fill()
}

/** Red seal stamp with a character in it. */
export function hanko(g: Ctx, x: number, y: number, size: number, char: string, alpha = 1): void {
  g.save()
  g.globalAlpha *= alpha
  g.fillStyle = RED
  g.translate(x, y)
  g.rotate(-0.06)
  g.fillRect(-size / 2, -size / 2, size, size)
  g.strokeStyle = PAPER
  g.lineWidth = Math.max(1, size * 0.05)
  g.strokeRect(-size / 2 + size * 0.1, -size / 2 + size * 0.1, size * 0.8, size * 0.8)
  g.restore()
  text(g, char, x, y + size * 0.04, size * 0.62, PAPER, { font: FONT_BRUSH, alpha })
}

/** Mon coin: gold disc with a square hole. */
export function mon(g: Ctx, x: number, y: number, r: number, alpha = 1): void {
  circle(g, x, y, r, GOLD, alpha)
  ring(g, x, y, r, 1.4, INK, alpha * 0.8)
  g.save()
  g.globalAlpha *= alpha
  g.fillStyle = INK
  g.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6)
  g.restore()
}

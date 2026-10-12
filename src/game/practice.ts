import { sfx } from '../core/audio.ts'
import type { InputHandler } from '../core/input.ts'
import { type Vec, clamp, copy, dist } from '../core/math.ts'
import { view } from '../core/view.ts'
import { wrap } from '../render/hud.ts'
import { FONT_BRUSH, GOLD, INK, INK_SOFT, RED, brushPath, line, polyline, ring, text } from '../render/ink.ts'
import { drawGrain, drawSky } from '../render/scenery.ts'
import { LEVELS } from './levels.ts'
import { type ShapeKind, type ShapeMatch, missReason, recognize } from './shapes.ts'
import { MOVE_ORDER, type MoveKind, SPECIALS, moveOf } from './specials.ts'
import type { PlayerStats } from './stats.ts'

/** Points are recorded this far apart, as in a real cut. */
const SPACING = 6
/** A shorter drag counts as a tap, not a drawing. */
const MIN_LENGTH = 14
/** A read at least this good is called clean. */
const CLEAN_SCORE = 0.9

const unitCircle = (n: number): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2), y: Math.sin((i / n) * Math.PI * 2) }))
const starTips = Array.from({ length: 5 }, (_, i) => ({
  x: Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 5),
  y: Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 5),
}))

/** How each special is drawn, with an icon in unit coordinates (-1..1). */
const GUIDE: Record<MoveKind, { how: string; icon: Vec[] }> = {
  void: { how: 'circle', icon: unitCircle(28) },
  rising: { how: 'triangle / box', icon: [{ x: 0, y: -1 }, { x: 0.95, y: 0.8 }, { x: -0.95, y: 0.8 }, { x: 0, y: -1 }] },
  still: { how: 'zigzag, 5 lines', icon: [-1, -0.6, -0.2, 0.2, 0.6, 1].map((x, i) => ({ x, y: i % 2 ? 0.75 : -0.75 })) },
  thousand: { how: 'star', icon: [0, 2, 4, 1, 3, 0].map((i) => starTips[i]) },
}

const SHAPE_NAME: Record<ShapeKind, string> = {
  circle: 'Circle',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  zigzag: 'Zigzag',
  star: 'Star',
}

function pathLength(pts: Vec[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i])
  return d
}

interface Reading {
  pts: Vec[]
  match: ShapeMatch | null
  /** What to fix, if anything. */
  tip: string
  /** Real seconds the drawing took. */
  time: number
}

/**
 * 稽古, the practice room: draw shapes on an empty page and see how the game reads them, with
 * the same recognizer and the same time limit as a real cut, but nothing to fight.
 */
export class Practice implements InputHandler {
  private readonly stats: PlayerStats
  private readonly onExit: () => void
  private drawing: Vec[] | null = null
  private drawT = 0
  private preview: ShapeMatch | null = null
  private previewT = 0
  private last: Reading | null = null
  private time = 0

  constructor(stats: PlayerStats, onExit: () => void) {
    this.stats = stats
    this.onExit = onExit
  }

  pointerDown(p: Vec): void {
    this.drawing = [copy(p)]
    this.drawT = 0
    this.preview = null
    this.previewT = 0
  }

  pointerMove(p: Vec): void {
    const pts = this.drawing
    if (pts && dist(pts[pts.length - 1], p) >= SPACING) pts.push(copy(p))
  }

  pointerUp(): void {
    const pts = this.drawing
    this.drawing = null
    this.preview = null
    if (!pts || pathLength(pts) < MIN_LENGTH) return
    const match = recognize(pts)
    const limit = this.stats.focusTime
    let tip = match ? '' : missReason(pts)
    if (match && this.drawT > limit) tip = `Too slow: in battle the cut fires on its own after ${limit.toFixed(1)}s`
    this.last = { pts, match, tip, time: this.drawT }
    sfx(match && !tip ? 'chain' : 'miss')
  }

  keyDown(code: string): void {
    if (code === 'Escape') this.onExit()
  }

  update(dt: number): void {
    this.time += dt
    if (!this.drawing) return
    this.drawT += dt
    this.previewT -= dt
    if (this.previewT <= 0) {
      this.previewT = 0.1
      const was = this.preview
      this.preview = recognize(this.drawing)
      if (this.preview && (!was || moveOf(was.shape) !== moveOf(this.preview.shape))) sfx('ready')
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { w } = view
    drawSky(g, LEVELS[0].theme, this.time * 30, 0)
    // Header, kept clear of the Back button in the top-right corner.
    text(g, '稽古', 24, 34, 30, RED, { font: FONT_BRUSH, align: 'left' })
    text(g, 'Shape practice', 76, 36, 20, INK, { font: FONT_BRUSH, align: 'left' })
    wrap(g, 'Draw a shape in one stroke, then lift to see how it reads.', 14, w - 48).forEach((l, i) =>
      text(g, l, 24, 68 + i * 18, 14, INK_SOFT, { align: 'left' }),
    )
    this.renderGuide(g)
    this.renderDrawing(g)
    this.renderResult(g)
    drawGrain(g)
  }

  /** One icon per special: how to draw it, what it costs, and whether it is learned. */
  private renderGuide(g: CanvasRenderingContext2D): void {
    const { w } = view
    const lastMove = this.last?.match ? moveOf(this.last.match.shape) : null
    const slot = Math.min(170, (w - 24) / MOVE_ORDER.length)
    const x0 = (w - slot * MOVE_ORDER.length) / 2
    const iy = 128
    const r = 20
    MOVE_ORDER.forEach((k, i) => {
      const def = SPECIALS[k]
      const learned = this.stats.arts[k]
      const cx = x0 + slot * (i + 0.5)
      const hot = k === lastMove
      const color = hot ? RED : INK
      if (hot) ring(g, cx, iy, r + 12, 2, RED, 0.45)
      polyline(g, GUIDE[k].icon.map((p) => ({ x: cx + p.x * r, y: iy + p.y * r })), 3, color, learned ? 0.9 : 0.35)
      text(g, def.kanji, cx, iy + r + 20, 20, color, { font: FONT_BRUSH, alpha: learned ? 1 : 0.45 })
      text(g, def.name, cx, iy + r + 40, 12, color, { font: FONT_BRUSH, alpha: learned ? 1 : 0.45 })
      text(g, GUIDE[k].how, cx, iy + r + 56, 11, INK_SOFT)
      text(g, learned ? `${def.cost} 気` : 'not learned', cx, iy + r + 71, 11, learned ? GOLD : INK_SOFT)
    })
  }

  private renderDrawing(g: CanvasRenderingContext2D): void {
    const pts = this.drawing
    if (pts) {
      brushPath(g, pts, 3.5, RED, 0.9, false)
      const p = this.preview
      if (p) {
        // Read live, as while drawing a real cut.
        const def = SPECIALS[moveOf(p.shape)]
        const end = pts[pts.length - 1]
        ring(g, p.center.x, p.center.y, p.radius, 1.5, RED, 0.35)
        text(g, `${def.kanji} ${def.name}`, end.x + 18, end.y - 22, 22, RED, { align: 'left', font: FONT_BRUSH })
      }
      return
    }
    const last = this.last
    if (!last) return
    brushPath(g, last.pts, 6, last.match ? INK : INK_SOFT, 0.85)
    if (last.match) ring(g, last.match.center.x, last.match.center.y, last.match.radius, 1.5, RED, 0.3)
  }

  /** The bottom panel: the focus timer while drawing, then the verdict. */
  private renderResult(g: CanvasRenderingContext2D): void {
    const { w, h } = view
    const by = h - 80
    if (this.drawing) {
      // The time a real cut gives you before it fires on its own.
      const k = clamp(1 - this.drawT / this.stats.focusTime, 0, 1)
      const bw = Math.min(260, w - 80)
      text(g, '集中  focus', w / 2, by - 16, 14, INK_SOFT, { font: FONT_BRUSH })
      line(g, { x: (w - bw) / 2, y: by + 4 }, { x: (w + bw) / 2, y: by + 4 }, 10, INK, 0.14)
      if (k > 0) line(g, { x: (w - bw) / 2, y: by + 4 }, { x: (w - bw) / 2 + bw * k, y: by + 4 }, 8, RED)
      else text(g, 'A real cut would have fired by now', w / 2, by + 30, 13, RED)
      return
    }
    const last = this.last
    if (!last) {
      text(g, 'Your shape will be read here', w / 2, by, 15, INK_SOFT)
      return
    }
    const lines: { str: string; color: string }[] = []
    const m = last.match
    if (m) {
      const move = moveOf(m.shape)
      const def = SPECIALS[move]
      text(g, `${def.kanji} ${def.name}`, w / 2, by - 14, 30, RED, { font: FONT_BRUSH })
      const quality = m.score >= CLEAN_SCORE ? 'clean' : 'rough'
      lines.push({ str: `${SHAPE_NAME[m.shape]}, ${quality} (${Math.round(m.score * 100)}%), drawn in ${last.time.toFixed(1)}s`, color: INK_SOFT })
      if (last.tip) lines.push({ str: last.tip, color: RED })
      if (!this.stats.arts[move]) lines.push({ str: 'Not learned yet: learn it at the Dojo (技 Arts) to use it in battle', color: INK_SOFT })
    } else {
      text(g, 'Not a shape', w / 2, by - 14, 28, INK, { font: FONT_BRUSH })
      lines.push({ str: last.tip, color: RED })
    }
    let y = by + 18
    for (const l of lines) {
      for (const part of wrap(g, l.str, 13, w - 40)) {
        text(g, part, w / 2, y, 13, l.color)
        y += 17
      }
    }
  }
}

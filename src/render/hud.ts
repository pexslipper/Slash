import { clamp } from '../core/math.ts'
import { view } from '../core/view.ts'
import { comboMult } from '../game/combo.ts'
import { MOVE_ORDER, SPECIALS } from '../game/specials.ts'
import type { World } from '../game/world.ts'
import { FONT_BRUSH, FONT_TEXT, GOLD, INK, INK_SOFT, PAPER, RED, hanko, mon, text } from './ink.ts'

type Ctx = CanvasRenderingContext2D

/** Brush-stroke meter: a faint ink track with a filled stroke over it. */
function meter(g: Ctx, x: number, y: number, w: number, frac: number, color: string): void {
  g.save()
  g.lineCap = 'round'
  g.strokeStyle = INK
  g.globalAlpha = 0.14
  g.lineWidth = 12
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x + w, y)
  g.stroke()
  g.globalAlpha = 1
  g.strokeStyle = color
  g.lineWidth = 9
  const f = clamp(frac, 0, 1)
  if (f > 0.01) {
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + w * f, y + Math.sin(f * 9) * 0.8)
    g.stroke()
  }
  g.restore()
}

/** Soft paper backing so text stays readable over the black ink ground. */
function paperBand(g: Ctx, y: number, h: number, width: number): void {
  const grad = g.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(239, 229, 207, 0)')
  grad.addColorStop(0.35, 'rgba(239, 229, 207, 0.85)')
  grad.addColorStop(1, 'rgba(239, 229, 207, 0.92)')
  g.save()
  g.fillStyle = grad
  g.fillRect(0, y, width, h)
  g.restore()
}

/** Long hint lines are split at their "·" separators on narrow (portrait) screens. */
function fitLines(str: string, width: number): string[] {
  return width < 1000 ? str.split('·').map((part) => part.trim()) : [str]
}

/** Word-wraps text to a maximum width at the given (body-font) size. */
function wrap(g: Ctx, str: string, size: number, maxW: number): string[] {
  g.save()
  g.font = `700 ${size}px ${FONT_TEXT}`
  const width = (t: string): number => (g.measureText(t) as TextMetrics | undefined)?.width ?? t.length * size * 0.5
  const out: string[] = []
  let line = ''
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && width(next) > maxW) {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  g.restore()
  return out
}

export function renderHud(g: Ctx, w: World): void {
  const { w: vw, h: vh } = view
  const p = w.player
  const s = w.stats
  // Phones in portrait (and other narrow views): stack the top HUD instead of spreading it out.
  const narrow = vw < 640

  text(g, '命', 24, 26, 22, RED, { font: FONT_BRUSH })
  meter(g, 46, 27, 210, p.hp / s.maxHp, RED)
  text(g, '墨', 24, 54, 22, INK, { font: FONT_BRUSH })
  // Ink is the length of the cut being drawn; it is always full between cuts.
  meter(g, 46, 55, 210, w.inkLeft / w.maxLength, INK)

  text(g, '気', 24, 82, 22, GOLD, { font: FONT_BRUSH })
  meter(g, 46, 83, 210, w.spirit / 100, GOLD)
  g.fillStyle = INK
  for (const k of MOVE_ORDER) if (SPECIALS[k].cost > 0) g.fillRect(46 + 210 * (SPECIALS[k].cost / 100) - 1, 76, 2, 14)
  // One stamp per shape special, lit when it can be cast (only the star costs spirit).
  MOVE_ORDER.forEach((k, i) => {
    const def = SPECIALS[k]
    const x = 58 + i * 34
    // Lit when learned and affordable, faint when short of spirit, barely there while locked.
    if (!s.arts[k]) text(g, def.kanji, x, 113, 18, INK, { font: FONT_BRUSH, alpha: 0.1 })
    else if (w.spirit >= def.cost) hanko(g, x, 112, 24, def.kanji)
    else text(g, def.kanji, x, 113, 18, INK, { font: FONT_BRUSH, alpha: 0.3 })
  })

  // Kept clear of the pause button in the top-right corner.
  mon(g, vw - 176, 30, 10)
  text(g, String(w.bankGold + w.runGold), vw - 158, 31, 22, INK, { align: 'left', font: FONT_BRUSH })

  // Level name and foes left: centered on wide screens, under the coins (clear of the pause button) on narrow ones.
  const titleX = narrow ? vw - 20 : vw / 2
  const titleAlign = narrow ? 'right' : 'center'
  text(g, `${w.def.kanji}  ${w.def.name}`, titleX, narrow ? 72 : 28, 18, INK, { font: FONT_BRUSH, alpha: 0.75, align: titleAlign })
  if (!w.def.boss) {
    // The gate stays sealed until every foe has fallen.
    const left = w.foesLeft
    text(g, left > 0 ? `残  ${left} foes` : '開  gate open', titleX, narrow ? 94 : 50, 15, left > 0 ? RED : INK, { font: FONT_BRUSH, alpha: 0.85, align: titleAlign })
  }

  const boss = w.boss
  if (boss && boss.alive) {
    const bw = Math.min(520, vw - 120)
    const bx = (vw - bw) / 2
    const label = wrap(g, boss.bossLabel(), 14, vw - 40)
    const by = vh - 40 - label.length * 18
    paperBand(g, by - 52, vh - by + 52, vw)
    text(g, boss.bossName, vw / 2, by - 20, 18, INK, { font: FONT_BRUSH })
    meter(g, bx, by, bw, boss.hp / boss.maxHp, RED)
    label.forEach((l, i) => text(g, l, vw / 2, by + 22 + i * 18, 14, boss.bossAlert() ? RED : INK_SOFT))
  }

  if (w.comboShow > 0 && w.combo > 0) {
    const a = Math.min(1, w.comboShow * 2)
    const cy = narrow ? 165 : 74
    text(g, `${w.combo}`, vw / 2 - 8, cy, 40, RED, { font: FONT_BRUSH, align: 'right', alpha: a })
    text(g, `斬  ×${comboMult(w.combo)}`, vw / 2, cy + 2, 20, INK, { font: FONT_BRUSH, align: 'left', alpha: a })
  }

  if (w.banner) {
    const { t, max } = w.banner
    const a = clamp(Math.min((max - t) * 4, t * 3), 0, 1)
    const cy = vh * 0.36
    g.save()
    g.globalAlpha = a * 0.75
    g.fillStyle = PAPER
    g.fillRect(0, cy - 70, vw, 140)
    g.restore()
    text(g, w.banner.title, vw / 2, cy - 8, 84, INK, { font: FONT_BRUSH, alpha: a })
    hanko(g, vw / 2 + 64, cy - 32, 28, '印', a)
    if (w.banner.sub) text(g, w.banner.sub, vw / 2, cy + 48, 20, RED, { font: FONT_BRUSH, alpha: a })
  }

  // Bottom hints (not during duels, where the boss bar uses this space).
  const hints: { str: string; color: string }[] = []
  if (w.stage === 1 && w.kills < 3 && !w.outcome && !w.banner) {
    hints.push(
      { str: 'Click to run or jump  ·  Drag to draw a cut (time slows)  ·  Release to flash-step to its start and strike', color: INK },
      { str: 'Hit the red seal for a critical  ·  Click mid-cut for a circular finisher', color: INK_SOFT },
    )
  } else if (w.stage <= 2 && w.specialsCast === 0 && !w.outcome && !w.banner && w.kills >= 3) {
    const learned = MOVE_ORDER.some((k) => s.arts[k])
    hints.push({
      str: learned
        ? 'Draw a learned shape to cast its special  ·  triangle/rectangle 昇, circle 円, zigzag 静, star 星'
        : 'Shape specials are locked  ·  Learn them with mon at the Dojo between stages (技 Arts)',
      color: RED,
    })
  }
  if (hints.length > 0 && !(boss && boss.alive)) {
    const lines = hints.flatMap((h) => fitLines(h.str, vw).flatMap((part) => wrap(g, part, 15, vw - 32)).map((str) => ({ str, color: h.color })))
    const lh = 21
    const top = vh - 18 - lines.length * lh
    paperBand(g, top - 24, vh - top + 24, vw)
    lines.forEach((l, i) => text(g, l.str, vw / 2, top + lh / 2 + i * lh, 15, l.color, { alpha: 0.9 }))
  }
}

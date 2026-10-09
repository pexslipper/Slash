import { clamp } from '../core/math.ts'
import { view } from '../core/view.ts'
import { comboMult } from '../game/combo.ts'
import { MOVE_ORDER, SPECIALS } from '../game/specials.ts'
import type { World } from '../game/world.ts'
import { FONT_BRUSH, GOLD, INK, INK_SOFT, PAPER, RED, hanko, mon, text } from './ink.ts'

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

export function renderHud(g: Ctx, w: World): void {
  const { w: vw, h: vh } = view
  const p = w.player
  const s = w.stats

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

  text(g, `${w.def.kanji}  ${w.def.name}`, vw / 2, 28, 18, INK, { font: FONT_BRUSH, alpha: 0.75 })
  if (!w.def.boss) {
    // The gate stays sealed until every foe has fallen.
    const left = w.foesLeft
    text(g, left > 0 ? `残  ${left} foes` : '開  gate open', vw / 2, 50, 15, left > 0 ? RED : INK, { font: FONT_BRUSH, alpha: 0.85 })
  }

  const boss = w.boss
  if (boss && boss.alive) {
    const bw = Math.min(520, vw - 120)
    const bx = (vw - bw) / 2
    const by = vh - 54
    text(g, boss.bossName, vw / 2, by - 20, 18, INK, { font: FONT_BRUSH })
    meter(g, bx, by, bw, boss.hp / boss.maxHp, RED)
    text(g, boss.bossLabel(), vw / 2, by + 22, 14, boss.bossAlert() ? RED : INK_SOFT)
  }

  if (w.comboShow > 0 && w.combo > 0) {
    const a = Math.min(1, w.comboShow * 2)
    text(g, `${w.combo}`, vw / 2 - 8, 74, 40, RED, { font: FONT_BRUSH, align: 'right', alpha: a })
    text(g, `斬  ×${comboMult(w.combo)}`, vw / 2, 76, 20, INK, { font: FONT_BRUSH, align: 'left', alpha: a })
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

  if (w.stage <= 2 && w.specialsCast === 0 && !w.outcome && !w.banner && w.kills >= 3) {
    const learned = MOVE_ORDER.some((k) => s.arts[k])
    const hint = learned
      ? 'Draw a learned shape to cast its special: triangle/rectangle 昇, circle 円, zigzag 静, star 星.'
      : 'Shape specials are locked. Learn them with mon at the Dojo between stages (技 Arts).'
    text(g, hint, vw / 2, vh - 28, 15, RED, { alpha: 0.85 })
  }

  if (w.stage === 1 && w.kills < 3 && !w.outcome && !w.banner) {
    text(g, 'Click to run or jump  ·  Drag to draw a cut (time slows)  ·  Release to flash-step to its start and strike', vw / 2, vh - 46, 15, INK, { alpha: 0.75 })
    text(g, 'Hit the red seal for a critical  ·  Click mid-cut for a circular finisher', vw / 2, vh - 24, 13, INK_SOFT)
  }
}

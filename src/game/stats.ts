import type { MoveKind } from './specials.ts'
import { UPGRADES } from './upgrades.ts'

export interface PlayerStats {
  maxHp: number
  /** Base damage per cut. */
  damage: number
  /** Damage multiplier for hitting a red seal. */
  critMult: number
  /** Guard armor level the blade can cut through. */
  armorPen: number
  /** Longest path a single cut can follow. Every cut gets the full length; nothing is spent. */
  maxInk: number
  /** Farthest a cut may start from the samurai (the flash-step distance). */
  approachRange: number
  /** Time scale while drawing. */
  slowFactor: number
  /** Real seconds you can keep drawing before the cut fires on its own. */
  focusTime: number
  magnetRadius: number
  /** Fraction of max HP healed by a 5+ kill stroke. */
  vampHeal: number
  dashSpeed: number
  approachSpeed: number
  finisherRadius: number
  /** Shape specials learned at the Dojo; all locked at first. */
  arts: Record<MoveKind, boolean>
}

export const BASE_STATS: PlayerStats = {
  maxHp: 100,
  damage: 10,
  critMult: 2,
  armorPen: 0,
  maxInk: 650,
  approachRange: 420,
  slowFactor: 0.2,
  focusTime: 2.5,
  magnetRadius: 60,
  vampHeal: 0,
  dashSpeed: 2400,
  approachSpeed: 1900,
  finisherRadius: 110,
  arts: { rising: false, void: false, still: false, thousand: false },
}

export function computeStats(levels: Record<string, number>): PlayerStats {
  const s = { ...BASE_STATS, arts: { ...BASE_STATS.arts } }
  for (const u of UPGRADES) {
    const lvl = Math.min(levels[u.id] ?? 0, u.maxLevel)
    if (lvl > 0) u.apply(s, lvl)
  }
  return s
}

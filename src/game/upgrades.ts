import type { PlayerStats } from './stats.ts'

export type TreeId = 'arts' | 'blade' | 'flow' | 'core'

export interface UpgradeDef {
  id: string
  tree: TreeId
  name: string
  maxLevel: number
  baseCost: number
  growth: number
  /** Total effect at a given level. */
  describe: (level: number) => string
  apply: (s: PlayerStats, level: number) => void
}

export const TREES: { id: TreeId; name: string; kanji: string; tagline: string; color: string }[] = [
  { id: 'arts', name: 'Arts', kanji: '技', tagline: 'Shape specials, learned once', color: '#5a3d8a' },
  { id: 'blade', name: 'Blade', kanji: '刃', tagline: 'Damage & combos', color: '#b3121b' },
  { id: 'flow', name: 'Flow', kanji: '流', tagline: 'Ink & focus', color: '#16120f' },
  { id: 'core', name: 'Spirit', kanji: '心', tagline: 'Survival & perks', color: '#b8862b' },
]

const slowAt = (level: number): number => 0.2 - 0.03 * level
const focusAt = (level: number): number => 2.5 + 0.5 * level

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'artRising',
    tree: 'arts',
    name: '昇 Rising Cut',
    maxLevel: 1,
    baseCost: 80,
    growth: 1,
    describe: () => 'Draw a triangle or rectangle: launches everyone inside into the air',
    apply: (s) => {
      s.arts.rising = true
    },
  },
  {
    id: 'artVoid',
    tree: 'arts',
    name: '円 Void Cut',
    maxLevel: 1,
    baseCost: 150,
    growth: 1,
    describe: () => 'Draw a circle: holds enemies inside in the air and cuts them',
    apply: (s) => {
      s.arts.void = true
    },
  },
  {
    id: 'artStill',
    tree: 'arts',
    name: '静 Still Cut',
    maxLevel: 1,
    baseCost: 250,
    growth: 1,
    describe: () => 'Draw a 5-stroke zigzag: freezes what it cuts, then every cut lands; mid-air foes die',
    apply: (s) => {
      s.arts.still = true
    },
  },
  {
    id: 'artThousand',
    tree: 'arts',
    name: '星 Thousand Cuts',
    maxLevel: 1,
    baseCost: 400,
    growth: 1,
    describe: () => 'Draw a star with a full Spirit meter: cuts every enemy on screen',
    apply: (s) => {
      s.arts.thousand = true
    },
  },
  {
    id: 'sharpness',
    tree: 'blade',
    name: 'Tamahagane Edge',
    maxLevel: 8,
    baseCost: 40,
    growth: 1.45,
    describe: (l) => `+${l * 30}% cut damage`,
    apply: (s, l) => {
      s.damage *= 1 + 0.3 * l
    },
  },
  {
    id: 'armorPen',
    tree: 'blade',
    name: 'Armor Breaker',
    maxLevel: 2,
    baseCost: 150,
    growth: 2.4,
    describe: (l) => (l === 1 ? 'Cut through standard guards (50% dmg)' : 'Cut through heavy guards too'),
    apply: (s, l) => {
      s.armorPen = l
    },
  },
  {
    id: 'keen',
    tree: 'blade',
    name: 'Keen Eye',
    maxLevel: 3,
    baseCost: 120,
    growth: 1.8,
    describe: (l) => `Red-seal criticals deal ×${(2 + l * 0.5).toFixed(1)} damage`,
    apply: (s, l) => {
      s.critMult = 2 + l * 0.5
    },
  },
  {
    id: 'reservoir',
    tree: 'flow',
    name: 'Ink Stone',
    maxLevel: 8,
    baseCost: 40,
    growth: 1.45,
    describe: (l) => `+${l * 15}% cut length and flash-step range`,
    apply: (s, l) => {
      s.maxInk *= 1 + 0.15 * l
      s.approachRange *= 1 + 0.15 * l
    },
  },
  {
    id: 'chronos',
    tree: 'flow',
    name: 'Mushin Focus',
    maxLevel: 5,
    baseCost: 70,
    growth: 1.7,
    describe: (l) => `Time slows to ${Math.round(slowAt(l) * 100)}% for ${focusAt(l).toFixed(1)}s`,
    apply: (s, l) => {
      s.slowFactor = slowAt(l)
      s.focusTime = focusAt(l)
    },
  },
  {
    id: 'magnet',
    tree: 'core',
    name: 'Coin Charm',
    maxLevel: 5,
    baseCost: 45,
    growth: 1.55,
    describe: (l) => `+${l * 50} coin pickup radius`,
    apply: (s, l) => {
      s.magnetRadius += 50 * l
    },
  },
  {
    id: 'vitality',
    tree: 'core',
    name: 'Iron Body',
    maxLevel: 6,
    baseCost: 60,
    growth: 1.55,
    describe: (l) => `+${l * 25} max HP`,
    apply: (s, l) => {
      s.maxHp += 25 * l
    },
  },
  {
    id: 'vampiric',
    tree: 'core',
    name: 'Blood Oath',
    maxLevel: 3,
    baseCost: 180,
    growth: 1.8,
    describe: (l) => `5+ kills in one stroke heal ${5 + l * 5}% HP`,
    apply: (s, l) => {
      s.vampHeal = (5 + l * 5) / 100
    },
  },
]

/** Price of buying the level after `level`. */
export function upgradeCost(u: UpgradeDef, level: number): number {
  return Math.round((u.baseCost * u.growth ** level) / 5) * 5
}

import { type Grade, isGrade } from '../game/rank.ts'

const KEY = 'iai.save.v1'

export interface Settings {
  sound: boolean
  vibration: boolean
}

export interface SaveData {
  gold: number
  upgrades: Record<string, number>
  bestStage: number
  /** Stage a new run may start from (the one after the last duel won). */
  checkpoint: number
  /** Best grade earned on each stage, by stage number. */
  ranks: Record<string, Grade>
  settings: Settings
}

export function defaultSave(): SaveData {
  return { gold: 0, upgrades: {}, bestStage: 0, checkpoint: 1, ranks: {}, settings: { sound: true, vibration: true } }
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

export function loadSave(): SaveData {
  const d = defaultSave()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return d
    const parsed = JSON.parse(raw) as Partial<SaveData>
    const upgrades: Record<string, number> = {}
    for (const [id, lvl] of Object.entries(parsed.upgrades ?? {})) upgrades[id] = num(lvl, 0)
    const ranks: Record<string, Grade> = {}
    for (const [stage, grade] of Object.entries(parsed.ranks ?? {})) if (isGrade(grade)) ranks[stage] = grade
    return {
      gold: num(parsed.gold, d.gold),
      upgrades,
      bestStage: num(parsed.bestStage, d.bestStage),
      checkpoint: Math.max(1, num(parsed.checkpoint, d.checkpoint)),
      ranks,
      settings: {
        sound: bool(parsed.settings?.sound, d.settings.sound),
        vibration: bool(parsed.settings?.vibration, d.settings.vibration),
      },
    }
  } catch {
    return d
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage blocked or full: progress just won't persist this session.
  }
}

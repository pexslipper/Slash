import { clamp } from '../core/math.ts'
import { COMBO_MULTS } from './combo.ts'

/** Stage grades, best first. */
export const GRADES = ['S', 'A', 'B', 'C'] as const
export type Grade = (typeof GRADES)[number]

export const isGrade = (v: unknown): v is Grade => typeof v === 'string' && (GRADES as readonly string[]).includes(v)

/** True if `a` beats `b` (anything beats no grade yet). */
export const betterGrade = (a: Grade, b: Grade | undefined): boolean => b === undefined || GRADES.indexOf(a) < GRADES.indexOf(b)

/** Points out of 100 needed for each grade. */
const GRADE_AT: Record<Grade, number> = { S: 85, A: 70, B: 50, C: 0 }
/** The score is split between taking no damage, the best combo multiplier, and speed. */
const HEALTH_POINTS = 40
const COMBO_POINTS = 30
const SPEED_POINTS = 30
/** Losing this fraction of max HP in one stage leaves no health points. */
const HEALTH_LOSS_ZERO = 0.5

/**
 * Par time in seconds. A level gets time to cross the map plus a few seconds per foe; a duel gets
 * enough time to wear the boss down at about PAR_DUEL_CUTS cuts per second, so damage upgrades
 * make its par easier to beat. Full speed points at par or faster, none at twice par.
 */
const PAR_BASE = 15
const PAR_TRAVEL_SPEED = 220
const PAR_PER_FOE = 3
const PAR_DUEL_BASE = 25
const PAR_DUEL_CUTS = 1.2

export function levelPar(width: number, foes: number): number {
  return PAR_BASE + width / PAR_TRAVEL_SPEED + foes * PAR_PER_FOE
}

export function duelPar(bossHp: number, damage: number): number {
  return PAR_DUEL_BASE + bossHp / (damage * PAR_DUEL_CUTS)
}

export interface Rank {
  grade: Grade
  score: number
  /** Real seconds the stage took, and its par. */
  time: number
  par: number
  damageTaken: number
  bestMult: number
}

export function computeRank(time: number, par: number, damageTaken: number, maxHp: number, bestMult: number): Rank {
  const health = HEALTH_POINTS * clamp(1 - damageTaken / (maxHp * HEALTH_LOSS_ZERO), 0, 1)
  const tier = Math.max(0, COMBO_MULTS.filter((m) => m <= bestMult).length - 1)
  const combo = (COMBO_POINTS * tier) / (COMBO_MULTS.length - 1)
  const speed = SPEED_POINTS * clamp(2 - time / par, 0, 1)
  const score = Math.round(health + combo + speed)
  const grade = GRADES.find((g) => score >= GRADE_AT[g]) ?? 'C'
  return { grade, score, time, par, damageTaken, bestMult }
}

/** 83.4 → "1:23". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

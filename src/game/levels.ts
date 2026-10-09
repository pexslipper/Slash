import type { Difficulty } from './enemies/base.ts'
import { type LevelDef, buildMap } from './level.ts'

/** Every map is 18 rows (720 units) tall; ground surface on row 15 unless noted. */
const ROWS = 18

const bambooGrove: LevelDef = {
  name: 'Bamboo Grove',
  kanji: '竹林',
  subtitle: 'Draw the cut. Release. Strike.',
  boss: false,
  theme: {
    skyTop: '#f4ecd8',
    skyBottom: '#e3d4b4',
    orb: '#c0392b',
    orbAlpha: 0.85,
    orbSize: 0.16,
    mountain: '30, 36, 26',
    petals: true,
  },
  grid: buildMap(176, ROWS, (m) => {
    m.rect('#', 0, 15, 38, 17).put('P', 3, 14)
    m.row('b b b', 8, 14).row('c c c', 8, 12)
    m.put('a', 20, 14)
    m.rect('#', 26, 13, 38, 14).put('a', 33, 12)
    // A gap too wide to jump comfortably: cut across it.
    m.row('c c c c c', 39, 12)
    m.rect('#', 49, 15, 71, 17)
    m.rect('=', 53, 11, 59, 11).row('c c c', 54, 10).put('a', 57, 10)
    m.row('bbb', 63, 14).put('a', 68, 14)
    m.rect('#', 72, 10, 76, 17).row('c c', 73, 9)
    m.rect('#', 77, 15, 124, 17)
    // A pack standing close together: launch them (triangle), then circle them in the air.
    m.put('a', 85, 14).put('a', 88, 14).put('a', 91, 14).row('b b', 96, 14)
    // First tengu: always in the air, so a zigzag through one kills it outright.
    m.put('t', 103, 9).put('a', 108, 14)
    m.rect('=', 112, 11, 117, 11).row('c c c', 113, 10)
    m.put('t', 119, 8).put('t', 123, 9)
    // A gap with a single plank across it.
    m.rect('=', 127, 12, 131, 12)
    m.rect('#', 133, 15, 175, 17)
    m.row('bbbbb', 136, 14)
    // Four in a row with a tengu above: one big launch-and-circle.
    m.put('a', 144, 14).put('a', 146, 14).put('a', 148, 14).put('a', 150, 14).put('t', 147, 8)
    m.rect('#', 155, 12, 158, 14).put('a', 156, 11)
    m.put('t', 162, 9).put('a', 164, 14)
    m.put('G', 170, 14)
  }),
}

const mountainPass: LevelDef = {
  name: 'Mountain Pass',
  kanji: '山道',
  subtitle: 'Shields guard the front. Strike from above or behind.',
  boss: false,
  theme: {
    skyTop: '#f3dfc4',
    skyBottom: '#e2bb98',
    orb: '#b3121b',
    orbAlpha: 0.88,
    orbSize: 0.22,
    mountain: '45, 25, 18',
    petals: true,
  },
  grid: buildMap(196, ROWS, (m) => {
    m.rect('#', 0, 15, 30, 17).put('P', 2, 14)
    m.put('s', 16, 14).row('c c', 14, 11)
    m.rect('^', 31, 16, 40, 16).rect('#', 31, 17, 40, 17)
    m.rect('=', 33, 12, 38, 12).put('a', 36, 11)
    m.rect('#', 41, 13, 52, 17).put('r', 50, 12)
    m.rect('#', 53, 15, 70, 17)
    m.rect('#', 58, 10, 61, 14).put('r', 59, 9)
    m.rect('=', 63, 11, 67, 11).row('c c c', 63, 10)
    m.put('s', 67, 14)
    m.rect('^', 71, 16, 78, 16).rect('#', 71, 17, 78, 17)
    m.rect('#', 79, 12, 84, 17).put('a', 81, 11)
    m.rect('^', 85, 16, 88, 16).rect('#', 85, 17, 88, 17)
    m.rect('#', 89, 15, 136, 17)
    m.rect('#', 96, 11, 99, 14).put('r', 97, 10)
    m.put('s', 105, 14).put('a', 110, 14).put('a', 114, 14)
    m.row('b b b', 117, 14)
    // An oni holds the pass: too heavy to launch far, so freeze it with a zigzag and cut it apart.
    m.put('o', 126, 14).put('t', 131, 9)
    m.rect('^', 137, 16, 144, 16).rect('#', 137, 17, 144, 17)
    m.put('t', 139, 10).put('t', 143, 9)
    m.rect('#', 145, 15, 195, 17)
    m.rect('#', 150, 10, 153, 14).put('r', 151, 9)
    m.put('a', 158, 14).put('a', 160, 14).put('a', 162, 14).put('s', 166, 14)
    m.put('o', 174, 14).put('t', 178, 8)
    m.row('b b b', 182, 14)
    m.put('G', 190, 14)
  }),
}

const castleWalls: LevelDef = {
  name: 'Castle Walls',
  kanji: '城壁',
  subtitle: 'Ninja blink when you draw. Aim for their shadow.',
  boss: false,
  theme: {
    skyTop: '#e6e2d8',
    skyBottom: '#c9c3b5',
    orb: '#8c2a23',
    orbAlpha: 0.72,
    orbSize: 0.12,
    mountain: '22, 22, 28',
    petals: false,
  },
  grid: buildMap(204, ROWS, (m) => {
    m.rect('#', 0, 15, 24, 17).put('P', 2, 14)
    m.put('n', 14, 14).put('a', 20, 14)
    m.rect('=', 20, 11, 24, 11)
    m.rect('#', 25, 7, 29, 17).put('r', 27, 6)
    m.rect('#', 30, 15, 60, 17)
    m.rect('=', 34, 11, 40, 11).put('n', 37, 10)
    m.rect('=', 44, 8, 50, 8).row('c c c c', 44, 7).put('n', 49, 7)
    m.put('s', 54, 14).put('a', 58, 14)
    m.rect('=', 56, 12, 60, 12)
    m.rect('#', 61, 9, 66, 17).put('r', 63, 8)
    m.rect('#', 67, 15, 130, 17)
    m.rect('^', 70, 14, 76, 14)
    m.rect('=', 69, 10, 77, 10).put('n', 72, 9).put('a', 76, 9)
    m.put('s', 84, 14).put('n', 88, 14)
    m.rect('#', 92, 11, 96, 14).put('r', 94, 10)
    m.put('s', 102, 14).put('n', 106, 14).put('a', 109, 14)
    m.row('b b b b', 112, 14)
    // The inner wall, climbed by its scaffold.
    m.rect('=', 125, 11, 130, 11)
    m.rect('#', 131, 7, 135, 17).put('r', 133, 6)
    // Courtyard garrison with tengu overhead: room for every style.
    m.rect('#', 136, 15, 203, 17)
    m.rect('=', 141, 10, 147, 10).rect('=', 156, 10, 162, 10)
    m.put('a', 140, 14).put('a', 142, 14).put('n', 150, 14).row('c c c c', 142, 9)
    m.put('t', 145, 7).put('t', 151, 6).put('t', 157, 7).put('n', 159, 9)
    m.put('o', 166, 14).put('s', 171, 14)
    m.put('s', 182, 14).put('n', 186, 14).put('a', 188, 14).put('a', 190, 14)
    m.row('b b b', 193, 14)
    m.put('G', 198, 14)
  }),
}

const foxfireGrove: LevelDef = {
  name: 'Foxfire Grove',
  kanji: '狐火',
  subtitle: 'Kuzunoha, the Shadow Fox',
  boss: true,
  theme: {
    skyTop: '#cdbfd6',
    skyBottom: '#ead8c6',
    orb: '#d9472b',
    orbAlpha: 0.8,
    orbSize: 0.2,
    mountain: '45, 28, 55',
    petals: true,
  },
  grid: buildMap(44, ROWS, (m) => {
    m.rect('#', 0, 15, 43, 17).put('P', 5, 14)
    // Platforms at three heights: places for her to blink to, and for you to chase her.
    m.rect('=', 6, 11, 11, 11).rect('=', 32, 11, 37, 11)
    m.rect('=', 15, 8, 20, 8).rect('=', 24, 8, 29, 8)
    m.rect('=', 19, 5, 25, 5)
    m.row('b b', 1, 14).row('b b', 40, 14)
    m.put('K', 34, 14)
  }),
}

const demonGate: LevelDef = {
  name: 'Demon Gate',
  kanji: '鬼門',
  subtitle: 'Gōki, the Oni Warlord',
  boss: true,
  theme: {
    skyTop: '#f0cdb0',
    skyBottom: '#d98a6a',
    orb: '#7d0c12',
    orbAlpha: 0.9,
    orbSize: 0.26,
    mountain: '55, 16, 10',
    petals: false,
  },
  grid: buildMap(52, ROWS, (m) => {
    m.rect('#', 0, 15, 51, 17).put('P', 5, 14)
    m.rect('=', 3, 10, 9, 10).rect('=', 42, 10, 48, 10)
    m.put('W', 40, 14)
  }),
}

const moonlitDuel: LevelDef = {
  name: 'Moonlit Duel',
  kanji: '月下',
  subtitle: 'Kagemaru, the Mirror Ronin',
  boss: true,
  theme: {
    skyTop: '#8f95a5',
    skyBottom: '#d4cebe',
    orb: '#f7f3e6',
    orbAlpha: 0.95,
    orbSize: 0.15,
    mountain: '16, 16, 26',
    petals: true,
  },
  grid: buildMap(40, ROWS, (m) => {
    m.rect('#', 0, 15, 39, 17).put('P', 6, 14)
    m.rect('=', 7, 11, 12, 11).rect('=', 27, 11, 32, 11)
    m.rect('=', 17, 8, 22, 8)
    m.put('B', 31, 14)
  }),
}

/** A duel follows every level: 6 stages per loop. */
export const LEVELS: LevelDef[] = [bambooGrove, foxfireGrove, mountainPass, demonGate, castleWalls, moonlitDuel]

export const isBossStage = (stage: number): boolean => LEVELS[(stage - 1) % LEVELS.length].boss

/** Stage numbers keep counting past the last level; each loop is harder. */
export function getLevel(stage: number): { def: LevelDef; diff: Difficulty; cycle: number } {
  const idx = (stage - 1) % LEVELS.length
  const cycle = Math.floor((stage - 1) / LEVELS.length)
  return {
    def: LEVELS[idx],
    cycle,
    diff: {
      hpMul: 1 + idx * 0.1 + cycle * 0.6,
      speedMul: 1 + cycle * 0.12,
      chargeMul: 1 + idx * 0.05 + cycle * 0.25,
      inkCostMul: 1 + cycle * 0.1,
      goldMul: 1 + cycle * 0.5,
      armorBonus: cycle >= 1 ? 1 : 0,
    },
  }
}

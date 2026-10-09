import type { Vec } from '../../core/math.ts'
import { Kitsune, KitsuneClone } from '../boss/kitsune.ts'
import { Ronin } from '../boss/ronin.ts'
import { Warlord } from '../boss/warlord.ts'
import { Archer } from './archer.ts'
import { Ashigaru } from './ashigaru.ts'
import { Bamboo } from './bamboo.ts'
import type { Difficulty, Enemy, EnemyKind } from './base.ts'
import { Guard } from './guard.ts'
import { Ninja } from './ninja.ts'
import { Oni } from './oni.ts'
import { Tengu } from './tengu.ts'

/** `feet` is the bottom-center the enemy stands on. */
export function createEnemy(kind: EnemyKind, feet: Vec, diff: Difficulty): Enemy {
  switch (kind) {
    case 'ashigaru':
      return new Ashigaru(feet, diff)
    case 'archer':
      return new Archer(feet, diff)
    case 'guard':
      return new Guard(feet, diff)
    case 'ninja':
      return new Ninja(feet, diff)
    case 'bamboo':
      return new Bamboo(feet, diff)
    case 'tengu':
      return new Tengu(feet, diff)
    case 'oni':
      return new Oni(feet, diff)
    case 'kitsune':
      return new Kitsune(feet, diff)
    case 'foxclone':
      return new KitsuneClone(feet, diff)
    case 'warlord':
      return new Warlord(feet, diff)
    case 'ronin':
      return new Ronin(feet, diff)
  }
}

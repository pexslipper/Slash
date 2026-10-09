/** Hits needed to reach each combo tier within one stroke. Every pass of the blade counts. */
export const COMBO_STEPS = [0, 3, 5, 8, 12]
export const COMBO_MULTS = [1, 1.2, 1.5, 2, 2.5]

export function comboTier(hits: number): number {
  let tier = 0
  COMBO_STEPS.forEach((need, i) => {
    if (hits >= need) tier = i
  })
  return tier
}

export const comboMult = (hits: number): number => COMBO_MULTS[comboTier(hits)]

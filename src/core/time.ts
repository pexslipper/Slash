/** Global simulation clock: `scale` drives slow-mo, `hitstop` briefly freezes the simulation on impacts. */
export const clock = { scale: 1, hitstop: 0 }

export function hitstop(seconds: number): void {
  clock.hitstop = Math.max(clock.hitstop, seconds)
}

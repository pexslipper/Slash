/** World units on the shorter screen side; the longer side stretches to fit. */
export const WORLD_MIN = 720

/**
 * Never draw smaller than this many CSS pixels per world unit. Big screens are already above it;
 * on phones it zooms in (showing less of the level) so the samurai and enemies stay a usable size.
 */
const MIN_SCALE = 0.9

export const view = {
  /** World size in units. */
  w: 1280,
  h: WORLD_MIN,
  /** CSS pixels per world unit. */
  scale: 1,
  dpr: 1,
}

export function updateView(cssW: number, cssH: number, dpr: number): void {
  view.dpr = dpr
  view.scale = Math.max(Math.min(cssW, cssH) / WORLD_MIN, MIN_SCALE)
  view.w = cssW / view.scale
  view.h = cssH / view.scale
}

export const DEBUG = new URLSearchParams(location.search).has('debug')

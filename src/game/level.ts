import { type Vec, clamp, dist, lerpVec } from '../core/math.ts'

export const TILE = 40
export const GRAVITY = 1900
export const MAX_FALL = 1100

export const EMPTY = 0
export const SOLID = 1
export const ONEWAY = 2
export const SPIKE = 3

export type SpawnKind =
  | 'ashigaru'
  | 'archer'
  | 'guard'
  | 'ninja'
  | 'bamboo'
  | 'tengu'
  | 'oni'
  | 'kitsune'
  | 'foxclone'
  | 'warlord'
  | 'ronin'

export interface Spawn {
  kind: SpawnKind
  /** Feet position: column center, cell bottom. */
  x: number
  y: number
}

export interface Theme {
  skyTop: string
  skyBottom: string
  /** Sun or moon. */
  orb: string
  orbAlpha: number
  orbSize: number
  /** "r, g, b" of the distant mountain washes. */
  mountain: string
  petals: boolean
}

export interface LevelDef {
  name: string
  kanji: string
  subtitle: string
  theme: Theme
  boss: boolean
  grid: string[]
}

const SPAWN_CHARS: Record<string, SpawnKind> = {
  a: 'ashigaru',
  r: 'archer',
  s: 'guard',
  n: 'ninja',
  b: 'bamboo',
  t: 'tengu',
  o: 'oni',
  B: 'ronin',
  K: 'kitsune',
  W: 'warlord',
}

/**
 * Paints a level grid. Legend: # ground, = wooden one-way platform, ^ spikes,
 * P player start, G torii gate (goal), c coin, a ashigaru, r archer, s shield guard,
 * n ninja, b bamboo, t tengu (flying), o oni (brute); bosses: K kitsune, W oni warlord, B ronin.
 */
export class MapBuilder {
  private readonly cells: string[][]

  constructor(cols: number, rows: number) {
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '))
  }

  rect(ch: string, c0: number, r0: number, c1: number, r1: number): this {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.put(ch, c, r)
    return this
  }

  put(ch: string, c: number, r: number): this {
    if (r >= 0 && r < this.cells.length && c >= 0 && c < this.cells[r].length) this.cells[r][c] = ch
    return this
  }

  /** Places a string left to right; spaces leave cells untouched. */
  row(str: string, c: number, r: number): this {
    ;[...str].forEach((ch, i) => {
      if (ch !== ' ') this.put(ch, c + i, r)
    })
    return this
  }

  build(): string[] {
    return this.cells.map((r) => r.join(''))
  }
}

export function buildMap(cols: number, rows: number, paint: (m: MapBuilder) => void): string[] {
  const m = new MapBuilder(cols, rows)
  paint(m)
  return m.build()
}

/** Anything that moves with tile collision. `pos` is the box center. */
export interface Body {
  pos: Vec
  vel: Vec
  readonly hw: number
  readonly hh: number
  grounded: boolean
  /** While > 0 the body falls through one-way platforms. */
  dropTimer: number
}

export class Level {
  readonly def: LevelDef
  readonly cols: number
  readonly rows: number
  readonly width: number
  readonly height: number
  readonly start: Vec = { x: TILE * 2, y: TILE * 10 }
  readonly gate: Vec | null = null
  readonly spawns: Spawn[] = []
  readonly coins: Vec[] = []
  private readonly grid: Uint8Array

  constructor(def: LevelDef) {
    this.def = def
    this.rows = def.grid.length
    this.cols = Math.max(...def.grid.map((r) => r.length))
    this.width = this.cols * TILE
    this.height = this.rows * TILE
    this.grid = new Uint8Array(this.cols * this.rows)
    for (let cy = 0; cy < this.rows; cy++) {
      const row = def.grid[cy]
      for (let cx = 0; cx < row.length; cx++) {
        const ch = row[cx]
        const feet = { x: (cx + 0.5) * TILE, y: (cy + 1) * TILE }
        if (ch === '#') this.grid[cy * this.cols + cx] = SOLID
        else if (ch === '=') this.grid[cy * this.cols + cx] = ONEWAY
        else if (ch === '^') this.grid[cy * this.cols + cx] = SPIKE
        else if (ch === 'P') this.start = feet
        else if (ch === 'G') this.gate ??= feet
        else if (ch === 'c') this.coins.push({ x: feet.x, y: feet.y - TILE / 2 })
        else if (SPAWN_CHARS[ch]) this.spawns.push({ kind: SPAWN_CHARS[ch], ...feet })
      }
    }
  }

  /** Columns outside the map are walls; rows above and below are open air. */
  tile(cx: number, cy: number): number {
    if (cx < 0 || cx >= this.cols) return SOLID
    if (cy < 0 || cy >= this.rows) return EMPTY
    return this.grid[cy * this.cols + cx]
  }

  tileAt(x: number, y: number): number {
    return this.tile(Math.floor(x / TILE), Math.floor(y / TILE))
  }

  solidAt(x: number, y: number): boolean {
    return this.tileAt(x, y) === SOLID
  }

  overlapsSolid(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let cy = Math.floor(y0 / TILE); cy <= Math.floor(y1 / TILE); cy++) {
      for (let cx = Math.floor(x0 / TILE); cx <= Math.floor(x1 / TILE); cx++) if (this.tile(cx, cy) === SOLID) return true
    }
    return false
  }

  /** Parameter (0..1) just before segment ab first enters solid ground, or null when clear. */
  segmentBlocked(a: Vec, b: Vec): number | null {
    const n = Math.max(1, Math.ceil(dist(a, b) / 6))
    for (let i = 0; i <= n; i++) {
      const p = lerpVec(a, b, i / n)
      if (this.solidAt(p.x, p.y)) return Math.max(0, (i - 1) / n)
    }
    return null
  }

  /** True when the box touches the sharp part (lower 65%) of a spike tile. */
  touchesSpike(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let cy = Math.floor(y0 / TILE); cy <= Math.floor(y1 / TILE); cy++) {
      for (let cx = Math.floor(x0 / TILE); cx <= Math.floor(x1 / TILE); cx++) {
        if (this.tile(cx, cy) !== SPIKE) continue
        if (y1 > cy * TILE + TILE * 0.35) return true
      }
    }
    return false
  }

  /** Top y of the first standable surface at or below `y` in the column of `x`. */
  findGround(x: number, y: number): number | null {
    const cx = Math.floor(x / TILE)
    if (cx < 0 || cx >= this.cols) return null
    for (let cy = Math.max(1, Math.floor(y / TILE)); cy < this.rows; cy++) {
      const t = this.tile(cx, cy)
      if ((t === SOLID || t === ONEWAY) && this.tile(cx, cy - 1) === EMPTY) return cy * TILE
      if (t === SPIKE) return null
    }
    return null
  }
}

/** Moves a body with axis-separated tile collision. Returns true if it hit a wall. */
export function moveBody(level: Level, b: Body, dt: number): boolean {
  let wall = false
  b.vel.x = clamp(b.vel.x, -1400, 1400)
  b.pos.x += b.vel.x * dt
  {
    const cy0 = Math.floor((b.pos.y - b.hh + 0.01) / TILE)
    const cy1 = Math.floor((b.pos.y + b.hh - 0.01) / TILE)
    if (b.vel.x !== 0) {
      const edge = b.vel.x > 0 ? b.pos.x + b.hw : b.pos.x - b.hw
      const cx = Math.floor(edge / TILE)
      for (let cy = cy0; cy <= cy1; cy++) {
        if (level.tile(cx, cy) !== SOLID) continue
        b.pos.x = b.vel.x > 0 ? cx * TILE - b.hw - 0.001 : (cx + 1) * TILE + b.hw + 0.001
        b.vel.x = 0
        wall = true
        break
      }
    }
  }

  const prevBottom = b.pos.y + b.hh
  b.pos.y += b.vel.y * dt
  b.grounded = false
  const cx0 = Math.floor((b.pos.x - b.hw + 0.01) / TILE)
  const cx1 = Math.floor((b.pos.x + b.hw - 0.01) / TILE)
  if (b.vel.y > 0) {
    const cy = Math.floor((b.pos.y + b.hh) / TILE)
    for (let cx = cx0; cx <= cx1; cx++) {
      const t = level.tile(cx, cy)
      const oneWay = t === ONEWAY && prevBottom <= cy * TILE + 0.5 && b.dropTimer <= 0
      if (t !== SOLID && !oneWay) continue
      b.pos.y = cy * TILE - b.hh
      b.vel.y = 0
      b.grounded = true
      break
    }
  } else if (b.vel.y < 0) {
    const cy = Math.floor((b.pos.y - b.hh) / TILE)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (level.tile(cx, cy) !== SOLID) continue
      b.pos.y = (cy + 1) * TILE + b.hh
      b.vel.y = 0
      break
    }
  }
  return wall
}

/** Pushes a body out of solid ground after it was placed directly (e.g. at the end of a dash). */
export function unstick(level: Level, b: Body): void {
  const stuck = (): boolean => level.overlapsSolid(b.pos.x - b.hw, b.pos.y - b.hh, b.pos.x + b.hw, b.pos.y + b.hh)
  if (!stuck()) return
  const origin = { ...b.pos }
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    for (let step = 2; step <= 60; step += 2) {
      b.pos = { x: origin.x + dx * step, y: origin.y + dy * step }
      if (!stuck()) return
    }
  }
  b.pos = origin
}

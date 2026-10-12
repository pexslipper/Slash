import { sfx } from '../core/audio.ts'
import type { SaveData } from '../core/save.ts'
import { type Grade, type Rank, formatTime } from '../game/rank.ts'
import { SPECIALS } from '../game/specials.ts'
import { TREES, UPGRADES, upgradeCost } from '../game/upgrades.ts'

let root: HTMLDivElement
let pauseBtn: HTMLButtonElement
let backBtn: HTMLButtonElement
let onPauseClick: (() => void) | null = null
let onBackClick: (() => void) | null = null

export function mountOverlay(parent: HTMLElement): void {
  root = document.createElement('div')
  root.id = 'overlay'
  root.className = 'hidden'
  parent.appendChild(root)

  pauseBtn = document.createElement('button')
  pauseBtn.id = 'pause-btn'
  pauseBtn.type = 'button'
  pauseBtn.title = 'Pause (Esc)'
  pauseBtn.setAttribute('aria-label', 'Pause')
  pauseBtn.innerHTML = '<span></span><span></span>'
  pauseBtn.hidden = true
  pauseBtn.addEventListener('click', () => {
    sfx('ui')
    onPauseClick?.()
  })
  parent.appendChild(pauseBtn)

  backBtn = document.createElement('button')
  backBtn.id = 'back-btn'
  backBtn.type = 'button'
  backBtn.className = 'btn'
  backBtn.title = 'Back (Esc)'
  backBtn.textContent = '戻  Back'
  backBtn.hidden = true
  backBtn.addEventListener('click', () => {
    sfx('ui')
    onBackClick?.()
  })
  parent.appendChild(backBtn)

  // Every menu button clicks like a small wood block.
  root.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) sfx('ui')
  })
}

/** Shows the in-game pause button (during play only). */
export function setPauseButton(visible: boolean, onClick?: () => void): void {
  pauseBtn.hidden = !visible
  if (onClick) onPauseClick = onClick
}

/** Shows the Back button in the top-right corner (in the practice room). */
export function setBackButton(visible: boolean, onClick?: () => void): void {
  backBtn.hidden = !visible
  if (onClick) onBackClick = onClick
}

export function hideOverlay(): void {
  root.className = 'hidden'
  root.innerHTML = ''
}

function show(html: string): void {
  root.className = ''
  root.innerHTML = html
  root.scrollTop = 0
}

function onClick(selector: string, fn: () => void): void {
  root.querySelector(selector)?.addEventListener('click', fn)
}

export type SettingKey = 'sound' | 'vibration'

export interface SettingsOpts {
  sound: boolean
  /** Null where the device can't vibrate: the toggle is left out. */
  vibration: boolean | null
  /** Flips a setting and returns its new value. */
  onToggle(key: SettingKey): boolean
}

const toggleLabel = (name: string, on: boolean): string => `${name}: ${on ? 'On' : 'Off'}`

function settingsHtml(s: SettingsOpts): string {
  const vib =
    s.vibration === null
      ? ''
      : `<button class="btn small" id="t-vibration" aria-pressed="${s.vibration}">${toggleLabel('Vibration', s.vibration)}</button>`
  return `<div class="toggles"><button class="btn small" id="t-sound" aria-pressed="${s.sound}">${toggleLabel('Sound', s.sound)}</button>${vib}</div>`
}

function bindSettings(s: SettingsOpts): void {
  for (const [key, name] of [['sound', 'Sound'], ['vibration', 'Vibration']] as const) {
    const btn = root.querySelector<HTMLButtonElement>(`#t-${key}`)
    btn?.addEventListener('click', () => {
      const on = s.onToggle(key)
      btn.textContent = toggleLabel(name, on)
      btn.setAttribute('aria-pressed', String(on))
    })
  }
}

const { rising, void: circle, still, thousand } = SPECIALS

export interface TitleOpts {
  gold: number
  best: number
  checkpoint: number
  settings: SettingsOpts
  onStart(stage: number): void
  onShop(): void
}

export function showTitle(o: TitleOpts): void {
  show(`
    <div class="panel narrow title">
      <div class="seal">居合</div>
      <h1>IAI</h1>
      <p class="subtitle">The One-Stroke Blade</p>
      <p class="tag">Draw your cut. Time slows. Release, and the samurai flash-steps to the line and follows it.</p>
      <div class="actions">
        <button class="btn primary" id="start">Begin the path</button>
        ${o.checkpoint > 1 ? `<button class="btn" id="cont">Continue from stage ${o.checkpoint}</button>` : ''}
        <button class="btn" id="shop">Dojo · Upgrades</button>
      </div>
      <div class="meta"><span class="gold">${o.gold} mon</span><span>Best stage: ${o.best}</span></div>
      ${settingsHtml(o.settings)}
      <ul class="howto">
        <li><b>Click</b> Run to a spot, or jump toward it. Click again in the air to jump again.</li>
        <li><b>Drag</b> Draw the path of your blade while time slows. Your ink sets how long one cut can be, and it never runs dry.</li>
        <li><b>Clear the stage</b> The torii gate stays sealed until every foe has fallen.</li>
        <li><b>Duels</b> A boss waits after every level. Cut across their red attack lines to parry; each duel has its own trick.</li>
        <li><b>Release</b> You flash-step to where the line starts (if it's within reach), then cut along it. Cut again right away.</li>
        <li><b>Multi-slash</b> Every pass through an enemy is a hit. Zigzag through them to raise the multiplier up to ×2.5.</li>
        <li><b>Shapes</b> Learn specials with mon at the Dojo (技 Arts), then draw their shape to cast them. Each costs Spirit (気), earned by landing hits and parries. Triangle or rectangle (${rising.cost}): launches everyone inside, hanging in the air. Circle (${circle.cost}): holds enemies in the air and cuts them. Zigzag (${still.cost}): everyone the zigzag passes through freezes, then all the cuts land at once, and anything frozen in mid-air dies outright. Star (${thousand.cost}, a full meter): cuts every enemy near it. Practice them in the Dojo (稽古).</li>
        <li><b>Chain</b> Cut again while a special's targets are still in the air and your combo carries on (連).</li>
        <li><b>Finisher</b> Click during a cut to slash in a circle where you land.</li>
        <li><b>Read them</b> Shields guard the front, archers aim first, ninja blink to their shadow, tengu dive from above, and oni slam the ground in front of them.</li>
      </ul>
    </div>`)
  onClick('#start', () => o.onStart(1))
  onClick('#cont', () => o.onStart(o.checkpoint))
  onClick('#shop', o.onShop)
  bindSettings(o.settings)
}

/** A cleared stage's rank, with the best one earned there so far. */
export interface ShopRank {
  rank: Rank
  best: Grade
  newBest: boolean
}

export interface ShopOpts {
  save: SaveData
  title: string
  summary?: string
  rank?: ShopRank
  continueLabel: string
  onBuy(id: string): void
  onContinue(): void
  onPractice(): void
}

function rankHtml({ rank: r, best, newBest }: ShopRank): string {
  return `
    <div class="rank">
      <div class="grade${r.grade === 'S' ? ' top' : ''}">${r.grade}</div>
      <div class="rank-lines">
        <div>Time <b>${formatTime(r.time)}</b> <span>(par ${formatTime(r.par)})</span></div>
        <div>Damage taken <b>${Math.round(r.damageTaken)}</b></div>
        <div>Best combo <b>×${r.bestMult}</b></div>
        <div class="${newBest ? 'new' : ''}">${newBest ? 'New best rank on this stage!' : `Best on this stage: ${best}`}</div>
      </div>
    </div>`
}

export function showShop(o: ShopOpts): void {
  const trees = TREES.map((tree) => {
    const cards = UPGRADES.filter((u) => u.tree === tree.id)
      .map((u) => {
        const lvl = o.save.upgrades[u.id] ?? 0
        const maxed = lvl >= u.maxLevel
        const cost = upgradeCost(u, lvl)
        const pips = Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')
        return `
          <div class="card">
            <div class="card-head"><b>${u.name}</b><span class="lvl">${lvl}/${u.maxLevel}</span></div>
            <div class="pips">${pips}</div>
            <p class="now">${lvl > 0 ? u.describe(lvl) : 'Not learned'}</p>
            ${maxed ? '' : `<p class="next">Next: ${u.describe(lvl + 1)}</p>`}
            <button class="btn buy" data-id="${u.id}" ${maxed || o.save.gold < cost ? 'disabled' : ''}>
              ${maxed ? (u.maxLevel === 1 ? 'Learned' : 'Mastered') : `${u.maxLevel === 1 ? 'Learn · ' : ''}${cost} mon`}
            </button>
          </div>`
      })
      .join('')
    return `
      <section class="tree" style="--tree:${tree.color}">
        <h2><span>${tree.kanji}</span>${tree.name}</h2>
        <p class="sub">${tree.tagline}</p>
        ${cards}
      </section>`
  }).join('')

  const scroll = root.scrollTop
  show(`
    <div class="panel shop">
      <header>
        <div>
          <h1>${o.title}</h1>
          ${o.summary ? `<p class="summary">${o.summary}</p>` : ''}
          ${o.rank ? rankHtml(o.rank) : ''}
        </div>
        <div class="gold">${o.save.gold} mon</div>
      </header>
      <div class="trees">${trees}</div>
      <footer>
        <button class="btn" id="practice">稽古  Practice shapes</button>
        <button class="btn primary" id="go">${o.continueLabel}</button>
      </footer>
    </div>`)
  root.scrollTop = scroll

  root.querySelectorAll<HTMLButtonElement>('.buy').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      if (!id) return
      o.onBuy(id)
      showShop(o)
    }),
  )
  onClick('#go', o.onContinue)
  onClick('#practice', o.onPractice)
}

export interface GameOverOpts {
  stage: number
  gold: number
  kills: number
  best: number
  checkpoint: number
  onRetry(stage: number): void
  onShop(): void
  onTitle(): void
}

export function showGameOver(o: GameOverOpts): void {
  show(`
    <div class="panel narrow over">
      <div class="seal">敗</div>
      <h1>Defeated</h1>
      <p class="tag">You fell on stage ${o.stage}. The mon you gathered are kept.</p>
      <div class="stats">
        <div><b class="gold">+${o.gold}</b><span>Mon</span></div>
        <div><b>${o.kills}</b><span>Cuts</span></div>
        <div><b>${o.best}</b><span>Best stage</span></div>
      </div>
      <div class="actions">
        <button class="btn primary" id="again">Retry stage ${o.stage}</button>
        ${o.checkpoint > 1 && o.checkpoint !== o.stage ? `<button class="btn" id="cp">Restart from stage ${o.checkpoint}</button>` : ''}
        <button class="btn" id="shop">Dojo · Upgrades</button>
        <button class="btn" id="title">Title</button>
      </div>
    </div>`)
  onClick('#again', () => o.onRetry(o.stage))
  onClick('#cp', () => o.onRetry(o.checkpoint))
  onClick('#shop', o.onShop)
  onClick('#title', o.onTitle)
}

export interface PauseOpts {
  /** Level title, e.g. "竹林 Bamboo Grove". */
  title: string
  detail: string
  settings: SettingsOpts
  onResume(): void
  onRestart(): void
  onMenu(): void
}

export function showPause(o: PauseOpts): void {
  show(`
    <div class="panel narrow pause">
      <div class="seal">休</div>
      <h1>Paused</h1>
      <p class="tag">${o.title} · ${o.detail}</p>
      <div class="actions" id="pause-actions">
        <button class="btn primary" id="resume">Resume</button>
        <button class="btn" id="restart">Restart stage</button>
        <button class="btn" id="menu">Main menu</button>
      </div>
      ${settingsHtml(o.settings)}
      <ul class="howto">
        <li><b>Click</b> Run or jump there.</li>
        <li><b>Drag</b> Draw a cut (time slows). Hold near the screen edge to scroll.</li>
        <li><b>Shapes</b> Once learned at the Dojo, each costs Spirit (気): triangle or rectangle launches (${rising.cost}), circle juggles (${circle.cost}), a 5-stroke zigzag freezes (${still.cost}), star cuts everything near it (${thousand.cost}). Cut again while they hang in the air to chain the combo (連).</li>
        <li><b>Esc</b> Pause or resume.</li>
      </ul>
    </div>`)
  onClick('#resume', o.onResume)
  onClick('#restart', o.onRestart)
  bindSettings(o.settings)
  onClick('#menu', () => {
    // Leaving mid-stage loses the stage's progress, so ask once.
    const actions = root.querySelector('#pause-actions')
    if (!actions) return
    actions.innerHTML = `
      <p class="confirm">Leave this stage? The mon you gathered are kept; the stage starts over next time.</p>
      <button class="btn primary" id="menu-yes">Leave to main menu</button>
      <button class="btn" id="menu-no">Stay</button>`
    onClick('#menu-yes', o.onMenu)
    onClick('#menu-no', () => showPause(o))
  })
}

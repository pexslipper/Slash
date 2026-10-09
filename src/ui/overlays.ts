import type { SaveData } from '../core/save.ts'
import { TREES, UPGRADES, upgradeCost } from '../game/upgrades.ts'

let root: HTMLDivElement
let pauseBtn: HTMLButtonElement
let onPauseClick: (() => void) | null = null

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
  pauseBtn.addEventListener('click', () => onPauseClick?.())
  parent.appendChild(pauseBtn)
}

/** Shows the in-game pause button (during play only). */
export function setPauseButton(visible: boolean, onClick?: () => void): void {
  pauseBtn.hidden = !visible
  if (onClick) onPauseClick = onClick
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

export interface TitleOpts {
  gold: number
  best: number
  checkpoint: number
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
      <ul class="howto">
        <li><b>Click</b> Run to a spot, or jump toward it. Click again in the air to jump again.</li>
        <li><b>Drag</b> Draw the path of your blade while time slows. Your ink sets how long one cut can be, and it never runs dry.</li>
        <li><b>Clear the stage</b> The torii gate stays sealed until every foe has fallen.</li>
        <li><b>Duels</b> A boss waits after every level. Cut across their red attack lines to parry; each duel has its own trick.</li>
        <li><b>Release</b> You flash-step to where the line starts (if it's within reach), then cut along it. Cut again right away.</li>
        <li><b>Multi-slash</b> Every pass through an enemy is a hit. Zigzag through them to raise the multiplier up to ×2.5.</li>
        <li><b>Shapes</b> Learn specials with mon at the Dojo (技 Arts), then draw their shape to cast them. Triangle or rectangle: launches everyone inside, hanging in the air. Circle: holds enemies in the air and cuts them. Zigzag: everyone the zigzag passes through freezes, then all the cuts land at once, and anything frozen in mid-air dies outright. These are free; the star (cut everything on screen) costs a full Spirit meter (気), earned by landing hits.</li>
        <li><b>Finisher</b> Click during a cut to slash in a circle where you land.</li>
        <li><b>Read them</b> Shields guard the front, archers aim first, ninja blink to their shadow, tengu dive from above, and oni slam the ground in front of them.</li>
      </ul>
    </div>`)
  onClick('#start', () => o.onStart(1))
  onClick('#cont', () => o.onStart(o.checkpoint))
  onClick('#shop', o.onShop)
}

export interface ShopOpts {
  save: SaveData
  title: string
  summary?: string
  continueLabel: string
  onBuy(id: string): void
  onContinue(): void
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
        </div>
        <div class="gold">${o.save.gold} mon</div>
      </header>
      <div class="trees">${trees}</div>
      <footer><button class="btn primary" id="go">${o.continueLabel}</button></footer>
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
      <ul class="howto">
        <li><b>Click</b> Run or jump there.</li>
        <li><b>Drag</b> Draw a cut (time slows). Hold near the screen edge to scroll.</li>
        <li><b>Shapes</b> Once learned at the Dojo: triangle or rectangle launches, circle juggles, a 5-stroke zigzag freezes, star cuts everything (full Spirit).</li>
        <li><b>Esc</b> Pause or resume.</li>
      </ul>
    </div>`)
  onClick('#resume', o.onResume)
  onClick('#restart', o.onRestart)
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

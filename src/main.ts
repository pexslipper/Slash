import './style.css'
import { Input } from './core/input.ts'
import { lerp } from './core/math.ts'
import { type SaveData, loadSave, writeSave } from './core/save.ts'
import { DEBUG, updateView, view } from './core/view.ts'
import { LEVELS, isBossStage } from './game/levels.ts'
import { drawSamurai } from './game/player.ts'
import { type PlayerStats, computeStats } from './game/stats.ts'
import { UPGRADES, upgradeCost } from './game/upgrades.ts'
import { World, type StageResult } from './game/world.ts'
import { INK, RED, brushPath, text } from './render/ink.ts'
import { drawGrain, drawSky } from './render/scenery.ts'
import { hideOverlay, mountOverlay, setPauseButton, showGameOver, showPause, showShop, showTitle } from './ui/overlays.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
const canvas = document.createElement('canvas')
app.appendChild(canvas)
const g = canvas.getContext('2d')!
mountOverlay(app)

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  updateView(w, h, dpr)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
}
window.addEventListener('resize', resize)
resize()

const input = new Input(canvas)

class Game {
  save: SaveData = loadSave()
  stats: PlayerStats = computeStats(this.save.upgrades)
  world: World | null = null
  private running = false
  private runHp = 0
  private runSpirit = 0
  private time = 0
  private paused = false
  /** HP and spirit the current stage started with, for "Restart stage". */
  private stageHp = 0
  private stageSpirit = 0

  title(): void {
    this.world = null
    this.running = false
    this.paused = false
    input.handler = null
    setPauseButton(false)
    showTitle({
      gold: this.save.gold,
      best: this.save.bestStage,
      checkpoint: this.save.checkpoint,
      onStart: (stage) => this.startRun(stage),
      onShop: () => this.shop('Dojo', 'Done', () => this.title()),
    })
  }

  startRun(stage: number): void {
    this.stats = computeStats(this.save.upgrades)
    this.runHp = this.stats.maxHp
    this.runSpirit = 0
    this.startStage(stage)
  }

  private startStage(num: number): void {
    hideOverlay()
    this.stageHp = this.runHp
    this.stageSpirit = this.runSpirit
    this.world = new World(num, this.stats, this.runHp, this.runSpirit, this.save.gold, (r) => this.onStageEnd(num, r))
    input.handler = this.world
    this.running = true
    this.paused = false
    setPauseButton(true, () => this.pause())
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** Freezes the stage and shows the pause menu (only mid-stage, not during the end banner). */
  pause(): void {
    const w = this.world
    if (!w || !this.running || this.paused || w.outcome) return
    this.paused = true
    w.interrupt()
    input.handler = null
    setPauseButton(false)
    const detail = w.def.boss ? 'Duel' : w.foesLeft > 0 ? `${w.foesLeft} foes remain` : 'The gate is open'
    showPause({
      title: `${w.def.kanji} ${w.def.name}`,
      detail,
      onResume: () => this.resume(),
      onRestart: () => this.restartStage(),
      onMenu: () => this.quitToTitle(),
    })
  }

  resume(): void {
    if (!this.paused || !this.world) return
    this.paused = false
    hideOverlay()
    input.handler = this.world
    setPauseButton(true)
  }

  /** Mon picked up during an abandoned attempt are kept. */
  private bankStageGold(): void {
    if (!this.world) return
    this.save.gold += this.world.runGold
    writeSave(this.save)
  }

  private restartStage(): void {
    const w = this.world
    if (!w) return
    this.bankStageGold()
    this.runHp = this.stageHp
    this.runSpirit = this.stageSpirit
    this.startStage(w.stage)
  }

  private quitToTitle(): void {
    this.bankStageGold()
    this.title()
  }

  private onStageEnd(num: number, r: StageResult): void {
    this.running = false
    input.handler = null
    setPauseButton(false)
    this.save.gold += r.gold
    if (r.cleared) {
      this.save.bestStage = Math.max(this.save.bestStage, num)
      if (isBossStage(num)) this.save.checkpoint = Math.max(this.save.checkpoint, num + 1)
      writeSave(this.save)
      // HP carries between stages, with a partial heal at the shrine.
      this.runHp = Math.min(this.stats.maxHp, r.hp + this.stats.maxHp * 0.35)
      this.runSpirit = r.spirit
      const next = LEVELS[num % LEVELS.length]
      this.shop(
        `Stage ${num} cleared`,
        `Onward: ${next.kanji} ${next.name}`,
        () => this.startStage(num + 1),
        `+${r.gold} mon · ${r.kills} cuts · best combo ×${r.bestMult}`,
      )
    } else {
      writeSave(this.save)
      showGameOver({
        stage: num,
        gold: r.gold,
        kills: r.kills,
        best: this.save.bestStage,
        checkpoint: this.save.checkpoint,
        onRetry: (stage) => this.startRun(stage),
        onShop: () => this.shop('Dojo', 'Done', () => this.title()),
        onTitle: () => this.title(),
      })
    }
  }

  private shop(title: string, continueLabel: string, onContinue: () => void, summary?: string): void {
    showShop({ save: this.save, title, summary, continueLabel, onContinue, onBuy: (id) => this.buy(id) })
  }

  private buy(id: string): void {
    const u = UPGRADES.find((x) => x.id === id)
    if (!u) return
    const lvl = this.save.upgrades[id] ?? 0
    const cost = upgradeCost(u, lvl)
    if (lvl >= u.maxLevel || this.save.gold < cost) return
    this.save.gold -= cost
    this.save.upgrades[id] = lvl + 1
    writeSave(this.save)
    const prevMax = this.stats.maxHp
    this.stats = computeStats(this.save.upgrades)
    this.runHp += this.stats.maxHp - prevMax
  }

  addDebugGold(amount: number): void {
    this.save.gold += amount
    writeSave(this.save)
    if (this.world) this.world.bankGold += amount
  }

  update(dt: number): void {
    this.time += dt
    if (this.world && this.running && !this.paused) this.world.update(dt)
  }

  render(): void {
    g.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0)
    if (this.world) this.world.render(g)
    else this.renderTitleBackdrop()
  }

  /** A lone samurai on a ridge, with a cut sweeping across the sky. */
  private renderTitleBackdrop(): void {
    drawSky(g, LEVELS[0].theme, this.time * 40, 0)
    const { w, h } = view
    g.fillStyle = INK
    g.beginPath()
    g.moveTo(0, h)
    g.lineTo(0, h * 0.86)
    g.quadraticCurveTo(w * 0.25, h * 0.8, w * 0.45, h * 0.84)
    g.quadraticCurveTo(w * 0.7, h * 0.9, w, h * 0.83)
    g.lineTo(w, h)
    g.closePath()
    g.fill()
    drawSamurai(g, w * 0.18, h * 0.81 - 22, 1, 'stance', 0, INK, 1)
    const k = (this.time * 0.35) % 1
    if (k < 0.5) {
      const pts = Array.from({ length: 24 }, (_, i) => {
        const t = (i / 23) * Math.min(1, k * 4)
        return { x: w * (0.05 + 0.9 * t), y: h * (0.62 - 0.3 * t + 0.12 * Math.sin(t * Math.PI)) }
      })
      brushPath(g, pts, 10, INK, 1 - k * 2)
    }
    drawGrain(g)
  }
}

const game = new Game()
game.title()

// Esc toggles pause; leaving the tab or window pauses automatically.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || e.repeat) return
  if (game.isPaused) game.resume()
  else game.pause()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause()
})
window.addEventListener('blur', () => game.pause())

if (DEBUG) {
  // Reachable from the browser console as `game` for poking at state while debugging.
  Object.assign(window, { game })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG') game.addDebugGold(500)
    if (e.code === 'KeyB') {
      // Jump to the next duel (or replay this one).
      let stage = game.world?.stage ?? 1
      while (!isBossStage(stage)) stage++
      game.startRun(stage)
    }
  })
}

const STEP = 1 / 60
let last = performance.now()
let acc = 0
let fps = 60

function frame(now: number): void {
  // Clamped both ways: a long stall must not jump the simulation, and a frame stamped slightly
  // before the previous one (possible right after load) must not run it backwards.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
  last = now
  fps = lerp(fps, 1 / Math.max(dt, 1e-3), 0.05)
  acc += dt
  while (acc >= STEP) {
    game.update(STEP)
    acc -= STEP
  }
  game.render()
  if (DEBUG) text(g, `${Math.round(fps)} fps`, view.w - 20, view.h - 16, 12, RED, { align: 'right' })
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

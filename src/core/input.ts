import type { Vec } from './math.ts'
import { view } from './view.ts'

export interface InputHandler {
  pointerDown?(p: Vec): void
  pointerMove?(p: Vec): void
  pointerUp?(p: Vec): void
  keyDown?(code: string): void
}

/** Unifies mouse and touch through Pointer Events and maps them into world coordinates. */
export class Input {
  handler: InputHandler | null = null
  private activeId: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    const toWorld = (e: PointerEvent, rect: DOMRect): Vec => ({
      x: (e.clientX - rect.left) / view.scale,
      y: (e.clientY - rect.top) / view.scale,
    })

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (this.activeId !== null) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      this.activeId = e.pointerId
      canvas.setPointerCapture(e.pointerId)
      this.handler?.pointerDown?.(toWorld(e, canvas.getBoundingClientRect()))
    })

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.activeId) return
      const rect = canvas.getBoundingClientRect()
      const events = e.getCoalescedEvents?.() ?? []
      for (const ce of events.length > 0 ? events : [e]) this.handler?.pointerMove?.(toWorld(ce, rect))
    })

    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.activeId) return
      this.activeId = null
      this.handler?.pointerUp?.(toWorld(e, canvas.getBoundingClientRect()))
    }
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.code === 'Space' && e.target === document.body) e.preventDefault()
      this.handler?.keyDown?.(e.code)
    })
  }
}

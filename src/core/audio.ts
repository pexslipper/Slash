/**
 * Sound and haptics. Every sound is synthesized with Web Audio when it plays (there are no audio
 * files): filtered noise for brush swishes and slices, sine partials for ringing steel, falling
 * sines for taiko, short triangles for wooden clappers.
 * Browsers only allow audio after a user gesture, so the context starts on the first one.
 */

export type SoundName =
  | 'swish'
  | 'cut'
  | 'crit'
  | 'kill'
  | 'mark'
  | 'parry'
  | 'block'
  | 'hurt'
  | 'death'
  | 'jump'
  | 'coin'
  | 'arrow'
  | 'shuriken'
  | 'focus'
  | 'ready'
  | 'chain'
  | 'rising'
  | 'void'
  | 'shatter'
  | 'still'
  | 'star'
  | 'thud'
  | 'boom'
  | 'warn'
  | 'dash'
  | 'gong'
  | 'drum'
  | 'clear'
  | 'ui'
  | 'miss'

interface Voice {
  /** Oscillator wave, or 'noise' for filtered white noise. */
  wave: OscillatorType | 'noise'
  /** Start and end frequency in Hz: the pitch of a tone, or the filter frequency of noise. */
  f0: number
  f1?: number
  dur: number
  gain: number
  attack?: number
  delay?: number
  /** Noise only: filter type (default bandpass) and its Q. */
  filter?: BiquadFilterType
  q?: number
}

interface SoundDef {
  voices: Voice[]
  /** Skip the sound if it already played less than this many seconds ago (bursts of hits). */
  gap?: number
  /** Vibration on phones, in milliseconds. */
  buzz?: number
}

const taiko = (delay = 0, gain = 0.55, dur = 0.45): Voice[] => [
  { wave: 'sine', f0: 120, f1: 56, dur, gain, delay },
  { wave: 'noise', filter: 'lowpass', f0: 260, dur: 0.15, gain: gain * 0.55, delay },
]

const SOUNDS: Record<SoundName, SoundDef> = {
  // Flash-step: a quick rising rush of air.
  swish: { voices: [{ wave: 'noise', f0: 700, f1: 2800, q: 1.4, dur: 0.2, gain: 0.32, attack: 0.05 }] },
  // Blade through a foe: a dry slice and a short ring.
  cut: {
    gap: 0.03,
    buzz: 8,
    voices: [
      { wave: 'noise', filter: 'highpass', f0: 2800, q: 0.7, dur: 0.08, gain: 0.32 },
      { wave: 'sine', f0: 1900, f1: 1350, dur: 0.12, gain: 0.07 },
    ],
  },
  crit: {
    gap: 0.03,
    buzz: 14,
    voices: [
      { wave: 'noise', filter: 'highpass', f0: 3200, q: 0.7, dur: 0.09, gain: 0.36 },
      { wave: 'triangle', f0: 2650, f1: 2500, dur: 0.35, gain: 0.08 },
      { wave: 'sine', f0: 3960, dur: 0.25, gain: 0.04 },
    ],
  },
  // A killing cut: the slice plus a low thump.
  kill: {
    gap: 0.03,
    buzz: 20,
    voices: [
      { wave: 'noise', filter: 'highpass', f0: 2400, q: 0.7, dur: 0.1, gain: 0.34 },
      { wave: 'noise', filter: 'lowpass', f0: 900, dur: 0.16, gain: 0.3 },
      { wave: 'sine', f0: 150, f1: 48, dur: 0.24, gain: 0.45 },
    ],
  },
  // A Still Cut storing a hit: only a faint tick, the real sound comes on release.
  mark: { gap: 0.03, voices: [{ wave: 'sine', f0: 2600, dur: 0.05, gain: 0.035 }] },
  // Steel on steel: inharmonic partials ringing out.
  parry: {
    buzz: 45,
    voices: [
      { wave: 'noise', filter: 'highpass', f0: 2000, dur: 0.05, gain: 0.4 },
      { wave: 'sine', f0: 620, dur: 0.9, gain: 0.12 },
      { wave: 'sine', f0: 1480, dur: 0.6, gain: 0.08 },
      { wave: 'sine', f0: 2250, dur: 0.45, gain: 0.06 },
      { wave: 'sine', f0: 3330, dur: 0.3, gain: 0.04 },
    ],
  },
  // Blade turned by a shield: a dull clank.
  block: {
    buzz: 25,
    voices: [
      { wave: 'triangle', f0: 260, f1: 170, dur: 0.14, gain: 0.25 },
      { wave: 'noise', f0: 1200, q: 2, dur: 0.07, gain: 0.3 },
    ],
  },
  hurt: {
    buzz: 60,
    voices: [
      { wave: 'sine', f0: 220, f1: 80, dur: 0.26, gain: 0.35 },
      { wave: 'noise', filter: 'lowpass', f0: 700, dur: 0.16, gain: 0.3 },
    ],
  },
  death: {
    buzz: 160,
    voices: [
      { wave: 'sine', f0: 92, f1: 34, dur: 1.3, gain: 0.6 },
      { wave: 'noise', filter: 'lowpass', f0: 420, f1: 120, dur: 0.9, gain: 0.3 },
    ],
  },
  jump: { voices: [{ wave: 'noise', f0: 380, f1: 900, q: 1.2, dur: 0.13, gain: 0.12, attack: 0.02 }] },
  coin: {
    gap: 0.04,
    voices: [
      { wave: 'sine', f0: 1568, dur: 0.08, gain: 0.07 },
      { wave: 'sine', f0: 2093, dur: 0.14, gain: 0.06, delay: 0.05 },
    ],
  },
  // A bowstring let go.
  arrow: {
    gap: 0.05,
    voices: [
      { wave: 'triangle', f0: 330, f1: 170, dur: 0.13, gain: 0.12 },
      { wave: 'noise', f0: 2400, q: 2, dur: 0.1, gain: 0.12 },
    ],
  },
  shuriken: {
    gap: 0.05,
    voices: [
      { wave: 'noise', f0: 3500, f1: 5200, q: 4, dur: 0.16, gain: 0.14 },
      { wave: 'sine', f0: 2900, f1: 3400, dur: 0.12, gain: 0.03 },
    ],
  },
  // Time slows as the brush touches the paper.
  focus: {
    voices: [
      { wave: 'sine', f0: 330, f1: 110, dur: 0.4, gain: 0.1, attack: 0.02 },
      { wave: 'noise', filter: 'lowpass', f0: 700, f1: 200, dur: 0.35, gain: 0.08, attack: 0.03 },
    ],
  },
  // The shape being drawn has been read and can be cast.
  ready: {
    voices: [
      { wave: 'sine', f0: 880, dur: 0.2, gain: 0.07 },
      { wave: 'sine', f0: 1320, dur: 0.3, gain: 0.06, delay: 0.06 },
    ],
  },
  // A juggle carried the combo into a new cut.
  chain: {
    voices: [
      { wave: 'triangle', f0: 1320, f1: 1760, dur: 0.14, gain: 0.07 },
      { wave: 'sine', f0: 2640, dur: 0.2, gain: 0.03, delay: 0.05 },
    ],
  },
  rising: {
    buzz: 30,
    voices: [{ wave: 'noise', f0: 300, f1: 3000, q: 1.2, dur: 0.45, gain: 0.38, attack: 0.06 }, ...taiko(0, 0.5, 0.35)],
  },
  void: {
    buzz: 30,
    voices: [
      { wave: 'sine', f0: 72, f1: 55, dur: 1, gain: 0.35, attack: 0.05 },
      { wave: 'sine', f0: 144, f1: 110, dur: 0.9, gain: 0.1, attack: 0.05 },
      { wave: 'noise', f0: 900, q: 0.8, dur: 0.9, gain: 0.14, attack: 0.12 },
    ],
  },
  // The Void Cut's sphere breaking.
  shatter: {
    buzz: 25,
    voices: [
      { wave: 'noise', f0: 3000, q: 0.6, dur: 0.3, gain: 0.28 },
      { wave: 'sine', f0: 1800, f1: 900, dur: 0.22, gain: 0.05 },
    ],
  },
  // A Still Cut letting go: every stored cut cracks at once.
  still: {
    buzz: 50,
    voices: [
      { wave: 'noise', filter: 'highpass', f0: 4000, dur: 0.14, gain: 0.5 },
      { wave: 'sine', f0: 2400, dur: 0.6, gain: 0.07 },
      { wave: 'sine', f0: 3600, dur: 0.45, gain: 0.05 },
      { wave: 'sine', f0: 120, f1: 40, dur: 0.3, gain: 0.4 },
    ],
  },
  star: {
    buzz: 90,
    voices: [
      { wave: 'sine', f0: 110, f1: 45, dur: 0.6, gain: 0.55 },
      { wave: 'noise', f0: 500, f1: 4200, q: 0.9, dur: 0.8, gain: 0.32, attack: 0.2 },
      { wave: 'sine', f0: 1046, dur: 1.1, gain: 0.05, delay: 0.05 },
      { wave: 'sine', f0: 1568, dur: 1, gain: 0.045, delay: 0.12 },
      { wave: 'sine', f0: 2093, dur: 0.9, gain: 0.04, delay: 0.19 },
    ],
  },
  // A heavy blow landing on the ground.
  thud: {
    buzz: 40,
    voices: [
      { wave: 'sine', f0: 80, f1: 35, dur: 0.42, gain: 0.55 },
      { wave: 'noise', filter: 'lowpass', f0: 320, dur: 0.3, gain: 0.4 },
    ],
  },
  boom: {
    buzz: 120,
    voices: [
      { wave: 'sine', f0: 62, f1: 24, dur: 1.4, gain: 0.7 },
      { wave: 'noise', filter: 'lowpass', f0: 520, f1: 140, dur: 1, gain: 0.5 },
    ],
  },
  // Hyoshigi, two wooden clappers: a warning before something deadly.
  warn: {
    voices: [0, 0.14].flatMap((delay): Voice[] => [
      { wave: 'triangle', f0: 1100, f1: 900, dur: 0.07, gain: 0.32, delay },
      { wave: 'noise', f0: 2000, q: 4, dur: 0.05, gain: 0.2, delay },
    ]),
  },
  // A duelist's iai dash.
  dash: {
    voices: [
      { wave: 'noise', f0: 450, f1: 3200, q: 1.1, dur: 0.28, gain: 0.4, attack: 0.03 },
      { wave: 'sine', f0: 1500, f1: 700, dur: 0.18, gain: 0.05 },
    ],
  },
  gong: {
    voices: [
      { wave: 'sine', f0: 196, dur: 2, gain: 0.16, attack: 0.01 },
      { wave: 'sine', f0: 393, dur: 1.6, gain: 0.08 },
      { wave: 'sine', f0: 589, dur: 1.2, gain: 0.05 },
      { wave: 'sine', f0: 787, dur: 0.9, gain: 0.03 },
      { wave: 'noise', filter: 'lowpass', f0: 300, dur: 0.2, gain: 0.1 },
    ],
  },
  drum: { voices: taiko() },
  // Stage cleared: three taiko beats and a bell.
  clear: {
    voices: [
      ...taiko(0, 0.45, 0.4),
      ...taiko(0.16, 0.45, 0.4),
      ...taiko(0.32, 0.6, 0.7),
      { wave: 'sine', f0: 880, dur: 0.5, gain: 0.06, delay: 0.5 },
      { wave: 'sine', f0: 1320, dur: 0.7, gain: 0.05, delay: 0.56 },
    ],
  },
  // Menu buttons: a small wood block.
  ui: {
    voices: [
      { wave: 'triangle', f0: 720, dur: 0.05, gain: 0.12 },
      { wave: 'noise', f0: 1600, q: 3, dur: 0.03, gain: 0.08 },
    ],
  },
  miss: { voices: [{ wave: 'triangle', f0: 300, f1: 200, dur: 0.16, gain: 0.08 }] },
}

const VOLUME = 0.6

let ac: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let soundOn = true
let vibrationOn = true
const lastPlayed = new Map<SoundName, number>()
let buzzUntil = 0
let buzzMs = 0

/**
 * Vibration only works on Android phones (desktop browsers and iPhones ignore it), so the
 * setting is only offered where it can do something.
 */
export const canVibrate =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches

export function setSoundOn(on: boolean): void {
  soundOn = on
  if (out) out.gain.value = on ? VOLUME : 0
}

export function setVibrationOn(on: boolean): void {
  vibrationOn = on
}

/** Creates (or wakes) the audio context. Must run inside a user gesture. */
function unlock(): void {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      ac = new Ctor()
    } catch {
      return
    }
    // A compressor keeps a pile-up of hits from clipping.
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 6
    comp.connect(ac.destination)
    out = ac.createGain()
    out.gain.value = soundOn ? VOLUME : 0
    out.connect(comp)
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ac.state !== 'running') ac.resume().catch(() => undefined)
}

/** Starts listening for the first gesture that is allowed to turn sound on. */
export function initAudio(): void {
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true })
  }
}

function play(v: Voice, pitch: number): void {
  if (!ac || !out || !noise) return
  const t = ac.currentTime + (v.delay ?? 0)
  const end = t + v.dur
  const env = ac.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(v.gain, t + Math.min(v.attack ?? 0.004, v.dur / 2))
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  env.connect(out)
  const f0 = v.f0 * pitch
  const f1 = (v.f1 ?? v.f0) * pitch
  if (v.wave === 'noise') {
    const src = ac.createBufferSource()
    src.buffer = noise
    src.loop = true
    const filter = ac.createBiquadFilter()
    filter.type = v.filter ?? 'bandpass'
    filter.Q.value = v.q ?? 1
    filter.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, end)
    src.connect(filter).connect(env)
    // A random spot in the noise, so repeated hits don't sound identical.
    src.start(t, Math.random() * 0.9)
    src.stop(end + 0.02)
  } else {
    const osc = ac.createOscillator()
    osc.type = v.wave
    osc.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, end)
    osc.connect(env)
    osc.start(t)
    osc.stop(end + 0.02)
  }
}

/** Short vibration on phones. A burst of light hits never cuts a stronger buzz short. */
function buzz(ms: number): void {
  if (!vibrationOn || !canVibrate) return
  const now = performance.now()
  if (now < buzzUntil && ms <= buzzMs) return
  buzzUntil = now + ms + 30
  buzzMs = ms
  try {
    navigator.vibrate(ms)
  } catch {
    // Vibration blocked (e.g. no user gesture yet): just skip it.
  }
}

/** Plays a sound effect (and its vibration). `pitch` scales every frequency, e.g. to rise with a combo. */
export function sfx(name: SoundName, pitch = 1): void {
  const def = SOUNDS[name]
  if (def.buzz) buzz(def.buzz)
  if (!soundOn || !ac || ac.state !== 'running') return
  const now = ac.currentTime
  if (def.gap && now - (lastPlayed.get(name) ?? -Infinity) < def.gap) return
  lastPlayed.set(name, now)
  // A little random detune keeps repeats from sounding mechanical.
  const p = pitch * (0.97 + Math.random() * 0.06)
  for (const v of def.voices) play(v, p)
}

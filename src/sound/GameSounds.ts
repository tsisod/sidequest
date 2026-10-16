import { soundEffects } from './effects'
import type { SoundEffect, Tone } from './effects'

export type PlaySound = (effect: SoundEffect, delay?: number) => () => void

const PREFERENCE_KEY = 'sidequest-sounds-v1'
const MASTER_VOLUME = .3
const silence = () => {}

function readEnabled(): boolean {
  try { return localStorage.getItem(PREFERENCE_KEY) !== 'off' } catch { return true }
}

export function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.round(context.sampleRate / 2), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  return buffer
}

export function scheduleTone(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer, tone: Tone, start: number): AudioScheduledSourceNode {
  const begin = start + tone.at
  const end = begin + tone.length
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, begin)
  gain.gain.linearRampToValueAtTime(tone.volume ?? 1, begin + .005)
  gain.gain.exponentialRampToValueAtTime(.0001, end)
  let source: AudioScheduledSourceNode
  if (tone.wave === 'noise') {
    const buffer = context.createBufferSource()
    buffer.buffer = noise
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    filter.frequency.setValueAtTime(tone.from, begin)
    if (tone.to) filter.frequency.exponentialRampToValueAtTime(tone.to, end)
    buffer.connect(filter).connect(gain)
    source = buffer
  } else {
    const oscillator = context.createOscillator()
    oscillator.type = tone.wave
    oscillator.frequency.setValueAtTime(tone.from, begin)
    if (tone.to) oscillator.frequency.exponentialRampToValueAtTime(tone.to, end)
    oscillator.connect(gain)
    source = oscillator
  }
  gain.connect(destination)
  source.addEventListener('ended', () => gain.disconnect(), { once: true })
  source.start(begin)
  source.stop(end + .02)
  return source
}

export type SoundStatus = 'off' | 'locked' | 'ready'

export class GameSounds {
  private enabled = readEnabled()
  private unsupported = typeof AudioContext === 'undefined'
  private context?: AudioContext
  private master?: GainNode
  private noise?: AudioBuffer
  private listeners = new Set<() => void>()

  getEnabled = () => this.enabled
  getStatus = (): SoundStatus => !this.enabled || this.unsupported ? 'off' : this.context?.state === 'running' ? 'ready' : 'locked'
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish = () => { for (const listener of this.listeners) listener() }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return
    this.enabled = enabled
    try { localStorage.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off') } catch { /* The choice lasts for this visit when storage is unavailable. */ }
    this.publish()
    if (enabled) { this.unlock(); this.play('confirm') }
  }

  attach(target: EventTarget = window) {
    for (const type of ['pointerdown', 'click', 'keydown']) target.addEventListener(type, this.unlock, true)
    this.open()
    return () => {
      for (const type of ['pointerdown', 'click', 'keydown']) target.removeEventListener(type, this.unlock, true)
      const context = this.context
      this.context = this.master = this.noise = undefined
      if (context) { context.removeEventListener('statechange', this.publish); void context.close().catch(() => undefined) }
      this.publish()
    }
  }

  private open(): AudioContext | undefined {
    if (this.context || !this.enabled || this.unsupported) return this.context
    try {
      const context = new AudioContext()
      this.master = context.createGain()
      this.master.gain.value = MASTER_VOLUME
      this.master.connect(context.destination)
      this.noise = noiseBuffer(context)
      context.addEventListener('statechange', this.publish)
      this.context = context
    } catch { this.unsupported = true }
    this.publish()
    return this.context
  }

  unlock = () => {
    if (!this.enabled) return
    const context = this.open()
    if (context && context.state !== 'running' && context.state !== 'closed') void context.resume().catch(() => undefined)
  }

  play: PlaySound = (effect, delay = 0) => {
    const { context, master, noise } = this
    if (!this.enabled || document.hidden || !context || !master || !noise || context.state !== 'running') return silence
    const start = context.currentTime + .01 + delay
    const sources = soundEffects[effect].map(tone => scheduleTone(context, master, noise, tone, start))
    return () => { for (const source of sources) source.stop() }
  }
}

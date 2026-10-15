import type { WakeSound } from '../../shared/domain'
import { alarmVolume } from '../../shared/wakeAlarm'

export type WakeVoice = { gain: GainNode; stop: () => void }
export type WakeAudioState = {
  readiness: 'not-enabled' | 'unsupported' | AudioContextState
  previewing: boolean
  error: string | null
}
type Ring = { key: string; sound: WakeSound }

const initialState = (): WakeAudioState => ({ readiness: typeof AudioContext === 'undefined' ? 'unsupported' : 'not-enabled', previewing: false, error: null })
const tau = Math.PI * 2

export function createWakeBuffer(context: BaseAudioContext, sound: WakeSound): AudioBuffer {
  const length = Math.round(context.sampleRate * 2)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let index = 0; index < length; index++) {
    const time = index / context.sampleRate
    let value = 0
    if (sound === 'classic') {
      const beat = time % 1
      const pulse = beat % .15
      if (beat < .65 && pulse < .105) {
        const envelope = Math.min(1, pulse / .004) * Math.exp(-pulse * 16)
        value = envelope * (Math.sin(tau * 880 * time) + .45 * Math.sin(tau * 1327 * time) + .2 * Math.sin(tau * 2171 * time))
      }
    } else if (sound === 'chimes') {
      const notes = [523.25, 659.25, 783.99]
      for (let note = 0; note < notes.length; note++) {
        const age = time - note * .5
        if (age >= 0 && age < 2.4) {
          const frequency = notes[note]
          const envelope = Math.min(1, age / .008) * Math.exp(-age * 2.9)
          value += envelope * (Math.sin(tau * frequency * age) + .3 * Math.sin(tau * frequency * 2.01 * age) + .1 * Math.sin(tau * frequency * 3.98 * age))
        }
      }
    } else {
      for (const start of [.1, .48, 1.1, 1.48]) {
        const age = time - start
        if (age >= 0 && age < .28) {
          const envelope = Math.sin(Math.PI * age / .28) ** 2
          const phase = 1500 * age + 2100 * age * age + 9 * Math.sin(tau * 11 * age)
          value += envelope * (Math.sin(tau * phase) + .16 * Math.sin(tau * phase * 2))
        }
      }
    }
    const edge = Math.min(1, time / .01, (2 - time) / .02)
    data[index] = value * edge
    peak = Math.max(peak, Math.abs(data[index]))
  }
  if (peak > 0) for (let index = 0; index < length; index++) data[index] = data[index] / peak * .65
  return buffer
}

export function createWakeVoice(context: BaseAudioContext, sound: WakeSound, { gain: level, loop = true, when = context.currentTime, offset = 0 }: { gain: number; loop?: boolean; when?: number; offset?: number }): WakeVoice {
  const source = context.createBufferSource()
  source.buffer = createWakeBuffer(context, sound)
  source.loop = loop
  const gain = context.createGain()
  gain.gain.setValueAtTime(Math.max(0, Math.min(1, level)), when)
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -8
  limiter.knee.value = 3
  limiter.ratio.value = 12
  limiter.attack.value = .003
  limiter.release.value = .08
  source.connect(gain).connect(limiter).connect(context.destination)
  source.start(when, offset % 2)
  let stopped = false
  source.onended = () => { source.disconnect(); gain.disconnect(); limiter.disconnect() }
  return { gain, stop: () => {
    if (stopped) return
    stopped = true
    const end = context.currentTime + .02
    gain.gain.cancelScheduledValues(context.currentTime)
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime)
    gain.gain.linearRampToValueAtTime(0, end)
    source.stop(end)
  } }
}

export function scheduleWakeVolume(context: BaseAudioContext, gain: GainNode, audibleStartedAt: number): void {
  const elapsed = Math.max(0, (context.currentTime - audibleStartedAt) * 1000)
  const current = alarmVolume(elapsed)
  gain.gain.cancelScheduledValues(context.currentTime)
  gain.gain.setValueAtTime(current, context.currentTime)
  let previous = current
  const nextStep = (Math.floor(elapsed / 2000) + 1) * 2000
  for (let index = 0; index < 300; index++) {
    const at = nextStep + index * 2000
    const value = alarmVolume(at)
    gain.gain.setValueAtTime(value, audibleStartedAt + at / 1000)
    if (value === previous) break
    previous = value
  }
}

export class WakeAudioRuntime {
  private context: AudioContext | null = null
  private ring: Ring | null = null
  private voice: WakeVoice | null = null
  private voiceSound: WakeSound | null = null
  private previewVoice: WakeVoice | null = null
  private audibleStartedAt: number | null = null
  private previewTimer: ReturnType<typeof setTimeout> | null = null
  private error: string | null = null
  private state = initialState()
  private listeners = new Set<() => void>()

  getSnapshot = (): WakeAudioState => this.state
  getServerSnapshot = (): WakeAudioState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish = () => {
    const next: WakeAudioState = {
      readiness: this.context?.state ?? initialState().readiness,
      previewing: this.previewVoice !== null && this.context?.state === 'running',
      error: this.error,
    }
    if (next.readiness === this.state.readiness && next.previewing === this.state.previewing && next.error === this.state.error) return
    this.state = next
    for (const listener of this.listeners) listener()
  }
  private stateChanged = () => { this.syncVoice(); this.publish() }
  async enable(): Promise<boolean> {
    if (typeof AudioContext === 'undefined') { this.publish(); return false }
    this.error = null
    let context = this.context
    try {
      if (!context || context.state === 'closed') {
        context?.removeEventListener('statechange', this.stateChanged)
        this.voice = null
        this.voiceSound = null
        this.audibleStartedAt = null
        context = new AudioContext()
        this.context = context
        context.addEventListener('statechange', this.stateChanged)
      }
      await context.resume()
      if (this.context !== context) return false
      this.syncVoice()
      this.publish()
      return context.state === 'running'
    } catch {
      this.error = 'Sound could not start. Tap anywhere to try again.'
      this.publish()
      return false
    }
  }
  setAlarm(ring: Ring | null): void {
    if (ring?.key !== this.ring?.key) {
      this.voice?.stop()
      this.voice = null
      this.voiceSound = null
      this.audibleStartedAt = null
    }
    this.ring = ring
    if (ring) this.stopPreview()
    this.syncVoice()
    this.publish()
  }
  private syncVoice(): void {
    const context = this.context
    if (!this.ring || !context || context.state !== 'running') return
    if (!this.voice || this.voiceSound !== this.ring.sound) {
      this.voice?.stop()
      if (this.audibleStartedAt === null) this.audibleStartedAt = context.currentTime + .025
      const elapsed = Math.max(0, context.currentTime - this.audibleStartedAt)
      this.voice = createWakeVoice(context, this.ring.sound, { gain: alarmVolume(elapsed * 1000), when: context.currentTime + .025, offset: elapsed })
      this.voiceSound = this.ring.sound
      scheduleWakeVolume(context, this.voice.gain, this.audibleStartedAt)
    }
  }
  preview(sound: WakeSound): void {
    if (!this.context || this.context.state !== 'running' || this.ring) return
    this.stopPreview()
    this.previewVoice = createWakeVoice(this.context, sound, { gain: alarmVolume(0), loop: true })
    this.previewTimer = setTimeout(() => this.stopPreview(), 2800)
    this.publish()
  }
  stopPreview = (): void => {
    if (this.previewTimer) clearTimeout(this.previewTimer)
    this.previewTimer = null
    this.previewVoice?.stop()
    this.previewVoice = null
    this.publish()
  }
  dispose(): void {
    this.ring = null
    this.voice?.stop()
    this.voice = null
    this.voiceSound = null
    this.audibleStartedAt = null
    this.stopPreview()
    const context = this.context
    this.context = null
    if (context) { context.removeEventListener('statechange', this.stateChanged); void context.close().catch(() => undefined) }
    this.publish()
  }
}

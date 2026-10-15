import { DialogueSpeech, idleSpeech } from './DialogueSpeech'
import type { SpeechSnapshot } from './DialogueSpeech'
import type { SpeechClip } from './types'

const VOICE_PREFERENCE_KEY = 'sidequest-voice-v1'
const VOICE_VOLUME = 0.9

function readVoiceEnabled(): boolean {
  try { return window.localStorage.getItem(VOICE_PREFERENCE_KEY) !== 'off' } catch { return true }
}

export class DialogueAudio {
  private voiceEnabled = readVoiceEnabled()
  private listeners = new Set<() => void>()
  private context?: AudioContext
  private requestedContextState?: 'running' | 'suspended'
  private master?: GainNode
  private speechGain?: GainNode
  private speech?: DialogueSpeech
  private speechSnapshot = idleSpeech
  private speechListeners = new Set<() => void>()
  private activated = false
  private attached = false
  private hidden = false

  getVoiceEnabled = () => this.voiceEnabled
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSpeechSnapshot = () => this.speechSnapshot
  subscribeSpeech = (listener: () => void) => { this.speechListeners.add(listener); return () => { this.speechListeners.delete(listener) } }

  speak(clip: SpeechClip, url: string) {
    this.speech?.destroy()
    const speech = new DialogueSpeech(clip, url, (snapshot) => {
      if (this.speech === speech) this.reportSpeech(snapshot)
    })
    this.speech = speech
    this.reportSpeech({ clipId: clip.id, status: 'idle', wordIndex: -1 })
    this.sync()
    return () => {
      speech.destroy()
      if (this.speech === speech) { this.speech = undefined; this.reportSpeech(idleSpeech); this.sync() }
    }
  }

  replaySpeech(clipId: string) {
    if (this.speech?.clip.id !== clipId) return
    this.speech.replay()
    this.unlock()
  }

  setVoiceEnabled(enabled: boolean) {
    if (enabled === this.voiceEnabled) return
    this.voiceEnabled = enabled
    try { window.localStorage.setItem(VOICE_PREFERENCE_KEY, enabled ? 'on' : 'off') } catch { /* The voice preference is optional when storage is unavailable. */ }
    this.sync()
    for (const listener of this.listeners) listener()
  }

  attach(target: EventTarget = window) {
    this.attached = true
    this.hidden = document.hidden
    const visibility = () => {
      this.hidden = document.hidden
      this.sync()
    }
    target.addEventListener('pointerdown', this.unlock, true)
    target.addEventListener('click', this.unlock, true)
    target.addEventListener('keydown', this.unlock, true)
    document.addEventListener('visibilitychange', visibility)
    this.sync()
    return () => {
      target.removeEventListener('pointerdown', this.unlock, true)
      target.removeEventListener('click', this.unlock, true)
      target.removeEventListener('keydown', this.unlock, true)
      document.removeEventListener('visibilitychange', visibility)
      this.destroy()
    }
  }

  unlock = () => {
    if (this.activated && this.context?.state === 'running' && !this.speech) return
    this.activated = true
    this.sync(true)
  }

  private reportSpeech(snapshot: SpeechSnapshot) {
    this.speechSnapshot = snapshot
    for (const listener of this.speechListeners) listener()
  }

  private destroy() {
    this.attached = false
    this.speech?.destroy()
    this.speech = undefined
    this.reportSpeech(idleSpeech)
    if (this.context) void this.context.close().catch(() => undefined)
    this.context = undefined
    this.requestedContextState = undefined
    this.master = this.speechGain = undefined
  }

  private canSound() { return this.attached && (this.activated || !!this.speech) && !this.hidden }

  private ensureContext() {
    if (this.context) return this.context
    try {
      const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return undefined
      this.context = new Context()
      this.master = this.context.createGain()
      this.speechGain = this.context.createGain()
      this.master.gain.value = 0
      this.master.connect(this.context.destination)
      this.speechGain.connect(this.master)
    } catch { this.context = undefined }
    return this.context
  }

  private sync(retry = false) {
    const audible = this.canSound() && !!this.speech && this.voiceEnabled
    const context = audible ? this.ensureContext() : this.context
    this.speech?.setEnabled(audible, context, this.speechGain, retry)
    if (!context || !this.master || !this.speechGain) return
    const now = context.currentTime
    const gain = (node: GainNode, level: number) => {
      node.gain.cancelScheduledValues(now)
      node.gain.setTargetAtTime(level, now, 0.025)
    }
    gain(this.master, audible ? 0.72 : 0)
    gain(this.speechGain, VOICE_VOLUME ** 2)
    if (!audible) {
      if (context.state === 'running' || this.requestedContextState === 'running') {
        this.requestedContextState = 'suspended'
        void context.suspend().catch(() => undefined)
      }
      return
    }
    if (context.state !== 'running' || this.requestedContextState === 'suspended') {
      this.requestedContextState = 'running'
      void context.resume().catch(() => undefined)
    }
  }
}

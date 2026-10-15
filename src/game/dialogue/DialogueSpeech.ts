import type { SpeechClip } from './types'

export type SpeechSnapshot = { clipId: string | null, status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' | 'blocked', wordIndex: number }
export const idleSpeech: SpeechSnapshot = { clipId: null, status: 'idle', wordIndex: -1 }

/** A single page of speech. No media or network request until sound is enabled. */
export class DialogueSpeech {
  private media?: HTMLAudioElement
  private source?: MediaElementAudioSourceNode
  private gain?: GainNode
  private context?: AudioContext
  private enabled = false
  private destroyed = false
  private starting = false
  private waitingForContext = false
  private generation = 0
  private frame?: number
  private status: SpeechSnapshot['status'] = 'idle'
  private wordIndex = -1

  readonly clip: SpeechClip
  readonly url: string
  private readonly report: (snapshot: SpeechSnapshot) => void

  constructor(clip: SpeechClip, url: string, report: (snapshot: SpeechSnapshot) => void) {
    this.clip = clip
    this.url = url
    this.report = report
  }

  setEnabled(enabled: boolean, context?: AudioContext, output?: GainNode, retry = false) {
    if (this.destroyed) return
    this.enabled = enabled
    if (!enabled) {
      this.waitingForContext = false
      this.generation++
      this.starting = false
      this.media?.pause()
      this.cancelFrame()
      if (this.status !== 'ended' && this.status !== 'error') this.publish('paused')
      else this.publish(this.status)
      return
    }
    if (!context || !output || this.status === 'ended' || this.status === 'error' || this.starting) return
    if (this.status === 'blocked' && !retry) return
    try {
      if (!this.media) {
        this.context = context
        const media = this.media = new Audio()
        media.preload = 'none'
        media.src = this.url
        this.source = context.createMediaElementSource(media)
        this.gain = context.createGain()
        this.gain.gain.value = this.clip.gain
        this.source.connect(this.gain).connect(output)
        media.addEventListener('playing', this.onPlaying)
        media.addEventListener('waiting', this.onWaiting)
        media.addEventListener('seeking', this.onWaiting)
        media.addEventListener('seeked', this.onSeeked)
        media.addEventListener('pause', this.onPause)
        media.addEventListener('ended', this.onEnded)
        media.addEventListener('error', this.onError)
        context.addEventListener('statechange', this.onContextChange)
      }
      if (context.state !== 'running' && !retry) { this.waitForContext(); return }
      this.waitingForContext = false
      // The final pause can arrive before `ended`, while another audio sync
      // is already queued. Playing an ended element would restart the page.
      if (this.media.ended) this.onEnded()
      else if (this.media.paused) void this.play()
    } catch { this.onError() }
  }

  replay() {
    if (this.destroyed) return
    // The first pointer press unlocks speech before the Play voice click.
    // Keep that pending start: reloading at time zero aborts its media request.
    if (this.starting && this.status === 'loading' && this.media?.currentTime === 0) return
    this.generation++
    this.starting = false
    this.waitingForContext = false
    this.media?.pause()
    this.cancelFrame()
    if (this.media) {
      // Reset the decoder as well as its position. WebKit's MP3 pipeline can
      // stall after seeking an ended stream back to zero without reloading it.
      this.media.load()
      this.media.currentTime = 0
    }
    this.publish('idle')
  }

  destroy() {
    this.destroyed = true
    this.enabled = false
    this.generation++
    this.cancelFrame()
    this.context?.removeEventListener('statechange', this.onContextChange)
    if (this.media) {
      this.media.removeEventListener('playing', this.onPlaying)
      this.media.removeEventListener('waiting', this.onWaiting)
      this.media.removeEventListener('seeking', this.onWaiting)
      this.media.removeEventListener('seeked', this.onSeeked)
      this.media.removeEventListener('pause', this.onPause)
      this.media.removeEventListener('ended', this.onEnded)
      this.media.removeEventListener('error', this.onError)
      this.media.pause()
      this.media.removeAttribute('src')
      this.media.load()
    }
    this.source?.disconnect()
    this.gain?.disconnect()
  }

  private async play() {
    const media = this.media!
    const generation = ++this.generation
    this.starting = true
    this.publish('loading')
    try {
      await media.play()
      if (this.destroyed || !this.enabled) { media.pause(); return }
      if (generation !== this.generation) return
      this.onPlaying()
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return
      this.publish(error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'error')
      this.cancelFrame()
    } finally { if (generation === this.generation) this.starting = false }
  }

  private onPlaying = () => {
    if (!this.enabled || this.destroyed) { this.media?.pause(); return }
    if (this.context?.state !== 'running') { this.waitForContext(); return }
    this.tick()
  }
  private onWaiting = () => { this.cancelFrame(); if (this.enabled && !this.destroyed) this.publish('loading') }
  // WebKit can complete a seek without another `playing` event, including Replay.
  private onSeeked = () => { if (this.media && !this.media.paused && this.media.readyState >= 3) this.onPlaying() }
  private onPause = () => {
    this.cancelFrame()
    if (this.media?.ended) { this.onEnded(); return }
    if (!this.destroyed && !this.waitingForContext && this.status !== 'ended' && this.status !== 'error') this.publish('paused')
  }
  private onEnded = () => { this.cancelFrame(); if (!this.destroyed) this.publish('ended') }
  private onError = () => { this.cancelFrame(); if (!this.destroyed) this.publish('error') }
  private onContextChange = () => {
    if (this.destroyed || !this.enabled || this.status === 'ended' || this.status === 'error') return
    if (this.context?.state !== 'running') { this.waitForContext(); return }
    if (this.waitingForContext) {
      this.waitingForContext = false
      if (!this.starting) void this.play()
    } else if (!this.media?.paused && this.status !== 'loading' && this.status !== 'blocked') this.tick()
  }
  private waitForContext() {
    this.generation++
    this.starting = false
    this.waitingForContext = true
    this.media?.pause()
    this.cancelFrame()
    this.publish(this.media?.currentTime ? 'paused' : 'blocked')
  }
  private tick = () => {
    this.cancelFrame()
    if (!this.enabled || this.destroyed || this.media?.paused || this.context?.state !== 'running') { this.publish('paused'); return }
    if (this.media?.ended) { this.onEnded(); return }
    const time = this.media!.currentTime
    const word = this.clip.words.findIndex(({ start, end }) => time >= start && time < end)
    this.publish('playing', word)
    this.frame = requestAnimationFrame(this.tick)
  }
  private cancelFrame() { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined }
  private publish(status: SpeechSnapshot['status'], wordIndex = -1) {
    if (this.destroyed || this.status === status && this.wordIndex === wordIndex) return
    this.status = status
    this.wordIndex = wordIndex
    this.report({ clipId: this.clip.id, status, wordIndex })
  }
}

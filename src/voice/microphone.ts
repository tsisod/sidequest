import { hear, soundsSilent, startHearing } from './hearing'

export type Recording = { recorder: MediaRecorder; chunks: Blob[] }
export type Heard =
  | { kind: 'clip'; clip: Blob }
  | { kind: 'nothing-heard' }
  | { kind: 'silent-microphone'; microphone: string }
  | { kind: 'blocked' }
  | { kind: 'cancelled' }
export type Listening = { result: Promise<Heard>; finish: () => void; cancel: () => void; level: () => number }

const MICROPHONE_KEY = 'sidequest-voice-microphone-v1'
export const MEASURED_MS = 1_000
const MIN_CLIP_BYTES = 800

export const canRecord = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'

export function recordingType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function savedMicrophone(): string | null {
  try { return localStorage.getItem(MICROPHONE_KEY) } catch { return null }
}

export function saveMicrophone(id: string) {
  try { localStorage.setItem(MICROPHONE_KEY, id) } catch { /* The choice lasts for this visit when storage is unavailable. */ }
}

export function microphoneConstraints(deviceId: string | null, exact = false): MediaStreamConstraints {
  return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...deviceId ? { deviceId: exact ? { exact: deviceId } : { ideal: deviceId } } : {} } }
}

/** Each recording keeps its own chunks, so a recorder that is still stopping can never add audio to the next one. */
export function startRecording(stream: MediaStream): Recording {
  const type = recordingType()
  const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  recorder.start(250)
  return { recorder, chunks }
}

export function finishRecording({ recorder, chunks }: Recording): Promise<Blob | null> {
  if (recorder.state === 'inactive') return Promise.resolve(null)
  return new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || recordingType() || 'audio/webm' }))
    recorder.stop()
  })
}

/** Opens the saved microphone, records one spoken message and stops on its own when the speaker pauses. */
export function listenOnce(): Listening {
  let settle: (heard: Heard) => void = () => {}
  const result = new Promise<Heard>(resolve => { settle = resolve })
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let recording: Recording | null = null
  let hearing = startHearing(performance.now())
  let level = 0
  let frame = 0
  let ended = false

  async function end(outcome: Heard['kind']) {
    if (ended) return
    ended = true
    cancelAnimationFrame(frame)
    const label = stream?.getAudioTracks()[0]?.label || 'your microphone'
    let clip: Blob | null = null
    if (recording && outcome === 'clip') clip = await finishRecording(recording)
    else if (recording) void finishRecording(recording)
    stream?.getTracks().forEach(track => track.stop())
    void context?.close().catch(() => undefined)
    if (outcome === 'clip') settle(clip && clip.size >= MIN_CLIP_BYTES ? { kind: 'clip', clip } : { kind: 'nothing-heard' })
    else settle(outcome === 'silent-microphone' ? { kind: 'silent-microphone', microphone: label } : { kind: outcome })
  }

  navigator.mediaDevices.getUserMedia(microphoneConstraints(savedMicrophone())).then(media => {
    if (ended) { media.getTracks().forEach(track => track.stop()); return }
    stream = media
    try { recording = startRecording(media) } catch { void end('blocked'); return }
    const listening = context = new AudioContext()
    void listening.resume().catch(() => undefined)
    const analyser = listening.createAnalyser()
    analyser.fftSize = 1024
    listening.createMediaStreamSource(media).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let last = performance.now()
    hearing = startHearing(last)
    const tick = (time: number) => {
      const dt = Math.min(100, time - last)
      last = time
      if (listening.state !== 'running') hearing = startHearing(time, hearing.floor)
      else {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        let peak = 0
        for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)) }
        const rms = Math.sqrt(sum / samples.length)
        level += (Math.min(1, rms * 9) - level) * .35
        const verdict = hear(hearing, { time, dt, rms, peak })
        hearing = verdict.hearing
        if (verdict.verdict === 'finished') { void end('clip'); return }
        if (verdict.verdict === 'nothing-heard') { void end('nothing-heard'); return }
        if (verdict.verdict === 'silent-microphone') { void end('silent-microphone'); return }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }, () => { void end('blocked') })

  return {
    result,
    level: () => level,
    finish: () => {
      void context?.resume().catch(() => undefined)
      const measured = context?.state === 'running' && performance.now() - hearing.startedAt >= MEASURED_MS
      void end(measured && soundsSilent(hearing) ? 'silent-microphone' : 'clip')
    },
    cancel: () => { void end('cancelled') },
  }
}

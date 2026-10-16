import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MAX_VOICE_TEXT, MAX_VOICE_TURNS } from '../../shared/parentVoice'
import type { VoiceApi, VoiceReply, VoiceTurn } from '../../shared/parentVoice'
import Icon from '../components/Icon'
import { hear, soundsSilent, startHearing } from './hearing'
import type { Hearing } from './hearing'
import './voice.css'

type Phase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'idle'
type Microphone = { id: string; label: string }
type Recording = { recorder: MediaRecorder; chunks: Blob[] }

const MICROPHONE_KEY = 'sidequest-voice-microphone-v1'
const MEASURED_MS = 1_000

function recordingType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const local = voices.filter(voice => voice.lang.startsWith(lang.slice(0, 2)))
  return local.find(voice => /Samantha|Google US|Natural|Enhanced|Premium/.test(voice.name)) ?? local[0] ?? null
}

function savedMicrophone(): string | null {
  try { return localStorage.getItem(MICROPHONE_KEY) } catch { return null }
}

function microphoneConstraints(deviceId: string | null, exact = false): MediaStreamConstraints {
  return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...deviceId ? { deviceId: exact ? { exact: deviceId } : { ideal: deviceId } } : {} } }
}

const statusText: Record<Phase, string> = { starting: 'Getting the microphone…', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', idle: 'Tap the circle to talk' }

/**
 * Full-screen voice conversation for the parent dashboard. One microphone stream drives everything: its level
 * animates the orb and decides when the parent has finished, and its recording is transcribed and answered on the
 * server. The reply is spoken aloud, then it listens again.
 */
const canRecord = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'
const noRecording = 'This browser can\'t use the microphone here. Type your request below instead.'

export default function VoiceAssistant({ childName, voice, onClose }: { childName: string; voice: VoiceApi; onClose: () => void }) {
  const [recordable] = useState(canRecord)
  const [phase, setPhase] = useState<Phase>(recordable ? 'starting' : 'idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [changes, setChanges] = useState<string[]>([])
  const [problem, setProblem] = useState(recordable ? '' : noRecording)
  const [notice, setNotice] = useState('')
  const [typed, setTyped] = useState('')
  const [microphones, setMicrophones] = useState<Microphone[]>([])
  const [microphone, setMicrophone] = useState<Microphone | null>(null)
  const orb = useRef<HTMLButtonElement>(null)
  const phaseRef = useRef<Phase>(recordable ? 'starting' : 'idle')
  const turns = useRef<VoiceTurn[]>([])
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<{ context: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode | null } | null>(null)
  const recording = useRef<Recording | null>(null)
  const hearing = useRef<Hearing>(startHearing(0))
  const closed = useRef(false)
  const lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'
  const microphoneName = microphone?.label ? `“${microphone.label}”` : 'your microphone'

  // Everything that changes mid-conversation lives in refs, so these plain functions are safe to call from any render.
  function enter(next: Phase) { phaseRef.current = next; setPhase(next) }
  function history(): VoiceTurn[] {
    const kept = turns.current.slice(-(MAX_VOICE_TURNS - 2))
    while (kept.length && kept[0].role !== 'parent') kept.shift()
    return kept
  }
  function wakeAudio() { void audio.current?.context.resume().catch(() => undefined) }

  function speak(text: string, then: () => void) {
    const synth = window.speechSynthesis
    if (!synth || !text) { then(); return }
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.voice = pickVoice(lang)
    utterance.rate = 1.05
    let finished = false
    // Some browsers drop the end event, so a generous timer guarantees the conversation moves on.
    const fallback = window.setTimeout(() => finish(), 2_000 + text.length * 90)
    // Tapping the orb mid-reply cancels the speech, which fires this too; by then the parent is already talking again.
    function finish() { if (finished) return; finished = true; window.clearTimeout(fallback); if (phaseRef.current === 'speaking') then() }
    utterance.onend = finish
    utterance.onerror = finish
    enter('speaking')
    synth.speak(utterance)
  }

  function stopRecording(): Promise<Blob | null> {
    const current = recording.current
    recording.current = null
    if (!current || current.recorder.state === 'inactive') return Promise.resolve(null)
    return new Promise(resolve => {
      current.recorder.onstop = () => resolve(new Blob(current.chunks, { type: current.recorder.mimeType || recordingType() || 'audio/webm' }))
      current.recorder.stop()
    })
  }

  function startListening() {
    if (closed.current) return
    const media = stream.current
    if (!media) { enter('idle'); return }
    window.speechSynthesis?.cancel()
    void stopRecording()
    wakeAudio()
    const type = recordingType()
    let recorder: MediaRecorder
    try { recorder = type ? new MediaRecorder(media, { mimeType: type }) : new MediaRecorder(media) }
    catch { setProblem(noRecording); enter('idle'); return }
    const chunks: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.start(250)
    recording.current = { recorder, chunks }
    hearing.current = startHearing(performance.now(), hearing.current.floor)
    setProblem('')
    setNotice('')
    enter('listening')
  }

  function silentMicrophone() {
    void stopRecording()
    setProblem(`No sound is coming from ${microphoneName}. Check it isn't muted and its input volume is up${microphones.length > 1 ? ', or choose another microphone from the menu above' : ''}, then tap the circle.`)
    enter('idle')
  }

  function answered(answer: VoiceReply, earlier: VoiceTurn[]) {
    if (closed.current) return
    if (!answer.ok) {
      setProblem(answer.message)
      speak(answer.message, () => { if (!closed.current) enter('idle') })
      return
    }
    if (!answer.heard) { setNotice('I didn\'t catch any words. Tap the circle and try again.'); enter('idle'); return }
    turns.current = [...earlier, { role: 'parent', text: answer.heard }, { role: 'assistant', text: answer.reply }]
    setHeard(answer.heard)
    setReply(answer.reply)
    setChanges(answer.changes)
    speak(answer.reply, startListening)
  }

  async function finishListening() {
    if (phaseRef.current !== 'listening') return
    if (performance.now() - hearing.current.startedAt >= MEASURED_MS && soundsSilent(hearing.current)) { silentMicrophone(); return }
    enter('thinking')
    setHeard('')
    setReply('')
    setChanges([])
    const clip = await stopRecording()
    if (closed.current) return
    if (!clip || clip.size < 800) { setNotice('I didn\'t hear anything. Tap the circle and try again.'); enter('idle'); return }
    const earlier = history()
    answered(await voice.listen({ audio: await clip.arrayBuffer(), mimeType: clip.type, language: lang.slice(0, 2).toLowerCase() }, earlier), earlier)
  }

  function giveUp() {
    if (phaseRef.current !== 'listening') return
    void stopRecording()
    setNotice('I didn\'t hear anything. Tap the circle and try again.')
    enter('idle')
  }

  async function sendTyped(text: string) {
    const said = text.trim().slice(0, MAX_VOICE_TEXT)
    if (!said || phaseRef.current === 'thinking') return
    void stopRecording()
    window.speechSynthesis?.cancel()
    enter('thinking')
    setHeard(said)
    setReply('')
    setChanges([])
    setProblem('')
    setNotice('')
    const earlier = history()
    answered(await voice.ask([...earlier, { role: 'parent', text: said }]), earlier)
  }

  async function listMicrophones() {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
    if (!closed.current) setMicrophones(devices.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'communications').map(device => ({ id: device.deviceId, label: device.label || 'Microphone' })))
  }

  function adoptStream(media: MediaStream) {
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = media
    if (!audio.current) {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      audio.current = { context, analyser, source: null }
    }
    audio.current.source?.disconnect()
    audio.current.source = audio.current.context.createMediaStreamSource(media)
    audio.current.source.connect(audio.current.analyser)
    wakeAudio()
    const track = media.getAudioTracks()[0]
    setMicrophone(track ? { id: track.getSettings().deviceId ?? '', label: track.label } : null)
    track?.addEventListener('mute', () => { if (stream.current === media && phaseRef.current === 'listening') latest.current.silentMicrophone() })
    void listMicrophones()
  }

  async function chooseMicrophone(id: string) {
    try { localStorage.setItem(MICROPHONE_KEY, id) } catch { /* The choice lasts for this visit when storage is unavailable. */ }
    void stopRecording()
    enter('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia(microphoneConstraints(id, true))
      if (closed.current) { media.getTracks().forEach(track => track.stop()); return }
      adoptStream(media)
      startListening()
    } catch {
      setProblem('That microphone could not be opened. Pick another one, or type below.')
      enter('idle')
    }
  }

  const latest = useRef({ startListening, finishListening, giveUp, silentMicrophone, adoptStream, onClose })
  useEffect(() => { latest.current = { startListening, finishListening, giveUp, silentMicrophone, adoptStream, onClose } })

  // Open the microphone once, start the first turn, and tidy everything up on close.
  useEffect(() => {
    closed.current = false
    let cancelled = false
    orb.current?.focus({ preventScroll: true })
    if (recordable) {
      navigator.mediaDevices.getUserMedia(microphoneConstraints(savedMicrophone())).then(media => {
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return }
        latest.current.adoptStream(media)
        latest.current.startListening()
      }).catch(() => {
        if (cancelled) return
        setProblem('Allow the microphone for this site to talk (check the icon in the address bar), or type below.')
        enter('idle')
      })
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); latest.current.onClose() } }
    const devicesChanged = () => { void listMicrophones() }
    window.addEventListener('keydown', escape)
    navigator.mediaDevices?.addEventListener('devicechange', devicesChanged)
    return () => {
      cancelled = true
      closed.current = true
      window.removeEventListener('keydown', escape)
      navigator.mediaDevices?.removeEventListener('devicechange', devicesChanged)
      const current = recording.current
      recording.current = null
      if (current && current.recorder.state !== 'inactive') current.recorder.stop()
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      const closing = audio.current
      audio.current = null
      void closing?.context.close().catch(() => undefined)
      window.speechSynthesis?.cancel()
    }
  }, [recordable])

  // One animation loop: measures the voice, decides when a turn starts and ends, and sizes the orb.
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let level = 0
    const samples = new Float32Array(1024)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tick = (time: number) => {
      const dt = Math.min(100, time - last)
      last = time
      let target = 0
      const sound = audio.current
      if (phaseRef.current === 'listening' && sound) {
        if (sound.context.state !== 'running') hearing.current = startHearing(time, hearing.current.floor)
        else {
          sound.analyser.getFloatTimeDomainData(samples)
          let sum = 0
          let peak = 0
          for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)) }
          const rms = Math.sqrt(sum / samples.length)
          target = Math.min(1, rms * 9)
          const result = hear(hearing.current, { time, dt, rms, peak })
          hearing.current = result.hearing
          if (result.verdict === 'finished') void latest.current.finishListening()
          else if (result.verdict === 'nothing-heard') latest.current.giveUp()
          else if (result.verdict === 'silent-microphone') latest.current.silentMicrophone()
        }
      } else if (phaseRef.current === 'speaking') target = .35 + .3 * Math.abs(Math.sin(time / 170) * Math.sin(time / 61))
      level += (target - level) * (target > level ? .45 : .12)
      orb.current?.style.setProperty('--level', (reducedMotion ? 0 : level).toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  function tapOrb() {
    wakeAudio()
    if (phase === 'listening') { void finishListening(); return }
    if (phase === 'idle' || phase === 'speaking') startListening()
  }
  function submitTyped(event: FormEvent) {
    event.preventDefault()
    const text = typed
    setTyped('')
    void sendTyped(text)
  }

  const busy = phase === 'thinking' || phase === 'starting'
  const choices = microphone && !microphones.some(option => option.id === microphone.id) ? [microphone, ...microphones] : microphones
  return <div className="p-voice" role="dialog" aria-modal="true" aria-label="Voice commands">
    <button type="button" className="p-voice-close" onClick={onClose} aria-label="Close voice commands"><Icon name="close" size={22} /></button>
    <div className="p-voice-stage">
      <button ref={orb} type="button" className={`p-voice-orb p-voice-${phase}`} onClick={tapOrb} disabled={busy} aria-label={phase === 'listening' ? 'Done talking' : busy ? statusText[phase] : 'Talk'}>
        <span className="p-voice-cloud" aria-hidden="true" /><span className="p-voice-cloud p-voice-cloud-b" aria-hidden="true" />
        <Icon name="mic" size={30} />
      </button>
      <p className="p-voice-status" aria-live="polite">{statusText[phase]}</p>
      {microphone && <label className="p-voice-microphone"><Icon name="mic" size={15} /><span className="sr-only">Microphone</span>
        {choices.length > 1
          ? <select value={microphone.id} disabled={busy} onChange={event => { void chooseMicrophone(event.target.value) }}>{choices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          : <span>{microphone.label || 'Microphone'}</span>}
      </label>}
      <div className="p-voice-transcript" aria-live="polite">
        {heard ? <p className="p-voice-heard">“{heard}”</p> : phase === 'listening' && !reply && <p className="p-voice-hint">Try “Add take a shower for {childName}”</p>}
        {reply && <p className="p-voice-reply">{reply}</p>}
        {changes.length > 0 && <ul className="p-voice-changes">{changes.map(change => <li key={change}><Icon name="check" size={15} />{change}</li>)}</ul>}
        {notice && !problem && <p className="p-voice-hint">{notice}</p>}
        {problem && <p className="p-voice-problem" role="alert">{problem}</p>}
      </div>
    </div>
    <form className="p-voice-type" onSubmit={submitTyped}>
      <input value={typed} maxLength={MAX_VOICE_TEXT} onChange={event => setTyped(event.target.value)} placeholder={`Or type, like “add brush teeth for ${childName} every day”`} aria-label="Type a command" disabled={phase === 'thinking'} />
      <button type="submit" className="button button-primary" disabled={!typed.trim() || phase === 'thinking'}>Send</button>
    </form>
  </div>
}

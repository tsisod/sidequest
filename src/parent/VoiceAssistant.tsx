import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MAX_VOICE_TEXT, MAX_VOICE_TURNS } from '../../shared/parentVoice'
import type { VoiceApi, VoiceReply, VoiceTurn } from '../../shared/parentVoice'
import Icon from '../components/Icon'
import './voice.css'

type Phase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'idle'
type Vad = { startedAt: number; heardAt: number | null; loudMs: number; quietMs: number; floor: number }

// Turn-taking: speech must last this long to count, and this much quiet afterwards ends the turn.
const SPEECH_START_MS = 160
const SILENCE_END_MS = 950
const NO_SPEECH_MS = 8_000
const MAX_RECORDING_MS = 20_000

function recordingType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const local = voices.filter(voice => voice.lang.startsWith(lang.slice(0, 2)))
  return local.find(voice => /Samantha|Google US|Natural|Enhanced|Premium/.test(voice.name)) ?? local[0] ?? null
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
  const orb = useRef<HTMLButtonElement>(null)
  const phaseRef = useRef<Phase>(recordable ? 'starting' : 'idle')
  const turns = useRef<VoiceTurn[]>([])
  const stream = useRef<MediaStream | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const vad = useRef<Vad>({ startedAt: 0, heardAt: null, loudMs: 0, quietMs: 0, floor: .004 })
  const closed = useRef(false)
  const lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'

  // Everything that changes mid-conversation lives in refs, so these plain functions are safe to call from any render.
  function enter(next: Phase) { phaseRef.current = next; setPhase(next) }
  function history(): VoiceTurn[] {
    const kept = turns.current.slice(-(MAX_VOICE_TURNS - 2))
    while (kept.length && kept[0].role !== 'parent') kept.shift()
    return kept
  }

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
    function finish() { if (finished) return; finished = true; window.clearTimeout(fallback); then() }
    utterance.onend = finish
    utterance.onerror = finish
    enter('speaking')
    synth.speak(utterance)
  }

  function stopRecording(): Promise<Blob | null> {
    const current = recorder.current
    recorder.current = null
    if (!current || current.state === 'inactive') return Promise.resolve(null)
    return new Promise(resolve => {
      current.onstop = () => resolve(new Blob(chunks.current, { type: current.mimeType || recordingType() || 'audio/webm' }))
      current.stop()
    })
  }

  function startListening() {
    if (closed.current) return
    const media = stream.current
    if (!media) { enter('idle'); return }
    window.speechSynthesis?.cancel()
    void stopRecording()
    const type = recordingType()
    let next: MediaRecorder
    try { next = type ? new MediaRecorder(media, { mimeType: type }) : new MediaRecorder(media) }
    catch { setProblem(noRecording); enter('idle'); return }
    chunks.current = []
    next.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data) }
    next.start(250)
    recorder.current = next
    vad.current = { ...vad.current, startedAt: performance.now(), heardAt: null, loudMs: 0, quietMs: 0 }
    setProblem('')
    setNotice('')
    enter('listening')
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

  const latest = useRef({ startListening, finishListening, giveUp, onClose })
  useEffect(() => { latest.current = { startListening, finishListening, giveUp, onClose } })

  // Open the microphone once, start the first turn, and tidy everything up on close.
  useEffect(() => {
    closed.current = false
    let cancelled = false
    let context: AudioContext | null = null
    orb.current?.focus({ preventScroll: true })
    if (recordable) {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(media => {
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return }
        stream.current = media
        context = new AudioContext()
        const node = context.createAnalyser()
        node.fftSize = 1024
        context.createMediaStreamSource(media).connect(node)
        analyser.current = node
        latest.current.startListening()
      }).catch(() => {
        if (cancelled) return
        setProblem('Allow the microphone for this site to talk (check the icon in the address bar), or type below.')
        enter('idle')
      })
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); latest.current.onClose() } }
    window.addEventListener('keydown', escape)
    return () => {
      cancelled = true
      closed.current = true
      window.removeEventListener('keydown', escape)
      const current = recorder.current
      recorder.current = null
      if (current && current.state !== 'inactive') current.stop()
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      analyser.current = null
      void context?.close().catch(() => undefined)
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
      const node = analyser.current
      if (phaseRef.current === 'listening' && node) {
        node.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        const rms = Math.sqrt(sum / samples.length)
        target = Math.min(1, rms * 9)
        const turn = vad.current
        const threshold = Math.min(.08, Math.max(.012, turn.floor * 3))
        if (rms > threshold) {
          turn.loudMs += dt
          turn.quietMs = 0
          if (turn.heardAt === null && turn.loudMs >= SPEECH_START_MS) turn.heardAt = time
        } else {
          turn.quietMs += dt
          turn.loudMs = Math.max(0, turn.loudMs - dt / 2)
          turn.floor += (rms - turn.floor) * .05
        }
        const elapsed = time - turn.startedAt
        if (turn.heardAt !== null && turn.quietMs >= SILENCE_END_MS) void latest.current.finishListening()
        else if (turn.heardAt === null && elapsed >= NO_SPEECH_MS) latest.current.giveUp()
        else if (elapsed >= MAX_RECORDING_MS) void latest.current.finishListening()
      } else if (phaseRef.current === 'speaking') target = .35 + .3 * Math.abs(Math.sin(time / 170) * Math.sin(time / 61))
      level += (target - level) * (target > level ? .45 : .12)
      orb.current?.style.setProperty('--level', (reducedMotion ? 0 : level).toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  function tapOrb() {
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
  return <div className="p-voice" role="dialog" aria-modal="true" aria-label="Voice commands">
    <button type="button" className="p-voice-close" onClick={onClose} aria-label="Close voice commands"><Icon name="close" size={22} /></button>
    <div className="p-voice-stage">
      <button ref={orb} type="button" className={`p-voice-orb p-voice-${phase}`} onClick={tapOrb} disabled={busy} aria-label={phase === 'listening' ? 'Done talking' : busy ? statusText[phase] : 'Talk'}>
        <span className="p-voice-cloud" aria-hidden="true" /><span className="p-voice-cloud p-voice-cloud-b" aria-hidden="true" />
        <Icon name="mic" size={30} />
      </button>
      <p className="p-voice-status" aria-live="polite">{statusText[phase]}</p>
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

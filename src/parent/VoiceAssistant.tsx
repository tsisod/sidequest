import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MAX_VOICE_TEXT, MAX_VOICE_TURNS } from '../../shared/parentVoice'
import type { AskVoice, VoiceTurn } from '../../shared/parentVoice'
import Icon from '../components/Icon'
import './voice.css'

type Phase = 'listening' | 'thinking' | 'speaking' | 'idle'
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

// Chrome and Safari ship speech recognition under a prefix; Firefox has none, so typing stays available.
function recognitionClass(): (new () => Recognition) | null {
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const local = voices.filter(voice => voice.lang.startsWith(lang.slice(0, 2)))
  return local.find(voice => /Samantha|Google US|Natural|Enhanced|Premium/.test(voice.name)) ?? local[0] ?? null
}

const statusText: Record<Phase, string> = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', idle: 'Tap the circle to talk' }

/**
 * Full-screen voice conversation for the parent dashboard: the browser transcribes speech, the server carries out
 * the request, and the reply is spoken aloud before listening again. The orb follows the live microphone level.
 */
export default function VoiceAssistant({ childName, onAsk, onClose }: { childName: string; onAsk: AskVoice; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [changes, setChanges] = useState<string[]>([])
  const [problem, setProblem] = useState('')
  const [typed, setTyped] = useState('')
  const orb = useRef<HTMLButtonElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const turns = useRef<VoiceTurn[]>([])
  const recognition = useRef<Recognition | null>(null)
  const closed = useRef(false)
  const lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'
  const canListen = recognitionClass() !== null

  // Everything that changes mid-conversation lives in refs, so these plain functions are safe to call from any render.
  function enter(next: Phase) { phaseRef.current = next; setPhase(next) }
  function stopListening() { const current = recognition.current; recognition.current = null; current?.abort() }

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

  async function send(said: string) {
    const text = said.trim().slice(0, MAX_VOICE_TEXT)
    if (!text || closed.current) return
    stopListening()
    setHeard(text)
    setReply('')
    setChanges([])
    setProblem('')
    enter('thinking')
    const history = [...turns.current, { role: 'parent' as const, text }]
    const sent = history.slice(-MAX_VOICE_TURNS)
    while (sent.length && sent[0].role !== 'parent') sent.shift()
    const answer = await onAsk(sent)
    if (closed.current) return
    if (!answer.ok) {
      setProblem(answer.message)
      speak(answer.message, () => { if (!closed.current) enter('idle') })
      return
    }
    turns.current = [...history, { role: 'assistant', text: answer.reply }]
    setReply(answer.reply)
    setChanges(answer.changes)
    speak(answer.reply, () => { if (!closed.current) listen() })
  }

  function listen() {
    const Recognizer = recognitionClass()
    if (!Recognizer || closed.current) { enter('idle'); return }
    window.speechSynthesis?.cancel()
    stopListening()
    const recognizer = new Recognizer()
    recognizer.lang = lang
    recognizer.interimResults = true
    recognizer.continuous = false
    let finalText = ''
    recognizer.onresult = event => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      setHeard((finalText + interim).trim())
    }
    recognizer.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setProblem('Allow the microphone for this site to talk, or type below.')
      else if (event.error === 'network') setProblem('Speech recognition needs an internet connection.')
    }
    recognizer.onend = () => {
      if (recognition.current !== recognizer) return
      recognition.current = null
      if (finalText.trim()) void send(finalText)
      else enter('idle')
    }
    recognition.current = recognizer
    setHeard('')
    enter('listening')
    try { recognizer.start() } catch { recognition.current = null; enter('idle') }
  }

  // Microphone level drives the orb while listening; while speaking it pulses on its own.
  useEffect(() => {
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let frame = 0
    let level = 0
    const samples = new Float32Array(1024)
    let analyser: AnalyserNode | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(media => {
      if (closed.current) { media.getTracks().forEach(track => track.stop()); return }
      stream = media
      context = new AudioContext()
      analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(media).connect(analyser)
    }).catch(() => { /* No microphone access: the orb still breathes and pulses, and typing works. */ })
    const tick = (time: number) => {
      let target = 0
      if (phaseRef.current === 'listening' && analyser) {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        target = Math.min(1, Math.sqrt(sum / samples.length) * 7)
      } else if (phaseRef.current === 'speaking') target = .35 + .3 * Math.abs(Math.sin(time / 170) * Math.sin(time / 61))
      else if (phaseRef.current === 'listening') target = .12 + .08 * Math.sin(time / 300)
      level += (target - level) * (target > level ? .45 : .12)
      orb.current?.style.setProperty('--level', (reducedMotion ? 0 : level).toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
      void context?.close().catch(() => undefined)
    }
  }, [])

  const latest = useRef({ listen, onClose })
  useEffect(() => { latest.current = { listen, onClose } })
  // Start listening as soon as the overlay opens; tidy up everything when it closes.
  useEffect(() => {
    closed.current = false
    orb.current?.focus({ preventScroll: true })
    if (recognitionClass()) latest.current.listen()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); latest.current.onClose() } }
    window.addEventListener('keydown', escape)
    return () => {
      closed.current = true
      window.removeEventListener('keydown', escape)
      const current = recognition.current
      recognition.current = null
      current?.abort()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function tapOrb() {
    if (phase === 'thinking') return
    if (phase === 'listening') { recognition.current?.stop(); return }
    listen()
  }
  function submitTyped(event: FormEvent) {
    event.preventDefault()
    const text = typed
    setTyped('')
    void send(text)
  }

  return <div className="p-voice" role="dialog" aria-modal="true" aria-label="Voice commands">
    <button type="button" className="p-voice-close" onClick={onClose} aria-label="Close voice commands"><Icon name="close" size={22} /></button>
    <div className="p-voice-stage">
      <button ref={orb} type="button" className={`p-voice-orb p-voice-${phase}`} onClick={tapOrb} disabled={phase === 'thinking'} aria-label={phase === 'listening' ? 'Stop listening' : phase === 'thinking' ? 'Thinking' : 'Talk'}>
        <span className="p-voice-cloud" aria-hidden="true" /><span className="p-voice-cloud p-voice-cloud-b" aria-hidden="true" />
        <Icon name="mic" size={30} />
      </button>
      <p className="p-voice-status" aria-live="polite">{canListen ? statusText[phase] : phase === 'thinking' ? statusText.thinking : 'Type a command below'}</p>
      <div className="p-voice-transcript" aria-live="polite">
        {heard ? <p className="p-voice-heard">“{heard}”</p> : phase === 'listening' && !reply && <p className="p-voice-hint">Try “Add take a shower for {childName}”</p>}
        {reply && <p className="p-voice-reply">{reply}</p>}
        {changes.length > 0 && <ul className="p-voice-changes">{changes.map(change => <li key={change}><Icon name="check" size={15} />{change}</li>)}</ul>}
        {problem && <p className="p-voice-problem" role="alert">{problem}</p>}
      </div>
    </div>
    <form className="p-voice-type" onSubmit={submitTyped}>
      <input value={typed} maxLength={MAX_VOICE_TEXT} onChange={event => setTyped(event.target.value)} placeholder={`Or type, like “add brush teeth for ${childName} every day”`} aria-label="Type a command" disabled={phase === 'thinking'} />
      <button type="submit" className="button button-primary" disabled={!typed.trim() || phase === 'thinking'}>Send</button>
    </form>
  </div>
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Keybinds } from '../../../shared/keybinds'
import { MAX_SPARK_MESSAGE } from '../../../shared/spark'
import type { AskSpark, HearSpark, SparkSettings, SparkTurn } from '../../../shared/spark'
import type { Speak } from '../../../shared/speech'
import Icon from '../GameIcon'
import type { DialogueAudio } from '../dialogue/DialogueAudio'
import { dialoguePages } from '../dialogue/dialoguePages'
import { VoicedText } from '../dialogue/VoicedText'
import { useVoiceLines } from '../dialogue/voiceLines'
import { useSound } from '../../sound/SoundContext'
import { canRecord, listenOnce } from '../../voice/microphone'
import type { Heard, Listening } from '../../voice/microphone'
import '../dialogue/dialogue.css'
import './spark.css'

const suggestions = ['What do I need to do today?', 'I finished a quest!', 'How do I get screen time?']
type Microphone = 'idle' | 'listening' | 'hearing'
const language = () => (typeof navigator === 'undefined' ? 'en' : navigator.language || 'en').slice(0, 2).toLowerCase()

function heardProblem(heard: Exclude<Heard, { kind: 'clip' | 'cancelled' }>, name: string): string {
  if (heard.kind === 'silent-microphone') return `No sound is coming from “${heard.microphone}”. Ask a grown-up to check it isn't muted, or type to ${name} instead.`
  if (heard.kind === 'blocked') return `The microphone is blocked. Ask a grown-up to allow it for this page, or type to ${name} instead.`
  return `${name} didn't hear anything. Tap the microphone, say your message, then pause.`
}

type SparkDialogueProps = {
  spark: SparkSettings
  childName: string
  keybinds: Keybinds
  turns: readonly SparkTurn[]
  audio: DialogueAudio
  speak: Speak
  ask: AskSpark
  hear: HearSpark
  onTurns: (turns: SparkTurn[]) => void
  onClose: () => void
}

export default function SparkDialogue({ spark, childName, keybinds, turns, audio, speak, ask, hear, onTurns, onClose }: SparkDialogueProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const [microphone, setMicrophone] = useState<Microphone>('idle')
  const listening = useRef<Listening | null>(null)
  const micButton = useRef<HTMLButtonElement>(null)
  const last = turns.at(-1)
  const waiting = thinking || last?.role === 'child'
  const busy = waiting || microphone !== 'idle'
  const asked = turns.at(last?.role === 'spark' ? -2 : -1)
  const question = asked?.role === 'child' ? asked.text : undefined
  const text = last?.role === 'spark' ? last.text : `Hi ${childName}! I'm ${spark.name}. Ask me what to do today, tell me when you finish a quest, or ask me anything.`
  const pages = useMemo(() => dialoguePages(text), [text])
  const voices = useVoiceLines(pages, spark.voice, speak)
  const [paging, setPaging] = useState({ text, page: 0 })
  const shown = Math.min(paging.text === text ? paging.page : 0, pages.length - 1)
  const lastPage = shown === pages.length - 1
  const play = useSound()

  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  useLayoutEffect(() => {
    if (!busy) input.current?.focus({ preventScroll: true })
  }, [busy])
  useEffect(() => () => listening.current?.cancel(), [])
  useEffect(() => {
    if (microphone !== 'listening') return
    const button = micButton.current
    let frame = 0
    const tick = () => { button?.style.setProperty('--level', (listening.current?.level() ?? 0).toFixed(3)); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); button?.style.removeProperty('--level') }
  }, [microphone])

  async function send(message: string) {
    const asked = message.trim()
    if (!asked || waiting || listening.current) return
    const next = [...turns, { role: 'child' as const, text: asked }]
    setDraft('')
    setError('')
    setSent([])
    setThinking(true)
    play('send')
    onTurns(next)
    const result = await ask({ name: spark.name, keybinds, turns: next })
    setThinking(false)
    if (result.ok) {
      onTurns([...next, { role: 'spark', text: result.reply }])
      setSent(result.submitted)
      play(result.submitted.length ? 'confirm' : 'reply')
    } else {
      onTurns([...turns])
      setDraft(asked)
      setError(result.message)
      play('error')
    }
  }

  async function talk() {
    if (microphone === 'listening') { listening.current?.finish(); return }
    if (busy) return
    if (!canRecord()) { setError(`This browser can't use the microphone here. You can type to ${spark.name} instead.`); play('error'); return }
    setError('')
    play('tap')
    const session = listenOnce()
    listening.current = session
    setMicrophone('listening')
    const heard = await session.result
    if (listening.current !== session) return
    listening.current = null
    if (heard.kind === 'cancelled') { setMicrophone('idle'); return }
    if (heard.kind !== 'clip') { setMicrophone('idle'); setError(heardProblem(heard, spark.name)); play('error'); return }
    setMicrophone('hearing')
    const result = await hear({ name: spark.name, audio: await heard.clip.arrayBuffer(), mimeType: heard.clip.type, language: language() })
    setMicrophone('idle')
    if (!result.ok) { setError(result.message); play('error'); return }
    if (!result.text) { setError(`${spark.name} didn't catch any words. Tap the microphone and try again.`); play('error'); return }
    void send(result.text)
  }

  const status = microphone === 'listening' ? `${spark.name} is listening… tap the microphone when you're done.` : microphone === 'hearing' ? `${spark.name} is working out what you said` : waiting ? `${spark.name} is thinking` : null
  return <dialog ref={dialog} className="npc-dialogue spark-dialogue" aria-labelledby="spark-name" aria-busy={waiting} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialogue-page dialogue-page--character">
      <span aria-hidden="true" className="character-portrait spark-portrait" />
      <header className="dialogue-nameplate">
        <h2 id="spark-name">{spark.name}</h2>
        <span className="spark-badge">AI helper</span>
      </header>
      <div className="spark-reply">
        {question && <p className="spark-question"><span>You:</span> {question}</p>}
        {status ? <p className="dialogue-text spark-thinking" role="status">{status}{microphone !== 'listening' && <span aria-hidden="true" className="spark-dots" />}</p> : <VoicedText audio={audio} line={voices.get(pages[shown]) ?? 'loading'} text={pages[shown]} />}
        {!waiting && sent.length > 0 && <p className="spark-sent" role="status"><Icon name="check" size={16} />Sent for approval: {sent.join(', ')}</p>}
        {error && <p className="spark-error" role="alert">{error}</p>}
      </div>
      <div className="spark-actions">
        {!busy && !lastPage ? <button aria-label="Continue" className="dialogue-advance" onClick={() => { play('advance'); setPaging({ text, page: shown + 1 }) }} type="button"><span>Continue</span><Icon name="cursor" size={16} /></button> : null}
        {!busy && lastPage && <div className="spark-suggestions">{suggestions.map(suggestion => <button key={suggestion} type="button" className="spark-suggestion" onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>}
        <form className="spark-composer" onSubmit={event => { event.preventDefault(); void send(draft) }}>
          <label className="sr-only" htmlFor="spark-message">Message for {spark.name}</label>
          <input ref={input} id="spark-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_SPARK_MESSAGE} autoComplete="off" placeholder={`Ask ${spark.name} anything…`} disabled={busy} />
          <div className="spark-buttons">
            <button ref={micButton} type="button" className="spark-mic" data-state={microphone} aria-pressed={microphone === 'listening'} aria-label={microphone === 'listening' ? 'Done talking' : `Talk to ${spark.name} out loud`} title={microphone === 'listening' ? 'Done talking' : `Talk to ${spark.name}`} disabled={waiting || microphone === 'hearing'} onClick={() => void talk()}><Icon name="mic" size={20} /></button>
            <button type="submit" className="spark-send" disabled={busy || !draft.trim()}>Send<Icon name="chevron" size={14} /></button>
          </div>
        </form>
      </div>
    </div>
  </dialog>
}

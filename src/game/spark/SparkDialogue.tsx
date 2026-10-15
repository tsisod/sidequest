import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Keybinds } from '../../../shared/keybinds'
import { MAX_SPARK_MESSAGE } from '../../../shared/spark'
import type { AskSpark, SparkSettings, SparkTurn } from '../../../shared/spark'
import type { Speak } from '../../../shared/speech'
import Icon from '../GameIcon'
import type { DialogueAudio } from '../dialogue/DialogueAudio'
import { dialoguePages } from '../dialogue/dialoguePages'
import { VoicedText } from '../dialogue/VoicedText'
import { useVoiceLines } from '../dialogue/voiceLines'
import '../dialogue/dialogue.css'
import './spark.css'

const suggestions = ['What do I need to do today?', 'I finished a quest!', 'How do I get screen time?']

type SparkDialogueProps = {
  spark: SparkSettings
  childName: string
  keybinds: Keybinds
  turns: readonly SparkTurn[]
  audio: DialogueAudio
  speak: Speak
  ask: AskSpark
  onTurns: (turns: SparkTurn[]) => void
  onClose: () => void
}

export default function SparkDialogue({ spark, childName, keybinds, turns, audio, speak, ask, onTurns, onClose }: SparkDialogueProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const last = turns.at(-1)
  const waiting = thinking || last?.role === 'child'
  const question = [...turns].reverse().find(turn => turn.role === 'child')?.text
  const text = last?.role === 'spark' ? last.text : `Hi ${childName}! I'm ${spark.name}. Ask me what to do today, tell me when you finish a quest, or ask me anything.`
  const pages = useMemo(() => dialoguePages(text), [text])
  const voices = useVoiceLines(pages, spark.voice, speak)
  const [paging, setPaging] = useState({ text, page: 0 })
  const shown = Math.min(paging.text === text ? paging.page : 0, pages.length - 1)
  const lastPage = shown === pages.length - 1

  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  useLayoutEffect(() => {
    if (!waiting) input.current?.focus({ preventScroll: true })
  }, [waiting])

  async function send(message: string) {
    const asked = message.trim()
    if (!asked || waiting) return
    const next = [...turns, { role: 'child' as const, text: asked }]
    setDraft('')
    setError('')
    setSent([])
    setThinking(true)
    onTurns(next)
    const result = await ask({ name: spark.name, keybinds, turns: next })
    setThinking(false)
    if (result.ok) {
      onTurns([...next, { role: 'spark', text: result.reply }])
      setSent(result.submitted)
    } else {
      onTurns([...turns])
      setDraft(asked)
      setError(result.message)
    }
  }

  return <dialog ref={dialog} className="npc-dialogue spark-dialogue" aria-labelledby="spark-name" aria-busy={waiting} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialogue-page dialogue-page--character">
      <span aria-hidden="true" className="character-portrait spark-portrait" />
      <header className="dialogue-nameplate">
        <h2 id="spark-name">{spark.name}</h2>
        <span className="spark-badge">AI helper</span>
      </header>
      <div className="spark-reply">
        {question && <p className="spark-question"><span>You:</span> {question}</p>}
        {waiting ? <p className="dialogue-text spark-thinking" role="status">{spark.name} is thinking<span aria-hidden="true" className="spark-dots" /></p> : <VoicedText audio={audio} line={voices.get(pages[shown]) ?? 'loading'} text={pages[shown]} />}
        {!waiting && sent.length > 0 && <p className="spark-sent" role="status"><Icon name="check" size={16} />Sent for approval: {sent.join(', ')}</p>}
        {error && <p className="spark-error" role="alert">{error}</p>}
      </div>
      <div className="spark-actions">
        {!waiting && !lastPage ? <button aria-label="Continue" className="dialogue-advance" onClick={() => setPaging({ text, page: shown + 1 })} type="button"><span>Continue</span><Icon name="cursor" size={16} /></button> : null}
        {!waiting && lastPage && <div className="spark-suggestions">{suggestions.map(suggestion => <button key={suggestion} type="button" className="spark-suggestion" onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>}
        <form className="spark-composer" onSubmit={event => { event.preventDefault(); void send(draft) }}>
          <label className="sr-only" htmlFor="spark-message">Message for {spark.name}</label>
          <input ref={input} id="spark-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_SPARK_MESSAGE} autoComplete="off" placeholder={`Ask ${spark.name} anything…`} disabled={waiting} />
          <button type="submit" className="spark-send" disabled={waiting || !draft.trim()}>Send<Icon name="chevron" size={14} /></button>
        </form>
      </div>
    </div>
  </dialog>
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Speak } from '../../../shared/speech'
import Icon from '../GameIcon'
import type { Character } from '../villagers'
import type { DialogueAudio } from './DialogueAudio'
import { dialoguePages } from './dialoguePages'
import { VoicedText } from './VoicedText'
import { useVoiceLines } from './voiceLines'
import { useSound } from '../../sound/SoundContext'
import './dialogue.css'

export type Choice = { label: string; act: () => void }
type DialogueBoxProps = {
  character: Character
  audio: DialogueAudio
  speak: Speak
  scene: string
  text: string
  badge?: string
  choices: Choice[]
  busy: boolean
  onClose: () => void
}

export function DialogueBox({ character, audio, speak, scene, text, badge, choices, busy, onClose }: DialogueBoxProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const [paging, setPaging] = useState({ scene, page: 0 })
  const pages = useMemo(() => dialoguePages(text), [text])
  const voices = useVoiceLines(pages, character.voice, speak)
  const shown = Math.min(paging.scene === scene ? paging.page : 0, pages.length - 1)
  const lastPage = shown === pages.length - 1
  const play = useSound()

  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  useLayoutEffect(() => {
    actions.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [scene, shown])

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(index + step + buttons.length) % buttons.length]?.focus()
  }

  return <dialog ref={dialog} className="npc-dialogue" aria-labelledby="npc-name" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialogue-page dialogue-page--character">
      <span aria-hidden="true" className={`character-portrait ${character.portrait}`} />
      <header aria-atomic="true" aria-live="polite" className="dialogue-nameplate">
        <h2 id="npc-name">{character.name}</h2>
        {badge ? <span className="npc-quest-count">{badge}</span> : null}
      </header>
      <VoicedText audio={audio} line={voices.get(pages[shown]) ?? 'loading'} text={pages[shown]} />
      <div className="dialogue-choices" ref={actions} onKeyDown={moveFocus}>
        {lastPage ? choices.map(choice => <button className="dialogue-choice" disabled={busy} key={choice.label} onPointerEnter={event => { if (event.pointerType === 'mouse') event.currentTarget.focus({ preventScroll: true }) }} onClick={() => { play('tap'); choice.act() }} type="button">
          <Icon className="menu-cursor" name="cursor" size={16} /><span>{choice.label}</span>
        </button>) : <button aria-label="Continue" className="dialogue-advance" disabled={busy} onClick={() => { play('advance'); setPaging({ scene, page: shown + 1 }) }} type="button">
          <span>Continue</span><Icon name="cursor" size={16} />
        </button>}
      </div>
      {pages.length > 1 ? <span aria-label={`Page ${shown + 1} of ${pages.length}`} className="dialogue-page-number">{shown + 1} / {pages.length}</span> : null}
    </div>
  </dialog>
}

import { Fragment, useEffect, useSyncExternalStore } from 'react'
import Icon from '../GameIcon'
import type { DialogueAudio } from './DialogueAudio'
import { idleSpeech } from './DialogueSpeech'
import type { VoiceLine } from './voiceLines'

const getIdleSpeech = () => idleSpeech
const getVoiceDefault = () => true

export function VoicedText({ audio, line, text }: { audio: DialogueAudio; line: VoiceLine; text: string }) {
  const snapshot = useSyncExternalStore(audio.subscribeSpeech, audio.getSpeechSnapshot, getIdleSpeech)
  const voiceEnabled = useSyncExternalStore(audio.subscribe, audio.getVoiceEnabled, getVoiceDefault)
  const loaded = typeof line === 'object' && line.clip.text === text ? line : undefined
  useEffect(() => {
    if (loaded) return audio.speak(loaded.clip, loaded.url)
  }, [audio, loaded])
  const matching = loaded?.clip
  const current = matching && snapshot.clipId === matching.id
  const active = current && snapshot.status === 'playing' && voiceEnabled ? snapshot.wordIndex : -1
  const unavailable = voiceEnabled && (line === 'unavailable' || current && snapshot.status === 'error')
  const blocked = voiceEnabled && current && snapshot.status === 'blocked'
  return <>
    <span aria-live="polite" aria-atomic="true" className="sr-only">{text}</span>
    <p aria-hidden="true" className="dialogue-text">
      {matching && matching.words.length ? matching.words.map((word, index) => <Fragment key={word.from}>
        {text.slice(index === 0 ? 0 : matching.words[index - 1].to, word.from)}
        <span className="dialogue-word" data-speaking={active === index ? 'true' : undefined}>{text.slice(word.from, word.to)}</span>
        {index === matching.words.length - 1 ? text.slice(word.to) : null}
      </Fragment>) : text}
    </p>
    <div className="dialogue-voice-controls">
      <button aria-label={`Dialogue voice ${voiceEnabled ? 'on' : 'off'}`} aria-pressed={voiceEnabled} className="dialogue-replay" onClick={() => audio.setVoiceEnabled(!voiceEnabled)} type="button">
        <Icon name={voiceEnabled ? 'sound-on' : 'sound-off'} size={16} /><span>Voice {voiceEnabled ? 'on' : 'off'}</span>
      </button>
      {matching ? <button aria-label={blocked ? 'Play this page' : 'Replay this page'} className="dialogue-replay dialogue-replay--playback" data-reserved-label="Play voice" disabled={!voiceEnabled} onClick={() => audio.replaySpeech(matching.id)} type="button">
        <span>{blocked ? 'Play voice' : 'Replay'}</span>
      </button> : null}
      {voiceEnabled && line === 'loading' ? <span className="dialogue-voice-status">Warming up the voice…</span> : null}
      {unavailable ? <span className="dialogue-voice-status" role="status">Voice unavailable. You can keep reading.</span> : null}
    </div>
  </>
}

import { useEffect, useState } from 'react'
import type { Speak, Voice } from '../../../shared/speech'
import type { SpeechClip } from './types'

export type VoiceLine = { clip: SpeechClip; url: string } | 'loading' | 'unavailable'

const voiceLines = new Map<string, Promise<VoiceLine>>()
let clipCount = 0

function loadVoiceLine(text: string, voice: Voice, speak: Speak): Promise<VoiceLine> {
  const key = `${voice}:${text}`
  const cached = voiceLines.get(key)
  if (cached) return cached
  const line = speak(text, voice).then((result): VoiceLine => result.ok
    ? { clip: { id: `speech-${++clipCount}`, text, gain: 1, words: result.words }, url: URL.createObjectURL(new Blob([result.audio], { type: 'audio/mpeg' })) }
    : 'unavailable')
  voiceLines.set(key, line)
  void line.then(value => { if (value === 'unavailable') voiceLines.delete(key) })
  return line
}

export function useVoiceLines(pages: readonly string[], voice: Voice, speak: Speak): ReadonlyMap<string, VoiceLine> {
  const [lines, setLines] = useState<ReadonlyMap<string, VoiceLine>>(new Map())
  const key = pages.join('\n')
  useEffect(() => {
    let live = true
    for (const text of key.split('\n')) void loadVoiceLine(text, voice, speak).then(line => { if (live) setLines(current => new Map(current).set(text, line)) })
    return () => { live = false }
  }, [key, voice, speak])
  return lines
}

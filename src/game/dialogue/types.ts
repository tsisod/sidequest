import type { SpeechWord } from '../../../shared/speech'

export type SpeechClip = { id: string; text: string; gain: number; words: SpeechWord[] }

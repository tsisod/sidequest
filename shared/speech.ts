export type SpeechWord = { from: number; to: number; start: number; end: number }
export type SpeechAlignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
export type SpeechResult = { ok: true; audio: ArrayBuffer; words: SpeechWord[] } | { ok: false; message: string }

export const MAX_SPEECH_CHARACTERS = 240
const helperVoice = { stability: 0.65, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.95 }
export const voices = {
  smith: {
    voiceId: 'pqHfZKP75CvOlQylNhV4',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.65, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.95 },
  },
  librarian: {
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.7, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.9 },
  },
  housekeeper: {
    voiceId: 'cgSgspJ2msm6clMCkdW9',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 1 },
  },
  dog: {
    voiceId: 'IKne3meq5aSn9XLyUdCD',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.05 },
  },
  angler: {
    voiceId: 'CwhRBWXzGAHq8TQ4Fs17',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.65, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.9 },
  },
  gardener: {
    voiceId: 'FGY2WhTYpPnrIDTdsKH5',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 1 },
  },
  matilda: { voiceId: 'XrExE9yKIg1WjnnlVkGX', modelId: 'eleven_multilingual_v2', voiceSettings: helperVoice },
  will: { voiceId: 'bIHbv24MWmeRgasZH58o', modelId: 'eleven_multilingual_v2', voiceSettings: helperVoice },
  alice: { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', modelId: 'eleven_multilingual_v2', voiceSettings: helperVoice },
  liam: { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', modelId: 'eleven_multilingual_v2', voiceSettings: { ...helperVoice, speed: 1 } },
  river: { voiceId: 'SAz9YHcvj6GT2YYXdXww', modelId: 'eleven_multilingual_v2', voiceSettings: helperVoice },
  callum: { voiceId: 'N2lVS1w4EtoT3dr4eOWO', modelId: 'eleven_multilingual_v2', voiceSettings: helperVoice },
} as const
export type Voice = keyof typeof voices
export function parseVoice(value: unknown): Voice | null { return typeof value === 'string' && Object.hasOwn(voices, value) ? value as Voice : null }
export type Speak = (text: string, voice: Voice) => Promise<SpeechResult>

export async function speechHash(text: string, voice: Voice): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ text, profile: voices[voice] })))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function speechRequest(text: string, voice: Voice) {
  const profile = voices[voice]
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${profile.voiceId}/with-timestamps?output_format=mp3_44100_64`,
    body: { text, model_id: profile.modelId, voice_settings: profile.voiceSettings, seed: 1709, apply_text_normalization: 'auto' },
  }
}

export function alignedWords(text: string, alignment: SpeechAlignment | undefined): SpeechWord[] {
  if (!alignment || alignment.characters.join('') !== text) return []
  const { character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment
  if (starts.length !== alignment.characters.length || ends.length !== alignment.characters.length) return []
  const offsets: { start: number; end: number }[] = []
  alignment.characters.forEach((character, index) => {
    for (let unit = 0; unit < character.length; unit++) offsets.push({ start: starts[index], end: ends[index] })
  })
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)].map(match => {
    const from = match.index
    const to = from + match[0].length
    return { from, to, start: offsets[from].start, end: offsets[to - 1].end }
  })
}

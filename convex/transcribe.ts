import { MAX_VOICE_CLIP_BYTES } from '../shared/parentVoice.ts'

export type Clip = { audio: ArrayBuffer; mimeType: string; language: string }
export type Transcript = { ok: true; text: string } | { ok: false; reason: 'not-set-up' | 'missing-permission' | 'out-of-credits' | 'key-rejected' | 'busy' | 'unclear' }

const extensions: Record<string, string> = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav' }

export function usableClip(clip: Clip): boolean {
  return clip.audio.byteLength >= 200 && clip.audio.byteLength <= MAX_VOICE_CLIP_BYTES && /^audio\/[a-z0-9.+-]+(;.*)?$/i.test(clip.mimeType)
}

// ElevenLabs Scribe turns a recording into text; the browser's own speech recognition is too patchy across browsers.
export async function transcribe(clip: Clip, maxLength: number): Promise<Transcript> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return { ok: false, reason: 'not-set-up' }
  const subtype = clip.mimeType.split(';')[0].split('/')[1] ?? ''
  const form = new FormData()
  form.append('model_id', 'scribe_v2')
  if (/^[a-z]{2,3}$/.test(clip.language)) form.append('language_code', clip.language)
  form.append('file', new Blob([clip.audio], { type: clip.mimeType.split(';')[0] }), `speech.${extensions[subtype] ?? 'webm'}`)
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    console.error('Speech-to-text failed', response.status, detail)
    if (detail.includes('missing_permissions')) return { ok: false, reason: 'missing-permission' }
    if (detail.includes('quota_exceeded')) return { ok: false, reason: 'out-of-credits' }
    return { ok: false, reason: response.status === 401 ? 'key-rejected' : response.status === 429 ? 'busy' : 'unclear' }
  }
  const result: { text?: unknown } = await response.json()
  // Scribe marks sounds like "(laughs)" or "[music]"; only the words matter here.
  return { ok: true, text: typeof result.text === 'string' ? result.text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength) : '' }
}

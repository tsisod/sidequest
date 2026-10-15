import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignedWords, speechHash, speechRequest, voices } from '../shared/speech.ts'

const timed = (text: string) => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, index) => index / 10),
  character_end_times_seconds: [...text].map((_, index) => (index + 1) / 10),
})

test('the ElevenLabs request matches the Learnspace voice settings and asks for word timings', () => {
  const request = speechRequest('Ah, Alex!', 'smith')
  assert.equal(request.url, `https://api.elevenlabs.io/v1/text-to-speech/${voices.smith.voiceId}/with-timestamps?output_format=mp3_44100_64`)
  assert.deepEqual(request.body, { text: 'Ah, Alex!', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.65, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.95 }, seed: 1709, apply_text_normalization: 'auto' })
})

test('every character speaks with their own voice', () => {
  for (const voice of ['librarian', 'housekeeper', 'dog', 'angler', 'gardener'] as const) {
    const request = speechRequest('Hello, Alex!', voice)
    assert.equal(request.url, `https://api.elevenlabs.io/v1/text-to-speech/${voices[voice].voiceId}/with-timestamps?output_format=mp3_44100_64`)
    assert.deepEqual(request.body.voice_settings, voices[voice].voiceSettings)
  }
  const ids = Object.values(voices).map(voice => voice.voiceId)
  assert.equal(new Set(ids).size, ids.length)
})

test('character timings become highlighted words, keeping apostrophes inside words', () => {
  const text = "I've 2 chores."
  assert.deepEqual(alignedWords(text, timed(text)), [
    { from: 0, to: 4, start: 0, end: .4 },
    { from: 5, to: 6, start: .5, end: .6 },
    { from: 7, to: 13, start: .7, end: 1.3 },
  ])
})

test('mismatched or missing timings are never guessed', () => {
  assert.deepEqual(alignedWords('Hello there', timed('Hello')), [])
  assert.deepEqual(alignedWords('Hello', undefined), [])
})

test('each line and voice has its own cache key', async () => {
  assert.equal(await speechHash('Hello', 'smith'), await speechHash('Hello', 'smith'))
  assert.notEqual(await speechHash('Hello', 'smith'), await speechHash('Hello!', 'smith'))
  assert.notEqual(await speechHash('Hello', 'smith'), await speechHash('Hello', 'librarian'))
  assert.match(await speechHash('Hello', 'smith'), /^[a-f0-9]{64}$/)
})

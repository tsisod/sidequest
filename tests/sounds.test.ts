import assert from 'node:assert/strict'
import test from 'node:test'
import { soundEffects } from '../src/sound/effects.ts'

test('every sound effect is a short, audible, unclipped chirp', () => {
  for (const [name, tones] of Object.entries(soundEffects)) {
    assert.ok(tones.length > 0, name)
    const end = Math.max(...tones.map(tone => tone.at + tone.length))
    assert.ok(end <= 1, `${name} lasts ${end}s`)
    const instants = Array.from({ length: Math.ceil(end / .005) }, (_, step) => step * .005)
    const loudest = Math.max(...instants.map(at => tones.filter(tone => tone.at <= at && at < tone.at + tone.length - 1e-6).reduce((sum, tone) => sum + (tone.volume ?? 1), 0)))
    assert.ok(loudest <= 1, `${name} stacks to ${loudest}`)
    for (const tone of tones) {
      assert.ok(tone.at >= 0 && tone.length >= .03, `${name} timing`)
      for (const frequency of [tone.from, tone.to ?? tone.from]) assert.ok(frequency >= 40 && frequency <= 8000, `${name} pitch ${frequency}`)
    }
  }
})

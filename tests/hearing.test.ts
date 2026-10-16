import assert from 'node:assert/strict'
import test from 'node:test'
import { hear, soundsSilent, startHearing } from '../src/voice/hearing.ts'
import type { HearingVerdict } from '../src/voice/hearing.ts'

const FRAME_MS = 16
function run(levels: { ms: number; rms: number; peak?: number }[]): { verdict: HearingVerdict; at: number; silent: boolean } {
  let hearing = startHearing(0)
  let time = 0
  for (const level of levels) {
    for (let elapsed = 0; elapsed < level.ms; elapsed += FRAME_MS) {
      time += FRAME_MS
      const result = hear(hearing, { time, dt: FRAME_MS, rms: level.rms, peak: level.peak ?? level.rms * 3 })
      hearing = result.hearing
      if (result.verdict !== 'listening') return { verdict: result.verdict, at: time, silent: soundsSilent(hearing) }
    }
  }
  return { verdict: 'listening', at: time, silent: soundsSilent(hearing) }
}

test('a spoken sentence followed by a pause finishes the turn', () => {
  const result = run([{ ms: 600, rms: .002 }, { ms: 1800, rms: .06 }, { ms: 1500, rms: .002 }])
  assert.equal(result.verdict, 'finished')
  assert.ok(result.at > 2400 && result.at < 3500, `finished at ${result.at}`)
})

test('a microphone sending exact silence is reported within three seconds instead of waiting', () => {
  const result = run([{ ms: 10_000, rms: 0, peak: 0 }])
  assert.deepEqual({ verdict: result.verdict, silent: result.silent }, { verdict: 'silent-microphone', silent: true })
  assert.ok(result.at <= 2600, `reported at ${result.at}`)
})

test('a quiet but working room is never mistaken for a dead microphone', () => {
  const result = run([{ ms: 10_000, rms: .0006, peak: .002 }])
  assert.deepEqual({ verdict: result.verdict, silent: result.silent }, { verdict: 'nothing-heard', silent: false })
  assert.ok(result.at >= 8000)
})

test('a click too short to be speech does not end the turn', () => {
  const result = run([{ ms: 80, rms: .3 }, { ms: 1500, rms: .002 }, { ms: 1500, rms: .06 }, { ms: 1200, rms: .002 }])
  assert.equal(result.verdict, 'finished')
  assert.ok(result.at > 3000, `finished at ${result.at}`)
})

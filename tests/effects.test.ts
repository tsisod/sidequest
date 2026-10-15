import assert from 'node:assert/strict'
import test from 'node:test'
import { dust, heroPose, liveParticles, particleAt, sparkBob, sparkDrift, twinkle } from '../src/game/effects.ts'

const half = () => .5

test('the hero breathes while idle, stretches in the air and squashes on landing', () => {
  const pose = (time: number, extra: Partial<Parameters<typeof heroPose>[0]> = {}) => heroPose({ time, moving: false, airborne: false, landedAt: -Infinity, motion: true, ...extra })
  assert.deepEqual(pose(0), { scaleX: 1, scaleY: 1 })
  assert.deepEqual(pose(600), { scaleX: 1, scaleY: 31 / 32 })
  assert.deepEqual(pose(600, { moving: true }), { scaleX: 1, scaleY: 1 })
  assert.deepEqual(pose(600, { airborne: true }), { scaleX: .94, scaleY: 1.06 })
  const landed = pose(1000, { landedAt: 1000 })
  assert.ok(Math.abs(landed.scaleX - 1.12) < 1e-9 && Math.abs(landed.scaleY - .88) < 1e-9)
  const settling = pose(1060, { landedAt: 1000 })
  assert.ok(settling.scaleX > 1 && settling.scaleX < landed.scaleX)
  assert.deepEqual(pose(1200, { landedAt: 1000 }), { scaleX: 1, scaleY: 1 })
})

test('reduced motion keeps the hero and Spark still', () => {
  assert.deepEqual(heroPose({ time: 600, moving: false, airborne: true, landedAt: 590, motion: false }), { scaleX: 1, scaleY: 1 })
  assert.deepEqual(sparkDrift(1234, false), { x: 0, y: 0 })
})

test('Spark drifts gently around the hero and bobs by at most two pixels', () => {
  for (let time = 0; time < 10_000; time += 37) {
    const drift = sparkDrift(time, true)
    assert.ok(Math.abs(drift.x) <= 6 && Math.abs(drift.y) <= 3)
    assert.ok(Math.abs(sparkBob(time)) <= 2)
  }
})

test('dust and twinkles fade out and are removed when their time is up', () => {
  const puffs = dust({ x: 100, y: 200 }, 1000, 3, half)
  assert.equal(puffs.length, 3)
  assert.deepEqual(particleAt(puffs[0], 1000), { x: 100, y: 199, alpha: 1 })
  const middle = particleAt(puffs[0], 1000 + puffs[0].life / 2)
  assert.ok(middle.y < 199 && Math.abs(middle.alpha - .5) < 1e-9, 'dust rises while it fades')
  const sparkle = twinkle({ x: 50, y: 60 }, 1000, half)
  assert.ok(particleAt(sparkle, 1500).y > 60, 'twinkles drift down')
  assert.equal(liveParticles([...puffs, sparkle], 1000 + puffs[0].life).length, 1)
  assert.equal(liveParticles([...puffs, sparkle], 1000 + sparkle.life).length, 0)
})

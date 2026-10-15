import assert from 'node:assert/strict'
import test from 'node:test'
import { isJumping, JUMP_DURATION_MS, JUMP_HEIGHT_PX, jumpHeight } from '../src/game/jump.ts'

test('a jump begins and lands at ground level with a twenty-pixel midpoint', () => {
  const startedAt = 10_000
  assert.equal(JUMP_DURATION_MS, 500)
  assert.equal(JUMP_HEIGHT_PX, 20)
  assert.equal(jumpHeight(null, startedAt), 0)
  assert.equal(jumpHeight(startedAt, startedAt), 0)
  assert.equal(jumpHeight(startedAt, startedAt + JUMP_DURATION_MS / 2), 20)
  assert.equal(jumpHeight(startedAt, startedAt + JUMP_DURATION_MS), 0)
  assert.equal(jumpHeight(startedAt, startedAt + 10_000), 0)
  assert.equal(jumpHeight(startedAt, startedAt - 1), 0)
})

test('the arc is symmetric and bounded throughout its five-hundred-millisecond lifetime', () => {
  const startedAt = 100
  for (let elapsed = 0; elapsed <= JUMP_DURATION_MS; elapsed++) {
    const height = jumpHeight(startedAt, startedAt + elapsed)
    assert.ok(height >= 0 && height <= JUMP_HEIGHT_PX)
    assert.ok(Math.abs(height - jumpHeight(startedAt, startedAt + JUMP_DURATION_MS - elapsed)) < 1e-10)
  }
})

test('zero-valued start timestamps stay active and a landing enables the next jump', () => {
  assert.equal(isJumping(null, 0), false)
  assert.equal(isJumping(0, 0), true)
  assert.equal(isJumping(0, JUMP_DURATION_MS - 1), true)
  assert.equal(isJumping(0, JUMP_DURATION_MS), false)
  assert.equal(isJumping(0, JUMP_DURATION_MS + 1), false)
  assert.equal(isJumping(100.1, 100), true)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTimeZone } from '../shared/calendar.ts'
import { createFamily } from '../shared/sidequest.ts'
import { decodeLocalFamily } from '../src/state/localStore.ts'
import { parseAlarmTime } from '../shared/wakeAlarm.ts'

const NOW = Date.parse('2026-10-15T00:00:00.000Z')
function current() { const timeZone = parseTimeZone('Asia/Bangkok'); assert.ok(timeZone); return createFamily({ id: 'saved-family', code: 'ABCDEFGH23', now: NOW, timeZone }) }

test('local envelope 3 adds an off alarm without changing previous board state', () => {
  const { wakeAlarm, ...old } = current()
  const family = decodeLocalFamily({ version: 3, family: old }, NOW)
  assert.deepEqual(family, { ...old, wakeAlarm })
})

test('local envelope 4 preserves a configured alarm and rejects invalid present data or unknown versions', () => {
  const family = current()
  const time = parseAlarmTime('08:30')
  assert.ok(time)
  family.wakeAlarm = { ...family.wakeAlarm, enabled: true, time, sound: 'birds' }
  assert.deepEqual(decodeLocalFamily({ version: 4, family }, NOW), family)
  assert.throws(() => decodeLocalFamily({ version: 4, family: { ...family, wakeAlarm: null } }, NOW), /saved board/)
  assert.throws(() => decodeLocalFamily({ version: 5, family }, NOW), /recovery/)
})

test('legacy local envelopes 1 and 2 still migrate with safe alarm defaults', () => {
  const legacy = { id: 'old', code: 'ABCDEFGH23', childName: 'Alex', createdAt: NOW, screenMinutes: 20, clock: { kind: 'paused', remainingMs: 0 }, quests: [{ id: 'read', title: 'Read a book', xp: 50, gold: 4, place: 'library', status: 'todo' }] }
  const v2 = decodeLocalFamily({ version: 2, family: legacy }, NOW)
  assert.equal(v2.wakeAlarm.enabled, false)
  assert.equal(v2.wakeAlarm.time, '07:00')
  assert.equal(v2.quests[0]?.title, 'Read a book')
  const v1 = decodeLocalFamily({ version: 1, family: { ...legacy, quests: [{ ...legacy.quests[0], minutes: 10 }] } }, NOW)
  assert.equal(v1.wakeAlarm.enabled, false)
  assert.equal(v1.quests[0]?.xp, 50)
  assert.equal(v1.quests[0]?.gold, 4)
})

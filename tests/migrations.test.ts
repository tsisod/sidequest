import assert from 'node:assert/strict'
import test from 'node:test'
import type { TaskTemplate } from '../shared/domain.ts'
import { dateAt, nextDayBoundary, parseTimeZone } from '../shared/calendar.ts'
import { migrateV1ToV2, migrateV2Family, parseV2Family } from '../shared/migrations.ts'
import { earnedGold, earnedXp, parseFamily, reconcileFamily } from '../shared/sidequest.ts'

const NOW = Date.parse('2026-10-15T04:00:00.000Z')
function zone() { const value = parseTimeZone('Asia/Bangkok'); assert.ok(value); return value }
function legacy() {
  return {
    id: 'existing-family', code: 'ABCDEFGH23', childName: 'Alex', createdAt: NOW - 4_000, screenMinutes: 20,
    clock: { kind: 'paused', remainingMs: 0 },
    quests: [
      { id: 'done', title: 'Read a book', xp: 75, gold: 5, place: 'library', status: 'approved', submittedAt: NOW - 3_000, approvedAt: NOW - 2_000 },
      { id: 'review', title: 'Tidy room', xp: 50, gold: 4, place: 'cottage', status: 'pending', submittedAt: NOW - 1_000 },
      { id: 'todo', title: 'Move your body', xp: 25, gold: 2, place: 'garden', status: 'todo' },
    ],
  }
}

test('v2 migration preserves every quest field, identity, settings, timestamps and earned totals', () => {
  const before = legacy()
  const frozen = structuredClone(before)
  const family = migrateV2Family(before, { now: NOW, timeZone: zone() })
  assert.ok(family)
  assert.equal(family.version, 3)
  assert.equal(family.id, before.id)
  assert.equal(family.code, before.code)
  assert.equal(family.childName, before.childName)
  assert.equal(family.screenMinutes, before.screenMinutes)
  assert.equal(family.createdAt, before.createdAt)
  assert.equal(family.sessionDay, '2026-10-15')
  for (const quest of before.quests) {
    assert.deepEqual(family.quests.find(item => item.templateId === quest.id), { ...quest, place: quest.place === 'garden' ? 'cottage' : quest.place, id: `${quest.id}@${family.sessionDay}`, templateId: quest.id, date: family.sessionDay })
    const template: TaskTemplate | undefined = family.templates.find(item => item.id === quest.id)
    assert.ok(template)
    assert.deepEqual(template.schedule, { kind: 'once', date: family.sessionDay })
  }
  assert.equal(earnedXp(family), 75)
  assert.equal(earnedGold(family), 5)
  assert.deepEqual(family.clock, { kind: 'paused', remainingMs: 0 })
  assert.equal(family.allowanceGranted, false)
  assert.deepEqual(before, frozen)
  assert.deepEqual(parseFamily(family), family)
  assert.deepEqual(migrateV2Family(family, { now: NOW + 86_400_000, timeZone: zone() }), family)
})

test('previous unlocked allowance is consumed, never refilled, and retains its remaining clock', () => {
  const before = legacy()
  const source = { ...before, quests: [before.quests[0]], clock: { kind: 'running', endsAt: NOW + 5 * 60_000 } }
  const family = migrateV2Family(source, { now: NOW, timeZone: zone() })
  assert.ok(family)
  assert.equal(family.allowanceGranted, true)
  assert.equal(family.allowanceUsedMs, 15 * 60_000)
  assert.deepEqual(family.clock, { kind: 'running', endsAt: NOW + 5 * 60_000, startedAt: NOW })
  const expired = migrateV2Family({ ...source, clock: { kind: 'running', endsAt: NOW - 1 } }, { now: NOW, timeZone: zone() })
  assert.ok(expired)
  assert.deepEqual(expired.clock, { kind: 'paused', remainingMs: 0 })
  assert.equal(expired.allowanceGranted, true)
  const next = reconcileFamily(family, nextDayBoundary(NOW, zone()))
  assert.equal(next.allowanceGranted, false)
  assert.equal(next.quests.filter(quest => quest.date === next.sessionDay).length, 0)
})

test('migration retains parent blocking and caps live time at household midnight', () => {
  const before = legacy()
  const blocked = migrateV2Family({ ...before, clock: { kind: 'blocked', remainingMs: 20 * 60_000 } }, { now: NOW, timeZone: zone() })
  assert.deepEqual(blocked?.clock, { kind: 'blocked', remainingMs: 0 })
  const midnight = nextDayBoundary(NOW, zone())
  const running = migrateV2Family({ ...before, quests: [before.quests[0]], clock: { kind: 'running', endsAt: midnight + 60_000 } }, { now: midnight - 1_000, timeZone: zone() })
  assert.deepEqual(running?.clock, { kind: 'running', endsAt: midnight, startedAt: midnight - 1_000 })
})

test('v1 conversion remains separate and malformed legacy data is preserved by rejection', () => {
  const before = legacy()
  const v1 = { ...before, screenMinutes: undefined, quests: before.quests.map(quest => ({ ...quest, minutes: 15 })) }
  const v2 = migrateV1ToV2(v1)
  assert.ok(v2)
  assert.equal(v2.quests[0]?.xp, 75)
  assert.equal(v2.quests[0]?.gold, 5)
  const v3 = migrateV2Family(v2, { now: NOW, timeZone: zone() })
  assert.equal(v3?.sessionDay, dateAt(NOW, zone()))
  assert.equal(parseFamily(before), null)
  assert.equal(parseV2Family({ ...before, quests: [...before.quests, before.quests[0]] }), null)
  assert.equal(migrateV2Family({ ...before, clock: { kind: 'paused', remainingMs: NaN } }, { now: NOW, timeZone: zone() }), null)
  assert.equal(migrateV1ToV2({ ...v1, quests: [{ minutes: -1 }] }), null)
})

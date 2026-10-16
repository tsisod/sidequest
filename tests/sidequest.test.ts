import assert from 'node:assert/strict'
import test from 'node:test'
import type { Family, FamilyCommand, Role, Schedule } from '../shared/domain.ts'
import { addDays, nextDayBoundary, parseTimeZone } from '../shared/calendar.ts'
import { applyCommand, createFamily, earnedGold, earnedXp, familyWithinSizeLimit, levelProgress, parseFamily, parseSchedule, projectDay, reconcileFamily, remainingMs, scheduledOn, screenUnlocked, xpToLevelUp } from '../shared/sidequest.ts'

const NOW = Date.parse('2026-10-15T03:00:00.000Z')
const MINUTE = 60_000
function initial() {
  const timeZone = parseTimeZone('Asia/Bangkok')
  assert.ok(timeZone)
  return createFamily({ id: 'family-one', code: 'ABCDEFGH23', now: NOW, timeZone })
}
const run = (family: Family, command: FamilyCommand, role: Role, now = NOW) => applyCommand(family, command, { role, now })
function complete(family = initial(), now = NOW): Family {
  for (const quest of projectDay(family, family.sessionDay).quests) {
    const submitted = run(family, { kind: 'submit', questId: quest.id }, 'child', now)
    assert.equal(submitted.result.ok, true)
    const approved = run(submitted.family, { kind: 'approve', questId: quest.id }, 'parent', now)
    assert.equal(approved.result.ok, true)
    family = approved.family
  }
  return family
}
function added(id: string, schedule: Schedule): FamilyCommand { return { kind: 'add-template', id, title: 'Homework', xp: 25, gold: 3, place: 'library', schedule } }

test('initial three tasks are daily, dated, locked, and parseable', () => {
  const family = initial()
  assert.equal(family.version, 3)
  assert.equal(family.quests.length, 3)
  assert.ok(family.templates.every(template => template.schedule.kind === 'daily'))
  assert.ok(family.quests.every(quest => quest.id === `${quest.templateId}@${family.sessionDay}`))
  assert.equal(screenUnlocked(family), false)
  assert.deepEqual(family.clock, { kind: 'paused', remainingMs: 0 })
  assert.deepEqual(parseFamily(JSON.parse(JSON.stringify(family))), family)
})

test('once, daily, and selected-weekday schedules project without writing future work', () => {
  let family = initial()
  const tomorrow = addDays(family.sessionDay, 1)
  family = run(family, added('once', { kind: 'once', date: tomorrow }), 'parent').family
  family = run(family, added('weekly', { kind: 'weekly', from: family.sessionDay, weekdays: [1, 5] }), 'parent').family
  assert.equal(family.quests.length, 3)
  assert.equal(projectDay(family, tomorrow).quests.length, 5)
  assert.equal(projectDay(family, addDays(tomorrow, 1)).quests.length, 3)
  assert.equal(projectDay(family, addDays(tomorrow, 3)).quests.length, 4)
  const once = family.templates.find(template => template.id === 'once')
  assert.ok(once)
  assert.equal(scheduledOn(once, tomorrow), true)
  assert.equal(scheduledOn(once, addDays(tomorrow, 1)), false)
})

test('reconciliation is pure, idempotent, current-day-only and handles missed visits', () => {
  const family = initial()
  const before = structuredClone(family)
  const later = NOW + 14 * 24 * 60 * MINUTE
  const reconciled = reconcileFamily(family, later)
  assert.equal(reconciled.quests.length, 6)
  assert.equal(reconciled.sessionDay, '2026-10-29')
  assert.deepEqual(reconcileFamily(reconciled, later), reconciled)
  assert.deepEqual(family, before)
  assert.equal(projectDay(reconciled, addDays(family.sessionDay, 1)).quests.length, 3)
})

test('repeated per-occurrence approval earns rewards once, and every today task is required', () => {
  let family = initial()
  const first = family.quests[0]
  assert.ok(first)
  family = run(family, { kind: 'submit', questId: first.id }, 'child').family
  family = run(family, { kind: 'approve', questId: first.id }, 'parent').family
  assert.equal(earnedXp(family), first.xp)
  assert.equal(earnedGold(family), first.gold)
  assert.equal(screenUnlocked(family), false)
  assert.equal(remainingMs(family.clock, NOW), 0)
  assert.deepEqual(run(family, { kind: 'approve', questId: first.id }, 'parent').family, family)
  family = complete(family)
  assert.equal(earnedXp(family), 150)
  assert.equal(earnedGold(family), 11)
  assert.deepEqual(family.clock, { kind: 'paused', remainingMs: 20 * MINUTE })
  assert.equal(family.allowanceGranted, true)
})

test('new today tasks relock but preserve remaining balance and never refill the daily allowance', () => {
  let family = run(complete(), { kind: 'start-play' }, 'child').family
  family = run(family, added('extra', { kind: 'once', date: family.sessionDay }), 'parent', NOW + 5 * MINUTE).family
  assert.equal(screenUnlocked(family), false)
  assert.equal(family.allowanceUsedMs, 5 * MINUTE)
  assert.deepEqual(family.clock, { kind: 'paused', remainingMs: 15 * MINUTE })
  assert.equal(run(family, { kind: 'start-play' }, 'child', NOW + 5 * MINUTE).result.ok, false)
  family = complete(family, NOW + 5 * MINUTE)
  assert.deepEqual(family.clock, { kind: 'paused', remainingMs: 15 * MINUTE })
  assert.equal(family.allowanceGranted, true)
})

test('future tasks do not relock today or affect its running deadline', () => {
  const running = run(complete(), { kind: 'start-play' }, 'child').family
  const family = run(running, added('future', { kind: 'once', date: addDays(running.sessionDay, 1) }), 'parent').family
  assert.equal(screenUnlocked(family), true)
  assert.deepEqual(family.clock, running.clock)
})

test('daily allowance resets at household midnight and parental blocking survives', () => {
  const completed = complete()
  const blocked = run(completed, { kind: 'set-blocked', blocked: true }, 'parent').family
  const midnight = nextDayBoundary(NOW, blocked.timeZone)
  const next = reconcileFamily(blocked, midnight)
  assert.equal(next.sessionDay, '2026-10-16')
  assert.equal(next.allowanceGranted, false)
  assert.equal(next.allowanceUsedMs, 0)
  assert.deepEqual(next.clock, { kind: 'blocked', remainingMs: 0 })
  const finished = complete(next, midnight)
  assert.deepEqual(finished.clock, { kind: 'blocked', remainingMs: 20 * MINUTE })
  assert.equal(earnedXp(finished), 300)
})

test('new running sessions end at midnight even when the page sleeps', () => {
  const family = complete()
  const midnight = nextDayBoundary(NOW, family.timeZone)
  const started = run(family, { kind: 'start-play' }, 'child', midnight - 10_000).family
  assert.equal(started.clock.kind, 'running')
  if (started.clock.kind === 'running') assert.equal(started.clock.endsAt, midnight)
  assert.equal(remainingMs(started.clock, midnight + 10_000), 0)
  assert.deepEqual(reconcileFamily(started, midnight + 10_000).clock, { kind: 'paused', remainingMs: 0 })
})

test('historical pending approval earns once without unlocking today; past child submission fails', () => {
  const family = initial()
  const first = family.quests[0]
  assert.ok(first)
  const pending = run(family, { kind: 'submit', questId: first.id }, 'child').family
  const nextNow = nextDayBoundary(NOW, family.timeZone)
  const approved = run(pending, { kind: 'approve', questId: first.id }, 'parent', nextNow).family
  assert.equal(earnedXp(approved), first.xp)
  assert.equal(approved.allowanceGranted, false)
  assert.equal(screenUnlocked(approved), false)
  assert.deepEqual(approved.clock, { kind: 'paused', remainingMs: 0 })
  assert.deepEqual(run(approved, { kind: 'approve', questId: first.id }, 'parent', nextNow).family, approved)
  assert.equal(run(approved, { kind: 'submit', questId: first.id }, 'child', nextNow).result.ok, false)
})

test('settings retain consumed allowance across decrease, exhaustion, and increase', () => {
  const started = run(complete(), { kind: 'start-play' }, 'child').family
  const decreased = run(started, { kind: 'set-screen-time', minutes: 10 }, 'parent', NOW + 15 * MINUTE).family
  assert.equal(decreased.allowanceUsedMs, 15 * MINUTE)
  assert.deepEqual(decreased.clock, { kind: 'paused', remainingMs: 0 })
  const restored = run(decreased, { kind: 'set-screen-time', minutes: 20 }, 'parent', NOW + 15 * MINUTE).family
  assert.deepEqual(restored.clock, { kind: 'paused', remainingMs: 5 * MINUTE })
  const again = run(restored, { kind: 'set-screen-time', minutes: 20 }, 'parent', NOW + 15 * MINUTE).family
  assert.deepEqual(again, restored)
})

test('retirement is idempotent across later days and keeps approved and historical pending snapshots', () => {
  let family = initial()
  const first = family.quests[0]
  assert.ok(first)
  family = run(family, { kind: 'submit', questId: first.id }, 'child').family
  const tomorrow = nextDayBoundary(NOW, family.timeZone)
  family = run(family, { kind: 'remove-template', templateId: first.templateId }, 'parent', tomorrow).family
  assert.ok(family.quests.some(quest => quest.id === first.id && quest.status === 'pending'))
  assert.equal(projectDay(family, family.sessionDay).quests.some(quest => quest.templateId === first.templateId), false)
  const next = run(family, { kind: 'remove-template', templateId: first.templateId }, 'parent', tomorrow + 24 * 60 * MINUTE).family
  assert.equal(next.templates.find(template => template.id === first.templateId)?.endsBefore, '2026-10-16')
  assert.equal(projectDay(next, family.sessionDay).quests.some(quest => quest.templateId === first.templateId), false)
  const approved = run(complete(), { kind: 'remove-template', templateId: first.templateId }, 'parent').family
  assert.ok(approved.quests.some(quest => quest.id === first.id && quest.status === 'approved'))
})

test('parent removal may unlock a nonempty day; empty days remain locked', () => {
  let family = complete()
  family = run(family, added('extra', { kind: 'once', date: family.sessionDay }), 'parent').family
  family = run(family, { kind: 'remove-template', templateId: 'extra' }, 'parent').family
  assert.equal(screenUnlocked(family), true)
  let empty = initial()
  for (const template of empty.templates) empty = run(empty, { kind: 'remove-template', templateId: template.id }, 'parent').family
  assert.equal(screenUnlocked(empty), false)
  assert.equal(empty.allowanceGranted, false)
})

test('roles, template retries, validation, snapshots and size boundaries hold', () => {
  const family = initial()
  const action = added('new', { kind: 'once', date: family.sessionDay })
  assert.equal(run(family, action, 'child').result.ok, false)
  assert.equal(run(family, { kind: 'submit', questId: family.quests[0]?.id ?? '' }, 'parent').result.ok, false)
  const addedFamily = run(family, action, 'parent').family
  assert.deepEqual(run(addedFamily, action, 'parent').family, addedFamily)
  assert.equal(run(family, added('old', { kind: 'once', date: addDays(family.sessionDay, -1) }), 'parent').result.ok, false)
  assert.equal(parseSchedule({ kind: 'weekly', from: family.sessionDay, weekdays: [] }), null)
  assert.equal(parseSchedule({ kind: 'weekly', from: family.sessionDay, weekdays: [1, 1] }), null)
  assert.equal(parseFamily({ ...family, quests: [...family.quests, family.quests[0]] }), null)
  assert.equal(parseFamily({ ...family, allowanceUsedMs: Infinity }), null)
  const changed = { ...family, templates: family.templates.map(template => ({ ...template, title: 'Updated title' })) }
  assert.equal(projectDay(changed, family.sessionDay).quests[0]?.title, family.quests[0]?.title)
  assert.equal(familyWithinSizeLimit(family), true)
  assert.equal(familyWithinSizeLimit({ ...family, childName: 'x'.repeat(750_001) }), false)
})

test('new families get one task in each category and older garden tasks load as cottage chores', () => {
  const family = initial()
  assert.deepEqual(family.templates.map(template => [template.id, template.place]), [['read-20', 'library'], ['tidy-room', 'cottage'], ['move-body', 'chores']])
  const stored = structuredClone(family) as unknown as { templates: { place: string }[]; quests: { place: string }[] }
  stored.templates[1].place = 'garden'
  stored.quests[1].place = 'garden'
  const parsed = parseFamily(stored)
  assert.ok(parsed)
  assert.equal(parsed.templates[1].place, 'cottage')
  assert.equal(parsed.quests[1].place, 'cottage')
  const legacyAdd = run(family, { ...added('rake', { kind: 'daily', from: family.sessionDay }), place: 'garden' } as unknown as FamilyCommand, 'parent')
  assert.equal(legacyAdd.result.ok, true)
  assert.equal(legacyAdd.family.templates.find(template => template.id === 'rake')?.place, 'cottage')
})

test('each level needs 50 more XP than the one before, starting at 100', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(xpToLevelUp), [100, 150, 200, 250, 550])
  const at = (xp: number) => levelProgress(xp)
  assert.deepEqual(at(0), { level: 1, into: 0, needed: 100 })
  assert.deepEqual(at(99), { level: 1, into: 99, needed: 100 })
  assert.deepEqual(at(100), { level: 2, into: 0, needed: 150 })
  assert.deepEqual(at(249), { level: 2, into: 149, needed: 150 })
  assert.deepEqual(at(250), { level: 3, into: 0, needed: 200 })
  assert.deepEqual(at(450), { level: 4, into: 0, needed: 250 })
  assert.deepEqual(at(-20), { level: 1, into: 0, needed: 100 })
  const total = (level: number) => 100 * (level - 1) + 25 * (level - 1) * (level - 2)
  for (const level of [2, 5, 20, 199]) {
    assert.deepEqual(at(total(level)), { level, into: 0, needed: xpToLevelUp(level) })
    assert.equal(at(total(level) - 1).level, level - 1)
  }
})

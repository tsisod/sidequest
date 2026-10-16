import assert from 'node:assert/strict'
import test from 'node:test'
import type { Family, FamilyCommand, Role, Schedule } from '../shared/domain.ts'
import { addDays, parseTimeZone } from '../shared/calendar.ts'
import { defaultKeybinds } from '../shared/keybinds.ts'
import { applyCommand, createFamily, eventReminders, eventsOn, MAX_EVENTS, parseFamily, reconcileFamily } from '../shared/sidequest.ts'
import { MAX_SPARK_REPLY, parseSparkTurns, sparkBriefing, sparkReminder } from '../shared/spark.ts'

const NOW = Date.parse('2026-10-16T08:30:00.000Z')
const DAY = 24 * 60 * 60_000
function initial(): Family {
  const timeZone = parseTimeZone('Europe/London')
  assert.ok(timeZone)
  return createFamily({ id: 'family-one', code: 'ABCDEFGH23', now: NOW, timeZone })
}
const run = (family: Family, command: FamilyCommand, role: Role, now = NOW) => applyCommand(family, command, { role, now })
function plan(family: Family, id: string, title: string, schedule: Schedule, role: Role): Family {
  const outcome = run(family, { kind: 'add-event', id, title, schedule }, role)
  assert.deepEqual(outcome.result, { ok: true })
  return outcome.family
}
const titles = (family: Family, offset: number) => eventsOn(family, addDays(family.sessionDay, offset)).map(event => event.title)

test('parents and children both plan once, daily and weekly events from today onward', () => {
  let family = initial()
  const today = family.sessionDay
  family = plan(family, 'dentist', '  Dentist  ', { kind: 'once', date: addDays(today, 3) }, 'parent')
  family = plan(family, 'piano', 'Piano', { kind: 'weekly', from: today, weekdays: [5] }, 'parent')
  family = plan(family, 'feed-cat', 'Feed the cat', { kind: 'daily', from: addDays(today, 1) }, 'child')
  assert.deepEqual(family.events.map(event => [event.id, event.title, event.createdBy]), [['dentist', 'Dentist', 'parent'], ['piano', 'Piano', 'parent'], ['feed-cat', 'Feed the cat', 'child']])
  assert.deepEqual(titles(family, 0), ['Piano'])
  assert.deepEqual(titles(family, 1), ['Feed the cat'])
  assert.deepEqual(titles(family, 3), ['Dentist', 'Feed the cat'])
  assert.deepEqual(titles(family, 7), ['Piano', 'Feed the cat'])
  assert.deepEqual(titles(family, -1), [])
  assert.deepEqual(family.quests, initial().quests)
})

test('event retries converge, conflicting ids, past days, bad names and a full calendar are refused', () => {
  const family = initial()
  const tomorrow = addDays(family.sessionDay, 1)
  const add: FamilyCommand = { kind: 'add-event', id: 'trip', title: 'Zoo trip', schedule: { kind: 'once', date: tomorrow } }
  const once = run(family, add, 'parent').family
  assert.deepEqual(run(once, add, 'parent'), { family: once, result: { ok: true } })
  assert.equal(run(once, { ...add, title: 'Museum' }, 'parent').result.ok, false)
  assert.equal(run(once, add, 'child').result.ok, false)
  assert.equal(run(family, { ...add, schedule: { kind: 'once', date: addDays(family.sessionDay, -1) } }, 'child').result.ok, false)
  assert.equal(run(family, { ...add, schedule: { kind: 'daily', from: addDays(family.sessionDay, -1) } }, 'parent').result.ok, false)
  assert.equal(run(family, { ...add, title: '   ' }, 'parent').result.ok, false)
  assert.equal(run(family, { ...add, title: 'x'.repeat(81) }, 'parent').result.ok, false)
  const full = { ...family, events: Array.from({ length: MAX_EVENTS }, (_, index) => ({ id: `e${index}`, title: 'Old', schedule: { kind: 'once' as const, date: family.sessionDay }, createdBy: 'parent' as const })) }
  assert.deepEqual(run(full, add, 'parent').result, { ok: false, message: 'The calendar is full. Delete an old event first.' })
})

test('children delete only their own events while parents delete any event', () => {
  let family = initial()
  const tomorrow = addDays(family.sessionDay, 1)
  family = plan(family, 'school-play', 'School play', { kind: 'once', date: tomorrow }, 'parent')
  family = plan(family, 'sleepover', 'Sleepover', { kind: 'once', date: tomorrow }, 'child')
  const refused = run(family, { kind: 'remove-event', eventId: 'school-play' }, 'child')
  assert.deepEqual(refused, { family, result: { ok: false, message: 'Only your parent can delete this event.' } })
  const childRemoved = run(family, { kind: 'remove-event', eventId: 'sleepover' }, 'child')
  assert.deepEqual(childRemoved.family.events.map(event => event.id), ['school-play'])
  assert.deepEqual(run(childRemoved.family, { kind: 'remove-event', eventId: 'sleepover' }, 'child'), { family: childRemoved.family, result: { ok: true } })
  const parentRemoved = run(family, { kind: 'remove-event', eventId: 'sleepover' }, 'parent')
  assert.deepEqual(parentRemoved.family.events.map(event => event.id), ['school-play'])
  assert.deepEqual(run(parentRemoved.family, { kind: 'remove-event', eventId: 'school-play' }, 'parent').family.events, [])
})

test('saved boards without a calendar load empty and planned events survive a save', () => {
  const { events, ...saved } = initial()
  assert.deepEqual(events, [])
  assert.deepEqual(parseFamily(JSON.parse(JSON.stringify(saved))), initial())
  const family = plan(initial(), 'swim', 'Swimming', { kind: 'weekly', from: initial().sessionDay, weekdays: [2, 4] }, 'child')
  assert.deepEqual(parseFamily(JSON.parse(JSON.stringify(family))), family)
  assert.equal(parseFamily({ ...family, events: [...family.events, family.events[0]] }), null)
  assert.equal(parseFamily({ ...family, events: [{ ...family.events[0], createdBy: 'teacher' }] }), null)
  assert.equal(parseFamily({ ...family, events: {} }), null)
})

test('reminders name tomorrow\'s events once per occurrence and move on with the household day', () => {
  let family = initial()
  const today = family.sessionDay
  family = plan(family, 'dentist', 'Dentist', { kind: 'once', date: addDays(today, 1) }, 'parent')
  family = plan(family, 'later', 'Later', { kind: 'once', date: addDays(today, 2) }, 'parent')
  family = plan(family, 'today', 'Today only', { kind: 'once', date: today }, 'child')
  family = plan(family, 'saturday-club', 'Saturday club', { kind: 'weekly', from: today, weekdays: [6] }, 'child')
  assert.deepEqual(eventReminders(family), [{ key: 'dentist@2026-10-17', title: 'Dentist' }, { key: 'saturday-club@2026-10-17', title: 'Saturday club' }])
  const nextDay = reconcileFamily(family, NOW + DAY)
  assert.deepEqual(eventReminders(nextDay), [{ key: 'later@2026-10-18', title: 'Later' }])
  const nextWeek = reconcileFamily(family, NOW + 7 * DAY)
  assert.deepEqual(eventReminders(nextWeek), [{ key: 'saturday-club@2026-10-24', title: 'Saturday club' }])
})

test('Spark reminds the child in one spoken line that fits a reply', () => {
  assert.equal(sparkReminder('Alex', [{ key: 'a', title: 'Dentist' }]), 'Heads up, Alex! Tomorrow on your calendar: Dentist.')
  assert.equal(sparkReminder('Alex', [{ key: 'a', title: 'Dentist' }, { key: 'b', title: 'Piano' }]), 'Heads up, Alex! Tomorrow on your calendar: Dentist and Piano.')
  const many = Array.from({ length: 12 }, (_, index) => ({ key: `e${index}`, title: `${'Event '.repeat(13)}${index}`.slice(0, 80) }))
  const text = sparkReminder('A'.repeat(24), many)
  assert.match(text, /Event 7 and 4 more\.$/)
  assert.ok(text.length <= MAX_SPARK_REPLY)
  assert.ok(parseSparkTurns([{ role: 'child', text: 'hi' }, { role: 'spark', text }, { role: 'child', text: 'what time?' }]))
})

test('the briefing lists this week\'s calendar with who planned each event', () => {
  let family = initial()
  family = plan(family, 'dentist', 'Dentist', { kind: 'once', date: addDays(family.sessionDay, 1) }, 'parent')
  family = plan(family, 'build', 'Build a fort', { kind: 'once', date: family.sessionDay }, 'child')
  const text = sparkBriefing(family, NOW, { name: 'Spark', keybinds: defaultKeybinds })
  assert.match(text, /Calendar events, today and the next week:\n- Friday 16 October \(today\): "Build a fort" \(added by the child\)\n- Saturday 17 October: "Dentist" \(from the parent\)/)
  assert.match(sparkBriefing(initial(), NOW, { name: 'Spark', keybinds: defaultKeybinds }), /Calendar events: none today or in the next week\./)
})

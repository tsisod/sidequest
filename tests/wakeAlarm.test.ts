import assert from 'node:assert/strict'
import test from 'node:test'
import type { Family, FamilyCommand, TimeZone, WakeGameKind, WakeStage } from '../shared/domain.ts'
import { addDays, dateAt, parseDateKey, parseTimeZone } from '../shared/calendar.ts'
import { applyCommand, createFamily, earnedGold, earnedXp, parseFamily } from '../shared/sidequest.ts'
import { alarmInstant, alarmVolume, defaultWakeAlarm, parseAlarmTime, parseWakeAlarm, parseWakeGame, parseWakeSound, randomWakeGame, WAKE_GAMES, wakePhase, wakeReward } from '../shared/wakeAlarm.ts'

const MINUTE = 60_000
const DUE = Date.parse('2026-10-15T00:00:00.000Z')
function zone(value = 'Asia/Bangkok') { const parsed = parseTimeZone(value); assert.ok(parsed); return parsed }
function day(value = '2026-10-15') { const parsed = parseDateKey(value); assert.ok(parsed); return parsed }
function time(value = '07:00') { const parsed = parseAlarmTime(value); assert.ok(parsed); return parsed }
function initial(timeZone: TimeZone = zone(), now = DUE - MINUTE): Family { return createFamily({ id: 'alarm-family', code: 'ABCDEFGH23', now, timeZone }) }
function arm(value = '07:00', now = DUE - MINUTE, family = initial()): Family {
  const result = applyCommand(family, { kind: 'set-wake-alarm', enabled: true, time: time(value) }, { role: 'parent', now })
  assert.equal(result.result.ok, true)
  return result.family
}
function winCommand(family: Family, stage: WakeStage, date = family.wakeAlarm.startsOn): Extract<FamilyCommand, { kind: 'complete-wake-game' }> {
  return { kind: 'complete-wake-game', date, scheduledAt: alarmInstant(date, family.wakeAlarm.time, family.timeZone), stage, game: 'moles' }
}
function win(family: Family, stage: WakeStage, now: number, date = family.wakeAlarm.startsOn) { return applyCommand(family, winCommand(family, stage, date), { role: 'child', now }) }

test('wake defaults are off and only absent data defaults; invalid present data is rejected', () => {
  const family = initial()
  assert.deepEqual(family.wakeAlarm, defaultWakeAlarm({ date: family.sessionDay }))
  assert.deepEqual(wakePhase(family.wakeAlarm, DUE + 10 * MINUTE, family.timeZone), { kind: 'off' })
  assert.deepEqual(parseWakeAlarm(undefined, { date: day() }), defaultWakeAlarm({ date: day() }))
  for (const value of ['7:00', '24:00', '07:60', '07:00:00', '', null, 700]) assert.equal(parseAlarmTime(value), null)
  assert.equal(parseWakeSound('birds'), 'birds')
  assert.equal(parseWakeSound('loud'), null)
  assert.equal(parseWakeAlarm(null, { date: day() }), null)
  const { wakeAlarm, ...old } = family
  assert.equal(wakeAlarm.enabled, false)
  assert.deepEqual(parseFamily(old)?.wakeAlarm, defaultWakeAlarm({ date: family.sessionDay }))
  assert.equal(parseFamily({ ...family, wakeAlarm: undefined }), null)
  assert.equal(parseFamily({ ...family, wakeAlarm: { ...wakeAlarm, time: '99:00' } }), null)
})

test('primary alarm becomes due exactly on time and volume grows in bounded two-second steps', () => {
  const family = arm()
  assert.equal(wakePhase(family.wakeAlarm, DUE - 1, family.timeZone).kind, 'scheduled')
  const ringing = wakePhase(family.wakeAlarm, DUE, family.timeZone)
  assert.deepEqual(ringing, { kind: 'ringing', date: day(), scheduledAt: DUE, ringingAt: DUE, stage: 'first' })
  assert.equal(alarmVolume(-1), 0.2)
  assert.equal(alarmVolume(1_999), 0.2)
  assert.equal(alarmVolume(2_000), 0.25)
  assert.equal(alarmVolume(1_000_000), 0.8)
})

test('first completion waits five minutes; follow-up has one minute to finish, then re-rings', () => {
  const before = arm()
  const first = win(before, 'first', DUE + 10_000)
  assert.equal(first.result.ok, true)
  assert.deepEqual(first.family.wakeAlarm.progress, { kind: 'recheck', date: day(), scheduledAt: DUE, firstPassedAt: DUE + 10_000 })
  const readyAt = DUE + 10_000 + 5 * MINUTE
  const deadlineAt = readyAt + MINUTE
  assert.equal(wakePhase(first.family.wakeAlarm, readyAt - 1, zone()).kind, 'waiting')
  assert.deepEqual(wakePhase(first.family.wakeAlarm, readyAt, zone()), { kind: 'check', date: day(), scheduledAt: DUE, deadlineAt })
  assert.deepEqual(wakePhase(first.family.wakeAlarm, deadlineAt, zone()), { kind: 'ringing', date: day(), scheduledAt: DUE, stage: 'check', ringingAt: deadlineAt })
  const done = win(first.family, 'check', deadlineAt + MINUTE)
  assert.equal(done.result.ok, true)
  assert.equal(wakePhase(done.family.wakeAlarm, deadlineAt + MINUTE, zone()).kind, 'done')
  assert.deepEqual({ ...first.family, wakeAlarm: null }, { ...before, wakeAlarm: null })
  assert.deepEqual({ ...done.family, wakeAlarm: null }, { ...before, wakeAlarm: null })
  assert.deepEqual(done.family.wakeAlarm.results, [{ date: day(), scheduledAt: DUE, wokeAt: DUE + 10_000, xp: 100, gold: 50 }])
  assert.equal(earnedXp(done.family), earnedXp(before) + 100)
  assert.equal(earnedGold(done.family), earnedGold(before) + 50)
})

test('wake reward is full inside a minute, tapers to nothing at fifteen, then costs five gold per five minutes', () => {
  assert.deepEqual(wakeReward(0), { xp: 100, gold: 50 })
  assert.deepEqual(wakeReward(MINUTE - 1), { xp: 100, gold: 50 })
  assert.deepEqual(wakeReward(MINUTE), { xp: 93, gold: 47 })
  assert.deepEqual(wakeReward(14 * MINUTE), { xp: 7, gold: 3 })
  assert.deepEqual(wakeReward(15 * MINUTE), { xp: 0, gold: 0 })
  assert.deepEqual(wakeReward(20 * MINUTE - 1), { xp: 0, gold: 0 })
  assert.deepEqual(wakeReward(20 * MINUTE), { xp: 0, gold: -5 })
  assert.deepEqual(wakeReward(34 * MINUTE), { xp: 0, gold: -15 })
  for (let minute = 1; minute < 60; minute++) {
    const [earlier, later] = [wakeReward((minute - 1) * MINUTE), wakeReward(minute * MINUTE)]
    assert.ok(later.xp <= earlier.xp && later.gold <= earlier.gold, `minute ${minute}`)
  }
})

test('a late wake-up only takes gold the child has, and each day pays out once', () => {
  const armed = arm()
  const quest = 'read-20@2026-10-15'
  const submitted = applyCommand(armed, { kind: 'submit', questId: quest }, { role: 'child', now: DUE - 30_000 }).family
  const funded = applyCommand(submitted, { kind: 'approve', questId: quest }, { role: 'parent', now: DUE - 20_000 }).family
  assert.equal(earnedGold(funded), 5)
  const late = win(funded, 'first', DUE + 40 * MINUTE)
  assert.equal(late.result.ok, true)
  assert.deepEqual(late.family.wakeAlarm.results, [{ date: day(), scheduledAt: DUE, wokeAt: DUE + 40 * MINUTE, xp: 0, gold: -5 }])
  assert.equal(earnedGold(late.family), 0)
  assert.equal(earnedGold(win(armed, 'first', DUE + 40 * MINUTE).family), 0)

  const retimed = applyCommand(late.family, { kind: 'set-wake-alarm', enabled: true, time: time('08:00') }, { role: 'parent', now: DUE + 41 * MINUTE }).family
  const again = win(retimed, 'first', DUE + 60 * MINUTE + 5_000)
  assert.equal(again.result.ok, true)
  assert.equal(again.family.wakeAlarm.results.length, 1)
  assert.equal(earnedXp(again.family), earnedXp(late.family))
})

test('saved wake results round-trip and invalid ones are rejected', () => {
  const family = win(arm(), 'first', DUE + 2 * MINUTE).family
  assert.deepEqual(parseFamily(JSON.parse(JSON.stringify(family))), family)
  const [result] = family.wakeAlarm.results
  assert.equal(parseFamily({ ...family, wakeAlarm: { ...family.wakeAlarm, results: [result, result] } }), null)
  assert.equal(parseFamily({ ...family, wakeAlarm: { ...family.wakeAlarm, results: [{ ...result, xp: 101 }] } }), null)
  assert.equal(parseFamily({ ...family, wakeAlarm: { ...family.wakeAlarm, results: [{ ...result, wokeAt: result.scheduledAt - 1 }] } }), null)
  const { results: _, ...older } = family.wakeAlarm
  assert.deepEqual(parseFamily({ ...family, wakeAlarm: older })?.wakeAlarm.results, [])
})

test('early wins, wrong games, wrong dates and parent gameplay are rejected', () => {
  const family = arm()
  assert.equal(win(family, 'first', DUE - 1).result.ok, false)
  assert.equal(win(family, 'check', DUE).result.ok, false)
  const first = win(family, 'first', DUE).family
  assert.equal(win(first, 'check', DUE + 5 * MINUTE - 1).result.ok, false)
  const action = winCommand(first, 'check')
  assert.equal(applyCommand(first, { ...action, game: 'numbers' as unknown as WakeGameKind }, { role: 'child', now: DUE + 5 * MINUTE }).result.ok, false)
  assert.equal(applyCommand(first, { ...action, game: 'memory' }, { role: 'child', now: DUE + 5 * MINUTE }).result.ok, true)
  assert.equal(win(first, 'check', DUE + 5 * MINUTE, addDays(day(), 1)).result.ok, false)
  assert.equal(applyCommand(first, action, { role: 'parent', now: DUE + 5 * MINUTE }).result.ok, false)
  assert.equal(applyCommand(first, { kind: 'set-wake-alarm', enabled: false, time: time() }, { role: 'child', now: DUE }).result.ok, false)
})

test('successful duplicate wins preserve timestamps and sound changes preserve the ramp schedule', () => {
  const first = win(arm(), 'first', DUE).family
  assert.deepEqual(win(first, 'first', DUE + MINUTE).family, first)
  const changed = applyCommand(first, { kind: 'set-wake-sound', sound: 'birds' }, { role: 'child', now: DUE + MINUTE }).family
  assert.deepEqual(changed.wakeAlarm.progress, first.wakeAlarm.progress)
  assert.deepEqual(wakePhase(changed.wakeAlarm, DUE + 7 * MINUTE, zone()), wakePhase(first.wakeAlarm, DUE + 7 * MINUTE, zone()))
  const done = win(changed, 'check', DUE + 5 * MINUTE).family
  assert.deepEqual(win(done, 'check', DUE + 6 * MINUTE).family, done)
  assert.deepEqual(win(done, 'first', DUE + 6 * MINUTE).family, done)
  assert.equal(parseFamily(done)?.wakeAlarm.progress.kind, 'done')
})

test('identical settings do not rearm; explicit overrides invalidate delayed same-date wins', () => {
  const first = win(arm(), 'first', DUE).family
  const identical = applyCommand(first, { kind: 'set-wake-alarm', enabled: true, time: time() }, { role: 'parent', now: DUE + MINUTE }).family
  assert.deepEqual(identical, first)
  const oldWin = winCommand(first, 'first')
  const changed = arm('07:10', DUE + MINUTE, first)
  assert.equal(changed.wakeAlarm.startsOn, day())
  assert.deepEqual(changed.wakeAlarm.progress, { kind: 'unstarted' })
  assert.equal(applyCommand(changed, oldWin, { role: 'child', now: DUE + 10 * MINUTE }).result.ok, false)
  const actual = win(changed, 'first', DUE + 10 * MINUTE)
  assert.equal(actual.result.ok, true)
  assert.notEqual(actual.family.wakeAlarm.progress.kind, 'unstarted')
  const disabled = applyCommand(actual.family, { kind: 'set-wake-alarm', enabled: false, time: time('07:10') }, { role: 'parent', now: DUE + 11 * MINUTE }).family
  assert.deepEqual(wakePhase(disabled.wakeAlarm, DUE + 12 * MINUTE, zone()), { kind: 'off' })
  assert.equal(win(disabled, 'first', DUE + 12 * MINUTE).result.ok, false)
})

test('arming a passed time starts tomorrow and compares actual instants during a DST fold', () => {
  assert.equal(arm('07:00', DUE + 1).wakeAlarm.startsOn, addDays(day(), 1))
  const ny = zone('America/New_York')
  const secondOneFifteen = Date.parse('2026-11-01T06:15:00.000Z')
  const family = arm('01:30', secondOneFifteen, initial(ny, secondOneFifteen))
  assert.equal(family.wakeAlarm.startsOn, '2026-11-02')
  assert.equal(wakePhase(family.wakeAlarm, secondOneFifteen, ny).kind, 'scheduled')
})

test('previous-date recheck crosses midnight, finishes once, and is superseded by the next scheduled run', () => {
  const due = Date.parse('2026-10-15T16:55:00.000Z')
  const armed = arm('23:55', due - MINUTE, initial(zone(), due - MINUTE))
  const firstAt = due + 4 * MINUTE
  const first = win(armed, 'first', firstAt).family
  const checkAt = firstAt + 5 * MINUTE
  assert.equal(dateAt(checkAt, zone()), '2026-10-16')
  const phase = wakePhase(first.wakeAlarm, checkAt, zone())
  assert.equal(phase.kind, 'check')
  assert.equal(phase.date, '2026-10-15')
  const done = win(first, 'check', checkAt).family
  assert.equal(done.wakeAlarm.progress.kind, 'done')
  assert.equal(wakePhase(done.wakeAlarm, checkAt, zone()).kind, 'scheduled')
  assert.deepEqual(win(done, 'check', checkAt + 1).family, done)
  const newDue = alarmInstant(addDays(day(), 1), time('23:55'), zone())
  assert.equal(win(first, 'check', newDue).result.ok, false)
  const nextPhase = wakePhase(first.wakeAlarm, newDue, zone())
  assert.equal(nextPhase.kind, 'ringing')
  if (nextPhase.kind === 'ringing') { assert.equal(nextPhase.stage, 'first'); assert.equal(nextPhase.date, '2026-10-16') }
  const muchLater = wakePhase(first.wakeAlarm, newDue + 25 * 60 * MINUTE, zone())
  if (muchLater.kind !== 'off') assert.notEqual(muchLater.date, '2026-10-15')
  assert.deepEqual({ ...done, wakeAlarm: null }, { ...armed, wakeAlarm: null })
})

test('each wake-up test rolls whack-a-mole or memory at random, and only those two are accepted', () => {
  assert.deepEqual(WAKE_GAMES, ['moles', 'memory'])
  assert.equal(randomWakeGame(() => 0), 'moles')
  assert.equal(randomWakeGame(() => .4999), 'moles')
  assert.equal(randomWakeGame(() => .5), 'memory')
  assert.equal(randomWakeGame(() => .9999), 'memory')
  assert.equal(randomWakeGame(() => 1), 'memory')
  const rolls = new Set(Array.from({ length: 200 }, () => randomWakeGame()))
  assert.deepEqual([...rolls].sort(), ['memory', 'moles'])
  for (const game of ['moles', 'memory']) assert.equal(parseWakeGame(game), game)
  for (const game of ['numbers', '', null, 1]) assert.equal(parseWakeGame(game), null)
})

test('DST resolution chooses the first repeated minute and earliest valid minute after a gap', () => {
  const ny = zone('America/New_York')
  assert.equal(alarmInstant(day('2026-03-08'), time('02:30'), ny), Date.parse('2026-03-08T07:00:00.000Z'))
  assert.equal(alarmInstant(day('2026-11-01'), time('01:30'), ny), Date.parse('2026-11-01T05:30:00.000Z'))
  assert.equal(alarmInstant(day(), time(), zone()), DUE)
})

test('alarm instant calculation is cached instead of rescanning on display ticks', () => {
  const original = Intl.DateTimeFormat.prototype.formatToParts
  let calls = 0
  Intl.DateTimeFormat.prototype.formatToParts = function (value?: number | Date) { calls++; return original.call(this, value) }
  try {
    const date = day('2033-08-17')
    const scheduled = alarmInstant(date, time('07:13'), zone())
    const calculated = calls
    assert.ok(calculated > 0)
    for (let i = 0; i < 1_000; i++) assert.equal(alarmInstant(date, time('07:13'), zone()), scheduled)
    assert.equal(calls, calculated)
  } finally { Intl.DateTimeFormat.prototype.formatToParts = original }
})

test('stored progress requires valid ordered timestamps and the actual household scheduled instant', () => {
  const first = win(arm(), 'first', DUE).family
  const progress = { kind: 'recheck', date: day(), scheduledAt: DUE, firstPassedAt: DUE - 1 }
  assert.equal(parseFamily({ ...first, wakeAlarm: { ...first.wakeAlarm, progress } }), null)
  assert.equal(parseFamily({ ...first, wakeAlarm: { ...first.wakeAlarm, progress: { ...progress, scheduledAt: DUE - MINUTE, firstPassedAt: DUE } } }), null)
  assert.equal(parseFamily({ ...first, wakeAlarm: { ...first.wakeAlarm, progress: { kind: 'done', date: day(), scheduledAt: DUE, firstPassedAt: DUE, confirmedAt: DUE + 5 * MINUTE - 1 } } }), null)
})

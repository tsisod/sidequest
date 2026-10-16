import assert from 'node:assert/strict'
import test from 'node:test'
import type { Family } from '../shared/domain.ts'
import { parseTimeZone } from '../shared/calendar.ts'
import { applyCommand, createFamily, projectDay } from '../shared/sidequest.ts'
import { parseVoiceTurns, voiceAction, voiceBriefing } from '../shared/parentVoice.ts'

const NOW = Date.parse('2026-10-16T02:00:00.000Z') // 09:00 Friday in Bangkok
function family(): Family {
  const timeZone = parseTimeZone('Asia/Bangkok')
  assert.ok(timeZone)
  return createFamily({ id: 'voice-family', code: 'ABCDEFGH23', now: NOW, timeZone })
}
function run(start: Family, name: string, input: unknown) {
  const action = voiceAction(name, input, { family: start, now: NOW })
  assert.ok('command' in action, JSON.stringify(action))
  const outcome = applyCommand(start, action.command, { role: 'parent', now: NOW })
  return { ...outcome, summary: action.summary }
}
const shower = { title: 'Take a shower', xp: 25, gold: 2, place: 'cottage', repeat: 'once', weekdays: [], date: '' }

test('conversations start and end with the parent and stay within limits', () => {
  assert.deepEqual(parseVoiceTurns([{ role: 'parent', text: ' add a quest ' }]), [{ role: 'parent', text: 'add a quest' }])
  assert.ok(parseVoiceTurns([{ role: 'parent', text: 'add a quest' }, { role: 'assistant', text: 'Which one?' }, { role: 'parent', text: 'Shower' }]))
  assert.equal(parseVoiceTurns([{ role: 'assistant', text: 'Hi' }, { role: 'parent', text: 'add' }]), null)
  assert.equal(parseVoiceTurns([{ role: 'parent', text: 'add' }, { role: 'assistant', text: 'Done' }]), null)
  assert.equal(parseVoiceTurns([{ role: 'parent', text: '   ' }]), null)
  assert.equal(parseVoiceTurns([{ role: 'parent', text: 'x'.repeat(601) }]), null)
  assert.equal(parseVoiceTurns(Array.from({ length: 17 }, () => ({ role: 'parent', text: 'hi' }))), null)
  assert.equal(parseVoiceTurns('add a quest'), null)
})

test('"add take a shower for Alex" becomes a quest for today', () => {
  const { family: next, result, summary } = run(family(), 'add_quest', shower)
  assert.equal(result.ok, true)
  const quest = projectDay(next, '2026-10-16' as never).quests.find(item => item.title === 'Take a shower')
  assert.ok(quest)
  assert.deepEqual({ xp: quest.xp, gold: quest.gold, place: quest.place, status: quest.status }, { xp: 25, gold: 2, place: 'cottage', status: 'todo' })
  assert.equal(projectDay(next, '2026-10-17' as never).quests.some(item => item.title === 'Take a shower'), false)
  assert.equal(summary, 'Added "Take a shower" today, 25 XP and 2 gold')
})

test('repeating, future and clamped quests', () => {
  const daily = run(family(), 'add_quest', { ...shower, title: 'Brush teeth', repeat: 'daily' })
  assert.equal(projectDay(daily.family, '2026-10-20' as never).quests.some(item => item.title === 'Brush teeth'), true)
  assert.match(daily.summary, /every day/)
  const weekly = run(family(), 'add_quest', { ...shower, title: 'Swim practice', place: 'chores', repeat: 'weekly', weekdays: [1, 3, 3, 9] })
  const template = weekly.family.templates.find(item => item.title === 'Swim practice')
  assert.deepEqual(template?.schedule, { kind: 'weekly', from: '2026-10-16', weekdays: [1, 3] })
  const tomorrow = run(family(), 'add_quest', { ...shower, date: '2026-10-17' })
  assert.deepEqual(tomorrow.family.templates.at(-1)?.schedule, { kind: 'once', date: '2026-10-17' })
  assert.match(tomorrow.summary, /on 2026-10-17/)
  const big = run(family(), 'add_quest', { ...shower, xp: 9000, gold: 0.4 })
  assert.deepEqual({ xp: big.family.templates.at(-1)?.xp, gold: big.family.templates.at(-1)?.gold }, { xp: 500, gold: 1 })
})

test('the same quest is not added twice for one day, and the new task id is passed back', () => {
  const once = run(family(), 'add_quest', shower)
  const again = voiceAction('add_quest', { ...shower, title: ' take a SHOWER ' }, { family: once.family, now: NOW })
  assert.ok('error' in again && /already on Alex's list for today .*nothing was added/.test(again.error), JSON.stringify(again))
  const tomorrow = voiceAction('add_quest', { ...shower, date: '2026-10-17' }, { family: once.family, now: NOW })
  assert.ok(!('error' in tomorrow), 'a different day is fine')
  assert.ok('error' in voiceAction('add_quest', { ...shower, title: 'Read for 20 minutes', place: 'library', repeat: 'daily' }, { family: once.family, now: NOW }), 'already a daily quest')
  const action = voiceAction('add_quest', { ...shower, title: 'Feed the dog' }, { family: family(), now: NOW })
  assert.ok('command' in action && action.command.kind === 'add-template' && action.note === `Its task id is "${action.command.id}".`)
})

test('asking for what is already true changes nothing', () => {
  const start = family()
  const check = (name: string, input: unknown, pattern: RegExp) => {
    const action = voiceAction(name, input, { family: start, now: NOW })
    assert.ok('unchanged' in action && pattern.test(action.unchanged), `${name} ${JSON.stringify(action)}`)
  }
  check('pause_game', { paused: false }, /already playable/)
  check('set_wake_alarm', { enabled: false, time: '' }, /already off/)
  check('rename_child', { name: 'Alex' }, /already called Alex/)
  const paused = run(start, 'pause_game', { paused: true }).family
  assert.ok('unchanged' in voiceAction('pause_game', { paused: true }, { family: paused, now: NOW }))
})

test('bad quest requests come back as errors the assistant can explain', () => {
  const check = (input: unknown, pattern: RegExp) => {
    const action = voiceAction('add_quest', input, { family: family(), now: NOW })
    assert.ok('error' in action && pattern.test(action.error), JSON.stringify(input))
  }
  check({ ...shower, title: '' }, /title/)
  check({ ...shower, place: 'moon' }, /place/)
  check({ ...shower, date: '2026-10-15' }, /today or a later day/)
  check({ ...shower, date: 'tomorrow' }, /2026-10-16/)
  check({ ...shower, repeat: 'weekly', weekdays: [] }, /weekday/)
  check({ ...shower, repeat: 'hourly' }, /once, daily or weekly/)
  assert.ok('error' in voiceAction('delete_everything', {}, { family: family(), now: NOW }))
})

test('remove, approve, send back, pause, alarm and rename use the dashboard commands', () => {
  const start = family()
  const removed = run(start, 'remove_task', { task_id: 'tidy-room' })
  assert.equal(removed.result.ok, true)
  assert.equal(projectDay(removed.family, '2026-10-16' as never).quests.some(item => item.templateId === 'tidy-room'), false)
  assert.ok('error' in voiceAction('remove_task', { task_id: 'nope' }, { family: start, now: NOW }))

  const notDone = run(start, 'approve_quest', { quest_id: 'read-20@2026-10-16' })
  assert.equal(notDone.result.ok, false, 'the child has to mark it done first')
  const submitted = applyCommand(start, { kind: 'submit', questId: 'read-20@2026-10-16' }, { role: 'child', now: NOW }).family
  const approved = run(submitted, 'approve_quest', { quest_id: 'read-20@2026-10-16' })
  assert.equal(approved.result.ok, true)
  assert.equal(approved.summary, 'Approved "Read for 20 minutes"')
  assert.equal(run(submitted, 'send_back_quest', { quest_id: 'read-20@2026-10-16' }).family.quests.find(item => item.id === 'read-20@2026-10-16')?.status, 'todo')

  assert.equal(run(start, 'pause_game', { paused: true }).family.clock.kind, 'blocked')
  const alarm = run(start, 'set_wake_alarm', { enabled: true, time: '06:45' })
  assert.deepEqual({ enabled: alarm.family.wakeAlarm.enabled, time: alarm.family.wakeAlarm.time }, { enabled: true, time: '06:45' })
  assert.equal(run(start, 'set_wake_alarm', { enabled: true, time: '' }).family.wakeAlarm.time, '07:00')
  assert.ok('error' in voiceAction('set_wake_alarm', { enabled: true, time: '7am' }, { family: start, now: NOW }))
  assert.equal(run(start, 'rename_child', { name: 'Sam' }).family.childName, 'Sam')
})

test('the briefing lists the ids the assistant may use', () => {
  const text = voiceBriefing(family(), NOW)
  assert.match(text, /Child: Alex\./)
  assert.match(text, /quest id "read-20@2026-10-16": "Read for 20 minutes"/)
  assert.match(text, /task id "tidy-room": "Tidy your room"/)
  assert.match(text, /Wake-up alarm: off/)
  assert.match(text, /Today is 2026-10-16/)
})

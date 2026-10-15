import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DateKey, Quest } from '../shared/domain.ts'
import { smithDialog, smithThanks } from '../src/game/smithDialog.ts'

const exercise = (title: string, status: 'todo' | 'pending' | 'approved' = 'todo'): Quest => {
  const base = { id: `${title}@2026-10-15`, templateId: title, date: '2026-10-15' as DateKey, title, xp: 40, gold: 3, place: 'chores' as const }
  return status === 'todo' ? { ...base, status } : status === 'pending' ? { ...base, status, submittedAt: 1 } : { ...base, status, submittedAt: 1, approvedAt: 2 }
}

test('the blacksmith names the exercise, its reward and how many are left', () => {
  const dialog = smithDialog([exercise('Go for a run'), exercise('Ride your bike'), exercise('Stretch', 'approved')], 'Alex')
  assert.equal(dialog.quest?.title, 'Go for a run')
  assert.equal(dialog.lines[0], 'Ah, Alex! 2 exercises left today.')
  assert.match(dialog.lines[1], /outrun the village dog/)
  assert.equal(dialog.lines[2], 'Your task: Go for a run. It is worth 40 XP and 3 gold.')
  assert.equal(smithDialog([exercise('Swim')], 'Alex').lines[0], 'Ah, Alex! One exercise left today.')
})

test('the lines change with the exercise and cycle through the remaining ones', () => {
  const exercises = [exercise('Go for a run'), exercise('Ride your bike')]
  const next = smithDialog(exercises, 'Alex', 1)
  assert.equal(next.quest?.title, 'Ride your bike')
  assert.equal(next.lines[0], 'Here is another one.')
  assert.match(next.lines[1], /grindstone/)
  assert.equal(smithDialog(exercises, 'Alex', 2).quest?.title, 'Go for a run')
  const comment = (title: string) => smithDialog([exercise(title)], 'Alex').lines[1]
  assert.match(comment('Walk the dog'), /long walk/)
  assert.match(comment('Football practice'), /steady arm/)
  assert.match(comment('10 push-ups'), /heaviest hammer/)
  assert.match(comment('Skipping rope'), /Jump high/)
  assert.match(comment('Yoga'), /Bend like hot iron/)
  assert.match(comment('Dance class'), /rhythm/)
  assert.match(comment('Move your body'), /strong body/)
  assert.match(comment('Brunch'), /strong body/)
})

test('waiting, finished and empty days get their own lines', () => {
  assert.deepEqual(smithDialog([exercise('Go for a run', 'pending')], 'Alex'), { quest: null, lines: ['I\'ve sent word to your parent about "Go for a run".', 'Come back once they have looked it over.'] })
  assert.equal(smithDialog([exercise('Run', 'pending'), exercise('Swim', 'pending')], 'Alex').lines[1], 'That makes 2 exercises waiting for a check.')
  assert.deepEqual(smithDialog([exercise('Go for a run', 'approved')], 'Alex'), { quest: null, lines: ['Every exercise is done, Alex!', 'You are growing as strong as forged steel.'] })
  assert.deepEqual(smithDialog([], 'Alex'), { quest: null, lines: ['No exercise today, Alex. The forge is quiet.', 'Go and enjoy the village!'] })
})

test('after an exercise is handed in the blacksmith thanks the child and counts what is left', () => {
  assert.deepEqual(smithThanks(2, 'Alex'), ["Good work, Alex! I'll send word to your parent.", '2 exercises to go. Ready for the next one?'])
  assert.deepEqual(smithThanks(0, 'Alex'), ["Good work, Alex! I'll send word to your parent.", 'That was your last exercise today. Well done!'])
})

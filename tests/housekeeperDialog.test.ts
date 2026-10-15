import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DateKey, Quest } from '../shared/domain.ts'
import { housekeeperDialog, housekeeperThanks } from '../src/game/housekeeperDialog.ts'

const chore = (title: string, status: 'todo' | 'pending' | 'approved' = 'todo'): Quest => {
  const base = { id: `${title}@2026-10-15`, templateId: title, date: '2026-10-15' as DateKey, title, xp: 50, gold: 4, place: 'cottage' as const }
  return status === 'todo' ? { ...base, status } : status === 'pending' ? { ...base, status, submittedAt: 1 } : { ...base, status, submittedAt: 1, approvedAt: 2 }
}

test('the housekeeper names the chore, its reward and how many are left', () => {
  const dialog = housekeeperDialog([chore('Wash the dishes'), chore('Feed the cat'), chore('Rake leaves', 'approved')], 'Alex')
  assert.equal(dialog.quest?.title, 'Wash the dishes')
  assert.equal(dialog.lines[0], 'Hi, Alex! 2 chores to do around the cottage today.')
  assert.match(dialog.lines[1], /Bubbles everywhere/)
  assert.equal(dialog.lines[2], 'Your task: Wash the dishes. It is worth 50 XP and 4 gold.')
  assert.equal(housekeeperDialog([chore('Feed the cat')], 'Alex').lines[0], 'Hi, Alex! One chore to do around the cottage today.')
})

test('the lines change with the chore and cycle through the remaining ones', () => {
  const chores = [chore('Wash the dishes'), chore('Feed the cat')]
  const next = housekeeperDialog(chores, 'Alex', 1)
  assert.equal(next.quest?.title, 'Feed the cat')
  assert.equal(next.lines[0], 'Ooh, here is another one.')
  assert.match(next.lines[1], /animal friends/)
  assert.equal(housekeeperDialog(chores, 'Alex', 2).quest?.title, 'Wash the dishes')
  const comment = (title: string) => housekeeperDialog([chore(title)], 'Alex').lines[1]
  assert.match(comment('Make your bed'), /neatly made bed/)
  assert.match(comment('Tidy your room'), /favourite things/)
  assert.match(comment('Fold the laundry'), /No sock left behind/)
  assert.match(comment('Water the flowers'), /Flowers grow happiest/)
  assert.match(comment('Vacuum the stairs'), /sparkles/)
  assert.match(comment('Take out the bins'), /rubbish/)
  assert.match(comment('Help with the shopping'), /a place for everything/)
  assert.match(comment('Brush your teeth'), /Many hands/)
})

test('waiting, finished and empty days get their own lines', () => {
  assert.deepEqual(housekeeperDialog([chore('Make your bed', 'pending')], 'Alex'), { quest: null, lines: ['I\'ve told your parent about "Make your bed".', 'Come back once they have checked it.'] })
  assert.equal(housekeeperDialog([chore('Bed', 'pending'), chore('Dishes', 'pending')], 'Alex').lines[1], 'That makes 2 chores waiting for a check.')
  assert.deepEqual(housekeeperDialog([chore('Make your bed', 'approved')], 'Alex'), { quest: null, lines: ['Every chore is done, Alex!', 'The whole cottage is sparkling, thanks to you.'] })
  assert.deepEqual(housekeeperDialog([], 'Alex'), { quest: null, lines: ['No chores today, Alex! The cottage is spick and span.', 'Go and have fun in the village!'] })
})

test('after a chore is handed in the housekeeper thanks the child and counts what is left', () => {
  assert.deepEqual(housekeeperThanks(2, 'Alex'), ["Thank you, Alex! I'll tell your parent you did it.", '2 chores to go. Ready for the next one?'])
  assert.deepEqual(housekeeperThanks(0, 'Alex'), ["Thank you, Alex! I'll tell your parent you did it.", 'That was your last chore today. Hooray!'])
})

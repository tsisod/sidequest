import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DateKey, Quest } from '../shared/domain.ts'
import { librarianDialog, librarianThanks } from '../src/game/librarianDialog.ts'

const task = (title: string, status: 'todo' | 'pending' | 'approved' = 'todo'): Quest => {
  const base = { id: `${title}@2026-10-15`, templateId: title, date: '2026-10-15' as DateKey, title, xp: 30, gold: 2, place: 'library' as const }
  return status === 'todo' ? { ...base, status } : status === 'pending' ? { ...base, status, submittedAt: 1 } : { ...base, status, submittedAt: 1, approvedAt: 2 }
}

test('the librarian names the task, its reward and how many are left', () => {
  const dialog = librarianDialog([task('Read for 20 minutes'), task('Times tables'), task('Spelling list', 'approved')], 'Alex')
  assert.equal(dialog.quest?.title, 'Read for 20 minutes')
  assert.equal(dialog.lines[0], 'Hello, Alex! I have 2 tasks on my desk for you today.')
  assert.match(dialog.lines[1], /Every book is a door/)
  assert.equal(dialog.lines[2], 'Your task: Read for 20 minutes. It is worth 30 XP and 2 gold.')
  assert.equal(librarianDialog([task('Times tables')], 'Alex').lines[0], 'Hello, Alex! I have one task on my desk for you today.')
})

test('the librarian comments on the kind of study and cycles through the remaining tasks', () => {
  const tasks = [task('Read for 20 minutes'), task('Maths worksheet')]
  const next = librarianDialog(tasks, 'Alex', 1)
  assert.equal(next.quest?.title, 'Maths worksheet')
  assert.equal(next.lines[0], 'Let me find another one.')
  assert.match(next.lines[1], /Numbers are puzzles/)
  assert.equal(librarianDialog(tasks, 'Alex', 2).quest?.title, 'Read for 20 minutes')
  const comment = (title: string) => librarianDialog([task(title)], 'Alex').lines[1]
  assert.match(comment('Spelling words'), /Words are the bricks/)
  assert.match(comment('Write a thank-you letter'), /single sentence/)
  assert.match(comment('Piano practice'), /sings in the end/)
  assert.match(comment('French homework'), /new language/)
  assert.match(comment('Science homework'), /asking why/)
  assert.match(comment('Revise for the quiz'), /bookshelf/)
  assert.match(comment('Get ready for school'), /curious mind/)
  assert.match(comment('Start the summary'), /curious mind/)
})

test('waiting, finished and empty days get their own lines', () => {
  assert.deepEqual(librarianDialog([task('Read for 20 minutes', 'pending')], 'Alex'), { quest: null, lines: ['I\'ve sent "Read for 20 minutes" to your parent to look over.', 'Come back once they have checked it.'] })
  assert.equal(librarianDialog([task('Read', 'pending'), task('Maths', 'pending')], 'Alex').lines[1], 'That makes 2 tasks waiting for a check.')
  assert.deepEqual(librarianDialog([task('Read for 20 minutes', 'approved')], 'Alex'), { quest: null, lines: ['Every study task is done, Alex!', 'Your mind has had a splendid workout today.'] })
  assert.equal(librarianDialog([], 'Alex').quest, null)
})

test('after a task is handed in the librarian thanks the child and counts what is left', () => {
  assert.deepEqual(librarianThanks(1, 'Alex'), ["Splendid work, Alex! I'll send it to your parent to check.", '1 task to go. Shall we find the next one?'])
  assert.deepEqual(librarianThanks(0, 'Alex'), ["Splendid work, Alex! I'll send it to your parent to check.", 'That was your last study task today. Well done!'])
})

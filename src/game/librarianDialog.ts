import type { Quest } from '../../shared/domain'
import type { QuestTalk } from './villagers'

const flavor: [RegExp, string][] = [
  [/spell|vocab|phonics|\bwords?\b/i, 'Words are the bricks that every story is built from.'],
  [/\bread(ing)?\b|book|chapter|\bstor(y|ies)\b|novel|comic/i, 'Every book is a door. You only have to open it.'],
  [/writ|essay|journal|diary|letter|poem/i, 'Even the thickest book began with a single sentence.'],
  [/math|\bsums?\b|times ?table|multipl|divi(de|sion)|fraction|number|\bcount/i, 'Numbers are puzzles, and puzzles are meant to be solved.'],
  [/scien|experiment|nature|planet/i, 'Every great discovery began with someone asking why.'],
  [/histor|geograph|\bmaps?\b|countr/i, 'The past is full of true stories, waiting to be found.'],
  [/french|spanish|german|italian|chinese|mandarin|japanese|latin|language/i, 'A new language is a key to a whole new library.'],
  [/piano|guitar|violin|music|instrument|recorder|\bsing|drum/i, 'Practice is quiet work, but it sings in the end.'],
  [/\bart\b|draw|paint|sketch|colou?r/i, 'Even the finest books need pictures.'],
  [/\bcod(e|ing)\b|program|computer|typing/i, 'A computer only knows what you teach it, one careful step at a time.'],
  [/homework|study|revis|\btest|quiz|exam|worksheet|lesson|practi[cs]e/i, 'A little study every day fills a whole bookshelf in time.'],
]

function flavorFor(title: string): string {
  return flavor.find(([pattern]) => pattern.test(title))?.[1] ?? 'A curious mind is the finest book in any library.'
}

const plural = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`

export function librarianDialog(tasks: readonly Quest[], childName: string, taskIndex = 0): QuestTalk {
  const todo = tasks.filter(quest => quest.status === 'todo')
  const pending = tasks.filter(quest => quest.status === 'pending')
  if (tasks.length === 0) return { quest: null, lines: [`No study tasks today, ${childName}. The reading room is quiet.`, 'Off you go and explore the village!'] }
  if (todo.length === 0 && pending.length > 0) {
    return { quest: null, lines: [`I've sent "${pending[0].title}" to your parent to look over.`, pending.length === 1 ? 'Come back once they have checked it.' : `That makes ${plural(pending.length)} waiting for a check.`] }
  }
  if (todo.length === 0) return { quest: null, lines: [`Every study task is done, ${childName}!`, 'Your mind has had a splendid workout today.'] }
  const task = todo[taskIndex % todo.length]
  return {
    quest: task,
    lines: [
      taskIndex === 0 ? `Hello, ${childName}! I have ${todo.length === 1 ? 'one task' : `${todo.length} tasks`} on my desk for you today.` : 'Let me find another one.',
      flavorFor(task.title),
      `Your task: ${task.title}. It is worth ${task.xp} XP and ${task.gold} gold.`,
    ],
  }
}

export function librarianThanks(remaining: number, childName: string): string[] {
  return [`Splendid work, ${childName}! I'll send it to your parent to check.`, remaining > 0 ? `${plural(remaining)} to go. Shall we find the next one?` : 'That was your last study task today. Well done!']
}

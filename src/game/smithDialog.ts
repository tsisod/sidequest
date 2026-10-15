import type { Quest } from '../../shared/domain'
import type { QuestTalk } from './villagers'

const flavor: [RegExp, string][] = [
  [/\brun|jog|sprint|\brace/i, 'Quick feet! You will soon outrun the village dog.'],
  [/walk|hike|stroll|\bsteps\b/i, 'A long walk clears the head, like cool water on hot iron.'],
  [/bike|cycl|scoot|skat/i, 'Keep those wheels turning, like my grindstone.'],
  [/swim|pool/i, 'Swimming makes you strong from head to toe.'],
  [/ball|tennis|cricket|rugby|hockey|catch|throw|kick/i, 'Every good throw starts with a steady arm.'],
  [/stretch|yoga|balance|bend/i, 'Bend like hot iron and you will never break.'],
  [/jump|skip|trampoline|\bhop/i, 'Jump high! The sparks from my forge do it all day.'],
  [/push.?up|press.?up|sit.?up|squat|plank|lunge|burpee|strength|weight|\blift/i, 'Strong arms swing the heaviest hammer.'],
  [/danc/i, 'Even my hammer keeps a rhythm. Dance to the beat!'],
  [/climb/i, 'Climb steady, one hold at a time.'],
]

function flavorFor(title: string): string {
  return flavor.find(([pattern]) => pattern.test(title))?.[1] ?? 'A strong body is the best tool a hero can carry.'
}

const plural = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`

export function smithDialog(exercises: readonly Quest[], childName: string, exerciseIndex = 0): QuestTalk {
  const todo = exercises.filter(quest => quest.status === 'todo')
  const pending = exercises.filter(quest => quest.status === 'pending')
  if (exercises.length === 0) return { quest: null, lines: [`No exercise today, ${childName}. The forge is quiet.`, 'Go and enjoy the village!'] }
  if (todo.length === 0 && pending.length > 0) {
    return { quest: null, lines: [`I've sent word to your parent about "${pending[0].title}".`, pending.length === 1 ? 'Come back once they have looked it over.' : `That makes ${plural(pending.length)} waiting for a check.`] }
  }
  if (todo.length === 0) return { quest: null, lines: [`Every exercise is done, ${childName}!`, 'You are growing as strong as forged steel.'] }
  const exercise = todo[exerciseIndex % todo.length]
  return {
    quest: exercise,
    lines: [
      exerciseIndex === 0 ? `Ah, ${childName}! ${todo.length === 1 ? 'One exercise' : `${todo.length} exercises`} left today.` : 'Here is another one.',
      flavorFor(exercise.title),
      `Your task: ${exercise.title}. It is worth ${exercise.xp} XP and ${exercise.gold} gold.`,
    ],
  }
}

export function smithThanks(remaining: number, childName: string): string[] {
  return [`Good work, ${childName}! I'll send word to your parent.`, remaining > 0 ? `${plural(remaining)} to go. Ready for the next one?` : 'That was your last exercise today. Well done!']
}

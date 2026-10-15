import type { Quest } from '../../shared/domain'
import type { QuestTalk } from './villagers'

const flavor: [RegExp, string][] = [
  [/dish|plate|wash up|sink|cup/i, 'Bubbles everywhere! Dishes are more fun with lots of bubbles.'],
  [/\bbed\b|make.*bed/i, 'A neatly made bed is the best thing to come home to.'],
  [/room|tidy|clean|mess|toys/i, 'A tidy room means you can always find your favourite things.'],
  [/trash|garbage|rubbish|bin|recycl/i, 'Out with the rubbish! The butterflies will thank you.'],
  [/laundry|clothes|sock|fold|washing/i, 'Match every sock and fold them neat. No sock left behind!'],
  [/dog|cat|pet|feed|fish|hamster|rabbit/i, 'Our animal friends count on us. Just ask the dog by the door!'],
  [/table|dinner|lunch|breakfast|cook|bak/i, 'A well set table makes every meal feel like a feast.'],
  [/plant|water|garden|weed|leaves|rake|flower/i, 'Flowers grow happiest when someone looks after them. So do butterflies!'],
  [/vacuum|hoover|sweep|mop|dust|floor/i, 'Sweep away the dust and the whole cottage sparkles.'],
  [/window|mirror|glass/i, 'Shiny windows let in all the sunshine.'],
  [/shopping|groceries|unpack|put away/i, 'Everything in its place, and a place for everything.'],
  [/car|bike|shoe|boot|polish/i, 'Give it a shine so it looks brand new.'],
]

function flavorFor(title: string): string {
  return flavor.find(([pattern]) => pattern.test(title))?.[1] ?? 'Many hands make light work. Thank you for helping!'
}

const plural = (count: number) => `${count} ${count === 1 ? 'chore' : 'chores'}`

export function housekeeperDialog(chores: readonly Quest[], childName: string, choreIndex = 0): QuestTalk {
  const todo = chores.filter(quest => quest.status === 'todo')
  const pending = chores.filter(quest => quest.status === 'pending')
  if (chores.length === 0) return { quest: null, lines: [`No chores today, ${childName}! The cottage is spick and span.`, 'Go and have fun in the village!'] }
  if (todo.length === 0 && pending.length > 0) {
    return { quest: null, lines: [`I've told your parent about "${pending[0].title}".`, pending.length === 1 ? 'Come back once they have checked it.' : `That makes ${plural(pending.length)} waiting for a check.`] }
  }
  if (todo.length === 0) return { quest: null, lines: [`Every chore is done, ${childName}!`, 'The whole cottage is sparkling, thanks to you.'] }
  const chore = todo[choreIndex % todo.length]
  return {
    quest: chore,
    lines: [
      choreIndex === 0 ? `Hi, ${childName}! ${todo.length === 1 ? 'One chore' : `${todo.length} chores`} to do around the cottage today.` : 'Ooh, here is another one.',
      flavorFor(chore.title),
      `Your task: ${chore.title}. It is worth ${chore.xp} XP and ${chore.gold} gold.`,
    ],
  }
}

export function housekeeperThanks(remaining: number, childName: string): string[] {
  return [`Thank you, ${childName}! I'll tell your parent you did it.`, remaining > 0 ? `${plural(remaining)} to go. Ready for the next one?` : 'That was your last chore today. Hooray!']
}

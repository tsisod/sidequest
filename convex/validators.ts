import { v } from 'convex/values'

export const roleValidator = v.union(v.literal('parent'), v.literal('child'))
const place = v.union(v.literal('library'), v.literal('cottage'), v.literal('chores'), v.literal('garden'))
const baseQuest = { id: v.string(), title: v.string(), xp: v.number(), gold: v.number(), place }
const progress = <T extends typeof baseQuest>(base: T) => v.union(
  v.object({ ...base, status: v.literal('todo') }),
  v.object({ ...base, status: v.literal('pending'), submittedAt: v.number() }),
  v.object({ ...base, status: v.literal('approved'), submittedAt: v.number(), approvedAt: v.number() }),
)
export const scheduleValidator = v.union(
  v.object({ kind: v.literal('once'), date: v.string() }),
  v.object({ kind: v.literal('daily'), from: v.string() }),
  v.object({ kind: v.literal('weekly'), from: v.string(), weekdays: v.array(v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal(6), v.literal(7))) }),
)
const template = v.object({ ...baseQuest, schedule: scheduleValidator, endsBefore: v.union(v.string(), v.null()) })
const quest = progress({ ...baseQuest, templateId: v.string(), date: v.string() })
const wakeSound = v.union(v.literal('classic'), v.literal('chimes'), v.literal('birds'))
const wakeGame = v.union(v.literal('moles'), v.literal('memory'), v.literal('numbers'))
const wakeStage = v.union(v.literal('first'), v.literal('check'))
const wakeProgress = v.union(
  v.object({ kind: v.literal('unstarted') }),
  v.object({ kind: v.literal('recheck'), date: v.string(), scheduledAt: v.number(), firstPassedAt: v.number() }),
  v.object({ kind: v.literal('done'), date: v.string(), scheduledAt: v.number(), firstPassedAt: v.number(), confirmedAt: v.number() }),
)
const wakeResult = v.object({ date: v.string(), scheduledAt: v.number(), wokeAt: v.number(), xp: v.number(), gold: v.number() })
export const wakeAlarmValidator = v.object({ enabled: v.boolean(), time: v.string(), startsOn: v.string(), sound: wakeSound, progress: wakeProgress, results: v.optional(v.array(wakeResult)) })
export const familyValidator = v.object({
  version: v.literal(3), id: v.string(), code: v.string(), childName: v.string(), createdAt: v.number(), screenMinutes: v.number(),
  wakeAlarm: v.optional(wakeAlarmValidator), timeZone: v.string(), sessionDay: v.string(), allowanceGranted: v.boolean(), allowanceUsedMs: v.number(), templates: v.array(template), quests: v.array(quest),
  clock: v.union(
    v.object({ kind: v.literal('paused'), remainingMs: v.number() }),
    v.object({ kind: v.literal('running'), endsAt: v.number(), startedAt: v.number() }),
    v.object({ kind: v.literal('blocked'), remainingMs: v.number() }),
  ),
})
export const commandValidator = v.union(
  v.object({ kind: v.literal('set-wake-alarm'), enabled: v.boolean(), time: v.string() }),
  v.object({ kind: v.literal('set-wake-sound'), sound: wakeSound }),
  v.object({ kind: v.literal('complete-wake-game'), date: v.string(), scheduledAt: v.number(), stage: wakeStage, game: wakeGame }),
  v.object({ kind: v.literal('add-template'), ...baseQuest, schedule: scheduleValidator }),
  v.object({ kind: v.literal('remove-template'), templateId: v.string() }),
  v.object({ kind: v.literal('approve'), questId: v.string() }),
  v.object({ kind: v.literal('return'), questId: v.string() }),
  v.object({ kind: v.literal('set-screen-time'), minutes: v.number() }),
  v.object({ kind: v.literal('set-blocked'), blocked: v.boolean() }),
  v.object({ kind: v.literal('rename-child'), name: v.string() }),
  v.object({ kind: v.literal('submit'), questId: v.string() }),
  v.object({ kind: v.literal('start-play') }),
  v.object({ kind: v.literal('pause-play') }),
)

export const legacyCommandValidator = v.union(
  v.object({ kind: v.literal('add-quest'), ...baseQuest }),
  v.object({ kind: v.literal('remove-quest'), questId: v.string() }),
)

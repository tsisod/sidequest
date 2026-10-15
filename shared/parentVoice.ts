import type { DateKey, Family, FamilyCommand, Place, Quest, Schedule, TaskTemplate, Weekday } from './domain.ts'
import { dateAt, parseDateKey } from './calendar.ts'
import { isRecord, parsePlace, projectDay } from './sidequest.ts'
import { parseAlarmTime } from './wakeAlarm.ts'

export const MAX_VOICE_TURNS = 16
export const MAX_VOICE_TEXT = 600
export type VoiceTurn = { role: 'parent' | 'assistant'; text: string }
export const MAX_VOICE_CLIP_BYTES = 2_000_000
/** `heard` is what the parent said (typed, or transcribed from their recording); it is empty when the recording held no words. */
export type VoiceReply = { ok: true; heard: string; reply: string; changes: string[] } | { ok: false; message: string }
export type VoiceClip = { audio: ArrayBuffer; mimeType: string; language: string }
export type VoiceApi = {
  ask: (turns: VoiceTurn[]) => Promise<VoiceReply>
  listen: (clip: VoiceClip, earlier: VoiceTurn[]) => Promise<VoiceReply>
}

/** A conversation must start and end with the parent speaking, so there is always something to answer. */
export function parseVoiceTurns(value: unknown): VoiceTurn[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_VOICE_TURNS) return null
  const turns: VoiceTurn[] = []
  for (const raw of value) {
    if (!isRecord(raw) || (raw.role !== 'parent' && raw.role !== 'assistant') || typeof raw.text !== 'string') return null
    const text = raw.text.trim()
    if (!text || text.length > MAX_VOICE_TEXT) return null
    turns.push({ role: raw.role, text })
  }
  return turns[0].role === 'parent' && turns[turns.length - 1].role === 'parent' ? turns : null
}

export const voiceGuide = `You are the voice assistant on the parent dashboard of Sidequest, a family app. A parent gives their child quests (real-life tasks), approves finished quests to award XP and gold, can pause the child's game, and sets a daily wake-up alarm. The parent is talking to you and your replies are read aloud.

Carry out what the parent asks with the tools, using the family state that follows. Reply in one or two short spoken sentences that confirm what changed, for example: "Done. Alex has Take a shower today for 25 XP and 2 gold." When you call tools, write that confirmation in the same message as the tool calls, as if they succeeded: it is read aloud straight away, and you only get another turn if a tool fails. Never use markdown, lists, emoji or ids in a reply.

Adding quests:
- Make a short title in sentence case from what the parent said, such as "Take a shower" or "Read for 20 minutes".
- A quest is for today only unless the parent says otherwise. "Every day" means daily; named weekdays mean weekly on those days; "tomorrow" or a date means once on that date.
- Place: library for reading, homework and learning; cottage for chores, tidying, hygiene and helping at home; chores for exercise, sport and outdoor play (it is the blacksmith's training yard).
- If the parent names no reward: quick tasks 25 XP and 2 gold, medium tasks 50 XP and 4 gold, big tasks 75 XP and 5 gold. XP must be 1 to 500 and gold 1 to 100.

Quest and task ids come only from the family state; never invent one. When a request could match more than one quest or task, ask one short question instead of guessing. If a tool returns an error, say briefly what went wrong. If Sidequest cannot do what was asked, say so in one sentence. If the parent is chatting or saying thanks, answer briefly and warmly.`

const placeNames: Record<Place, string> = { library: 'library (learning)', cottage: 'cottage (chores at home)', chores: 'training yard (exercise)' }
const statusNames: Record<Quest['status'], string> = { todo: 'not done yet', pending: 'done by the child, waiting for your approval', approved: 'approved' }
const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function scheduleText(schedule: Schedule): string {
  if (schedule.kind === 'once') return `once on ${schedule.date}`
  if (schedule.kind === 'daily') return `every day from ${schedule.from}`
  return `every ${schedule.weekdays.map(day => dayNames[day]).join(', ')} from ${schedule.from}`
}

/** The per-request state block: who the child is, today's quests and the tasks that create them, the game and the alarm. */
export function voiceBriefing(family: Family, now: number): string {
  const today = dateAt(now, family.timeZone)
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: family.timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now)
  const quests = projectDay(family, today).quests
  const tasks = family.templates.filter(template => template.endsBefore === null || template.endsBefore > today)
  return [
    `Family state. Now: ${clock} (${family.timeZone}). Today is ${today}.`,
    `Child: ${family.childName}.`,
    `Today's quests:${quests.length ? '' : ' none.'}`,
    ...quests.map(quest => `- quest id "${quest.id}": "${quest.title}", ${placeNames[quest.place]}, ${quest.xp} XP, ${quest.gold} gold, ${statusNames[quest.status]}`),
    `Tasks that create quests:${tasks.length ? '' : ' none.'}`,
    ...tasks.map(task => `- task id "${task.id}": "${task.title}", ${placeNames[task.place]}, ${task.xp} XP, ${task.gold} gold, ${scheduleText(task.schedule)}`),
    `Game: ${family.clock.kind === 'blocked' ? 'paused by the parent' : 'the child can play'}.`,
    `Wake-up alarm: ${family.wakeAlarm.enabled ? `on at ${family.wakeAlarm.time} every day` : `off (last time ${family.wakeAlarm.time})`}.`,
  ].join('\n')
}

export type VoiceAction = { command: FamilyCommand; summary: string } | { error: string }
type Input = Record<string, unknown>

const text = (input: Input, key: string) => typeof input[key] === 'string' ? input[key].trim() : ''
const whole = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : null
function slug(title: string): string { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'quest' }

function addTask(input: Input, family: Family, now: number): VoiceAction {
  const title = text(input, 'title').replace(/\s+/g, ' ')
  if (!title || title.length > 80) return { error: 'The quest title must be 1 to 80 characters.' }
  const xp = whole(input.xp, 1, 500)
  const gold = whole(input.gold, 1, 100)
  const place = parsePlace(input.place)
  if (xp === null || gold === null || !place) return { error: 'Give XP (1-500), gold (1-100) and a place: library, cottage or chores.' }
  const today = dateAt(now, family.timeZone)
  let schedule: Schedule
  if (input.repeat === 'daily') schedule = { kind: 'daily', from: today }
  else if (input.repeat === 'weekly') {
    const days = Array.isArray(input.weekdays) ? [...new Set(input.weekdays.filter((day): day is Weekday => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b) : []
    if (!days.length) return { error: 'A weekly quest needs at least one weekday (1 = Monday to 7 = Sunday).' }
    schedule = { kind: 'weekly', from: today, weekdays: days }
  } else if (input.repeat === 'once') {
    const date: DateKey | null = text(input, 'date') ? parseDateKey(text(input, 'date')) : today
    if (!date) return { error: 'Dates must look like 2026-10-16.' }
    if (date < today) return { error: 'Quests can only be added for today or a later day.' }
    schedule = { kind: 'once', date }
  } else return { error: 'Repeat must be once, daily or weekly.' }
  const when = schedule.kind === 'once' ? schedule.date === today ? 'today' : `on ${schedule.date}` : scheduleText(schedule).replace(/ from .*$/, '')
  return { command: { kind: 'add-template', id: `${slug(title)}-${now.toString(36)}`, title, xp, gold, place, schedule }, summary: `Added "${title}" ${when}, ${xp} XP and ${gold} gold` }
}

function findTask(family: Family, id: string): TaskTemplate | null { return family.templates.find(template => template.id === id) ?? null }
function findQuest(family: Family, now: number, id: string): Quest | null {
  return projectDay(family, dateAt(now, family.timeZone)).quests.find(quest => quest.id === id) ?? family.quests.find(quest => quest.id === id) ?? null
}

/** Turns one tool call into the same family command the dashboard buttons send, or an error to hand back to the model. */
export function voiceAction(name: string, rawInput: unknown, { family, now }: { family: Family; now: number }): VoiceAction {
  const input: Input = isRecord(rawInput) ? rawInput : {}
  switch (name) {
    case 'add_quest': return addTask(input, family, now)
    case 'remove_task': {
      const task = findTask(family, text(input, 'task_id'))
      return task ? { command: { kind: 'remove-template', templateId: task.id }, summary: `Removed "${task.title}"` } : { error: 'There is no task with that id.' }
    }
    case 'approve_quest':
    case 'send_back_quest': {
      const quest = findQuest(family, now, text(input, 'quest_id'))
      if (!quest) return { error: 'There is no quest with that id.' }
      return name === 'approve_quest'
        ? { command: { kind: 'approve', questId: quest.id }, summary: `Approved "${quest.title}"` }
        : { command: { kind: 'return', questId: quest.id }, summary: `Sent "${quest.title}" back to do again` }
    }
    case 'pause_game':
      if (typeof input.paused !== 'boolean') return { error: 'Say whether the game should be paused.' }
      return { command: { kind: 'set-blocked', blocked: input.paused }, summary: input.paused ? 'Paused the game' : 'Unpaused the game' }
    case 'set_wake_alarm': {
      if (typeof input.enabled !== 'boolean') return { error: 'Say whether the alarm should be on.' }
      const time = text(input, 'time') ? parseAlarmTime(text(input, 'time')) : family.wakeAlarm.time
      if (!time) return { error: 'Alarm times use 24-hour HH:MM, like 07:00.' }
      return { command: { kind: 'set-wake-alarm', enabled: input.enabled, time }, summary: input.enabled ? `Wake-up alarm on at ${time}` : 'Wake-up alarm off' }
    }
    case 'rename_child': {
      const childName = text(input, 'name')
      if (!childName || childName.length > 24) return { error: 'Names must be 1 to 24 characters.' }
      return { command: { kind: 'rename-child', name: childName }, summary: `Renamed your child to ${childName}` }
    }
    default: return { error: 'That tool is not available.' }
  }
}

import type { ActionResult, DateKey, Family, FamilyCommand, Place, PlayClock, ProjectDay, Quest, Role, Schedule, TaskTemplate, TimeZone, Weekday } from './domain.ts'
import { alarmInstant, defaultWakeAlarm, parseAlarmTime, parseWakeAlarm, parseWakeGame, parseWakeSound, wakePhase, wakeReward } from './wakeAlarm.ts'
import { addDays, dateAt, nextDayBoundary, parseDateKey, parseTimeZone, weekdayOf } from './calendar.ts'

const MINUTE = 60_000
const MAX_TIME = 24 * 60 * MINUTE
const success: ActionResult = { ok: true }
const failure = (message: string): ActionResult => ({ ok: false, message })
export const finiteTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
export const validText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
export const whole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
const legacyChorePlace = 'garden'
export function parsePlace(value: unknown): Place | null {
  if (value === legacyChorePlace) return 'cottage'
  return value === 'library' || value === 'cottage' || value === 'chores' ? value : null
}
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
const isWeekday = (value: unknown): value is Weekday => whole(value, 7)
export function parseSchedule(value: unknown): Schedule | null {
  if (!isRecord(value)) return null
  if (value.kind === 'once') { const date = parseDateKey(value.date); return date ? { kind: 'once', date } : null }
  const from = parseDateKey(value.from)
  if (!from) return null
  if (value.kind === 'daily') return { kind: 'daily', from }
  if (value.kind !== 'weekly' || !Array.isArray(value.weekdays) || !value.weekdays.length || !value.weekdays.every(isWeekday) || new Set(value.weekdays).size !== value.weekdays.length) return null
  return { kind: 'weekly', from, weekdays: [...value.weekdays].sort((a, b) => a - b) }
}
function parseTemplate(value: unknown): TaskTemplate | null {
  const place = isRecord(value) ? parsePlace(value.place) : null
  if (!isRecord(value) || !validText(value.id, 100) || !validText(value.title, 80) || !whole(value.xp, 500) || !whole(value.gold, 100) || !place) return null
  const schedule = parseSchedule(value.schedule)
  const endsBefore = value.endsBefore === null ? null : parseDateKey(value.endsBefore)
  if (!schedule || (value.endsBefore !== null && !endsBefore)) return null
  return { id: value.id, title: value.title.trim(), xp: value.xp, gold: value.gold, place, schedule, endsBefore }
}
export function scheduledOn(template: TaskTemplate, date: DateKey): boolean {
  if (template.endsBefore !== null && date >= template.endsBefore) return false
  const schedule = template.schedule
  if (schedule.kind === 'once') return schedule.date === date
  return date >= schedule.from && (schedule.kind === 'daily' || schedule.weekdays.includes(weekdayOf(date)))
}
function occurrence(template: TaskTemplate, date: DateKey): Quest {
  return { id: `${template.id}@${date}`, templateId: template.id, date, title: template.title, xp: template.xp, gold: template.gold, place: template.place, status: 'todo' }
}
export function projectDay(family: Family, date: DateKey): ProjectDay {
  const saved = family.quests.filter(quest => quest.date === date)
  const ids = new Set(saved.map(quest => quest.templateId))
  return { date, quests: [...saved, ...family.templates.filter(template => !ids.has(template.id) && scheduledOn(template, date)).map(template => occurrence(template, date))] }
}
export function screenUnlocked(family: Family): boolean {
  const quests = projectDay(family, family.sessionDay).quests
  return quests.length > 0 && quests.every(quest => quest.status === 'approved')
}
export function questEarnings(family: Family): { xp: number; gold: number } {
  return family.quests.reduce((sum, quest) => quest.status === 'approved' ? { xp: sum.xp + quest.xp, gold: sum.gold + quest.gold } : sum, { xp: 0, gold: 0 })
}
export function earnedXp(family: Family): number { return questEarnings(family).xp + family.wakeAlarm.results.reduce((sum, result) => sum + result.xp, 0) }
export function earnedGold(family: Family): number { return questEarnings(family).gold + family.wakeAlarm.results.reduce((sum, result) => sum + result.gold, 0) }
/** A late wake-up can only take gold the child already has, so the balance never drops below zero. */
export function wakeRewardFor(family: Family, scheduledAt: number, wokeAt: number): { xp: number; gold: number } {
  const reward = wakeReward(wokeAt - scheduledAt)
  return { xp: reward.xp, gold: Math.max(reward.gold, 0 - earnedGold(family)) }
}
export function remainingMs(clock: PlayClock, now: number): number { return Math.min(MAX_TIME, Math.max(0, clock.kind === 'running' ? clock.endsAt - now : clock.remainingMs)) }
function stopped(clock: PlayClock, balance: number): PlayClock { return { kind: clock.kind === 'blocked' ? 'blocked' : 'paused', remainingMs: balance } }
function budgetRemaining(family: Family): number { return family.allowanceGranted ? Math.max(0, family.screenMinutes * MINUTE - family.allowanceUsedMs) : 0 }
export function reconcileFamily(family: Family, now: number): Family {
  const today = dateAt(now, family.timeZone)
  if (today < family.sessionDay) return family
  let next = family
  if (today !== family.sessionDay) next = { ...next, sessionDay: today, allowanceGranted: false, allowanceUsedMs: 0, clock: stopped(next.clock, 0) }
  const projected = projectDay(next, today).quests
  const ids = new Set(next.quests.map(quest => quest.id))
  const missing = projected.filter(quest => !ids.has(quest.id))
  if (missing.length) next = { ...next, quests: [...next.quests, ...missing] }
  if (next.clock.kind === 'running') {
    const clock = next.clock
    const consumed = Math.max(0, Math.min(now, clock.endsAt) - clock.startedAt)
    if (consumed > 0) next = { ...next, allowanceUsedMs: next.allowanceUsedMs + consumed, clock: { ...clock, startedAt: Math.max(clock.startedAt, Math.min(now, clock.endsAt)) } }
    if (now >= clock.endsAt) next = { ...next, clock: { kind: 'paused', remainingMs: budgetRemaining(next) } }
  }
  if (!screenUnlocked(next) && next.clock.kind === 'running') next = { ...next, clock: stopped(next.clock, budgetRemaining(next)) }
  return next
}
function grantIfComplete(family: Family): Family {
  return !family.allowanceGranted && screenUnlocked(family) ? { ...family, allowanceGranted: true, clock: stopped(family.clock, family.screenMinutes * MINUTE) } : family
}
export function createFamily({ id, code, now, timeZone }: { id: string; code: string; now: number; timeZone: TimeZone }): Family {
  const sessionDay = dateAt(now, timeZone)
  const defaults = [
    { id: 'read-20', title: 'Read for 20 minutes', xp: 75, gold: 5, place: 'library' },
    { id: 'tidy-room', title: 'Tidy your room', xp: 50, gold: 4, place: 'cottage' },
    { id: 'move-body', title: 'Move your body', xp: 25, gold: 2, place: 'chores' },
  ] satisfies Omit<TaskTemplate, 'schedule' | 'endsBefore'>[]
  const templates: TaskTemplate[] = defaults.map(template => ({ ...template, endsBefore: null, schedule: { kind: 'daily', from: sessionDay } }))
  return reconcileFamily({ version: 3, id, code, childName: 'Alex', createdAt: now, screenMinutes: 20, wakeAlarm: defaultWakeAlarm({ date: sessionDay }), timeZone, sessionDay, templates, quests: [], allowanceGranted: false, allowanceUsedMs: 0, clock: { kind: 'paused', remainingMs: 0 } }, now)
}
export function applyCommand(family: Family, command: FamilyCommand, { role, now }: { role: Role; now: number }): { family: Family; result: ActionResult } {
  const childCommand = command.kind === 'submit' || command.kind === 'start-play' || command.kind === 'pause-play' || command.kind === 'set-wake-sound' || command.kind === 'complete-wake-game'
  if ((role === 'child') !== childCommand) return { family, result: failure('This action needs the other family role.') }
  if (!finiteTime(now)) return { family, result: failure('The clock is unavailable. Try again.') }
  const wakeCommand = command.kind === 'set-wake-alarm' || command.kind === 'set-wake-sound' || command.kind === 'complete-wake-game'
  let next = wakeCommand ? family : reconcileFamily(family, now)
  const done = (result: ActionResult = success) => ({ family: next, result })
  switch (command.kind) {
    case 'set-wake-alarm': {
      const time = parseAlarmTime(command.time)
      if (!time || typeof command.enabled !== 'boolean') return done(failure('Choose a valid wake-up time.'))
      const alarm = next.wakeAlarm
      if (alarm.enabled === command.enabled && alarm.time === time) return done()
      const today = dateAt(now, next.timeZone)
      const startsOn = command.enabled && alarmInstant(today, time, next.timeZone) < now ? addDays(today, 1) : today
      next = { ...next, wakeAlarm: { ...alarm, enabled: command.enabled, time, startsOn, progress: { kind: 'unstarted' } } }
      return done()
    }
    case 'set-wake-sound': {
      const sound = parseWakeSound(command.sound)
      if (!sound) return done(failure('Choose Classic bells, Morning chimes, or Birdsong.'))
      next = { ...next, wakeAlarm: { ...next.wakeAlarm, sound } }
      return done()
    }
    case 'complete-wake-game': {
      const alarm = next.wakeAlarm
      const date = parseDateKey(command.date)
      if (!alarm.enabled || !date || !finiteTime(command.scheduledAt) || !parseWakeGame(command.game) || command.scheduledAt !== alarmInstant(date, alarm.time, next.timeZone)) return done(failure('This wake-up challenge has changed. Use the current alarm.'))
      const today = dateAt(now, next.timeZone)
      const progress = alarm.progress
      const recordedRun = progress.kind !== 'unstarted' && progress.date === date && progress.scheduledAt === command.scheduledAt && progress.firstPassedAt <= now
      const recentRun = date === today || (date === addDays(today, -1) && now < alarmInstant(today, alarm.time, next.timeZone))
      if (recordedRun && recentRun && (command.stage === 'first' || progress.kind === 'done')) return done()
      const phase = wakePhase(alarm, now, next.timeZone)
      const playable = phase.kind === 'ringing' ? phase.stage === command.stage : phase.kind === 'check' && command.stage === 'check'
      if (!playable || phase.kind === 'off' || phase.date !== date || phase.scheduledAt !== command.scheduledAt) return done(failure('This wake-up challenge is not ready. Use the current alarm and try again.'))
      if (command.stage === 'first') {
        const rewarded = alarm.results.some(result => result.date === date)
        const results = rewarded ? alarm.results : [...alarm.results, { date, scheduledAt: command.scheduledAt, wokeAt: now, ...wakeRewardFor(next, command.scheduledAt, now) }]
        next = { ...next, wakeAlarm: { ...alarm, progress: { kind: 'recheck', date, scheduledAt: command.scheduledAt, firstPassedAt: now }, results } }
      }
      else {
        if (progress.kind !== 'recheck' || progress.date !== date || progress.scheduledAt !== command.scheduledAt) return done(failure('Finish the first wake-up challenge before the follow-up.'))
        next = { ...next, wakeAlarm: { ...alarm, progress: { kind: 'done', date, scheduledAt: command.scheduledAt, firstPassedAt: progress.firstPassedAt, confirmedAt: now } } }
      }
      return done()
    }
    case 'add-template': {
      const template = parseTemplate({ ...command, endsBefore: null })
      if (!template) return done(failure('Use a title of 1–80 characters, 1–500 XP, 1–100 gold, and a valid schedule.'))
      const existing = next.templates.find(item => item.id === template.id)
      if (existing) return done(existing.title === template.title && existing.xp === template.xp && existing.gold === template.gold && existing.place === template.place && JSON.stringify(existing.schedule) === JSON.stringify(template.schedule) ? success : failure('That task ID is already in use.'))
      const start = template.schedule.kind === 'once' ? template.schedule.date : template.schedule.from
      if (start < next.sessionDay) return done(failure('Schedule new tasks for today or a future date.'))
      next = { ...next, templates: [...next.templates, template] }
      if (scheduledOn(template, next.sessionDay)) next = { ...next, quests: [...next.quests, occurrence(template, next.sessionDay)], clock: stopped(next.clock, remainingMs(next.clock, now)) }
      return done()
    }
    case 'remove-template': {
      const existing = next.templates.find(template => template.id === command.templateId)
      if (!existing) return done()
      const endsBefore = existing.endsBefore !== null && existing.endsBefore < next.sessionDay ? existing.endsBefore : next.sessionDay
      next = { ...next, templates: next.templates.map(template => template.id === existing.id ? { ...template, endsBefore } : template), quests: next.quests.filter(quest => !(quest.templateId === existing.id && quest.date === next.sessionDay && quest.status !== 'approved')) }
      next = grantIfComplete(next)
      return done()
    }
    case 'approve':
    case 'return':
    case 'submit': {
      const quest = next.quests.find(item => item.id === command.questId)
      if (!quest) return done(failure('This dated quest is no longer available.'))
      if (quest.date > next.sessionDay || (command.kind === 'submit' && quest.date !== next.sessionDay)) return done(failure('Only today’s quests can be submitted.'))
      let updated: Quest
      if (command.kind === 'approve') {
        if (quest.status === 'approved') return done()
        if (quest.status !== 'pending') return done(failure('The child needs to submit this quest first.'))
        updated = { ...quest, status: 'approved', approvedAt: Math.max(now, quest.submittedAt) }
      } else if (command.kind === 'return') {
        if (quest.status === 'todo') return done()
        if (quest.status === 'approved') return done(failure('Approved quests cannot be returned.'))
        updated = { id: quest.id, templateId: quest.templateId, date: quest.date, title: quest.title, xp: quest.xp, gold: quest.gold, place: quest.place, status: 'todo' }
      } else {
        if (quest.status !== 'todo') return done()
        updated = { ...quest, status: 'pending', submittedAt: now }
      }
      next = { ...next, quests: next.quests.map(item => item.id === quest.id ? updated : item) }
      if (quest.date === next.sessionDay) next = grantIfComplete(next)
      return done()
    }
    case 'set-screen-time': {
      if (!whole(command.minutes, 120)) return done(failure('Choose 1–120 whole minutes.'))
      next = { ...next, screenMinutes: command.minutes }
      if (next.allowanceGranted) {
        const balance = budgetRemaining(next)
        next = { ...next, clock: next.clock.kind === 'running' && balance > 0 ? { kind: 'running', startedAt: now, endsAt: Math.min(now + balance, nextDayBoundary(now, next.timeZone)) } : stopped(next.clock, balance) }
      }
      return done()
    }
    case 'set-blocked':
      if (typeof command.blocked !== 'boolean') return done(failure('Choose whether play is blocked.'))
      if (command.blocked && next.clock.kind !== 'blocked') next = { ...next, clock: { kind: 'blocked', remainingMs: remainingMs(next.clock, now) } }
      if (!command.blocked && next.clock.kind === 'blocked') next = { ...next, clock: { kind: 'paused', remainingMs: next.clock.remainingMs } }
      return done()
    case 'rename-child':
      if (!validText(command.name, 24)) return done(failure('Use a name of 1–24 characters.'))
      next = { ...next, childName: command.name.trim() }
      return done()
    case 'start-play':
      if (!screenUnlocked(next)) return done(failure('Finish every task for today and ask your parent to approve them first.'))
      if (next.clock.kind === 'blocked') return done(failure('Play is paused by your parent. Your journal is still open.'))
      if (next.clock.kind === 'running') return done()
      if (next.clock.remainingMs <= 0) return done(failure('Today’s screen time is used up.'))
      next = { ...next, clock: { kind: 'running', startedAt: now, endsAt: Math.min(now + next.clock.remainingMs, nextDayBoundary(now, next.timeZone)) } }
      return done()
    case 'pause-play':
      if (next.clock.kind === 'running') next = { ...next, clock: { kind: 'paused', remainingMs: budgetRemaining(next) } }
      return done()
  }
}
function parseQuest(value: unknown): Quest | null {
  const place = isRecord(value) ? parsePlace(value.place) : null
  if (!isRecord(value) || !validText(value.id, 120) || !validText(value.templateId, 100) || !validText(value.title, 80) || !whole(value.xp, 500) || !whole(value.gold, 100) || !place) return null
  const date = parseDateKey(value.date)
  if (!date || value.id !== `${value.templateId}@${date}`) return null
  const base = { id: value.id, templateId: value.templateId, date, title: value.title.trim(), xp: value.xp, gold: value.gold, place }
  if (value.status === 'todo') return { ...base, status: 'todo' }
  if (!finiteTime(value.submittedAt)) return null
  if (value.status === 'pending') return { ...base, status: 'pending', submittedAt: value.submittedAt }
  if (value.status === 'approved' && finiteTime(value.approvedAt) && value.approvedAt >= value.submittedAt) return { ...base, status: 'approved', submittedAt: value.submittedAt, approvedAt: value.approvedAt }
  return null
}
export function parseFamily(value: unknown): Family | null {
  if (!isRecord(value) || value.version !== 3 || !validText(value.id, 100) || typeof value.code !== 'string' || !/^[A-Z2-9]{8,12}$/.test(value.code) || !validText(value.childName, 24) || !finiteTime(value.createdAt) || !whole(value.screenMinutes, 120) || typeof value.allowanceGranted !== 'boolean' || !finiteTime(value.allowanceUsedMs) || !Array.isArray(value.quests) || !Array.isArray(value.templates) || !isRecord(value.clock)) return null
  const timeZone = parseTimeZone(value.timeZone)
  const sessionDay = parseDateKey(value.sessionDay)
  if (!timeZone || !sessionDay) return null
  const wakeAlarm = 'wakeAlarm' in value ? value.wakeAlarm === undefined ? null : parseWakeAlarm(value.wakeAlarm, { date: sessionDay }) : defaultWakeAlarm({ date: sessionDay })
  if (!wakeAlarm) return null
  const progress = wakeAlarm.progress
  if (progress.kind !== 'unstarted') {
    if (alarmInstant(progress.date, wakeAlarm.time, timeZone) !== progress.scheduledAt || dateAt(progress.firstPassedAt, timeZone) !== progress.date) return null
    if (progress.kind === 'done' && progress.confirmedAt >= alarmInstant(addDays(progress.date, 1), wakeAlarm.time, timeZone)) return null
  }
  const templates: TaskTemplate[] = []
  const templateIds = new Set<string>()
  for (const raw of value.templates) { const template = parseTemplate(raw); if (!template || templateIds.has(template.id)) return null; templateIds.add(template.id); templates.push(template) }
  const quests: Quest[] = []
  const questIds = new Set<string>()
  for (const raw of value.quests) { const quest = parseQuest(raw); if (!quest || questIds.has(quest.id) || !templateIds.has(quest.templateId)) return null; questIds.add(quest.id); quests.push(quest) }
  let clock: PlayClock
  if (value.clock.kind === 'running' && finiteTime(value.clock.endsAt) && finiteTime(value.clock.startedAt) && value.clock.startedAt <= value.clock.endsAt) clock = { kind: 'running', endsAt: value.clock.endsAt, startedAt: value.clock.startedAt }
  else if ((value.clock.kind === 'paused' || value.clock.kind === 'blocked') && finiteTime(value.clock.remainingMs) && value.clock.remainingMs <= MAX_TIME) clock = { kind: value.clock.kind, remainingMs: value.clock.remainingMs }
  else return null
  return { version: 3, id: value.id, code: value.code, childName: value.childName.trim(), createdAt: value.createdAt, screenMinutes: value.screenMinutes, wakeAlarm, timeZone, sessionDay, allowanceGranted: value.allowanceGranted, allowanceUsedMs: value.allowanceUsedMs, clock, templates, quests }
}
export function familyWithinSizeLimit(family: Family): boolean { return new TextEncoder().encode(JSON.stringify(family)).byteLength <= 750_000 }

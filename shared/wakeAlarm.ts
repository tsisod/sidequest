import type { AlarmTime, DateKey, TimeZone, WakeAlarm, WakeGameKind, WakePhase, WakeProgress, WakeResult, WakeSound, WakeStage } from './domain.ts'
import { addDays, dateAt, parseDateKey } from './calendar.ts'

const MINUTE = 60_000
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function isAlarmTime(value: unknown): value is AlarmTime { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) }
export function parseAlarmTime(value: unknown): AlarmTime | null { return isAlarmTime(value) ? value : null }
export function parseWakeSound(value: unknown): WakeSound | null { return value === 'classic' || value === 'chimes' || value === 'birds' ? value : null }
export function defaultWakeAlarm({ date }: { date: DateKey }): WakeAlarm {
  const time = parseAlarmTime('07:00')
  if (!time) throw new Error('The default wake-up time is unavailable.')
  return { enabled: false, time, startsOn: date, sound: 'classic', progress: { kind: 'unstarted' }, results: [] }
}
function parseWakeResult(value: unknown): WakeResult | null {
  if (!isRecord(value) || !timestamp(value.scheduledAt) || !timestamp(value.wokeAt) || value.wokeAt < value.scheduledAt) return null
  const date = parseDateKey(value.date)
  if (!date || !Number.isInteger(value.xp) || !Number.isInteger(value.gold) || typeof value.xp !== 'number' || typeof value.gold !== 'number' || value.xp < 0 || value.xp > WAKE_XP || value.gold > WAKE_GOLD) return null
  return { date, scheduledAt: value.scheduledAt, wokeAt: value.wokeAt, xp: value.xp, gold: value.gold }
}
export function parseWakeAlarm(value: unknown, { date }: { date: DateKey }): WakeAlarm | null {
  if (value === undefined) return defaultWakeAlarm({ date })
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || !isRecord(value.progress)) return null
  const time = parseAlarmTime(value.time)
  const sound = parseWakeSound(value.sound)
  const startsOn = parseDateKey(value.startsOn)
  if (!time || !sound || !startsOn) return null
  const results: WakeResult[] = []
  if (value.results !== undefined) {
    if (!Array.isArray(value.results)) return null
    for (const raw of value.results) {
      const result = parseWakeResult(raw)
      if (!result || results.some(saved => saved.date === result.date)) return null
      results.push(result)
    }
  }
  const raw = value.progress
  let progress: WakeProgress
  if (raw.kind === 'unstarted') progress = { kind: 'unstarted' }
  else {
    const runDate = parseDateKey(raw.date)
    if (!runDate || runDate < startsOn || !timestamp(raw.scheduledAt) || !timestamp(raw.firstPassedAt) || raw.firstPassedAt < raw.scheduledAt) return null
    if (raw.kind === 'recheck') progress = { kind: 'recheck', date: runDate, scheduledAt: raw.scheduledAt, firstPassedAt: raw.firstPassedAt }
    else if (raw.kind === 'done' && timestamp(raw.confirmedAt) && raw.confirmedAt >= raw.firstPassedAt + 5 * MINUTE) progress = { kind: 'done', date: runDate, scheduledAt: raw.scheduledAt, firstPassedAt: raw.firstPassedAt, confirmedAt: raw.confirmedAt }
    else return null
  }
  return { enabled: value.enabled, time, startsOn, sound, progress, results }
}

const instantCache = new Map<string, number>()
const formatters = new Map<TimeZone, Intl.DateTimeFormat>()
function localMinute(now: number, zone: TimeZone): string {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', calendar: 'gregory', numberingSystem: 'latn' })
    formatters.set(zone, formatter)
  }
  const parts = formatter.formatToParts(now)
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === kind)?.value
  return `${part('year')?.padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
export function alarmInstant(date: DateKey, time: AlarmTime, zone: TimeZone): number {
  const key = `${date}|${time}|${zone}`
  const cached = instantCache.get(key)
  if (cached !== undefined) return cached
  const target = `${date}T${time}`
  const midnightUtc = Date.parse(`${date}T00:00:00.000Z`)
  const end = midnightUtc + 42 * 60 * MINUTE
  for (let instant = midnightUtc - 18 * 60 * MINUTE; instant <= end; instant += MINUTE) {
    if (localMinute(instant, zone) < target) continue
    if (instantCache.size >= 256) {
      const oldest = instantCache.keys().next().value
      if (oldest !== undefined) instantCache.delete(oldest)
    }
    instantCache.set(key, instant)
    return instant
  }
  throw new Error('The wake-up time could not be resolved in this household time zone.')
}
export function wakeGameFor(date: DateKey, stage: WakeStage): WakeGameKind {
  const games: WakeGameKind[] = ['moles', 'memory', 'numbers']
  const days = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / (24 * 60 * MINUTE))
  const index = ((days % games.length) + games.length + (stage === 'check' ? 1 : 0)) % games.length
  return games[index]
}
function recheckPhase(progress: Extract<WakeProgress, { kind: 'recheck' }>, now: number): WakePhase {
  const readyAt = progress.firstPassedAt + 5 * MINUTE
  const deadlineAt = progress.firstPassedAt + 6 * MINUTE
  const base = { date: progress.date, scheduledAt: progress.scheduledAt, game: wakeGameFor(progress.date, 'check') }
  if (now < readyAt) return { kind: 'waiting', ...base, readyAt, deadlineAt }
  if (now < deadlineAt) return { kind: 'check', ...base, deadlineAt }
  return { kind: 'ringing', ...base, stage: 'check', ringingAt: deadlineAt }
}
export function wakePhase(alarm: WakeAlarm, now: number, zone: TimeZone): WakePhase {
  if (!alarm.enabled) return { kind: 'off' }
  const today = dateAt(now, zone)
  const date = today < alarm.startsOn ? alarm.startsOn : today
  const scheduledAt = alarmInstant(date, alarm.time, zone)
  const progress = alarm.progress
  if (progress.kind !== 'unstarted' && progress.date === today && progress.scheduledAt === scheduledAt) {
    if (progress.kind === 'done') return { kind: 'done', date: today, scheduledAt, nextAt: alarmInstant(addDays(today, 1), alarm.time, zone) }
    return recheckPhase(progress, now)
  }
  if (progress.kind === 'recheck' && progress.date === addDays(today, -1) && today >= alarm.startsOn && now < scheduledAt && progress.scheduledAt === alarmInstant(progress.date, alarm.time, zone)) return recheckPhase(progress, now)
  if (now < scheduledAt) return { kind: 'scheduled', date, scheduledAt, game: wakeGameFor(date, 'first') }
  return { kind: 'ringing', date, scheduledAt, stage: 'first', ringingAt: scheduledAt, game: wakeGameFor(date, 'first') }
}
// Waking within the first minute earns the full reward; each later minute takes 1/15 off until fifteen minutes earns nothing, then every further five minutes costs five gold.
export const WAKE_XP = 100
export const WAKE_GOLD = 50
export function wakeReward(lateMs: number): { xp: number; gold: number } {
  const minutes = Math.floor(Math.max(0, lateMs) / MINUTE)
  if (minutes < 15) return { xp: Math.round(WAKE_XP * (15 - minutes) / 15), gold: Math.round(WAKE_GOLD * (15 - minutes) / 15) }
  return { xp: 0, gold: 0 - 5 * Math.floor((minutes - 15) / 5) }
}
export function alarmVolume(elapsedMs: number): number {
  return Math.min(0.8, 0.2 + Math.floor(Math.max(0, elapsedMs) / 2_000) * 0.05)
}

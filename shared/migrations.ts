import type { Family, Place, PlayClock, Quest, TaskTemplate, TimeZone } from './domain.ts'
import { defaultWakeAlarm } from './wakeAlarm.ts'
import { dateAt, nextDayBoundary } from './calendar.ts'
import { finiteTime, isRecord, parseFamily, parsePlace, validText, whole } from './sidequest.ts'

type LegacyQuest = { id: string; title: string; xp: number; gold: number; place: Place } & (
  | { status: 'todo' }
  | { status: 'pending'; submittedAt: number }
  | { status: 'approved'; submittedAt: number; approvedAt: number }
)
type LegacyClock = { kind: 'paused' | 'blocked'; remainingMs: number } | { kind: 'running'; endsAt: number }
export type LegacyFamily = { id: string; code: string; childName: string; quests: LegacyQuest[]; clock: LegacyClock; createdAt: number; screenMinutes: number }

export function parseV2Family(value: unknown): LegacyFamily | null {
  if (!isRecord(value) || !validText(value.id, 100) || typeof value.code !== 'string' || !/^[A-Z2-9]{8,12}$/.test(value.code) || !validText(value.childName, 24) || !finiteTime(value.createdAt) || !whole(value.screenMinutes, 120) || !Array.isArray(value.quests) || !isRecord(value.clock)) return null
  const quests: LegacyQuest[] = []
  const ids = new Set<string>()
  for (const raw of value.quests) {
    const place = isRecord(raw) ? parsePlace(raw.place) : null
    if (!isRecord(raw) || !validText(raw.id, 100) || ids.has(raw.id) || !validText(raw.title, 80) || !whole(raw.xp, 500) || !whole(raw.gold, 100) || !place) return null
    const base = { id: raw.id, title: raw.title.trim(), xp: raw.xp, gold: raw.gold, place }
    let quest: LegacyQuest
    if (raw.status === 'todo') quest = { ...base, status: 'todo' }
    else if (raw.status === 'pending' && finiteTime(raw.submittedAt)) quest = { ...base, status: 'pending', submittedAt: raw.submittedAt }
    else if (raw.status === 'approved' && finiteTime(raw.submittedAt) && finiteTime(raw.approvedAt) && raw.approvedAt >= raw.submittedAt) quest = { ...base, status: 'approved', submittedAt: raw.submittedAt, approvedAt: raw.approvedAt }
    else return null
    ids.add(quest.id)
    quests.push(quest)
  }
  let clock: LegacyClock
  if (value.clock.kind === 'running' && finiteTime(value.clock.endsAt)) clock = { kind: 'running', endsAt: value.clock.endsAt }
  else if ((value.clock.kind === 'paused' || value.clock.kind === 'blocked') && finiteTime(value.clock.remainingMs) && value.clock.remainingMs <= 24 * 60 * 60_000) clock = { kind: value.clock.kind, remainingMs: value.clock.remainingMs }
  else return null
  return { id: value.id, code: value.code, childName: value.childName.trim(), createdAt: value.createdAt, screenMinutes: value.screenMinutes, clock, quests }
}

export function migrateV1ToV2(value: unknown): LegacyFamily | null {
  if (!isRecord(value) || !Array.isArray(value.quests)) return null
  const quests: unknown[] = []
  for (const raw of value.quests) {
    if (!isRecord(raw) || !whole(raw.minutes, 120)) return null
    quests.push({ ...raw, xp: Math.min(500, raw.minutes * 5), gold: Math.ceil(raw.minutes / 3) })
  }
  const family = parseV2Family({ ...value, screenMinutes: 20, quests })
  if (!family) return null
  const unlocked = family.quests.length > 0 && family.quests.every(quest => quest.status === 'approved')
  return { ...family, clock: { kind: family.clock.kind === 'blocked' ? 'blocked' : 'paused', remainingMs: unlocked ? 20 * 60_000 : 0 } }
}

export function migrateV2Family(value: unknown, { now, timeZone }: { now: number; timeZone: TimeZone }): Family | null {
  const current = parseFamily(value)
  if (current) return current
  const legacy = parseV2Family(value)
  if (!legacy) return null
  const sessionDay = dateAt(now, timeZone)
  const templates: TaskTemplate[] = legacy.quests.map(quest => ({ id: quest.id, title: quest.title, xp: quest.xp, gold: quest.gold, place: quest.place, schedule: { kind: 'once', date: sessionDay }, endsBefore: null }))
  const quests: Quest[] = legacy.quests.map(quest => ({ ...quest, id: `${quest.id}@${sessionDay}`, templateId: quest.id, date: sessionDay }))
  const allowanceGranted = quests.length > 0 && quests.every(quest => quest.status === 'approved')
  const remaining = legacy.clock.kind === 'running' ? Math.max(0, legacy.clock.endsAt - now) : legacy.clock.remainingMs
  let clock: PlayClock = { kind: legacy.clock.kind === 'blocked' ? 'blocked' : 'paused', remainingMs: allowanceGranted ? remaining : 0 }
  if (allowanceGranted && legacy.clock.kind === 'running' && remaining > 0) clock = { kind: 'running', startedAt: now, endsAt: Math.min(legacy.clock.endsAt, nextDayBoundary(now, timeZone)) }
  return { version: 3, id: legacy.id, code: legacy.code, childName: legacy.childName, createdAt: legacy.createdAt, screenMinutes: legacy.screenMinutes, wakeAlarm: defaultWakeAlarm({ date: sessionDay }), timeZone, sessionDay, allowanceGranted, allowanceUsedMs: allowanceGranted ? Math.max(0, legacy.screenMinutes * 60_000 - remaining) : 0, templates, events: [], quests, clock }
}

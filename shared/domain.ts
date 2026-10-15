import type { AskSpark, SparkAlert, SparkInboxChange } from './spark.ts'
import type { Speak } from './speech.ts'

export type Role = 'parent' | 'child'
export type Place = 'library' | 'cottage' | 'chores'
export type DateKey = string & { readonly __brand: 'DateKey' }
export type TimeZone = string & { readonly __brand: 'TimeZone' }
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Schedule =
  | { kind: 'once'; date: DateKey }
  | { kind: 'daily'; from: DateKey }
  | { kind: 'weekly'; from: DateKey; weekdays: Weekday[] }

export type TaskTemplate = {
  id: string
  title: string
  xp: number
  gold: number
  place: Place
  schedule: Schedule
  endsBefore: DateKey | null
}

export type Quest = {
  id: string
  templateId: string
  date: DateKey
  title: string
  xp: number
  gold: number
  place: Place
} & (
  | { status: 'todo' }
  | { status: 'pending'; submittedAt: number }
  | { status: 'approved'; submittedAt: number; approvedAt: number }
)

export type ProjectDay = { date: DateKey; quests: Quest[] }

export type PlayClock =
  | { kind: 'paused'; remainingMs: number }
  | { kind: 'running'; endsAt: number; startedAt: number }
  | { kind: 'blocked'; remainingMs: number }

export type AlarmTime = string & { readonly __brand: 'AlarmTime' }
export type WakeSound = 'classic' | 'chimes' | 'birds'
export type WakeGameKind = 'moles' | 'memory'
export type WakeStage = 'first' | 'check'
export type WakeProgress =
  | { kind: 'unstarted' }
  | { kind: 'recheck'; date: DateKey; scheduledAt: number; firstPassedAt: number }
  | { kind: 'done'; date: DateKey; scheduledAt: number; firstPassedAt: number; confirmedAt: number }
export type WakeResult = { date: DateKey; scheduledAt: number; wokeAt: number; xp: number; gold: number }
export type WakeAlarm = {
  enabled: boolean
  time: AlarmTime
  startsOn: DateKey
  sound: WakeSound
  progress: WakeProgress
  results: WakeResult[]
}
export type WakePhase =
  | { kind: 'off' }
  | { kind: 'scheduled'; date: DateKey; scheduledAt: number }
  | { kind: 'ringing'; date: DateKey; scheduledAt: number; stage: WakeStage; ringingAt: number }
  | { kind: 'waiting'; date: DateKey; scheduledAt: number; readyAt: number; deadlineAt: number }
  | { kind: 'check'; date: DateKey; scheduledAt: number; deadlineAt: number }
  | { kind: 'done'; date: DateKey; scheduledAt: number; nextAt: number }

export type Family = {
  version: 3
  id: string
  code: string
  childName: string
  quests: Quest[]
  templates: TaskTemplate[]
  timeZone: TimeZone
  sessionDay: DateKey
  allowanceGranted: boolean
  allowanceUsedMs: number
  clock: PlayClock
  createdAt: number
  screenMinutes: number
  wakeAlarm: WakeAlarm
}

export type FamilyCommand =
  | { kind: 'set-wake-alarm'; enabled: boolean; time: AlarmTime }
  | { kind: 'set-wake-sound'; sound: WakeSound }
  | { kind: 'complete-wake-game'; date: DateKey; scheduledAt: number; stage: WakeStage; game: WakeGameKind }
  | { kind: 'add-template'; id: string; title: string; xp: number; gold: number; place: Place; schedule: Schedule }
  | { kind: 'remove-template'; templateId: string }
  | { kind: 'approve'; questId: string }
  | { kind: 'return'; questId: string }
  | { kind: 'set-screen-time'; minutes: number }
  | { kind: 'set-blocked'; blocked: boolean }
  | { kind: 'rename-child'; name: string }
  | { kind: 'submit'; questId: string }
  | { kind: 'start-play' }
  | { kind: 'pause-play' }

export type ActionResult = { ok: true } | { ok: false; message: string }
export type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; family: Family; serverOffsetMs: number }

export type FamilyConnection = {
  mode: 'local' | 'hosted'
  state: ConnectionState
  execute: (command: FamilyCommand) => Promise<ActionResult>
  speak: Speak
  ask: AskSpark
  inbox: SparkAlert[] | null
  editInbox: (change: SparkInboxChange) => Promise<ActionResult>
  join: (code: string) => Promise<ActionResult>
  create: () => Promise<ActionResult>
}

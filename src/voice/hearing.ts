export type Hearing = { startedAt: number; heardAt: number | null; loudMs: number; quietMs: number; floor: number; peak: number }
export type HearingVerdict = 'listening' | 'finished' | 'nothing-heard' | 'silent-microphone'
export type Frame = { time: number; dt: number; rms: number; peak: number }

const SPEECH_START_MS = 160
const SILENCE_END_MS = 950
const NO_SPEECH_MS = 8_000
const MAX_RECORDING_MS = 20_000
const SILENT_MICROPHONE_MS = 2_500
const DIGITAL_SILENCE = 1e-5

export function startHearing(time: number, floor = .004): Hearing {
  return { startedAt: time, heardAt: null, loudMs: 0, quietMs: 0, floor, peak: 0 }
}

/** A microphone that is muted, switched off or the wrong device sends exact zeros; a real room never does. */
export function soundsSilent(hearing: Hearing): boolean { return hearing.peak < DIGITAL_SILENCE }

export function hear(hearing: Hearing, { time, dt, rms, peak }: Frame): { hearing: Hearing; verdict: HearingVerdict } {
  const threshold = Math.min(.08, Math.max(.012, hearing.floor * 3))
  const loud = rms > threshold
  const loudMs = loud ? hearing.loudMs + dt : Math.max(0, hearing.loudMs - dt / 2)
  const next: Hearing = {
    ...hearing,
    loudMs,
    quietMs: loud ? 0 : hearing.quietMs + dt,
    floor: loud ? hearing.floor : hearing.floor + (rms - hearing.floor) * .05,
    peak: Math.max(hearing.peak, peak),
    heardAt: hearing.heardAt ?? (loud && loudMs >= SPEECH_START_MS ? time : null),
  }
  const elapsed = time - next.startedAt
  if (next.heardAt !== null) return { hearing: next, verdict: next.quietMs >= SILENCE_END_MS || elapsed >= MAX_RECORDING_MS ? 'finished' : 'listening' }
  if (elapsed >= SILENT_MICROPHONE_MS && soundsSilent(next)) return { hearing: next, verdict: 'silent-microphone' }
  return { hearing: next, verdict: elapsed >= NO_SPEECH_MS ? 'nothing-heard' : 'listening' }
}

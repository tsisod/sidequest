import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActionResult, DateKey, Family, FamilyCommand, WakeGameKind, WakePhase, WakeSound, WakeStage } from '../../shared/domain'
import { wakeRewardFor } from '../../shared/sidequest'
import { parseWakeSound, wakePhase } from '../../shared/wakeAlarm'
import Icon from '../game/GameIcon'
import { daylightAt, localTime, seasonFor } from '../game/sky'
import WakeChallenge from './WakeChallenge'
import { RewardCelebration } from '../components/RewardCelebration'
import { WakeHud, WakeScene } from './WakeScene'
import { useWakeAudio, useWakeScreenLock } from './useWakeAudio'
import './alarm.css'

type WakeAlarmPanelProps = { family: Family; now: number; onCommand: (command: FamilyCommand) => Promise<ActionResult>; settingsHost: HTMLElement | null; onChallenge?: () => void }
type ChallengePhase = Extract<WakePhase, { kind: 'ringing' | 'check' }>
type Celebration = { date: DateKey; scheduledAt: number; stage: WakeStage }
const CELEBRATION_MS = 3200
const sounds: { value: WakeSound; label: string }[] = [
  { value: 'classic', label: 'Classic bells' }, { value: 'chimes', label: 'Morning chimes' }, { value: 'birds', label: 'Birdsong' },
]
function countdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function stageFor(phase: ChallengePhase): WakeStage { return phase.kind === 'check' ? 'check' : phase.stage }
function attemptFor(phase: ChallengePhase): string { return `${phase.scheduledAt}:${phase.date}:${stageFor(phase)}` }

export default function WakeAlarmPanel({ family, now, onCommand, settingsHost, onChallenge }: WakeAlarmPanelProps) {
  const phase = wakePhase(family.wakeAlarm, now, family.timeZone)
  const challenge = phase.kind === 'ringing' || phase.kind === 'check' ? phase : null
  const attemptKey = challenge ? attemptFor(challenge) : null
  const [acceptedAttempt, setAcceptedAttempt] = useState<string | null>(null)
  const [wonAttempt, setWonAttempt] = useState<{ key: string; game: WakeGameKind } | null>(null)
  const [pending, setPending] = useState<'sound' | 'completion' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keepAwake, setKeepAwake] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const challengeRef = useRef<HTMLDialogElement>(null)
  const commandLock = useRef(false)
  const activeChallenge = challenge !== null && attemptKey !== acceptedAttempt
  const showing = activeChallenge || celebration !== null
  const ringKey = phase.kind === 'ringing' && activeChallenge ? attemptKey : null
  const { runtime, status: audio } = useWakeAudio(ringKey, family.wakeAlarm.sound)
  const wakeLock = useWakeScreenLock(family.wakeAlarm.enabled, keepAwake)
  const soundReady = audio.readiness === 'running'
  const busy = pending !== null
  const clockTime = (instant: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: family.timeZone }).format(instant)

  useEffect(() => {
    const modal = challengeRef.current
    if (showing) {
      runtime.stopPreview()
      if (modal && !modal.open) {
        modal.showModal()
        modal.focus({ preventScroll: true })
      }
    } else if (modal?.open) modal.close()
  }, [showing, attemptKey, runtime])
  useEffect(() => {
    if (!celebration) return
    const timer = setTimeout(() => setCelebration(null), CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [celebration])
  useEffect(() => { if (activeChallenge) onChallenge?.() }, [activeChallenge, onChallenge])
  useEffect(() => { if (!settingsHost) runtime.stopPreview() }, [settingsHost, runtime])

  async function changeSound(value: string) {
    const sound = parseWakeSound(value)
    if (!sound || commandLock.current || sound === family.wakeAlarm.sound) return
    commandLock.current = true
    setPending('sound')
    setError(null)
    try {
      const result = await onCommand({ kind: 'set-wake-sound', sound })
      if (!result.ok) setError(result.message)
    } catch { setError('The sound choice could not be saved. Try again.') }
    finally { commandLock.current = false; setPending(null) }
  }
  async function saveWin(current: ChallengePhase, game: WakeGameKind) {
    if (commandLock.current) return
    const key = attemptFor(current)
    commandLock.current = true
    setPending('completion')
    setError(null)
    try {
      const result = await onCommand({ kind: 'complete-wake-game', date: current.date, scheduledAt: current.scheduledAt, stage: stageFor(current), game })
      if (result.ok) { setAcceptedAttempt(key); setCelebration({ date: current.date, scheduledAt: current.scheduledAt, stage: stageFor(current) }) }
      else setError(result.message)
    } catch { setError('Your win could not be saved. Try saving again.') }
    finally { commandLock.current = false; setPending(null) }
  }
  function won(current: ChallengePhase, game: WakeGameKind) { setWonAttempt({ key: attemptFor(current), game }); void saveWin(current, game) }

  const readinessText = soundReady ? 'Sound enabled on this device' : audio.readiness === 'unsupported' ? 'Sound is unavailable in this browser.' : audio.readiness === 'not-enabled' ? 'Sound is not enabled on this device.' : 'The browser has paused sound. Enable it again.'
  const enableSound = <button className="wake-button wake-button-primary" type="button" disabled={audio.readiness === 'unsupported'} onClick={() => { void runtime.enable() }}><Icon name="volume" size={18} />Enable sound on this device</button>
  const description = phase.kind === 'off' ? 'Your parent can set a daily wake-up time.' : phase.kind === 'scheduled' ? `Next alarm ${clockTime(phase.scheduledAt)}.` : phase.kind === 'waiting' ? `Your next challenge opens in ${countdown(phase.readyAt - now)}.` : phase.kind === 'done' ? `All done today. Next alarm ${clockTime(phase.nextAt)}.` : 'Complete the wake-up challenge.'
  const results = family.wakeAlarm.results
  const liveReward = challenge && phase.kind === 'ringing' && stageFor(challenge) === 'first' && !results.some(result => result.date === challenge.date) ? wakeRewardFor(family, challenge.scheduledAt, now) : null
  const earned = celebration?.stage === 'first' ? results.find(result => result.date === celebration.date && result.scheduledAt === celebration.scheduledAt) ?? null : null
  const local = localTime(now, family.timeZone)
  const screenStatus = wakeLock === 'held' ? 'Screen kept awake while this page is visible.' : wakeLock === 'unsupported' ? 'Screen wake lock is unavailable in this browser.' : wakeLock === 'denied' ? 'The browser did not allow the screen wake lock.' : wakeLock === 'requesting' ? 'Requesting screen wake lock…' : keepAwake && family.wakeAlarm.enabled ? 'Screen wake lock is not active.' : null

  return <div className="wake-alarm-control">
    {settingsHost && !activeChallenge && createPortal(<div className="wake-alarm-control wake-settings">
      <div className="wake-alarm-time"><strong>{family.wakeAlarm.time}</strong><span>{family.wakeAlarm.enabled ? 'Every day' : 'Alarm off'}</span></div><p className="wake-description">{description}</p>
      <div className={`wake-audio-readiness ${soundReady ? 'wake-audio-ready' : ''}`}><Icon name={soundReady ? 'check' : 'volume'} size={18} /><span>{readinessText}</span></div>{!soundReady && enableSound}{audio.error && <p className="wake-error" role="alert">{audio.error}</p>}
      <fieldset className="wake-sounds"><legend>Choose your alarm sound</legend>{sounds.map(sound => <div className="wake-sound-row" key={sound.value}><label><input type="radio" name="wake-sound" value={sound.value} checked={family.wakeAlarm.sound === sound.value} disabled={busy} onChange={() => { void changeSound(sound.value) }} /><span>{sound.label}</span></label><button type="button" className="wake-preview-button" disabled={!soundReady} aria-label={`Preview ${sound.label}`} onClick={() => runtime.preview(sound.value)}><Icon name="play" size={14} />Preview</button></div>)}</fieldset>{audio.previewing && <button className="wake-stop-preview" type="button" onClick={runtime.stopPreview}><Icon name="pause" size={15} />Stop preview</button>}{error && <p className="wake-error" role="alert">{error}</p>}
      <label className="wake-screen-toggle"><input type="checkbox" checked={keepAwake} disabled={!family.wakeAlarm.enabled} onChange={event => setKeepAwake(event.target.checked)} /><span>Keep this screen awake</span></label>{screenStatus && <p className="wake-screen-status" role="status">{screenStatus}</p>}<p className="wake-page-requirement">Keep this page open with sound enabled. A closed page cannot ring.</p>
    </div>, settingsHost)}
    <dialog className="wake-dialog wake-active-dialog" ref={challengeRef} tabIndex={-1} aria-label={challenge && stageFor(challenge) === 'first' ? `Good morning, ${family.childName}. Finish the game to quiet the alarm.` : 'Still awake? Finish one more game.'} onCancel={event => event.preventDefault()}>
      {showing && <WakeScene season={seasonFor(local, family.timeZone)} daylight={daylightAt(local, family.timeZone)}>
        {challenge && activeChallenge && <div className="wake-active-body">
          <WakeChallenge key={attemptFor(challenge)} disabled={busy || wonAttempt?.key === attemptFor(challenge)} onComplete={game => won(challenge, game)} hud={(done, total) => <WakeHud reward={liveReward} ringing={phase.kind === 'ringing'} done={done} total={total} />} />
          {error && <p className="wake-error" role="alert">{error}</p>}{wonAttempt?.key === attemptFor(challenge) && pending !== 'completion' && acceptedAttempt !== attemptFor(challenge) && <button className="wake-button wake-button-primary wake-retry" type="button" disabled={busy} onClick={() => { if (wonAttempt) void saveWin(challenge, wonAttempt.game) }}>Save completion again<Icon name="arrow" size={17} /></button>}
        </div>}
        {celebration && <RewardCelebration reward={earned && { xp: earned.xp, gold: earned.gold }} emblem="sun" announce={earned ? 'Awake!' : 'Awake! Check-in complete.'} />}
      </WakeScene>}
    </dialog>
  </div>
}

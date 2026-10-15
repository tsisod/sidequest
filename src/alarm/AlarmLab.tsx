import { useEffect, useState } from 'react'
import type { Family, FamilyCommand, WakeSound } from '../../shared/domain'
import { parseTimeZone } from '../../shared/calendar'
import { applyCommand, createFamily, reconcileFamily } from '../../shared/sidequest'
import { alarmVolume, parseAlarmTime, wakePhase } from '../../shared/wakeAlarm'
import WakeAlarmPanel from './WakeAlarmPanel'
import { createWakeVoice, scheduleWakeVolume } from './audio'

const BASE = Date.parse('2026-10-15T06:50:00Z')
function labFamily(now: number): Family {
  const timeZone = parseTimeZone('UTC')
  const time = parseAlarmTime('07:00')
  if (!timeZone || !time) throw new Error('Invalid alarm lab configuration.')
  const initial = createFamily({ id: 'alarm-lab', code: 'ALARMLAB23', now, timeZone })
  return applyCommand(initial, { kind: 'set-wake-alarm', enabled: true, time }, { role: 'parent', now }).family
}

export default function AlarmLab() {
  const [offset, setOffset] = useState(() => BASE - Date.now())
  const [now, setNow] = useState(() => Date.now() + offset)
  const [saved, setSaved] = useState(() => labFamily(BASE))
  const [audioCheck, setAudioCheck] = useState('Audio check has not run.')
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset)
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [offset])
  const family = reconcileFamily(saved, now)
  const phase = wakePhase(family.wakeAlarm, now, family.timeZone)
  function restart() {
    setOffset(BASE - Date.now())
    setNow(BASE)
    setSaved(labFamily(BASE))
  }
  async function command(action: FamilyCommand) {
    const outcome = applyCommand(saved, action, { role: action.kind === 'set-wake-alarm' ? 'parent' : 'child', now })
    setSaved(outcome.family)
    return outcome.result
  }
  async function checkAudio() {
    setAudioCheck('Rendering real Web Audio graphs…')
    try {
      const context = new OfflineAudioContext(1, 24_000 * 6, 24_000)
      const gain = context.createGain()
      gain.gain.value = alarmVolume(0)
      gain.connect(context.destination)
      const source = context.createConstantSource()
      source.offset.value = 0.1
      source.connect(gain)
      source.start()
      scheduleWakeVolume(context, gain, 0)
      const buffer = (await context.startRendering()).getChannelData(0)
      const early = buffer[24_000]
      const louder = buffer[72_000]
      if (!(louder > early && Math.abs(early - alarmVolume(1_000) * 0.1) < 0.0001 && Math.abs(louder - alarmVolume(3_000) * 0.1) < 0.0001)) throw new Error('Volume step did not match the rendered gain.')
      const sounds: WakeSound[] = ['classic', 'chimes', 'birds']
      const peaks: string[] = []
      for (const sound of sounds) {
        const rendered = new OfflineAudioContext(1, 24_000 * 4, 24_000)
        createWakeVoice(rendered, sound, { gain: 0.6, loop: true, when: 0 })
        const samples = (await rendered.startRendering()).getChannelData(0)
        let peak = 0
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
        if (!(peak > 0.001 && peak < 1)) throw new Error(`Invalid ${sound} signal.`)
        peaks.push(`${sound} peak ${peak.toFixed(3)}`)
      }
      setAudioCheck(`PASS: rendered volume ${early.toFixed(4)} to ${louder.toFixed(4)} after two seconds; ${peaks.join(', ')}. No clipping.`)
    } catch (error) { setAudioCheck(`FAIL: ${error instanceof Error ? error.message : 'Audio rendering failed.'}`) }
  }
  return <main className="child-app" style={{ minHeight: '100dvh', height: 'auto', padding: 30, fontFamily: 'Manrope, sans-serif', background: '#edf1e5' }}>
    <h1>Alarm lab</h1><p>Development only. This board never connects to a real family.</p>
    <p><strong>{new Date(now).toISOString()}</strong> · {phase.kind}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBlock: 20 }}>
      <button className="button button-primary" disabled={phase.kind !== 'scheduled'} onClick={() => { if (phase.kind === 'scheduled') setOffset(value => value + phase.scheduledAt - now + 1_000) }}>Ring now</button>
      <button className="button button-secondary" onClick={() => setOffset(value => value + 10_000)}>Advance 10 seconds</button>
      <button className="button button-secondary" onClick={() => setOffset(value => value + 300_000)}>Advance five minutes</button>
      <button className="button button-secondary" onClick={() => setOffset(value => value + 60_000)}>Advance one minute</button>
      <button className="button button-secondary" onClick={() => setOffset(value => value + 86_400_000)}>Next day</button>
      <button className="button button-secondary" onClick={restart}>Restart test</button>
      <button className="button button-secondary" onClick={() => { void checkAudio() }}>Run audio check</button>
    </div>
    <div ref={setSettingsHost} style={{ maxWidth: 480, marginTop: 24 }} /><WakeAlarmPanel family={family} now={now} onCommand={command} settingsHost={settingsHost} />
    <p>Beat the first game, advance five minutes, then advance one minute without finishing to verify the second alarm.</p>
    <p role="status">{audioCheck}</p>
  </main>
}

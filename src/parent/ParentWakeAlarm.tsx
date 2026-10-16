import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ActionResult, Family, FamilyCommand } from '../../shared/domain'
import { parseAlarmTime, wakePhase } from '../../shared/wakeAlarm'
import Icon from '../components/Icon'
import { useAutoDismiss } from './useAutoDismiss'
import './parentAlarm.css'

type Props = {
  family: Family
  now: number
  disabled: boolean
  onCommand: (command: FamilyCommand) => Promise<ActionResult>
}

function displayTime(time: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`2000-01-01T${time}:00Z`))
}

export default function ParentWakeAlarm({ family, now, disabled, onCommand }: Props) {
  const alarm = family.wakeAlarm
  const phase = wakePhase(alarm, now, family.timeZone)
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(alarm.enabled)
  const [time, setTime] = useState<string>(alarm.time)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useAutoDismiss(notice, () => setNotice(''))
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const status = phase.kind === 'off' ? 'Off'
    : phase.kind === 'done' ? 'Awake for today'
    : phase.kind === 'ringing' ? 'Wake-up due'
    : phase.kind === 'check' ? 'Awake check is ready'
    : phase.kind === 'waiting' ? `Awake check in ${Math.ceil((phase.readyAt - now) / 60_000)} min`
    : 'Every day'

  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) {
      element.showModal()
      element.querySelector<HTMLInputElement>('input[type="time"]')?.focus()
    }
    if (!open && element?.open) element.close()
  }, [open])

  function edit() {
    setTime(alarm.time)
    setEnabled(true)
    setError('')
    setNotice('')
    setOpen(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const parsed = parseAlarmTime(time)
    if (!parsed) { setError('Choose a valid wake-up time.'); return }
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const result = await onCommand({ kind: 'set-wake-alarm', enabled, time: parsed })
      if (!result.ok) { setError(result.message); return }
      setOpen(false)
      setNotice(enabled ? `Daily alarm set for ${displayTime(parsed)}.` : 'Wake-up alarm turned off.')
    } catch {
      setError('The alarm could not be saved. Please try again.')
    } finally { saving.current = false; setBusy(false) }
  }

  return <>
    <section className="p-card p-alarm-card" aria-label="Daily wake-up alarm">
      <span className="p-alarm-symbol"><Icon name="clock" size={23} /></span>
      <div className="p-alarm-copy"><h2>Wake-up alarm</h2><p>{alarm.enabled ? displayTime(alarm.time) : 'Set a daily wake-up time'}<span className={alarm.enabled ? 'p-alarm-status p-alarm-enabled' : 'p-alarm-status'}>{status}</span></p></div>
      <button className="button button-secondary" type="button" disabled={disabled || busy} onClick={edit}>{alarm.enabled ? 'Edit alarm' : 'Set alarm'}<Icon name="chevron" size={16} /></button>
    </section>
    {notice && <p className="p-alarm-notice" role="status">{notice}</p>}
    <dialog className="dialog-shell p-dialog p-alarm-dialog" ref={dialog} aria-labelledby="wake-alarm-title" onCancel={event => { if (busy) event.preventDefault(); else setOpen(false) }} onClose={() => setOpen(false)} onClick={event => { if (!busy && event.target === event.currentTarget) setOpen(false) }}>
      <div className="p-dialog-heading"><button className="icon-button" aria-label="Close alarm settings" type="button" disabled={busy} onClick={() => setOpen(false)}><Icon name="close" size={18} /></button><h2 id="wake-alarm-title">Wake-up alarm</h2></div>
      <form onSubmit={event => { void save(event) }}>
        <label className="p-field">Wake-up time<input type="time" required value={time} disabled={busy} onChange={event => setTime(event.target.value)} /></label>
        <label className="p-alarm-toggle"><span><strong>Every day</strong><small>{family.timeZone.split('/').at(-1)?.replaceAll('_', ' ')} time</small></span><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} aria-label="Enable daily wake-up alarm" /></label>
        <p className="p-alarm-explanation">A wake-up game stops the alarm. A second game five minutes later confirms they are awake.</p>
        {error && <p className="p-dialog-error" role="alert">{error}</p>}
        <div className="p-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : enabled ? 'Save alarm' : 'Turn off alarm'}</button></div>
      </form>
    </dialog>
  </>
}

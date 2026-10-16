import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ActionResult, CalendarEvent, DateKey, FamilyCommand, Role, Schedule } from '../../shared/domain'
import { weekdayOf } from '../../shared/calendar'
import type { CalendarIcon } from './MonthCalendar'
import { formatDate, repeatLabel } from './format'
import { useSound } from '../sound/SoundContext'

type Repeat = Schedule['kind']
type DayPlannerProps = {
  date: DateKey
  today: DateKey
  role: Role
  childName: string
  events: readonly CalendarEvent[]
  Icon: CalendarIcon
  onCommand: (command: FamilyCommand) => Promise<ActionResult>
  onAdded?: (title: string) => void
}

const repeats: { value: Repeat; label: string }[] = [{ value: 'once', label: 'Once' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]

function scheduleFor(repeat: Repeat, date: DateKey): Schedule {
  if (repeat === 'once') return { kind: 'once', date }
  if (repeat === 'daily') return { kind: 'daily', from: date }
  return { kind: 'weekly', from: date, weekdays: [weekdayOf(date)] }
}

function ownerNote(event: CalendarEvent, role: Role, childName: string): string | null {
  if (event.createdBy === role) return null
  return role === 'parent' ? `Added by ${childName}` : 'From your parent'
}

export default function DayPlanner({ date, today, role, childName, events, Icon, onCommand, onAdded }: DayPlannerProps) {
  const [title, setTitle] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('once')
  const [pending, setPending] = useState<FamilyCommand['kind'] | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const draftId = useRef<string | null>(null)
  const play = useSound()
  const schedule = scheduleFor(repeat, date)
  const dayName = formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })
  const busy = pending !== null
  const preview = schedule.kind === 'once' ? `Just on ${dayName}` : `${repeatLabel(schedule)} from ${formatDate(date, { month: 'long', day: 'numeric' })}`

  async function run(command: FamilyCommand): Promise<boolean> {
    setPending(command.kind)
    setError('')
    try {
      const result = await onCommand(command)
      if (!result.ok) setError(result.message)
      play(!result.ok ? 'error' : command.kind === 'add-event' ? 'confirm' : 'remove')
      return result.ok
    } catch {
      setError('That change could not be saved. Please try again.')
      play('error')
      return false
    } finally { setPending(null) }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = title.trim()
    if (!name) { setError('Give the event a name.'); play('error'); return }
    draftId.current ??= crypto.randomUUID()
    if (!await run({ kind: 'add-event', id: draftId.current, title: name, schedule })) return
    draftId.current = null
    setTitle('')
    setRepeat('once')
    onAdded?.(name)
  }
  async function remove(event: CalendarEvent) {
    if (await run({ kind: 'remove-event', eventId: event.id })) setConfirming(null)
  }

  return <div className="cal-plan">
    {events.length === 0 ? <p className="cal-plan-empty">{date < today ? 'Nothing happened on this day.' : 'Nothing planned yet.'}</p> : <ul className="cal-plan-list" aria-label={`Events on ${dayName}`}>
      {events.map(event => {
        const note = ownerNote(event, role, childName)
        const removable = role === 'parent' || event.createdBy === role
        return <li key={event.id} className="cal-plan-event" data-by={event.createdBy}>
          <span className="cal-plan-dot" aria-hidden="true" />
          <span className="cal-plan-copy"><strong>{event.title}</strong><small>{repeatLabel(event.schedule)}{note && ` · ${note}`}</small></span>
          {removable && (confirming === event.id
            ? <span className="cal-plan-confirm"><button type="button" className="cal-plan-keep" disabled={busy} onClick={() => { play('tap'); setConfirming(null) }}>Keep</button><button type="button" className="cal-plan-delete" disabled={busy} onClick={() => void remove(event)}>{pending === 'remove-event' ? 'Deleting…' : event.schedule.kind === 'once' ? 'Delete' : 'Delete all'}</button></span>
            : <button type="button" className="cal-plan-trash" disabled={busy} aria-label={`Delete ${event.title}`} title={event.schedule.kind === 'once' ? 'Delete event' : 'Delete every repeat'} onClick={() => { play('tap'); setError(''); setConfirming(event.id) }}><Icon name="trash" size={18} /></button>)}
        </li>
      })}
    </ul>}
    {date < today ? <p className="cal-plan-note">Past days can’t get new events.</p> : <form className="cal-plan-form" onSubmit={event => void add(event)}>
      <label className="cal-plan-field"><span>New event</span><input value={title} maxLength={80} placeholder="Dentist at 4 pm" autoComplete="off" disabled={busy} onChange={event => { setTitle(event.target.value); draftId.current = null }} /></label>
      <fieldset className="cal-plan-repeat" disabled={busy}><legend>Repeats</legend><div>{repeats.map(option => <label key={option.value}><input type="radio" name={`repeat-${date}`} value={option.value} checked={repeat === option.value} onChange={() => { play('tap'); setRepeat(option.value); draftId.current = null }} /><span>{option.label}</span></label>)}</div></fieldset>
      <p className="cal-plan-preview">{preview}</p>
      <button type="submit" className="cal-plan-submit" disabled={busy}>{pending === 'add-event' ? 'Saving…' : 'Add event'}<Icon name="plus" size={16} /></button>
    </form>}
    {error && <p className="cal-plan-error" role="alert">{error}</p>}
  </div>
}

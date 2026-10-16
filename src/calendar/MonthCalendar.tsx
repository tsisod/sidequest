import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import type { CalendarEvent, DateKey } from '../../shared/domain'
import { monthGrid, monthStart } from '../../shared/calendar'
import type { IconName } from '../components/Icon'
import { formatDate } from './format'
import { useSound } from '../sound/SoundContext'
import './calendar.css'

export type CalendarIcon = ComponentType<{ name: IconName; size?: number; className?: string }>
type Step = -1 | 1
type View = { month: DateKey; step: Step | null; leaving: DateKey | null }
type MonthCalendarProps = {
  today: DateKey
  selected: DateKey | null
  eventsOn: (date: DateKey) => readonly CalendarEvent[]
  onPick: (date: DateKey) => void
  Icon: CalendarIcon
  className?: string
}

const SLIDE_MS = 320
const VISIBLE_EVENTS = 3

export default function MonthCalendar({ today, selected, eventsOn, onPick, Icon, className = '' }: MonthCalendarProps) {
  const thisMonth = monthStart(today)
  const [view, setView] = useState<View>({ month: thisMonth, step: null, leaving: null })
  const play = useSound()
  const go = (month: DateKey) => {
    play('page')
    setView(current => month === current.month ? current : { month, step: month > current.month ? 1 : -1, leaving: current.month })
  }
  const monthName = (month: DateKey) => formatDate(month, { month: 'long', year: 'numeric' })

  useEffect(() => {
    if (!view.leaving) return
    const timer = window.setTimeout(() => setView(current => ({ ...current, leaving: null })), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [view])

  const grid = (month: DateKey, motion: 'enter' | 'leave' | null) => <div key={month} className="cal-grid" data-motion={motion ?? undefined} inert={motion === 'leave'} aria-hidden={motion === 'leave' || undefined} style={{ '--cal-dir': view.step ?? 1 } as CSSProperties}>
    {monthGrid(month).map(date => {
      const events = eventsOn(date)
      const label = `${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}${date === today ? ', today' : ''}. ${events.length ? `${events.length} ${events.length === 1 ? 'event' : 'events'}: ${events.map(event => event.title).join(', ')}` : 'No events'}`
      return <button type="button" key={date} className="cal-day" data-outside={date.slice(0, 7) !== month.slice(0, 7) || undefined} data-past={date < today || undefined} aria-current={date === today ? 'date' : undefined} aria-pressed={selected === null ? undefined : date === selected} aria-label={label} onClick={() => { play('tap'); onPick(date) }}>
        <span className="cal-date">{Number(date.slice(8))}</span>
        {events.length > 0 && <span className="cal-events">
          {events.slice(0, VISIBLE_EVENTS).map(event => <span key={event.id} className="cal-event" data-by={event.createdBy}>{event.title}</span>)}
          {events.length > VISIBLE_EVENTS && <span className="cal-more">+{events.length - VISIBLE_EVENTS}</span>}
        </span>}
      </button>
    })}
  </div>

  return <section className={`cal ${className}`} aria-label="Month calendar">
    <header className="cal-header">
      <button type="button" className="cal-nav cal-nav-prev" aria-label={`Previous month, ${monthName(monthStart(view.month, -1))}`} onClick={() => go(monthStart(view.month, -1))}><Icon name="chevron" size={20} className="cal-nav-icon" /></button>
      <div className="cal-heading">
        <h2 className="cal-title" aria-live="polite"><span key={view.month} data-motion={view.step ? 'enter' : undefined} style={{ '--cal-dir': view.step ?? 1 } as CSSProperties}>{monthName(view.month)}</span></h2>
        {view.month !== thisMonth && <button type="button" className="cal-today" onClick={() => go(thisMonth)}>Today</button>}
      </div>
      <button type="button" className="cal-nav cal-nav-next" aria-label={`Next month, ${monthName(monthStart(view.month, 1))}`} onClick={() => go(monthStart(view.month, 1))}><Icon name="chevron" size={20} className="cal-nav-icon" /></button>
    </header>
    <div className="cal-weekdays" aria-hidden="true">{monthGrid(view.month).slice(0, 7).map(date => <span key={date}>{formatDate(date, { weekday: 'short' })}</span>)}</div>
    <div className="cal-viewport">
      {view.leaving && grid(view.leaving, 'leave')}
      {grid(view.month, view.step ? 'enter' : null)}
    </div>
  </section>
}

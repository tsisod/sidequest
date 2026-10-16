import { useEffect, useRef, useState } from 'react'
import type { ActionResult, DateKey, Family, FamilyCommand } from '../../shared/domain'
import { eventsOn } from '../../shared/sidequest'
import MonthCalendar from '../calendar/MonthCalendar'
import DayPlanner from '../calendar/DayPlanner'
import { formatDate } from '../calendar/format'
import Icon from '../components/Icon'
import ParentMessage from './ParentMessage'
import './parentCalendar.css'

type ParentCalendarProps = { family: Family; onCommand: (command: FamilyCommand) => Promise<ActionResult> }

export default function ParentCalendar({ family, onCommand }: ParentCalendarProps) {
  const [day, setDay] = useState<DateKey | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const today = family.sessionDay

  useEffect(() => {
    const element = dialog.current
    if (day && element && !element.open) element.showModal()
    if (!day && element?.open) element.close()
  }, [day])

  return <section aria-labelledby="calendar-heading">
    <div className="p-page-heading"><div><h1 id="calendar-heading">Calendar</h1><p>Tap a day to plan an event for {family.childName}. Spark reminds them the day before.</p></div>
      <p className="p-calendar-legend"><span data-by="parent">Your events</span><span data-by="child">Added by {family.childName}</span></p>
    </div>
    <div className="p-feedback" aria-live="polite" aria-atomic="true">
      {notice && <ParentMessage kind="notice" message={notice} onDismiss={() => setNotice(null)} />}
    </div>
    <MonthCalendar className="p-card p-calendar" today={today} selected={day} eventsOn={date => eventsOn(family, date)} onPick={date => { setNotice(null); setDay(date) }} Icon={Icon} />
    <dialog className="dialog-shell p-dialog p-calendar-dialog" ref={dialog} aria-labelledby="calendar-dialog-title" onClose={() => setDay(null)} onClick={event => { if (event.target === event.currentTarget) setDay(null) }}>
      <div className="p-dialog-heading"><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setDay(null)}><Icon name="close" size={18} /></button><h2 id="calendar-dialog-title">{day && formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}{day === today && <small>Today</small>}</h2></div>
      {day && <DayPlanner key={day} date={day} today={today} role="parent" childName={family.childName} events={eventsOn(family, day)} Icon={Icon} onCommand={onCommand} onAdded={title => { setDay(null); setNotice(`“${title}” is on the calendar.`) }} />}
    </dialog>
  </section>
}

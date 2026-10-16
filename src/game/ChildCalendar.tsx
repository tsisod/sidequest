import { useState } from 'react'
import type { ActionResult, DateKey, Family, FamilyCommand } from '../../shared/domain'
import { eventsOn } from '../../shared/sidequest'
import MonthCalendar from '../calendar/MonthCalendar'
import DayPlanner from '../calendar/DayPlanner'
import { formatDate } from '../calendar/format'
import Icon from './GameIcon'
import './gameCalendar.css'

type ChildCalendarProps = { family: Family; helperName: string; onCommand: (command: FamilyCommand) => Promise<ActionResult> }

export default function ChildCalendar({ family, helperName, onCommand }: ChildCalendarProps) {
  const today = family.sessionDay
  const [day, setDay] = useState<DateKey>(today)
  return <div className="game-menu-pane game-calendar">
    <p className="game-menu-note">Plan your own events here. {helperName} reminds you the day before. Only your parent can delete the events they planned.</p>
    <MonthCalendar today={today} selected={day} eventsOn={date => eventsOn(family, date)} onPick={setDay} Icon={Icon} />
    <section className="game-calendar-day" aria-labelledby="game-calendar-day">
      <h3 id="game-calendar-day">{formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}{day === today && <small>Today</small>}</h3>
      <DayPlanner key={day} date={day} today={today} role="child" childName={family.childName} events={eventsOn(family, day)} Icon={Icon} onCommand={onCommand} />
    </section>
  </div>
}

import type { DateKey, Family, Schedule } from '../../shared/domain'
import { addDays, startOfWeek } from '../../shared/calendar'
import { eventsOn } from '../../shared/sidequest'

const formatters = new Map<string, Intl.DateTimeFormat>()
export function formatDate(date: DateKey, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options)
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' })
    formatters.set(key, formatter)
  }
  return formatter.format(new Date(`${date}T12:00:00Z`))
}

export function repeatLabel(schedule: Schedule): string {
  if (schedule.kind === 'once') return 'Once'
  if (schedule.kind === 'daily') return 'Every day'
  const monday = startOfWeek(schedule.from)
  return `Every ${schedule.weekdays.map(weekday => formatDate(addDays(monday, weekday - 1), { weekday: 'long' })).join(', ')}`
}

export function nextEventLabel(family: Family, days = 14): string {
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(family.sessionDay, offset)
    const event = eventsOn(family, date)[0]
    if (event) return `${event.title} · ${offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}`
  }
  return 'Nothing planned yet'
}

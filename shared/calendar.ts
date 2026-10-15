import type { DateKey, TimeZone, Weekday } from './domain.ts'

function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function parseDateKey(value: unknown): DateKey | null { return isDateKey(value) ? value : null }

function isTimeZone(value: unknown): value is TimeZone {
  if (typeof value !== 'string' || value.length > 100 || !value) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0); return true } catch { return false }
}
export function parseTimeZone(value: unknown): TimeZone | null { return isTimeZone(value) ? value : null }

const formatters = new Map<TimeZone, Intl.DateTimeFormat>()
export function dateAt(now: number, zone: TimeZone): DateKey {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'gregory', numberingSystem: 'latn' })
    formatters.set(zone, formatter)
  }
  const parts = formatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  const date = parseDateKey(`${part('year')?.padStart(4, '0')}-${part('month')}-${part('day')}`)
  if (!date) throw new Error('Sidequest could not read the household date.')
  return date
}
export function addDays(date: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) throw new Error('Calendar days must be whole numbers.')
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  const result = parseDateKey(value.toISOString().slice(0, 10))
  if (!result) throw new Error('This calendar date is outside the supported range.')
  return result
}
export function weekdayOf(date: DateKey): Weekday {
  const weekdays: Weekday[] = [7, 1, 2, 3, 4, 5, 6]
  return weekdays[new Date(`${date}T00:00:00.000Z`).getUTCDay()]
}
export function startOfWeek(date: DateKey): DateKey { return addDays(date, 1 - weekdayOf(date)) }
export function nextDayBoundary(now: number, zone: TimeZone): number {
  let low = Math.floor(now)
  let high = low + 36 * 60 * 60_000
  const today = dateAt(low, zone)
  if (dateAt(high, zone) === today) throw new Error('Sidequest could not find the next household day.')
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (dateAt(middle, zone) === today) low = middle
    else high = middle
  }
  return high
}

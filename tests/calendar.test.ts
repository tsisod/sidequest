import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, dateAt, monthGrid, monthStart, nextDayBoundary, parseDateKey, parseTimeZone, startOfWeek, weekdayOf } from '../shared/calendar.ts'

function zone(value: string) { const parsed = parseTimeZone(value); assert.ok(parsed); return parsed }
function day(value: string) { const parsed = parseDateKey(value); assert.ok(parsed); return parsed }

test('date keys validate real Gregorian dates and calendar arithmetic handles month/year boundaries', () => {
  for (const invalid of ['2026-02-29', '2026-04-31', '2026-1-01', 'not-a-date', 123, null]) assert.equal(parseDateKey(invalid), null)
  assert.equal(addDays(day('2024-02-28'), 1), '2024-02-29')
  assert.equal(addDays(day('2026-12-31'), 1), '2027-01-01')
  assert.equal(weekdayOf(day('2026-10-19')), 1)
  assert.equal(weekdayOf(day('2026-10-18')), 7)
  assert.equal(startOfWeek(day('2026-10-18')), '2026-10-12')
})

test('household dates use the configured zone independent of host zone', () => {
  const now = Date.parse('2026-10-15T17:00:00.000Z')
  assert.equal(dateAt(now, zone('Asia/Bangkok')), '2026-10-16')
  assert.equal(dateAt(now, zone('America/New_York')), '2026-10-15')
  assert.equal(parseTimeZone('Somewhere/Invalid'), null)
})

test('next midnight handles twenty-three and twenty-five hour DST days exactly', () => {
  const ny = zone('America/New_York')
  const spring = Date.parse('2026-03-08T05:00:00.000Z')
  const fall = Date.parse('2026-11-01T04:00:00.000Z')
  assert.equal(nextDayBoundary(spring, ny), Date.parse('2026-03-09T04:00:00.000Z'))
  assert.equal(nextDayBoundary(fall, ny), Date.parse('2026-11-02T05:00:00.000Z'))
  assert.equal((nextDayBoundary(spring, ny) - spring) / 3_600_000, 23)
  assert.equal((nextDayBoundary(fall, ny) - fall) / 3_600_000, 25)
  const bangkok = zone('Asia/Bangkok')
  const before = Date.parse('2026-10-15T16:59:59.999Z')
  assert.equal(nextDayBoundary(before, bangkok), before + 1)
})

test('month views start on the Monday before the first and cover six full weeks', () => {
  assert.equal(monthStart(day('2026-10-16')), '2026-10-01')
  assert.equal(monthStart(day('2026-12-31'), 1), '2027-01-01')
  assert.equal(monthStart(day('2026-01-31'), -1), '2025-12-01')
  assert.equal(monthStart(day('2026-03-31'), -1), '2026-02-01')
  assert.throws(() => monthStart(day('2026-10-16'), 0.5), /whole numbers/)
  const october = monthGrid(day('2026-10-01'))
  assert.equal(october.length, 42)
  assert.equal(october[0], '2026-09-28')
  assert.equal(weekdayOf(october[0]), 1)
  assert.equal(october[41], '2026-11-08')
  assert.equal(monthGrid(day('2026-06-01'))[0], '2026-06-01')
  assert.equal(monthGrid(day('2026-02-15'))[0], '2026-01-26')
})

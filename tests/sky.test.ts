import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daylightAt, localTime, seasonFor } from '../src/game/sky.ts'

const at = (iso: string, timeZone: string) => localTime(Date.parse(iso), timeZone)

test('local time follows the household time zone', () => {
  assert.deepEqual(at('2026-10-15T12:30:00Z', 'America/New_York'), { month: 10, dayOfYear: 288, hour: 8.5 })
  assert.deepEqual(at('2026-10-15T23:00:00Z', 'Asia/Tokyo'), { month: 10, dayOfYear: 289, hour: 8 })
})

test('seasons follow the calendar and flip in the southern hemisphere', () => {
  assert.equal(seasonFor(at('2026-10-15T12:00:00Z', 'America/New_York'), 'America/New_York'), 'autumn')
  assert.equal(seasonFor(at('2026-10-15T12:00:00Z', 'Australia/Sydney'), 'Australia/Sydney'), 'spring')
  assert.equal(seasonFor(at('2026-01-10T12:00:00Z', 'Europe/London'), 'Europe/London'), 'winter')
  assert.equal(seasonFor(at('2026-07-04T12:00:00Z', 'America/Argentina/Buenos_Aires'), 'America/Argentina/Buenos_Aires'), 'winter')
  assert.equal(seasonFor(at('2026-04-20T12:00:00Z', 'Europe/Berlin'), 'Europe/Berlin'), 'spring')
  assert.equal(seasonFor(at('2026-08-01T12:00:00Z', 'Asia/Tokyo'), 'Asia/Tokyo'), 'summer')
})

test('midday is untinted, midnight is dark with lit windows, and evening turns warm', () => {
  const october = { month: 10, dayOfYear: 288 }
  assert.deepEqual(daylightAt({ ...october, hour: 12 }, 'Europe/London'), { tint: null, glow: 0 })
  const midnight = daylightAt({ ...october, hour: 0 }, 'Europe/London')
  assert.equal(midnight.glow, 1)
  assert.ok(midnight.tint && midnight.tint[2] > midnight.tint[0])
  const evening = daylightAt({ ...october, hour: 17.6 }, 'Europe/London')
  assert.ok(evening.tint && evening.tint[0] > evening.tint[2])
})

test('summer days are longer than winter days', () => {
  const lit = (dayOfYear: number, timeZone: string, hour: number) => daylightAt({ month: 1, dayOfYear, hour }, timeZone).tint === null
  assert.equal(lit(172, 'Europe/Paris', 18.5), true)
  assert.equal(lit(355, 'Europe/Paris', 18.5), false)
  assert.equal(lit(355, 'Australia/Melbourne', 18.5), true)
})

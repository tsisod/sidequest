import { internalMutationGeneric, internalQueryGeneric } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { dateAt, nextDayBoundary, parseDateKey, parseTimeZone } from '../shared/calendar.ts'
import { migrateV2Family, parseV2Family } from '../shared/migrations.ts'
import { alarmInstant, alarmVolume, parseAlarmTime } from '../shared/wakeAlarm.ts'
import { earnedGold, earnedXp, familyWithinSizeLimit, parseFamily, remainingMs } from '../shared/sidequest.ts'

function migrationZone() {
  const zone = parseTimeZone('Asia/Bangkok')
  if (!zone) throw new ConvexError('The migration time zone is unavailable.')
  return zone
}
export const preview = internalQueryGeneric({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const timeZone = migrationZone()
    const rows = await ctx.db.query('families').collect()
    return { now, timeZone, families: rows.map(row => {
      const current = parseFamily(row.family)
      const legacy = parseV2Family(row.family)
      const family = current ?? migrateV2Family(row.family, { now, timeZone })
      if (!family) throw new ConvexError('A family failed validation. No data was changed.')
      return { rowId: row._id, familyId: family.id, alreadyMigrated: Boolean(current), quests: family.quests.length, templates: family.templates.length, approved: family.quests.filter(quest => quest.status === 'approved').length, xp: earnedXp(family), gold: earnedGold(family), sessionDay: family.sessionDay, beforeClock: legacy?.clock ?? family.clock, afterClock: family.clock, remainingMs: remainingMs(family.clock, now), withinSizeLimit: familyWithinSizeLimit(family) }
    }) }
  },
})
export const run = internalMutationGeneric({
  args: { now: v.optional(v.number()), expectedLegacyCount: v.number() },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const timeZone = migrationZone()
    const rows = await ctx.db.query('families').collect()
    const legacy = rows.filter(row => !parseFamily(row.family))
    if (legacy.length > 0 && legacy.length !== args.expectedLegacyCount) throw new ConvexError('The legacy family count changed. Preview again before migration.')
    for (const row of legacy) {
      const family = migrateV2Family(row.family, { now, timeZone })
      if (!family || !familyWithinSizeLimit(family)) throw new ConvexError('A family failed migration validation. No records were changed.')
      await ctx.db.patch(row._id, { family })
    }
    return { migrated: legacy.length, unchanged: rows.length - legacy.length, now, timeZone }
  },
})
export const calendarProbe = internalQueryGeneric({
  args: {},
  handler: () => {
    const cases = [
      { zone: 'Asia/Bangkok', instant: '2026-10-15T17:00:00.000Z' },
      { zone: 'America/New_York', instant: '2026-03-08T05:00:00.000Z' },
      { zone: 'America/New_York', instant: '2026-11-01T04:00:00.000Z' },
    ]
    return cases.map(item => {
      const zone = parseTimeZone(item.zone)
      if (!zone) throw new ConvexError(`Time zone unsupported: ${item.zone}`)
      const now = Date.parse(item.instant)
      const boundary = nextDayBoundary(now, zone)
      return { ...item, date: dateAt(now, zone), nextBoundary: new Date(boundary).toISOString(), hours: (boundary - now) / 3_600_000 }
    })
  },
})

export const wakeProbe = internalQueryGeneric({
  args: {},
  handler: () => {
    const cases = [
      { zone: 'Asia/Bangkok', date: '2026-10-15', time: '07:00' },
      { zone: 'America/New_York', date: '2026-03-08', time: '02:30' },
      { zone: 'America/New_York', date: '2026-11-01', time: '01:30' },
    ]
    return {
      instants: cases.map(item => {
        const zone = parseTimeZone(item.zone)
        const date = parseDateKey(item.date)
        const time = parseAlarmTime(item.time)
        if (!zone || !date || !time) throw new ConvexError('The wake-up runtime probe failed validation.')
        return { ...item, scheduledAt: new Date(alarmInstant(date, time, zone)).toISOString() }
      }),
      volumes: [0, 2_000, 100_000].map(elapsedMs => ({ elapsedMs, gain: alarmVolume(elapsedMs) })),
    }
  },
})

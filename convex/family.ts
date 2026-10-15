import { mutationGeneric, queryGeneric } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { FamilyCommand } from '../shared/domain.ts'
import { applyCommand, createFamily, familyWithinSizeLimit, parseFamily, parsePlace, parseSchedule } from '../shared/sidequest.ts'
import { parseAlarmTime } from '../shared/wakeAlarm.ts'
import { parseDateKey, parseTimeZone } from '../shared/calendar.ts'
import { commandValidator, legacyCommandValidator, roleValidator } from './validators.ts'

const refreshMessage = 'Sidequest has updated. Refresh this page to continue.'
const version = v.optional(v.number())
export async function digest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
function validToken(token: string): boolean { return /^[a-f0-9]{64}$/.test(token) }

export const create = mutationGeneric({
  args: { parentToken: v.string(), code: v.string(), id: v.string(), clientVersion: version, timeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.clientVersion !== 3) return { ok: false, message: refreshMessage }
    const timeZone = parseTimeZone(args.timeZone)
    if (!timeZone || !validToken(args.parentToken) || !/^[A-Z2-9]{8,12}$/.test(args.code) || !args.id || args.id.length > 100) return { ok: false, message: 'Invalid family setup or household time zone.' }
    const parentHash = await digest(args.parentToken)
    const existing = await ctx.db.query('families').withIndex('by_parent', q => q.eq('parentHash', parentHash)).unique()
    if (existing) return { ok: true }
    const existingCapability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', parentHash)).unique()
    if (existingCapability) return { ok: false, message: 'This credential belongs to a different connection.' }
    const duplicate = await ctx.db.query('families').withIndex('by_code', q => q.eq('code', args.code)).unique()
    if (duplicate) return { ok: false, message: 'This pairing code is already in use. Please try a new family code.' }
    const family = createFamily({ id: args.id, code: args.code, now: Date.now(), timeZone })
    if (!familyWithinSizeLimit(family)) return { ok: false, message: 'This family board has reached its storage capacity.' }
    const familyId = await ctx.db.insert('families', { family, code: args.code, parentHash })
    await ctx.db.insert('capabilities', { tokenHash: parentHash, role: 'parent', familyId })
    return { ok: true }
  },
})

export const join = mutationGeneric({
  args: { code: v.string(), childToken: v.string(), clientVersion: version },
  handler: async (ctx, args) => {
    if (args.clientVersion !== 3) return { ok: false, message: refreshMessage }
    if (!validToken(args.childToken)) return { ok: false, message: 'Invalid child connection. Reload and try again.' }
    const code = args.code.trim().toUpperCase()
    if (!/^[A-Z2-9]{8,12}$/.test(code)) return { ok: false, message: 'Enter the 8–12 character family code.' }
    const family = await ctx.db.query('families').withIndex('by_code', q => q.eq('code', code)).unique()
    if (!family) return { ok: false, message: 'That family code was not found. Check it with your parent.' }
    const tokenHash = await digest(args.childToken)
    const existing = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique()
    if (existing) return existing.role === 'child' && existing.familyId === family._id ? { ok: true } : { ok: false, message: 'This connection belongs to another family.' }
    await ctx.db.insert('capabilities', { tokenHash, role: 'child', familyId: family._id })
    return { ok: true }
  },
})

export const get = queryGeneric({
  args: { token: v.string(), role: roleValidator, clockSample: v.string(), clientVersion: version },
  handler: async (ctx, args) => {
    if (args.clientVersion !== 3) throw new ConvexError(refreshMessage)
    if (!validToken(args.token)) return null
    const tokenHash = await digest(args.token)
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique()
    if (!capability || capability.role !== args.role) return null
    const row = await ctx.db.get(capability.familyId)
    if (!row) return null
    const family = parseFamily(row.family)
    if (!family) throw new ConvexError('Sidequest is updating this family. Refresh shortly. Your data has been kept.')
    return { family, serverNow: Date.now() }
  },
})

export const command = mutationGeneric({
  args: { token: v.string(), role: roleValidator, command: v.union(commandValidator, legacyCommandValidator), clientVersion: version },
  handler: async (ctx, args) => {
    if (args.clientVersion !== 3) return { ok: false, message: refreshMessage }
    if (args.command.kind === 'add-quest' || args.command.kind === 'remove-quest') return { ok: false, message: refreshMessage }
    if (!validToken(args.token)) return { ok: false, message: 'This family connection has expired.' }
    const tokenHash = await digest(args.token)
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique()
    if (!capability || capability.role !== args.role) return { ok: false, message: 'This action needs a valid family connection.' }
    const row = await ctx.db.get(capability.familyId)
    const family = row && parseFamily(row.family)
    if (!family) return { ok: false, message: 'Sidequest is updating this family. Refresh shortly. Your data has been kept.' }
    let command: FamilyCommand
    if (args.command.kind === 'add-template') {
      const schedule = parseSchedule(args.command.schedule)
      const place = parsePlace(args.command.place)
      if (!schedule || !place) return { ok: false, message: 'Choose a valid task schedule.' }
      command = { ...args.command, place, schedule }
    } else if (args.command.kind === 'set-wake-alarm') {
      const time = parseAlarmTime(args.command.time)
      if (!time) return { ok: false, message: 'Choose a valid wake-up time.' }
      command = { ...args.command, time }
    } else if (args.command.kind === 'complete-wake-game') {
      const date = parseDateKey(args.command.date)
      if (!date) return { ok: false, message: 'Choose the current wake-up challenge.' }
      command = { ...args.command, date }
    } else command = args.command
    const outcome = applyCommand(family, command, { role: capability.role, now: Date.now() })
    if (!familyWithinSizeLimit(outcome.family)) return { ok: false, message: 'This family board has reached its storage capacity. Your saved data has been kept.' }
    await ctx.db.patch(row._id, { family: outcome.family })
    return outcome.result
  },
})

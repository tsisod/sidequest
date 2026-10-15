import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { familyValidator, roleValidator } from './validators.ts'

export default defineSchema({
  families: defineTable({ family: familyValidator, code: v.string(), parentHash: v.string() }).index('by_parent', ['parentHash']).index('by_code', ['code']),
  capabilities: defineTable({ tokenHash: v.string(), role: roleValidator, familyId: v.id('families') }).index('by_token', ['tokenHash']),
  sparkAlerts: defineTable({ familyId: v.id('families'), kind: v.union(v.literal('support'), v.literal('blocked'), v.literal('reply')), message: v.string(), reply: v.optional(v.string()), createdAt: v.number(), readAt: v.optional(v.number()) }).index('by_family', ['familyId', 'createdAt']),
  speechClips: defineTable({ hash: v.string(), storageId: v.id('_storage'), words: v.array(v.object({ from: v.number(), to: v.number(), start: v.number(), end: v.number() })) }).index('by_hash', ['hash']),
})

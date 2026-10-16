import Anthropic from '@anthropic-ai/sdk'
import { actionGeneric, internalMutationGeneric, internalQueryGeneric, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { ActionResult, Family } from '../shared/domain.ts'
import { parseKeybinds } from '../shared/keybinds.ts'
import { applyCommand, familyWithinSizeLimit, parseFamily, projectDay, reconcileFamily } from '../shared/sidequest.ts'
import { defaultSpark, MAX_SPARK_ALERTS, MAX_SPARK_MESSAGE, MAX_SPARK_REPLY, parseSparkName, parseSparkScreening, parseSparkTurns, sparkBriefing, sparkGuide, sparkSafeReplies, sparkSafetyGuide, sparkSafetyRequest, sparkVerdictSchema } from '../shared/spark.ts'
import type { SparkAlert, SparkAlertKind, SparkCheck, SparkHeard, SparkReply, SparkScreening } from '../shared/spark.ts'
import { digest } from './family.ts'
import { transcribe, usableClip } from './transcribe.ts'

const MODEL = 'claude-opus-5-5'
const SAFETY_MODEL = 'claude-haiku-5-5'
const MAX_STEPS = 4

export const context = internalQueryGeneric({
  args: { tokenHash: v.string() },
  handler: async (ctx, args): Promise<Family | null> => {
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (capability?.role !== 'child') return null
    const row = await ctx.db.get(capability.familyId)
    return row ? parseFamily(row.family) : null
  },
})

export const submit = internalMutationGeneric({
  args: { tokenHash: v.string(), questId: v.string() },
  handler: async (ctx, args): Promise<ActionResult> => {
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (capability?.role !== 'child') return { ok: false, message: 'Only the child game can send quests for approval.' }
    const row = await ctx.db.get(capability.familyId)
    const family = row && parseFamily(row.family)
    if (!family) return { ok: false, message: 'Sidequest is updating this family. Try again shortly.' }
    const outcome = applyCommand(family, { kind: 'submit', questId: args.questId }, { role: 'child', now: Date.now() })
    if (!familyWithinSizeLimit(outcome.family)) return { ok: false, message: 'This family board has reached its storage capacity.' }
    await ctx.db.patch(row._id, { family: outcome.family })
    return outcome.result
  },
})

const alertKind = v.union(v.literal('support'), v.literal('blocked'), v.literal('reply'))

export const alert = internalMutationGeneric({
  args: { tokenHash: v.string(), kind: alertKind, message: v.string(), reply: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (capability?.role !== 'child') return
    await ctx.db.insert('sparkAlerts', { familyId: capability.familyId, kind: args.kind, message: args.message.slice(0, MAX_SPARK_MESSAGE), ...args.reply ? { reply: args.reply.slice(0, MAX_SPARK_REPLY) } : {}, createdAt: Date.now() })
    const kept = await ctx.db.query('sparkAlerts').withIndex('by_family', q => q.eq('familyId', capability.familyId)).order('desc').take(MAX_SPARK_ALERTS + 1)
    if (kept.length > MAX_SPARK_ALERTS) await ctx.db.delete(kept[MAX_SPARK_ALERTS]._id)
  },
})

export const inbox = queryGeneric({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<SparkAlert[] | null> => {
    if (!/^[a-f0-9]{64}$/.test(args.token)) return null
    const tokenHash = await digest(args.token)
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique()
    if (capability?.role !== 'parent') return null
    const rows = await ctx.db.query('sparkAlerts').withIndex('by_family', q => q.eq('familyId', capability.familyId)).order('desc').take(MAX_SPARK_ALERTS)
    return rows.map(row => ({ id: row._id, kind: row.kind, message: row.message, reply: row.reply ?? null, createdAt: row.createdAt, readAt: row.readAt ?? null }))
  },
})

export const editInbox = mutationGeneric({
  args: { token: v.string(), change: v.union(v.object({ kind: v.literal('read') }), v.object({ kind: v.literal('remove'), id: v.string() })) },
  handler: async (ctx, args): Promise<ActionResult> => {
    if (!/^[a-f0-9]{64}$/.test(args.token)) return { ok: false, message: 'This family connection has expired.' }
    const tokenHash = await digest(args.token)
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique()
    if (capability?.role !== 'parent') return { ok: false, message: 'Only a parent can change the inbox.' }
    if (args.change.kind === 'read') {
      const now = Date.now()
      const rows = await ctx.db.query('sparkAlerts').withIndex('by_family', q => q.eq('familyId', capability.familyId)).order('desc').take(MAX_SPARK_ALERTS)
      for (const row of rows) if (row.readAt === undefined) await ctx.db.patch(row._id, { readAt: now })
      return { ok: true }
    }
    const id = ctx.db.normalizeId('sparkAlerts', args.change.id)
    const row = id && await ctx.db.get(id)
    if (!row || row.familyId !== capability.familyId) return { ok: false, message: 'That message was already removed.' }
    await ctx.db.delete(row._id)
    return { ok: true }
  },
})

const contextRef = makeFunctionReference<'query', { tokenHash: string }, Family | null>('spark:context')
const submitRef = makeFunctionReference<'mutation', { tokenHash: string; questId: string }, ActionResult>('spark:submit')
const alertRef = makeFunctionReference<'mutation', { tokenHash: string; kind: SparkAlertKind; message: string; reply?: string }, null>('spark:alert')
const unavailable = (message: string): SparkReply => ({ ok: false, message })

/** The child's spoken message as text; it is then sent through `ask`, so the usual safety checks apply. */
export const hear = actionGeneric({
  args: { token: v.string(), name: v.string(), audio: v.bytes(), mimeType: v.string(), language: v.string() },
  handler: async (ctx, args): Promise<SparkHeard> => {
    const name = parseSparkName(args.name) ?? defaultSpark.name
    if (!/^[a-f0-9]{64}$/.test(args.token) || !usableClip(args)) return { ok: false, message: `${name} couldn't hear that. Try again, or type it.` }
    if (!await ctx.runQuery(contextRef, { tokenHash: await digest(args.token) })) return { ok: false, message: `${name} needs a connected child device.` }
    const heard = await transcribe(args, MAX_SPARK_MESSAGE)
    if (heard.ok) return heard
    if (heard.reason === 'unclear') return { ok: false, message: `${name} couldn't hear that clearly. Try again, or type it.` }
    if (heard.reason === 'busy') return { ok: false, message: `${name} is busy listening to lots of people. Try again in a minute, or type it.` }
    if (heard.reason === 'out-of-credits') return { ok: false, message: `Talking to ${name} out loud isn't working right now. Ask a parent, or type instead.` }
    return { ok: false, message: `Talking to ${name} out loud isn't set up yet. Ask a parent, or type instead.` }
  },
})

const tools: Anthropic.Beta.BetaTool[] = [{
  name: 'submit_quest',
  description: 'Send one of today\'s to-do quests to the child\'s parent for approval. Use it only when the child clearly says they have finished that quest in real life. It cannot approve quests or change anything else.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { quest_id: { type: 'string', description: 'The id of the quest from today\'s list in the game state.' } },
    required: ['quest_id'],
    additionalProperties: false,
  },
}]

async function screen(client: Anthropic, check: SparkCheck): Promise<SparkScreening | 'unavailable'> {
  try {
    const response = await client.messages.create({
      model: SAFETY_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: sparkVerdictSchema } },
      system: [{ type: 'text', text: sparkSafetyGuide, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: sparkSafetyRequest(check) }],
    })
    if (response.stop_reason === 'refusal') return { verdict: check.kind === 'message' ? 'support' : 'block', caregiver: false }
    if (response.stop_reason !== 'end_turn') return 'unavailable'
    return parseSparkScreening(response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')) ?? 'unavailable'
  } catch (error) {
    console.error('Spark safety check failed', error instanceof Anthropic.APIError ? error.status : error)
    return 'unavailable'
  }
}

export const ask = actionGeneric({
  args: { token: v.string(), name: v.string(), keybinds: v.record(v.string(), v.string()), turns: v.array(v.object({ role: v.union(v.literal('child'), v.literal('spark')), text: v.string() })) },
  handler: async (ctx, args): Promise<SparkReply> => {
    const name = parseSparkName(args.name) ?? defaultSpark.name
    const turns = parseSparkTurns(args.turns)
    if (!/^[a-f0-9]{64}$/.test(args.token) || !turns) return unavailable('Try asking that again in a shorter message.')
    const tokenHash = await digest(args.token)
    const saved = await ctx.runQuery(contextRef, { tokenHash })
    if (!saved) return unavailable(`${name} needs a connected child device.`)
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return unavailable(`${name} is not set up yet. Ask a parent to add the AI key.`)
    const now = Date.now()
    const family = reconcileFamily(saved, now)
    const today = projectDay(family, family.sessionDay).quests
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: sparkGuide, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: sparkBriefing(family, now, { name, keybinds: parseKeybinds(args.keybinds) }) },
    ]
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map(turn => ({ role: turn.role === 'child' ? 'user' : 'assistant', content: turn.text }))
    const submitted: string[] = []

    async function submitQuest(input: unknown): Promise<{ content: string; is_error?: boolean }> {
      const questId = typeof input === 'object' && input !== null && 'quest_id' in input && typeof input.quest_id === 'string' ? input.quest_id : ''
      const quest = today.find(item => item.id === questId)
      if (!quest) return { content: 'There is no quest with that id today.', is_error: true }
      if (quest.status === 'pending') return { content: `"${quest.title}" is already waiting for parent approval.` }
      if (quest.status === 'approved') return { content: `"${quest.title}" is already approved.` }
      const result = await ctx.runMutation(submitRef, { tokenHash, questId })
      if (!result.ok) return { content: result.message, is_error: true }
      submitted.push(quest.title)
      return { content: `Sent "${quest.title}" to the parent. It is now waiting for approval.` }
    }

    const client = new Anthropic({ apiKey })
    const asked = turns[turns.length - 1].text
    const messageCheck = screen(client, { kind: 'message', message: asked })
    const record = (kind: SparkAlertKind, reply?: string) => ctx.runMutation(alertRef, { tokenHash, kind, message: asked, ...reply ? { reply } : {} })
    async function cleared(): Promise<SparkReply | null> {
      const result = await messageCheck
      if (result === 'unavailable') return unavailable(`${name} could not check that safely right now. Try again soon.`)
      if (result.verdict === 'allow') return null
      if (result.verdict === 'block') await record('blocked')
      else if (!result.caregiver) await record('support')
      return { ok: true, reply: result.verdict === 'block' ? sparkSafeReplies.blocked : result.caregiver ? sparkSafeReplies.supportOutsideHome : sparkSafeReplies.support, submitted }
    }

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system,
          tools,
          messages,
        })
        if (response.stop_reason === 'refusal') {
          const stop = await cleared()
          if (stop) return stop
          await record('blocked')
          return { ok: true, reply: sparkSafeReplies.blocked, submitted }
        }
        if (response.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: response.content }); continue }
        const uses = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use')
        if (response.stop_reason !== 'tool_use' || !uses.length) {
          const reply = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('').replace(/\*\*|__|`|^#+\s*/gm, '').trim().slice(0, MAX_SPARK_REPLY)
          const stop = await cleared()
          if (stop) return stop
          if (!reply) return unavailable(`${name} lost its words. Try asking again.`)
          const result = await screen(client, { kind: 'reply', message: asked, reply })
          if (result === 'unavailable') return unavailable(`${name} could not check that answer safely right now. Try again soon.`)
          if (result.verdict === 'allow') return { ok: true, reply, submitted }
          await record('reply', reply)
          return { ok: true, reply: sparkSafeReplies.unclear, submitted }
        }
        const stop = await cleared()
        if (stop) return stop
        messages.push({ role: 'assistant', content: response.content })
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
        for (const use of uses) {
          const result = use.name === 'submit_quest' ? await submitQuest(use.input) : { content: 'That tool is not available.', is_error: true }
          results.push({ type: 'tool_result', tool_use_id: use.id, ...result })
        }
        messages.push({ role: 'user', content: results })
      }
      return unavailable(`${name} got stuck. Try asking again.`)
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return unavailable(`${name}'s AI key is not working. Ask a parent to check it.`)
      if (error instanceof Anthropic.RateLimitError) return unavailable(`${name} is busy. Try again in a minute.`)
      if (error instanceof Anthropic.APIError) return unavailable(`${name} could not answer right now. Try again soon.`)
      throw error
    }
  },
})

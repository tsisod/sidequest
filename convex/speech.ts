import { actionGeneric, internalMutationGeneric, internalQueryGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { GenericId } from 'convex/values'
import { alignedWords, MAX_SPEECH_CHARACTERS, parseVoice, speechHash, speechRequest } from '../shared/speech.ts'
import type { SpeechAlignment, SpeechResult, SpeechWord } from '../shared/speech.ts'
import { digest } from './family.ts'

type StoredClip = { storageId: GenericId<'_storage'>; words: SpeechWord[] }
const wordValidator = v.object({ from: v.number(), to: v.number(), start: v.number(), end: v.number() })

export const lookup = internalQueryGeneric({
  args: { tokenHash: v.string(), hash: v.string() },
  handler: async (ctx, args): Promise<{ child: boolean; clip: StoredClip | null }> => {
    const capability = await ctx.db.query('capabilities').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique()
    const clip = await ctx.db.query('speechClips').withIndex('by_hash', q => q.eq('hash', args.hash)).unique()
    return { child: capability?.role === 'child', clip: clip ? { storageId: clip.storageId, words: clip.words } : null }
  },
})

export const remember = internalMutationGeneric({
  args: { hash: v.string(), storageId: v.id('_storage'), words: v.array(wordValidator) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('speechClips').withIndex('by_hash', q => q.eq('hash', args.hash)).unique()
    if (!existing) { await ctx.db.insert('speechClips', args); return }
    await ctx.db.patch(existing._id, { storageId: args.storageId, words: args.words })
    if (existing.storageId !== args.storageId) await ctx.storage.delete(existing.storageId).catch(() => undefined)
  },
})

const lookupRef = makeFunctionReference<'query', { tokenHash: string; hash: string }, { child: boolean; clip: StoredClip | null }>('speech:lookup')
const rememberRef = makeFunctionReference<'mutation', { hash: string; storageId: GenericId<'_storage'>; words: SpeechWord[] }, null>('speech:remember')
const unavailable = (message: string): SpeechResult => ({ ok: false, message })

export const speak = actionGeneric({
  args: { token: v.string(), text: v.string(), voice: v.optional(v.string()) },
  handler: async (ctx, args): Promise<SpeechResult> => {
    const text = args.text.trim()
    if (!/^[a-f0-9]{64}$/.test(args.token) || !text || text.length > MAX_SPEECH_CHARACTERS) return unavailable('This line cannot be voiced.')
    const voice = parseVoice(args.voice ?? 'smith')
    if (!voice) return unavailable('Choose one of the game voices.')
    const hash = await speechHash(text, voice)
    const { child, clip } = await ctx.runQuery(lookupRef, { tokenHash: await digest(args.token), hash })
    if (!child) return unavailable('Voice needs a connected child device.')
    const cached = clip && await ctx.storage.get(clip.storageId)
    if (clip && cached) return { ok: true, audio: await cached.arrayBuffer(), words: clip.words }
    const key = process.env.ELEVENLABS_API_KEY
    if (!key) return unavailable('Voice is not set up yet.')
    const request = speechRequest(text, voice)
    const response = await fetch(request.url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) })
    if (!response.ok) {
      console.error('Text-to-speech failed', response.status, (await response.text().catch(() => '')).slice(0, 300))
      return unavailable('Voice is unavailable right now.')
    }
    const result: { audio_base64?: unknown; alignment?: SpeechAlignment } = await response.json()
    if (typeof result.audio_base64 !== 'string') return unavailable('Voice is unavailable right now.')
    const audio = Uint8Array.from(atob(result.audio_base64), character => character.charCodeAt(0))
    const words = alignedWords(text, result.alignment)
    const storageId = await ctx.storage.store(new Blob([audio], { type: 'audio/mpeg' }))
    await ctx.runMutation(rememberRef, { hash, storageId, words })
    return { ok: true, audio: audio.buffer, words }
  },
})

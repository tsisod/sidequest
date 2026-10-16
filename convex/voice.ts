import Anthropic from '@anthropic-ai/sdk'
import { actionGeneric, makeFunctionReference } from 'convex/server'
import type { GenericActionCtx, GenericDataModel } from 'convex/server'
import { v } from 'convex/values'
import type { ActionResult, Family, FamilyCommand, Role } from '../shared/domain.ts'
import { reconcileFamily } from '../shared/sidequest.ts'
import { MAX_VOICE_CLIP_BYTES, MAX_VOICE_TEXT, parseVoiceTurns, voiceAction, voiceBriefing, voiceGuide } from '../shared/parentVoice.ts'
import type { VoiceReply, VoiceTurn } from '../shared/parentVoice.ts'

// Spoken commands need a quick answer, so this uses the fastest model at low effort.
const MODEL = 'claude-haiku-5-5'
const MAX_STEPS = 4
const CLIENT_VERSION = 3

// Reuse the dashboard's own endpoints so a spoken command is checked and saved exactly like a button press.
const getRef = makeFunctionReference<'query', { token: string; role: Role; clockSample: string; clientVersion: number }, { family: Family; serverNow: number } | null>('family:get')
const commandRef = makeFunctionReference<'mutation', { token: string; role: Role; command: FamilyCommand; clientVersion: number }, ActionResult>('family:command')

const quest = { type: 'string', description: 'A quest id from today\'s quests in the family state.' }
const tools: Anthropic.Tool[] = [
  {
    name: 'add_quest',
    description: 'Give the child a new quest: a real-life task they mark done in the game for the parent to approve.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short sentence-case title, 1 to 80 characters.' },
        xp: { type: 'integer', description: 'XP reward, 1 to 500.' },
        gold: { type: 'integer', description: 'Gold reward, 1 to 100.' },
        place: { type: 'string', enum: ['library', 'cottage', 'chores'], description: 'library: learning; cottage: chores at home and hygiene; chores: exercise and outdoor play.' },
        repeat: { type: 'string', enum: ['once', 'daily', 'weekly'] },
        weekdays: { type: 'array', items: { type: 'integer' }, description: 'For weekly quests: days 1 = Monday to 7 = Sunday. Otherwise empty.' },
        date: { type: 'string', description: 'For a once quest on a later day: YYYY-MM-DD. Empty for today or for repeating quests.' },
      },
      required: ['title', 'xp', 'gold', 'place', 'repeat', 'weekdays', 'date'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_task',
    description: 'Stop a task: a one-off quest is removed, a repeating one stops repeating from today. Approved quests keep their rewards.',
    strict: true,
    input_schema: { type: 'object', properties: { task_id: { type: 'string', description: 'A task id from the family state.' } }, required: ['task_id'], additionalProperties: false },
  },
  {
    name: 'approve_quest',
    description: 'Approve a quest the child has marked done, awarding its XP and gold. Only works once the child has sent it.',
    strict: true,
    input_schema: { type: 'object', properties: { quest_id: quest }, required: ['quest_id'], additionalProperties: false },
  },
  {
    name: 'send_back_quest',
    description: 'Send a quest the child marked done back to them to do again, without a reward.',
    strict: true,
    input_schema: { type: 'object', properties: { quest_id: quest }, required: ['quest_id'], additionalProperties: false },
  },
  {
    name: 'pause_game',
    description: 'Pause or unpause the child\'s game. While paused the child cannot walk around.',
    strict: true,
    input_schema: { type: 'object', properties: { paused: { type: 'boolean' } }, required: ['paused'], additionalProperties: false },
  },
  {
    name: 'set_wake_alarm',
    description: 'Turn the daily wake-up alarm on or off, optionally changing its time.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { enabled: { type: 'boolean' }, time: { type: 'string', description: '24-hour HH:MM such as 07:00, or empty to keep the current time.' } },
      required: ['enabled', 'time'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_child',
    description: 'Change the child\'s display name.',
    strict: true,
    input_schema: { type: 'object', properties: { name: { type: 'string', description: '1 to 24 characters.' } }, required: ['name'], additionalProperties: false },
  },
]

const spoken = (message: Anthropic.Message) => message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(' ').replace(/\*\*|__|`|^#+\s*|^\s*[-*]\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, MAX_VOICE_TEXT)

type Ctx = GenericActionCtx<GenericDataModel>
const turnValidator = v.object({ role: v.union(v.literal('parent'), v.literal('assistant')), text: v.string() })
const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token)

async function readFamily(ctx: Ctx, token: string): Promise<Family | null> {
  const snapshot = await ctx.runQuery(getRef, { token, role: 'parent', clockSample: `voice-${Date.now()}`, clientVersion: CLIENT_VERSION })
  return snapshot ? reconcileFamily(snapshot.family, Date.now()) : null
}

async function respond(ctx: Ctx, token: string, start: Family, turns: VoiceTurn[]): Promise<VoiceReply> {
  const heard = turns[turns.length - 1].text
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, message: 'Voice commands are not set up yet: the server needs its AI key.' }
  let family = start
  const client = new Anthropic({ apiKey })
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: voiceGuide, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: voiceBriefing(family, Date.now()) },
  ]
  const messages: Anthropic.MessageParam[] = turns.map(turn => ({ role: turn.role === 'parent' ? 'user' : 'assistant', content: turn.text }))
  const changes: string[] = []
  const done = (reply: string): VoiceReply => ({ ok: true, heard, reply, changes })
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.messages.create({ model: MODEL, max_tokens: 4096, output_config: { effort: 'low' }, system, tools, messages })
      if (response.stop_reason === 'refusal') return done('Sorry, I can\'t help with that one.')
      const uses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      if (response.stop_reason !== 'tool_use' || !uses.length) return done(spoken(response) || (changes.length ? 'Done.' : 'Sorry, I didn\'t catch that. Could you say it again?'))
      messages.push({ role: 'assistant', content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      // Haiku sometimes repeats the identical call in one reply; run it once and give the copy the same result.
      const seen = new Map<string, Anthropic.ToolResultBlockParam>()
      let failed = false
      for (const use of uses) {
        const title = use.name === 'add_quest' && typeof use.input === 'object' && use.input !== null && 'title' in use.input && typeof use.input.title === 'string' ? use.input.title.trim().toLowerCase() : null
        const key = title === null ? `${use.name}:${JSON.stringify(use.input)}` : `add_quest:${title}`
        const earlier = seen.get(key)
        if (earlier) { results.push({ ...earlier, tool_use_id: use.id }); continue }
        const action = voiceAction(use.name, use.input, { family, now: Date.now() })
        const record = (result: Anthropic.ToolResultBlockParam) => { seen.set(key, result); results.push(result) }
        if ('unchanged' in action) { record({ type: 'tool_result', tool_use_id: use.id, content: `${action.unchanged} Nothing needed changing.` }); continue }
        if ('error' in action) { failed = true; record({ type: 'tool_result', tool_use_id: use.id, content: action.error, is_error: true }); continue }
        const result = await ctx.runMutation(commandRef, { token, role: 'parent', command: action.command, clientVersion: CLIENT_VERSION })
        if (!result.ok) { failed = true; record({ type: 'tool_result', tool_use_id: use.id, content: result.message, is_error: true }); continue }
        changes.push(action.summary)
        family = await readFamily(ctx, token) ?? family
        record({ type: 'tool_result', tool_use_id: use.id, content: `Done. ${action.summary}.${action.note ? ` ${action.note}` : ''}` })
      }
      // The confirmation was written alongside the tool calls, so when everything worked there is no need for a second round trip.
      const confirmation = spoken(response)
      if (!failed && confirmation) return done(confirmation)
      messages.push({ role: 'user', content: results })
    }
    return done(changes.length ? 'Done.' : 'Sorry, I got stuck on that. Try saying it another way.')
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { ok: false, message: 'The server\'s AI key is not working.' }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, message: 'Voice commands are busy right now. Try again in a minute.' }
    if (error instanceof Anthropic.APIError) return { ok: false, message: 'I couldn\'t reach the voice assistant. Try again soon.' }
    throw error
  }
}

/** A typed command, or any text the parent already has. */
export const command = actionGeneric({
  args: { token: v.string(), turns: v.array(turnValidator) },
  handler: async (ctx, args): Promise<VoiceReply> => {
    const turns = parseVoiceTurns(args.turns)
    if (!validToken(args.token) || !turns) return { ok: false, message: 'Try saying that again a little shorter.' }
    const family = await readFamily(ctx, args.token)
    if (!family) return { ok: false, message: 'Voice commands need this parent dashboard to be connected.' }
    return respond(ctx, args.token, family, turns)
  },
})

const extensions: Record<string, string> = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav' }

// ElevenLabs Scribe turns the parent's recording into text; the browser's own speech recognition is too patchy across browsers.
async function transcribe(clip: { audio: ArrayBuffer; mimeType: string; language: string }): Promise<{ text: string } | { error: string }> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return { error: 'Voice input is not set up yet: the server needs its ElevenLabs key.' }
  const subtype = clip.mimeType.split(';')[0].split('/')[1] ?? ''
  const form = new FormData()
  form.append('model_id', 'scribe_v2')
  if (/^[a-z]{2,3}$/.test(clip.language)) form.append('language_code', clip.language)
  form.append('file', new Blob([clip.audio], { type: clip.mimeType.split(';')[0] }), `speech.${extensions[subtype] ?? 'webm'}`)
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    console.error('Speech-to-text failed', response.status, detail)
    if (detail.includes('missing_permissions')) return { error: 'Voice input needs the "Speech to Text" permission turned on for the server\'s ElevenLabs key.' }
    return { error: response.status === 401 ? 'The server\'s ElevenLabs key is not working.' : response.status === 429 ? 'Voice input is busy right now. Try again in a minute.' : 'I couldn\'t understand the recording. Try again.' }
  }
  const result: { text?: unknown } = await response.json()
  // Scribe marks sounds like "(laughs)" or "[music]"; only the words matter here.
  return { text: typeof result.text === 'string' ? result.text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_VOICE_TEXT) : '' }
}

/** A spoken command: the recording is transcribed, then answered like a typed one. */
export const listen = actionGeneric({
  args: { token: v.string(), audio: v.bytes(), mimeType: v.string(), language: v.string(), earlier: v.array(turnValidator) },
  handler: async (ctx, args): Promise<VoiceReply> => {
    if (!validToken(args.token) || args.audio.byteLength < 200 || args.audio.byteLength > MAX_VOICE_CLIP_BYTES || !/^audio\/[a-z0-9.+-]+(;.*)?$/i.test(args.mimeType)) return { ok: false, message: 'That recording could not be used. Try again.' }
    const family = await readFamily(ctx, args.token)
    if (!family) return { ok: false, message: 'Voice commands need this parent dashboard to be connected.' }
    const transcript = await transcribe(args)
    if ('error' in transcript) return { ok: false, message: transcript.error }
    if (!transcript.text) return { ok: true, heard: '', reply: '', changes: [] }
    const turns = parseVoiceTurns([...args.earlier, { role: 'parent', text: transcript.text }])
    if (!turns) return { ok: false, message: 'Let\'s start that again. Tap the circle and say it once more.' }
    return respond(ctx, args.token, family, turns)
  },
})

import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { parseTimeZone } from '../shared/calendar.ts'

if (process.argv.length !== 3 || !/^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/.test(process.argv[2])) {
  console.error('Usage: node scripts/verify-speech.mjs https://your-deployment.convex.cloud')
  process.exit(2)
}
const url = process.argv[2]
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from(randomBytes(12), byte => alphabet[byte % alphabet.length]).join('')
const tokens = { parent: randomBytes(32).toString('hex'), child: randomBytes(32).toString('hex') }
const http = new ConvexHttpClient(url, { logger: false, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }) })
const create = makeFunctionReference('family:create')
const join = makeFunctionReference('family:join')
const speak = makeFunctionReference('speech:speak')
const lines = { smith: 'Ah, a helper! The forge could use one today.', librarian: 'Hello there! Every book is a door.', housekeeper: 'Hi there! The cottage could use a helper.', dog: 'Woof woof! That means hello in dog.', angler: 'Shh! You will scare the fish.', gardener: 'Hello! I am looking after the crops.' }
const line = lines.smith

const created = await http.mutation(create, { parentToken: tokens.parent, code, id: `speech-${randomUUID()}`, timeZone: parseTimeZone('UTC'), clientVersion: 3 })
assert.equal(created.ok, true, 'Create a smoke family')
assert.equal((await http.action(speak, { token: tokens.child, text: line })).ok, false, 'An unlinked token is refused')
assert.equal((await http.mutation(join, { code, childToken: tokens.child, clientVersion: 3 })).ok, true, 'Link the child device')
assert.equal((await http.action(speak, { token: tokens.parent, text: line })).ok, false, 'The parent token is refused')
assert.equal((await http.action(speak, { token: tokens.child, text: 'x'.repeat(241) })).ok, false, 'Overlong text is refused')

const clips = {}
for (const [voice, text] of Object.entries(lines)) {
  const first = await http.action(speak, { token: tokens.child, text, voice })
  assert.equal(first.ok, true, first.ok ? '' : `${voice}: ${first.message}`)
  const bytes = new Uint8Array(first.audio)
  assert.ok(bytes.length > 4_000, `Expected real MP3 audio for ${voice}`)
  assert.ok((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), `Expected an MP3 header for ${voice}`)
  assert.deepEqual(first.words.map(word => text.slice(word.from, word.to)), text.match(/[\p{L}\p{N}]+/gu))
  assert.ok(first.words.every((word, index) => word.end >= word.start && (index === 0 || word.start >= first.words[index - 1].start)), 'Word timings must move forward')
  const started = Date.now()
  const second = await http.action(speak, { token: tokens.child, text, voice })
  assert.equal(second.ok, true)
  assert.deepEqual(new Uint8Array(second.audio), bytes, `The cached ${voice} clip is reused`)
  clips[voice] = bytes
  console.log(`PASS: ${voice} voice on ${url}: ${bytes.length} bytes, ${first.words.length} timed words, cached replay in ${Date.now() - started} ms.`)
}
const again = await http.action(speak, { token: tokens.child, text: lines.librarian, voice: 'smith' })
assert.equal(again.ok, true)
assert.notDeepEqual(new Uint8Array(again.audio), clips.librarian, 'Each voice caches its own clip of the same line')
console.log(`Retained 1 smoke family, 2 capabilities and ${Object.keys(lines).length + 1} cached clips.`)

import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { parseTimeZone } from '../shared/calendar.ts'
import { parseAlarmTime, wakePhase } from '../shared/wakeAlarm.ts'

const url = process.argv[2]
if (process.argv.length !== 3 || !/^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/.test(url)) {
  console.error('Usage: node scripts/verify-wake-alarm.mjs https://your-deployment.convex.cloud')
  process.exit(2)
}
const client = new ConvexHttpClient(url, { logger: false, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) })
const refs = Object.fromEntries(['create', 'join', 'get', 'command'].map(name => [name, makeFunctionReference(`family:${name}`)]))
const id = `wake-check-${randomUUID()}`
const tokens = { parent: randomBytes(32).toString('hex'), child: randomBytes(32).toString('hex') }
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from(randomBytes(12), byte => alphabet[byte % alphabet.length]).join('')
const timeZone = parseTimeZone('UTC')
assert.ok(timeZone)
let stage = 'setup'
let created = false

async function read() {
  const snapshot = await client.query(refs.get, { token: tokens.child, role: 'child', clockSample: randomUUID(), clientVersion: 3 })
  assert.ok(snapshot?.family && Number.isFinite(snapshot.serverNow))
  assert.equal(snapshot.family.id, id)
  return snapshot
}
async function command(role, action, allowed = true) {
  const result = await client.mutation(refs.command, { token: tokens[role], role, command: action, clientVersion: 3 })
  assert.equal(result.ok, allowed, `${role} ${action.kind}`)
}
async function waitUntil(instant) {
  while (Date.now() < instant) await new Promise(resolve => setTimeout(resolve, Math.min(15_000, instant - Date.now())))
}
function completion(phase) {
  assert.ok(phase.kind === 'ringing' || phase.kind === 'check')
  return { kind: 'complete-wake-game', date: phase.date, stage: phase.kind === 'check' ? 'check' : phase.stage, scheduledAt: phase.scheduledAt, game: phase.game }
}

try {
  assert.equal((await client.mutation(refs.create, { id, code, parentToken: tokens.parent, timeZone, clientVersion: 3 })).ok, true)
  created = true
  assert.equal((await client.mutation(refs.join, { code, childToken: tokens.child, clientVersion: 3 })).ok, true)
  const initial = await read()
  const questSnapshot = JSON.stringify(initial.family.quests)
  const clockSnapshot = JSON.stringify(initial.family.clock)
  const due = Math.ceil((Date.now() + 4_000) / 60_000) * 60_000
  const time = parseAlarmTime(new Date(due).toISOString().slice(11, 16))
  assert.ok(time)
  await command('child', { kind: 'set-wake-alarm', enabled: true, time }, false)
  await command('parent', { kind: 'set-wake-sound', sound: 'chimes' }, false)
  await command('parent', { kind: 'set-wake-alarm', enabled: true, time })
  await command('child', { kind: 'set-wake-sound', sound: 'chimes' })
  const scheduled = await read()
  const scheduledPhase = wakePhase(scheduled.family.wakeAlarm, scheduled.serverNow, timeZone)
  assert.equal(scheduledPhase.kind, 'scheduled')
  assert.equal(scheduledPhase.scheduledAt, due)
  await command('child', { kind: 'complete-wake-game', date: scheduledPhase.date, scheduledAt: due, stage: 'first', game: scheduledPhase.game }, false)

  stage = 'first daily alarm'
  console.log(`Waiting ${Math.ceil((due - Date.now()) / 1000)} seconds for the real scheduled alarm.`)
  await waitUntil(due + 500)
  const ringing = await read()
  const firstPhase = wakePhase(ringing.family.wakeAlarm, ringing.serverNow, timeZone)
  assert.equal(firstPhase.kind, 'ringing')
  const first = completion(firstPhase)
  await command('child', { ...first, scheduledAt: due - 60_000 }, false)
  await command('child', first)
  const passed = await read()
  assert.equal(passed.family.wakeAlarm.progress.kind, 'recheck')
  const originalProgress = structuredClone(passed.family.wakeAlarm.progress)
  await command('child', first)
  assert.deepEqual((await read()).family.wakeAlarm.progress, originalProgress)
  const waiting = wakePhase(passed.family.wakeAlarm, passed.serverNow, timeZone)
  assert.equal(waiting.kind, 'waiting')
  assert.equal(waiting.readyAt - originalProgress.firstPassedAt, 300_000)
  assert.equal(waiting.deadlineAt - waiting.readyAt, 60_000)
  await command('child', { kind: 'complete-wake-game', date: waiting.date, scheduledAt: waiting.scheduledAt, stage: 'check', game: waiting.game }, false)

  stage = 'five-minute awake check'
  console.log('First game recorded. Waiting the actual five minutes for the awake check.')
  await waitUntil(waiting.readyAt + 500)
  const check = await read()
  const checkPhase = wakePhase(check.family.wakeAlarm, check.serverNow, timeZone)
  assert.equal(checkPhase.kind, 'check')

  stage = 'missed check rings again'
  console.log('Awake check is open. Waiting the actual one-minute window to verify the alarm restarts.')
  await waitUntil(waiting.deadlineAt + 500)
  const missed = await read()
  const missedPhase = wakePhase(missed.family.wakeAlarm, missed.serverNow, timeZone)
  assert.equal(missedPhase.kind, 'ringing')
  assert.equal(missedPhase.stage, 'check')
  assert.equal(missedPhase.ringingAt, waiting.deadlineAt)
  const second = completion(missedPhase)
  await command('child', second)
  const done = await read()
  assert.equal(wakePhase(done.family.wakeAlarm, done.serverNow, timeZone).kind, 'done')
  const doneProgress = structuredClone(done.family.wakeAlarm.progress)
  await command('child', second)
  assert.deepEqual((await read()).family.wakeAlarm.progress, doneProgress)
  assert.equal(JSON.stringify(done.family.quests), questSnapshot)
  assert.equal(JSON.stringify(done.family.clock), clockSnapshot)
  console.log(`PASS: real scheduled alarm, first win, five-minute delay, one-minute deadline, repeat alarm and daily completion on ${url}.`)
  console.log(`Retained isolated family ${id} and its two capability rows. Existing families were not changed.`)
} catch {
  console.error(`FAIL during ${stage}. ${created ? `Isolated family ${id} was retained for inspection.` : 'Setup did not complete.'}`)
  process.exitCode = 1
}

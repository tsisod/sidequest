import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { ConvexClient, ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { addDays, dateAt, parseTimeZone } from '../shared/calendar.ts'
import { alarmInstant, parseAlarmTime } from '../shared/wakeAlarm.ts'
import { earnedGold, earnedXp, parseFamily, projectDay, remainingMs, screenUnlocked } from '../shared/sidequest.ts'

if (process.argv.length !== 3 || !/^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/.test(process.argv[2])) {
  console.error('Usage: node scripts/verify-hosted.mjs https://your-deployment.convex.cloud')
  process.exit(2)
}
assert.equal(typeof WebSocket, 'function', 'Run with Node.js 24 and its global WebSocket.')
const url = process.argv[2]
const id = `smoke-${randomUUID()}`
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from(randomBytes(12), byte => alphabet[byte % alphabet.length]).join('')
const tokens = { parent: randomBytes(32).toString('hex'), child: randomBytes(32).toString('hex') }
const refs = Object.fromEntries(['create', 'join', 'get', 'command'].map(name => [name, makeFunctionReference(`family:${name}`)]))
const http = new ConvexHttpClient(url, { logger: false, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) })
const minute = 60_000
let stage = 'create and join'
let created = false
const args = role => ({ token: tokens[role], role, clockSample: randomUUID(), clientVersion: 3 })
async function read(role = 'parent') {
  const value = await http.query(refs.get, args(role))
  const family = parseFamily(value?.family)
  assert.ok(family, 'Expected a valid family snapshot.')
  assert.equal(family.id, id, 'Snapshot must belong to this run only.')
  assert.ok(Number.isFinite(value.serverNow), 'Snapshot must include server time.')
  return { family, serverNow: value.serverNow }
}
async function command(role, action, allowed = true) {
  const result = await http.mutation(refs.command, { token: tokens[role], role, command: action, clientVersion: 3 })
  assert.equal(result.ok, allowed, `${role} ${action.kind} permission/result`)
}
async function checkSubscription() {
  const live = new ConvexClient(url, { logger: false, webSocketConstructor: WebSocket })
  let unsubscribe, timer, sent = false, update = Promise.resolve()
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Child subscription did not receive the parent update within 15 seconds.')), 15_000)
      unsubscribe = live.onUpdate(refs.get, args('child'), value => {
        if (value?.family?.id !== id) { reject(new Error('Child subscription returned the wrong family.')); return }
        if (value.family.childName === 'Smoke linked') resolve()
        else if (!sent) {
          sent = true
          update = command('parent', { kind: 'rename-child', name: 'Smoke linked' })
          void update.catch(reject)
        }
      }, () => reject(new Error('Child WebSocket subscription failed.')))
    })
    await update
  } finally {
    clearTimeout(timer)
    unsubscribe?.()
    await live.close()
  }
}

try {
  const timeZone = parseTimeZone('Asia/Bangkok')
  assert.ok(timeZone)
  const setup = { id, code, parentToken: tokens.parent, timeZone, clientVersion: 3 }
  assert.equal((await http.mutation(refs.create, setup)).ok, true)
  created = true
  assert.equal((await http.mutation(refs.join, { code, childToken: tokens.child, clientVersion: 3 })).ok, true)
  assert.equal((await http.mutation(refs.join, { code, childToken: tokens.child, clientVersion: 3 })).ok, true)
  const initial = (await read()).family
  assert.deepEqual((await read('child')).family, initial)
  assert.equal(initial.screenMinutes, 20)
  assert.equal(screenUnlocked(initial), false)
  const [first, ...others] = initial.quests
  assert.ok(first && others.length > 0, 'Smoke family needs multiple initial quests.')

  stage = 'wake-up defaults and role enforcement'
  assert.equal(initial.wakeAlarm.enabled, false)
  assert.equal(initial.wakeAlarm.time, '07:00')
  assert.equal(initial.wakeAlarm.sound, 'classic')
  assert.deepEqual(initial.wakeAlarm.progress, { kind: 'unstarted' })
  const wakeTime = parseAlarmTime('23:59')
  assert.ok(wakeTime)
  await command('child', { kind: 'set-wake-alarm', enabled: true, time: wakeTime }, false)
  await command('parent', { kind: 'set-wake-sound', sound: 'birds' }, false)
  await command('parent', { kind: 'set-wake-alarm', enabled: true, time: wakeTime })
  const armed = (await read()).family
  const parentTasks = armed.quests
  assert.equal(armed.wakeAlarm.enabled, true)
  assert.equal(armed.wakeAlarm.time, wakeTime)
  await command('parent', { kind: 'set-wake-alarm', enabled: true, time: wakeTime })
  assert.deepEqual((await read()).family.wakeAlarm, armed.wakeAlarm, 'Repeated alarm settings must not reset progress.')
  await command('child', { kind: 'set-wake-sound', sound: 'birds' })
  const sounded = (await read()).family
  assert.equal(sounded.wakeAlarm.sound, 'birds')
  assert.deepEqual(sounded.wakeAlarm.progress, armed.wakeAlarm.progress)
  assert.deepEqual(sounded.quests, parentTasks, 'Alarm settings and sounds must not change quest progress.')
  const futureDate = addDays(dateAt(Date.now(), timeZone), 2)
  await command('child', { kind: 'complete-wake-game', date: futureDate, scheduledAt: alarmInstant(futureDate, wakeTime, timeZone), stage: 'first', game: 'moles' }, false)
  await command('parent', { kind: 'set-wake-alarm', enabled: false, time: wakeTime })
  assert.equal((await read()).family.wakeAlarm.enabled, false)

  stage = 'role enforcement'
  assert.equal(await http.query(refs.get, { ...args('child'), role: 'parent' }), null)
  assert.equal(await http.query(refs.get, { ...args('parent'), role: 'child' }), null)
  assert.equal((await http.mutation(refs.command, { token: tokens.child, role: 'parent', clientVersion: 3, command: { kind: 'approve', questId: first.id } })).ok, false)
  await command('child', { kind: 'approve', questId: first.id }, false)
  await command('parent', { kind: 'submit', questId: first.id }, false)
  await command('child', { kind: 'start-play' }, false)

  stage = 'individual rewards and idempotent create'
  await command('child', { kind: 'submit', questId: first.id })
  await command('parent', { kind: 'approve', questId: first.id })
  const individual = (await read()).family
  assert.equal(earnedXp(individual), first.xp)
  assert.equal(earnedGold(individual), first.gold)
  assert.equal(screenUnlocked(individual), false)
  assert.deepEqual(individual.clock, { kind: 'paused', remainingMs: 0 })
  assert.equal((await http.mutation(refs.create, setup)).ok, true)
  assert.deepEqual((await read()).family, individual, 'Repeated create must preserve existing progress and alarm settings.')

  stage = 'all-quest unlock and repeated approval'
  for (const quest of others) {
    await command('child', { kind: 'submit', questId: quest.id })
    await command('parent', { kind: 'approve', questId: quest.id })
  }
  const complete = (await read()).family
  assert.equal(screenUnlocked(complete), true)
  assert.equal(earnedXp(complete), initial.quests.reduce((sum, quest) => sum + quest.xp, 0))
  assert.equal(earnedGold(complete), initial.quests.reduce((sum, quest) => sum + quest.gold, 0))
  assert.deepEqual(complete.clock, { kind: 'paused', remainingMs: 20 * minute })
  await command('parent', { kind: 'approve', questId: first.id })
  assert.deepEqual((await read()).family, complete, 'Repeated approval must not award more rewards or time.')
  stage = 'live child subscription'
  await checkSubscription()

  stage = 'start, pause and parent block'
  await command('child', { kind: 'start-play' })
  const running = await read('child')
  assert.equal(running.family.clock.kind, 'running')
  assert.ok(remainingMs(running.family.clock, running.serverNow) > 0 && remainingMs(running.family.clock, running.serverNow) <= 20 * minute)
  await command('child', { kind: 'pause-play' })
  const paused = (await read()).family
  assert.equal(paused.clock.kind, 'paused')
  assert.ok(paused.clock.remainingMs > 0 && paused.clock.remainingMs <= 20 * minute)
  await command('child', { kind: 'start-play' })
  await command('parent', { kind: 'set-blocked', blocked: true })
  const blocked = (await read('child')).family
  assert.equal(blocked.clock.kind, 'blocked')
  assert.ok(blocked.clock.remainingMs > 0 && blocked.clock.remainingMs <= paused.clock.remainingMs)
  await command('child', { kind: 'start-play' }, false)
  await command('parent', { kind: 'set-blocked', blocked: false })
  assert.deepEqual((await read()).family.clock, { kind: 'paused', remainingMs: blocked.clock.remainingMs })

  stage = 'future scheduling and current-day allowance'
  const beforeFuture = (await read()).family
  const tomorrow = addDays(beforeFuture.sessionDay, 1)
  const futureId = randomUUID()
  await command('parent', { kind: 'add-template', id: futureId, title: 'Tomorrow homework', xp: 30, gold: 4, place: 'library', schedule: { kind: 'once', date: tomorrow } })
  const withFuture = (await read()).family
  assert.equal(screenUnlocked(withFuture), true, 'Future work must not block today.')
  assert.equal(withFuture.quests.some(quest => quest.templateId === futureId), false)
  assert.equal(projectDay(withFuture, tomorrow).quests.some(quest => quest.templateId === futureId), true)
  assert.equal(projectDay(withFuture, addDays(tomorrow, 1)).quests.some(quest => quest.templateId === futureId), false)

  stage = 'new today quest relocks without refilling allowance'
  await command('child', { kind: 'start-play' })
  const templateId = randomUUID()
  await command('parent', { kind: 'add-template', id: templateId, title: 'Hosted smoke quest', xp: 50, gold: 10, place: 'chores', schedule: { kind: 'once', date: withFuture.sessionDay } })
  const relocked = (await read('child')).family
  const questId = `${templateId}@${relocked.sessionDay}`
  assert.ok(relocked.quests.some(quest => quest.id === questId && quest.status === 'todo'))
  assert.equal(screenUnlocked(relocked), false)
  assert.equal(relocked.clock.kind, 'paused')
  assert.ok(remainingMs(relocked.clock, Date.now()) > 0, 'Relocking must preserve unused time.')
  assert.equal(relocked.allowanceGranted, true)
  assert.equal(earnedXp(relocked), earnedXp(complete))
  assert.equal(earnedGold(relocked), earnedGold(complete))
  await command('child', { kind: 'start-play' }, false)
  await command('child', { kind: 'submit', questId })
  await command('parent', { kind: 'approve', questId })
  const recompleted = (await read()).family
  assert.equal(screenUnlocked(recompleted), true)
  assert.deepEqual(recompleted.clock, relocked.clock, 'Completing extra work must not refill today’s allowance.')
  assert.equal(earnedXp(recompleted), earnedXp(complete) + 50)
  await command('parent', { kind: 'remove-template', templateId: futureId })
  const retired = (await read()).family
  assert.equal(projectDay(retired, tomorrow).quests.some(quest => quest.templateId === futureId), false)

  stage = 'stale-client write rejection'
  const stale = await http.mutation(refs.command, { token: tokens.parent, role: 'parent', command: { kind: 'rename-child', name: 'Stale writer' } })
  assert.equal(stale.ok, false)
  assert.match(stale.message, /refresh/i)
  assert.equal((await read()).family.childName, 'Smoke linked')
  console.log(`PASS: hosted HTTP, wake-up settings, role, recurrence, daily allowance, clock and WebSocket checks on ${url}.`)
  console.log(`Created 3 small rows retained for smoke family ${id}: 1 family and 2 capabilities. No existing records or deletes used.`)
} catch (error) {
  let message = error instanceof Error ? error.message : 'Unknown verification failure.'
  for (const secret of [tokens.parent, tokens.child, code]) message = message.replaceAll(secret, '[redacted]')
  console.error(`FAIL during ${stage}: ${message}`)
  if (created) console.error(`Only newly generated smoke family ${id} may remain. No existing records or deletes used.`)
  process.exitCode = 1
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConvexClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { ActionResult, ConnectionState, Family, FamilyCommand, FamilyConnection, Role } from '../../shared/domain.ts'
import type { Speak, SpeechResult, Voice } from '../../shared/speech.ts'
import type { AskSpark, SparkAlert, SparkInboxChange, SparkReply, SparkTurn } from '../../shared/spark.ts'
import type { AskVoice, VoiceTurn, VoiceReply } from '../../shared/parentVoice.ts'
import { parseTimeZone } from '../../shared/calendar.ts'
import { parseFamily } from '../../shared/sidequest.ts'
import { claimParentCredentials, executeLocal, LOCAL_NOTICE, randomToken, readLocalFamily } from './localStore.ts'

const hostedUrl = import.meta.env.VITE_CONVEX_URL
let client: ConvexClient | undefined
const getClient = () => {
  if (!hostedUrl) throw new Error('Hosted Sidequest is not configured.')
  client ??= new ConvexClient(hostedUrl)
  return client
}
type Credentials = { token: string; code: string; id: string }
type RemoteSnapshot = { family: Family; serverNow: number }
const getRef = makeFunctionReference<'query', { token: string; role: Role; clockSample: string; clientVersion: number }, RemoteSnapshot | null>('family:get')
const createRef = makeFunctionReference<'mutation', { parentToken: string; code: string; id: string; timeZone: string; clientVersion: number }, ActionResult>('family:create')
const joinRef = makeFunctionReference<'mutation', { childToken: string; code: string; clientVersion: number }, ActionResult>('family:join')
const commandRef = makeFunctionReference<'mutation', { token: string; role: Role; command: FamilyCommand; clientVersion: number }, ActionResult>('family:command')
const speakRef = makeFunctionReference<'action', { token: string; text: string; voice: Voice }, SpeechResult>('speech:speak')
const inboxRef = makeFunctionReference<'query', { token: string }, SparkAlert[] | null>('spark:inbox')
const editInboxRef = makeFunctionReference<'mutation', { token: string; change: SparkInboxChange }, ActionResult>('spark:editInbox')
const askRef = makeFunctionReference<'action', { token: string; name: string; keybinds: Record<string, string>; turns: SparkTurn[] }, SparkReply>('spark:ask')
const voiceRef = makeFunctionReference<'action', { token: string; turns: VoiceTurn[] }, VoiceReply>('voice:command')
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Sidequest could not connect. Please try again.'
const credentialKey = (role: Role) => `sidequest-hosted:${hostedUrl}:${role}`

function parseCredentials(saved: string): Credentials {
  const raw: unknown = JSON.parse(saved)
  if (typeof raw !== 'object' || raw === null || !('token' in raw) || typeof raw.token !== 'string' || !/^[a-f0-9]{64}$/.test(raw.token) || !('code' in raw) || typeof raw.code !== 'string' || !('id' in raw) || typeof raw.id !== 'string') throw new Error('This saved family connection needs recovery. No saved data has been deleted.')
  return { token: raw.token, code: raw.code, id: raw.id }
}
function readStoredCredentials(key: string): Credentials | null {
  const saved = localStorage.getItem(key)
  return saved ? parseCredentials(saved) : null
}
function readCredentials(role: Role): Credentials | null { return readStoredCredentials(credentialKey(role)) }
function saveCredentials(role: Role, credentials: Credentials): void {
  localStorage.setItem(credentialKey(role), JSON.stringify(credentials))
}


function invitationCode(): string | null {
  const url = new URL(window.location.href)
  const query = url.searchParams.get('join')
  const hash = new URLSearchParams(url.hash.slice(1)).get('join')
  const code = query ?? hash
  return code === null ? null : code.trim().toUpperCase()
}
function clearInvitation(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('join')
  const hash = new URLSearchParams(url.hash.slice(1))
  if (hash.has('join')) { hash.delete('join'); url.hash = hash.toString() }
  window.history.replaceState(window.history.state, '', url)
}
function validCode(code: string): boolean { return /^[A-Z2-9]{8,12}$/.test(code) }
async function localFamilyForRoute(role: Role): Promise<Family> {
  const family = await readLocalFamily()
  const invite = role === 'child' ? invitationCode() : null
  if (invite !== null) {
    if (!validCode(invite)) throw new Error('Enter the 8–12 character family code.')
    if (family.code !== invite) throw new Error('This family is not saved on this browser. Open this link in the parent’s browser, or configure hosted Sidequest to connect devices.')
    clearInvitation()
  }
  return family
}
async function connectChild(code: string): Promise<Credentials> {
  if (!validCode(code)) throw new Error('Enter the 8–12 character family code.')
  const pendingKey = `${credentialKey('child')}:pending`
  const connected = readCredentials('child')
  const pending = readStoredCredentials(pendingKey)
  const saved = connected?.code === code ? connected : pending?.code === code ? pending : { token: randomToken(), code, id: '' }
  localStorage.setItem(pendingKey, JSON.stringify(saved))
  const result = await getClient().mutation(joinRef, { code, childToken: saved.token, clientVersion: 3 })
  if (!result.ok) throw new Error(result.message)
  saveCredentials('child', saved)
  clearInvitation()
  return saved
}


async function ownedParent(): Promise<Credentials> {
  const saved = parseCredentials(await claimParentCredentials(credentialKey('parent')))
  saveCredentials('parent', saved)
  return saved
}
async function createOwnedFamily(saved: Credentials): Promise<void> {
  const timeZone = parseTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  if (!timeZone) throw new Error('Your browser household time zone is unavailable.')
  const result = await getClient().mutation(createRef, { parentToken: saved.token, code: saved.code, id: saved.id, timeZone, clientVersion: 3 })
  if (!result.ok) throw new Error(result.message)
}

export function useSidequest(role: Role): FamilyConnection {
  const mode = hostedUrl ? 'hosted' : 'local'
  const [state, setState] = useState<ConnectionState>({ kind: 'loading' })
  const [credentialVersion, setCredentialVersion] = useState(0)
  const [inbox, setInbox] = useState<SparkAlert[] | null>(null)
  const credentials = useRef<Credentials | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    let live = true
    const refresh = async () => {
      try {
        const family = await localFamilyForRoute(role)
        if (live) setState({ kind: 'ready', family, serverOffsetMs: 0 })
      } catch (error) {
        if (live) setState({ kind: 'error', message: errorMessage(error) })
      }
    }
    if (mode === 'local') {
      void refresh()
      if (typeof BroadcastChannel !== 'undefined') {
        channel.current = new BroadcastChannel(LOCAL_NOTICE)
        channel.current.onmessage = () => { void refresh() }
      }
      const onStorage = (event: StorageEvent) => { if (event.key === LOCAL_NOTICE) void refresh() }
      const onFocus = () => { void refresh() }
      window.addEventListener('storage', onStorage)
      window.addEventListener('focus', onFocus)
      return () => {
        live = false
        active.current = false
        channel.current?.close()
        channel.current = null
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('focus', onFocus)
      }
    }
    const connect = async () => {
      try {
        const invite = role === 'child' ? invitationCode() : null
        let saved: Credentials | null
        if (role === 'parent') {
          if (!readCredentials('parent') && readCredentials('child')) {
            credentials.current = null
            if (live) setState({ kind: 'unpaired' })
            return
          }
          saved = await ownedParent()
          await createOwnedFamily(saved)
        } else if (invite !== null) saved = await connectChild(invite)
        else {
          saved = readCredentials('child')
          if (!saved) {
            const parent = await ownedParent()
            await createOwnedFamily(parent)
            saved = await connectChild(parent.code)
          }
        }
        if (!live) return
        credentials.current = saved
        if (!saved) { setState({ kind: 'unpaired' }); return }
        setState({ kind: 'loading' })
        const remote = getClient()
        if (!live) return
        let sampledOffset: number | undefined
        const stopInbox = role === 'parent' ? remote.onUpdate(inboxRef, { token: saved.token }, alerts => { if (live) setInbox(alerts) }, () => { if (live) setInbox(null) }) : null
        const stopFamily = remote.onUpdate(getRef, { token: saved.token, role, clockSample: crypto.randomUUID(), clientVersion: 3 }, snapshot => {
          if (!live) return
          if (!snapshot) { setState({ kind: 'unpaired' }); return }
          const family = parseFamily(snapshot.family)
          if (!family || !Number.isFinite(snapshot.serverNow)) { setState({ kind: 'error', message: 'The saved board needs recovery. Your data has been kept.' }); return }
          sampledOffset ??= snapshot.serverNow - Date.now()
          setState({ kind: 'ready', family, serverOffsetMs: sampledOffset })
        }, error => { if (live) setState({ kind: 'error', message: errorMessage(error) }) })
        unsubscribe.current = () => { stopFamily(); stopInbox?.() }
      } catch (error) {
        if (live) setState({ kind: 'error', message: errorMessage(error) })
      }
    }
    void connect()
    return () => { live = false; active.current = false; unsubscribe.current?.(); unsubscribe.current = null }
  }, [mode, role, credentialVersion])

  const execute = useCallback(async (command: FamilyCommand): Promise<ActionResult> => {
    try {
      if (state.kind !== 'ready') return { ok: false, message: 'Connect to your family first.' }
      if (mode === 'hosted') {
        const saved = credentials.current
        if (!saved) return { ok: false, message: 'Connect to your family first.' }
        return await getClient().mutation(commandRef, { token: saved.token, role, command, clientVersion: 3 })
      }
      const outcome = await executeLocal(command, role)
      if (active.current) setState({ kind: 'ready', family: outcome.family, serverOffsetMs: 0 })
      channel.current?.postMessage('changed')
      try { localStorage.setItem(LOCAL_NOTICE, randomToken(8)) } catch { /* IndexedDB already committed. */ }
      return outcome.result
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  }, [mode, role, state.kind])

  const join = useCallback(async (input: string): Promise<ActionResult> => {
    if (role !== 'child') return { ok: false, message: 'Open the child game to join a family.' }
    const code = input.trim().toUpperCase()
    if (!validCode(code)) return { ok: false, message: 'Enter the 8–12 character family code.' }
    try {
      if (mode === 'local') {
        const family = await readLocalFamily()
        if (family.code !== code) return { ok: false, message: 'That family is not on this browser. Open the parent’s browser, or use hosted Sidequest to connect devices.' }
        clearInvitation()
        if (active.current) setState({ kind: 'ready', family, serverOffsetMs: 0 })
      } else {
        credentials.current = await connectChild(code)
        setCredentialVersion(value => value + 1)
      }
      return { ok: true }
    } catch (error) { return { ok: false, message: errorMessage(error) } }
  }, [mode, role])

  const create = useCallback(async (): Promise<ActionResult> => {
    try {
      if (mode === 'local') {
        const family = await localFamilyForRoute(role)
        if (active.current) setState({ kind: 'ready', family, serverOffsetMs: 0 })
        return { ok: true }
      }
      if (role !== 'parent') return { ok: false, message: 'Ask your parent for the family code.' }
      const saved = await ownedParent()
      await createOwnedFamily(saved)
      credentials.current = saved
      setCredentialVersion(value => value + 1)
      return { ok: true }
    } catch (error) {
      const message = errorMessage(error)
      if (active.current) setState({ kind: 'error', message })
      return { ok: false, message }
    }
  }, [mode, role])

  const speak: Speak = useCallback(async (text, voice) => {
    const saved = credentials.current
    if (mode === 'local' || role !== 'child' || !saved) return { ok: false, message: 'Voice needs a hosted family connection.' }
    try { return await getClient().action(speakRef, { token: saved.token, text, voice }) }
    catch (error) { return { ok: false, message: errorMessage(error) } }
  }, [mode, role])

  const ask: AskSpark = useCallback(async ({ name, keybinds, turns }) => {
    const saved = credentials.current
    if (mode === 'local' || role !== 'child' || !saved) return { ok: false, message: `${name} needs a hosted family connection.` }
    try { return await getClient().action(askRef, { token: saved.token, name, keybinds, turns }) }
    catch (error) { return { ok: false, message: errorMessage(error) } }
  }, [mode, role])

  const editInbox = useCallback(async (change: SparkInboxChange): Promise<ActionResult> => {
    const saved = credentials.current
    if (mode === 'local' || role !== 'parent' || !saved) return { ok: false, message: 'The inbox needs a hosted family connection.' }
    try { return await getClient().mutation(editInboxRef, { token: saved.token, change }) }
    catch (error) { return { ok: false, message: errorMessage(error) } }
  }, [mode, role])

  const voice: AskVoice = useCallback(async turns => {
    const saved = credentials.current
    if (mode === 'local' || role !== 'parent' || !saved) return { ok: false, message: 'Voice commands need a hosted family connection.' }
    try { return await getClient().action(voiceRef, { token: saved.token, turns }) }
    catch (error) { return { ok: false, message: errorMessage(error) } }
  }, [mode, role])

  return { mode, state, execute, speak, ask, inbox, editInbox, voice, join, create }
}

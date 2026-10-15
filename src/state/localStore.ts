import type { ActionResult, Family, FamilyCommand, Role } from '../../shared/domain.ts'
import { parseTimeZone } from '../../shared/calendar.ts'
import { migrateV1ToV2, migrateV2Family } from '../../shared/migrations.ts'
import { applyCommand, createFamily, familyWithinSizeLimit, parseFamily } from '../../shared/sidequest.ts'

const DATABASE = 'sidequest-local-v1'
const STORE = 'family'
const KEY = 'active'
export const LOCAL_NOTICE = 'sidequest-local-change'
let database: Promise<IDBDatabase> | undefined

export function randomToken(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => alphabet[byte % alphabet.length]).join('')
}

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Sidequest could not open browser storage. Check that storage is allowed, then reload.'))
      request.onblocked = () => reject(new Error('Close older Sidequest tabs and reload to update browser storage.'))
    })
    database.catch(() => { database = undefined })
  }
  return database
}

export function decodeLocalFamily(raw: unknown, now = Date.now()): Family {
  if (typeof raw !== 'object' || raw === null || !('version' in raw) || (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4) || !('family' in raw)) throw new Error('This saved Sidequest board needs recovery. Your saved data has been kept. Try another browser profile or restore the previous app version.')
  const zone = parseTimeZone('Asia/Bangkok')
  if (!zone) throw new Error('The household time zone is unavailable.')
  const legacy = raw.version === 1 ? migrateV1ToV2(raw.family) : raw.family
  const family = (raw.version === 3 || raw.version === 4) ? parseFamily(raw.family) : migrateV2Family(legacy, { now, timeZone: zone })
  if (!family) throw new Error('Sidequest could not read the saved board. Your saved data has been kept. Try another browser profile or restore a backup.')
  return family
}

async function transact(transform: (family: Family) => { family: Family; result: ActionResult }): Promise<{ family: Family; result: ActionResult }> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const request = store.get(KEY)
    let outcome: { family: Family; result: ActionResult } | undefined
    let failure: Error | undefined
    request.onsuccess = () => {
      try {
        const raw: unknown = request.result
        const zone = parseTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
        if (!zone) throw new Error('Your browser time zone is unavailable. Please reload.')
        const family = raw === undefined ? createFamily({ id: crypto.randomUUID(), code: randomCode(), now: Date.now(), timeZone: zone }) : decodeLocalFamily(raw)
        outcome = transform(family)
        if (!familyWithinSizeLimit(outcome.family)) throw new Error('This family board has reached its storage capacity. Your saved data has been kept.')
        store.put({ version: 4, family: outcome.family }, KEY)
      } catch (error) {
        failure = error instanceof Error ? error : new Error('Sidequest could not read this board.')
        transaction.abort()
      }
    }
    transaction.oncomplete = () => outcome ? resolve(outcome) : reject(new Error('Sidequest could not load the board.'))
    transaction.onabort = () => reject(failure ?? new Error('Sidequest could not save this change. Check browser storage and try again.'))
    transaction.onerror = () => { failure ??= new Error('Sidequest could not save this change. Check browser storage and try again.') }
  })
}

export async function readLocalFamily(): Promise<Family> {
  return (await transact(family => ({ family, result: { ok: true } }))).family
}

export async function executeLocal(command: FamilyCommand, role: Role): Promise<{ family: Family; result: ActionResult }> {
  return transact(family => applyCommand(family, command, { role, now: Date.now() }))
}


export async function claimParentCredentials(key: string): Promise<string> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const request = store.get(`credential:${key}`)
    let saved: string | undefined
    let failure: Error | undefined
    request.onsuccess = () => {
      try {
        const raw: unknown = request.result
        if (typeof raw === 'string') saved = raw
        else {
          saved = localStorage.getItem(key) ?? JSON.stringify({ token: randomToken(), code: randomCode(), id: crypto.randomUUID() })
          store.put(saved, `credential:${key}`)
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error('Browser storage is unavailable.')
        transaction.abort()
      }
    }
    transaction.oncomplete = () => saved ? resolve(saved) : reject(new Error('The family connection could not be saved.'))
    transaction.onabort = () => reject(failure ?? new Error('The family connection could not be saved. Check browser storage.'))
    transaction.onerror = () => { failure ??= new Error('The family connection could not be saved. Check browser storage.') }
  })
}

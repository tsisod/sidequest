export type MoveAction = 'up' | 'down' | 'left' | 'right'
export type GameAction = MoveAction | 'sprint' | 'jump' | 'interact' | 'helper' | 'hints'
export type Keybinds = Readonly<Record<GameAction, string>>
export type Rebind = { ok: true; keybinds: Keybinds; swapped: GameAction | null } | { ok: false; message: string }

export const gameActions: readonly { action: GameAction; label: string }[] = [
  { action: 'up', label: 'Walk up' },
  { action: 'left', label: 'Walk left' },
  { action: 'down', label: 'Walk down' },
  { action: 'right', label: 'Walk right' },
  { action: 'sprint', label: 'Sprint (hold)' },
  { action: 'jump', label: 'Jump' },
  { action: 'interact', label: 'Interact' },
  { action: 'helper', label: 'AI helper' },
  { action: 'hints', label: 'Show/hide key hints' },
]
export const defaultKeybinds: Keybinds = { up: 'w', left: 'a', down: 's', right: 'd', sprint: 'shift', jump: ' ', interact: 'e', helper: 'q', hints: 'h' }
const spareKeys = [...'hgvbnmzxcfrtyuiopjkl1234567890']
const arrowKeys = new Map<string, MoveAction>([['arrowup', 'up'], ['arrowdown', 'down'], ['arrowleft', 'left'], ['arrowright', 'right']])

// Single characters as typed in lowercase, plus Shift so sprint can be held with either hand.
function bindable(key: string): boolean { return key === 'shift' || (key.length === 1 && key === key.toLowerCase()) }

export function actionFor(keybinds: Keybinds, key: string): GameAction | null {
  return arrowKeys.get(key) ?? gameActions.find(({ action }) => keybinds[action] === key)?.action ?? null
}

export function heldDirection(keybinds: Keybinds, held: Iterable<string>): { dx: number; dy: number } {
  const moves = new Set<GameAction | null>()
  for (const key of held) moves.add(actionFor(keybinds, key))
  return { dx: Number(moves.has('right')) - Number(moves.has('left')), dy: Number(moves.has('down')) - Number(moves.has('up')) }
}

export function rebind(keybinds: Keybinds, action: GameAction, key: string): Rebind {
  if (!bindable(key)) return { ok: false, message: 'Pick a letter, a number, Space or Shift.' }
  const swapped = gameActions.find(other => other.action !== action && keybinds[other.action] === key)?.action ?? null
  return { ok: true, swapped, keybinds: { ...keybinds, [action]: key, ...swapped ? { [swapped]: keybinds[action] } : {} } }
}

/** Saved keys are kept; an action added since they were saved takes its default key, or a spare one if that key is in use. */
export function parseKeybinds(value: unknown): Keybinds {
  if (typeof value !== 'object' || value === null) return defaultKeybinds
  const saved = value as Partial<Record<GameAction, unknown>>
  const keys = new Map<GameAction, string>()
  for (const { action } of gameActions) {
    const key = saved[action]
    if (key === undefined) continue
    if (typeof key !== 'string' || !bindable(key) || [...keys.values()].includes(key)) return defaultKeybinds
    keys.set(action, key)
  }
  for (const { action } of gameActions) {
    if (keys.has(action)) continue
    const taken = new Set(keys.values())
    const key = [defaultKeybinds[action], ...spareKeys].find(candidate => !taken.has(candidate))
    if (!key) return defaultKeybinds
    keys.set(action, key)
  }
  return Object.fromEntries(keys) as Keybinds
}

export function keyLabel(key: string): string { return key === ' ' ? 'Space' : key === 'shift' ? 'Shift' : key.toUpperCase() }

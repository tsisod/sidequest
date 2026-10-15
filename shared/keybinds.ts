export type MoveAction = 'up' | 'down' | 'left' | 'right'
export type GameAction = MoveAction | 'jump' | 'interact' | 'helper'
export type Keybinds = Readonly<Record<GameAction, string>>
export type Rebind = { ok: true; keybinds: Keybinds; swapped: GameAction | null } | { ok: false; message: string }

export const gameActions: readonly { action: GameAction; label: string }[] = [
  { action: 'up', label: 'Walk up' },
  { action: 'left', label: 'Walk left' },
  { action: 'down', label: 'Walk down' },
  { action: 'right', label: 'Walk right' },
  { action: 'jump', label: 'Jump' },
  { action: 'interact', label: 'Interact' },
  { action: 'helper', label: 'AI helper' },
]
export const defaultKeybinds: Keybinds = { up: 'w', left: 'a', down: 's', right: 'd', jump: ' ', interact: 'e', helper: 'q' }
const arrowKeys = new Map<string, MoveAction>([['arrowup', 'up'], ['arrowdown', 'down'], ['arrowleft', 'left'], ['arrowright', 'right']])

function bindable(key: string): boolean { return key.length === 1 && key === key.toLowerCase() }

export function actionFor(keybinds: Keybinds, key: string): GameAction | null {
  return arrowKeys.get(key) ?? gameActions.find(({ action }) => keybinds[action] === key)?.action ?? null
}

export function heldDirection(keybinds: Keybinds, held: Iterable<string>): { dx: number; dy: number } {
  const moves = new Set<GameAction | null>()
  for (const key of held) moves.add(actionFor(keybinds, key))
  return { dx: Number(moves.has('right')) - Number(moves.has('left')), dy: Number(moves.has('down')) - Number(moves.has('up')) }
}

export function rebind(keybinds: Keybinds, action: GameAction, key: string): Rebind {
  if (!bindable(key)) return { ok: false, message: 'Pick a letter, a number or Space.' }
  const swapped = gameActions.find(other => other.action !== action && keybinds[other.action] === key)?.action ?? null
  return { ok: true, swapped, keybinds: { ...keybinds, [action]: key, ...swapped ? { [swapped]: keybinds[action] } : {} } }
}

export function parseKeybinds(value: unknown): Keybinds {
  if (typeof value !== 'object' || value === null) return defaultKeybinds
  const saved = value as Partial<Record<GameAction, unknown>>
  const keys = gameActions.map(({ action }) => saved[action] ?? defaultKeybinds[action])
  if (!keys.every(key => typeof key === 'string' && bindable(key)) || new Set(keys).size !== keys.length) return defaultKeybinds
  return Object.fromEntries(gameActions.map(({ action }, index) => [action, keys[index]])) as Keybinds
}

export function keyLabel(key: string): string { return key === ' ' ? 'Space' : key.toUpperCase() }

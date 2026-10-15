export type ParentTheme = 'sage' | 'apricot' | 'cocoa'

export const themeStorageKey = 'sidequest-parent-theme'
export const parentThemes: { value: ParentTheme; label: string }[] = [
  { value: 'sage', label: 'Sage' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'cocoa', label: 'Cocoa' },
]

export function parseParentTheme(value: unknown): ParentTheme | null {
  return value === 'sage' || value === 'apricot' || value === 'cocoa' ? value : null
}

export function readParentTheme(): ParentTheme {
  try { return parseParentTheme(localStorage.getItem(themeStorageKey)) ?? 'sage' }
  catch { return 'sage' }
}

export function saveParentTheme(theme: ParentTheme): boolean {
  try { localStorage.setItem(themeStorageKey, theme); return true }
  catch { return false }
}

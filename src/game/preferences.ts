import { useState } from 'react'

function read<T>(key: string, parse: (saved: string | null) => T): T {
  try { return parse(localStorage.getItem(key)) } catch { return parse(null) }
}

export function useStoredPreference<T>(key: string, parse: (saved: string | null) => T, serialize: (value: T) => string) {
  const [value, setValue] = useState(() => read(key, parse))
  const update = (next: T) => {
    setValue(next)
    try { localStorage.setItem(key, serialize(next)) } catch { /* The preference lasts for this visit when storage is unavailable. */ }
  }
  return [value, update] as const
}

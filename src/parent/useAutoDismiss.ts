import { useEffect, useEffectEvent } from 'react'

const MESSAGE_MS = 5000

export function useAutoDismiss(message: string | null, dismiss: () => void) {
  const expire = useEffectEvent(dismiss)
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => expire(), MESSAGE_MS)
    return () => clearTimeout(timer)
  }, [message])
}

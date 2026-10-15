import { useEffect, useState, useSyncExternalStore } from 'react'
import type { WakeSound } from '../../shared/domain'
import { WakeAudioRuntime } from './audio'

export function useWakeAudio(ringKey: string | null, sound: WakeSound) {
  const [runtime] = useState(() => new WakeAudioRuntime())
  const status = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getServerSnapshot)
  useEffect(() => { runtime.setAlarm(ringKey ? { key: ringKey, sound } : null) }, [runtime, ringKey, sound])
  useEffect(() => { if (ringKey) void runtime.enable() }, [runtime, ringKey])
  useEffect(() => {
    // Browsers only start audio from a user gesture, so unlock it on the first tap or key press anywhere and the alarm can ring by itself later.
    const unlock = () => { if (runtime.getSnapshot().readiness !== 'running') void runtime.enable() }
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const
    for (const gesture of gestures) window.addEventListener(gesture, unlock, { capture: true })
    return () => { for (const gesture of gestures) window.removeEventListener(gesture, unlock, { capture: true }) }
  }, [runtime])
  useEffect(() => () => runtime.dispose(), [runtime])
  return { runtime, status }
}

export type WakeLockStatus = 'off' | 'unsupported' | 'requesting' | 'held' | 'released' | 'denied'

export function useWakeScreenLock(armed: boolean, requested: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('off')
  useEffect(() => {
    if (!armed || !requested) return
    if (!('wakeLock' in navigator)) return
    let active = true
    let pending = false
    let lock: WakeLockSentinel | null = null
    const release = () => {
      const current = lock
      lock = null
      if (current) void current.release().catch(() => undefined)
    }
    const acquire = async () => {
      if (!active || pending || lock || document.visibilityState !== 'visible') return
      pending = true
      setStatus('requesting')
      try {
        const current = await navigator.wakeLock.request('screen')
        if (!active || document.visibilityState !== 'visible') { await current.release(); return }
        lock = current
        setStatus('held')
        current.addEventListener('release', () => {
          if (lock !== current) return
          lock = null
          if (active) setStatus('released')
        }, { once: true })
      } catch { if (active) setStatus('denied') }
      finally { pending = false }
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') void acquire()
      else { release(); setStatus('released') }
    }
    void acquire()
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; document.removeEventListener('visibilitychange', visibility); release() }
  }, [armed, requested])
  return !armed || !requested ? 'off' : typeof navigator === 'undefined' || !('wakeLock' in navigator) ? 'unsupported' : status
}

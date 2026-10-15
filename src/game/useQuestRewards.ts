import { useEffect, useRef, useState } from 'react'
import type { Reward } from '../components/RewardCelebration'

const CELEBRATION_MS = 3200
const seenKey = (familyId: string) => `sidequest-rewards-seen-v1:${familyId}`

function readSeen(key: string): Reward | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { xp, gold } = value as Record<string, unknown>
    return typeof xp === 'number' && typeof gold === 'number' ? { xp, gold } : null
  } catch { return null }
}

/**
 * Celebrates quest XP and gold this device has not shown yet, whether the parent approved
 * while the game was open or while it was closed. Wake-up rewards celebrate inside the alarm.
 * `onReward` runs as each celebration starts.
 */
export function useQuestRewards(familyId: string, xp: number, gold: number, onReward: () => void): { reward: Reward; id: number } | null {
  const [shown, setShown] = useState<{ reward: Reward; id: number } | null>(null)
  const lastSeen = useRef<Reward | null>(null)
  const rewarded = useRef(onReward)
  useEffect(() => { rewarded.current = onReward })
  useEffect(() => {
    const key = seenKey(familyId)
    const seen = readSeen(key) ?? lastSeen.current
    lastSeen.current = { xp, gold }
    try { localStorage.setItem(key, JSON.stringify({ xp, gold })) } catch { /* Without storage, only live approvals celebrate. */ }
    if (!seen) return
    const gained = { xp: Math.max(0, xp - seen.xp), gold: Math.max(0, gold - seen.gold) }
    if (!gained.xp && !gained.gold) return
    rewarded.current()
    setShown(current => ({ reward: current ? { xp: current.reward.xp + gained.xp, gold: current.reward.gold + gained.gold } : gained, id: (current?.id ?? 0) + 1 }))
  }, [familyId, xp, gold])
  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [shown])
  return shown
}

export const JUMP_DURATION_MS = 500
export const JUMP_HEIGHT_PX = 20

export function isJumping(startedAt: number | null, now: number): boolean {
  return startedAt !== null && now - startedAt < JUMP_DURATION_MS
}

export function jumpHeight(startedAt: number | null, now: number): number {
  if (startedAt === null) return 0
  const progress = Math.max(0, Math.min(1, (now - startedAt) / JUMP_DURATION_MS))
  return 4 * JUMP_HEIGHT_PX * progress * (1 - progress)
}

import type { Point } from './world.ts'

export type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; color: string }
export type Pose = { scaleX: number; scaleY: number }
type Random = () => number

const dustColors = ['#f3e7c9', '#e4d2a8']
const twinkleColors = ['#fffbe0', '#c9f1ff', '#ffe58a']
const smokeColors = ['#d8d2c8', '#bdb6ac', '#a39c93']
const LANDING_MS = 120
const pick = (colors: string[], random: Random) => colors[Math.floor(random() * colors.length)]

export function dust(at: Point, time: number, count: number, random: Random = Math.random): Particle[] {
  return Array.from({ length: count }, () => ({
    x: at.x + (random() - .5) * 10, y: at.y - 1, vx: (random() - .5) * .03, vy: -.01 - random() * .01,
    born: time, life: 320 + random() * 180, size: random() < .5 ? 3 : 2, color: pick(dustColors, random),
  }))
}

export function twinkle(at: Point, time: number, random: Random = Math.random): Particle {
  return {
    x: at.x + (random() - .5) * 12, y: at.y + (random() - .5) * 8, vx: (random() - .5) * .01, vy: .006 + random() * .008,
    born: time, life: 550 + random() * 350, size: 1, color: pick(twinkleColors, random),
  }
}

export function smoke(at: Point, time: number, random: Random = Math.random): Particle {
  return {
    x: at.x + (random() - .5) * 4, y: at.y, vx: .003 + random() * .005, vy: -.012 - random() * .006,
    born: time, life: 1400 + random() * 600, size: random() < .5 ? 3 : 2, color: pick(smokeColors, random),
  }
}

export function liveParticles(particles: readonly Particle[], time: number): Particle[] {
  return particles.filter(particle => time - particle.born < particle.life)
}

export function particleAt(particle: Particle, time: number): Point & { alpha: number } {
  const age = time - particle.born
  return { x: particle.x + particle.vx * age, y: particle.y + particle.vy * age, alpha: Math.max(0, 1 - age / particle.life) }
}

export function drawParticles(context: CanvasRenderingContext2D, particles: readonly Particle[], time: number) {
  for (const particle of particles) {
    const at = particleAt(particle, time)
    context.globalAlpha = at.alpha
    context.fillStyle = particle.color
    context.fillRect(Math.round(at.x), Math.round(at.y), particle.size, particle.size)
  }
  context.globalAlpha = 1
}

export function heroPose({ time, moving, airborne, landedAt, motion }: { time: number; moving: boolean; airborne: boolean; landedAt: number; motion: boolean }): Pose {
  if (!motion) return { scaleX: 1, scaleY: 1 }
  if (airborne) return { scaleX: .94, scaleY: 1.06 }
  const landing = time - landedAt
  if (landing >= 0 && landing < LANDING_MS) {
    const squash = .12 * (1 - landing / LANDING_MS)
    return { scaleX: 1 + squash, scaleY: 1 - squash }
  }
  return { scaleX: 1, scaleY: !moving && Math.floor(time / 600) % 2 ? 31 / 32 : 1 }
}

export function sparkDrift(time: number, idle: boolean): Point {
  return idle ? { x: Math.sin(time / 1100) * 6, y: Math.sin(time / 550) * 3 } : { x: 0, y: 0 }
}

export function sparkBob(time: number): number {
  return Math.round(Math.sin(time / 420) * 2)
}

import type { Season } from './sky.ts'
import type { Point } from './world.ts'

const WIDTH = 64
const HEIGHT = 80
const FIRE = { width: 18, height: 14, frames: 4 }
const anchor = { x: 32, y: 78 }
const outline = '#3b2b23'
const bricks = ['#b7a184', '#a99377', '#c4b094', '#9e8a70']

export const forgeArt = { width: WIDTH, height: HEIGHT, anchor, fire: FIRE }
export const forgeMouth: Point = { x: 15 - anchor.x, y: 54 - anchor.y }
export const forgeGlow: Point = { x: 24 - anchor.x, y: 62 - anchor.y }
export const forgeChimneyTop: Point = { x: 41 - anchor.x, y: 3 - anchor.y }

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function brickWall(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, next: () => number) {
  context.fillStyle = '#6f5e4e'
  context.fillRect(x, y, width, height)
  for (let row = 0; row * 5 < height; row++) {
    for (let column = -1; column * 9 < width; column++) {
      const left = x + column * 9 + (row % 2 ? 4 : 0)
      const top = y + row * 5
      const from = Math.max(x, left)
      const to = Math.min(x + width, left + 8)
      const bottom = Math.min(y + height, top + 4)
      if (to <= from || bottom <= top) continue
      context.fillStyle = bricks[Math.floor(next() * bricks.length)]
      context.fillRect(from, top, to - from, bottom - top)
      context.fillStyle = '#d3c2a6'
      context.fillRect(from, top, to - from, 1)
    }
  }
  context.strokeStyle = outline
  context.lineWidth = 1
  context.strokeRect(x + .5, y + .5, width - 1, height - 1)
}

function snow(context: CanvasRenderingContext2D, x: number, y: number, width: number) {
  context.fillStyle = '#c9d6e2'
  context.fillRect(x, y + 1, width, 2)
  context.fillStyle = '#f4f8fb'
  context.fillRect(x + 1, y, width - 2, 2)
}

export function drawForge(season: Season): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const next = random(1709)

  brickWall(context, 34, 8, 14, 30, next)
  context.fillStyle = '#6e5c4d'
  context.fillRect(32, 3, 18, 5)
  context.fillStyle = '#8a7663'
  context.fillRect(33, 3, 16, 1)
  context.fillStyle = '#1f1410'
  context.fillRect(36, 3, 10, 2)
  context.strokeStyle = outline
  context.strokeRect(32.5, 2.5, 17, 5)

  brickWall(context, 8, 40, 48, 32, next)
  context.fillStyle = '#8a7663'
  context.fillRect(6, 36, 52, 4)
  context.fillStyle = '#a99377'
  context.fillRect(7, 36, 50, 1)
  context.strokeRect(6.5, 35.5, 51, 4)

  context.fillStyle = '#24120d'
  context.beginPath()
  context.arc(24, 60, 10, Math.PI, 0)
  context.lineTo(34, 72)
  context.lineTo(14, 72)
  context.closePath()
  context.fill()
  context.fillStyle = '#5a1c10'
  context.fillRect(15, 66, 18, 6)
  for (let x = 15; x < 33; x += 2) {
    context.fillStyle = next() < .5 ? '#2e2522' : '#4a3e38'
    context.fillRect(x, 68 + Math.floor(next() * 2), 2, 4)
  }
  context.strokeStyle = '#6f5e4e'
  context.beginPath()
  context.arc(24, 60, 10.5, Math.PI, 0)
  context.stroke()

  context.fillStyle = '#8f8174'
  context.fillRect(4, 72, 56, 6)
  context.fillStyle = '#b3a595'
  context.fillRect(5, 72, 54, 1)
  context.fillStyle = '#5e5249'
  context.fillRect(4, 77, 56, 1)
  context.strokeStyle = outline
  context.strokeRect(4.5, 71.5, 55, 6)

  for (const [x, y] of [[0, 74], [3, 71], [6, 75], [1, 70]] as const) {
    context.fillStyle = '#2e2a28'
    context.fillRect(x, y, 4, 4)
    context.fillStyle = '#4a4440'
    context.fillRect(x, y, 2, 1)
  }

  context.fillStyle = '#4a3122'
  context.fillRect(46, 66, 18, 11)
  context.fillStyle = '#6b4a33'
  context.fillRect(47, 69, 16, 7)
  context.fillStyle = '#5d8fb8'
  context.fillRect(47, 67, 16, 2)
  context.fillStyle = '#a9d0e8'
  context.fillRect(49, 67, 6, 1)

  if (season === 'winter') {
    snow(context, 31, 1, 20)
    snow(context, 5, 34, 54)
    snow(context, 45, 64, 19)
  }
  return canvas
}

export function drawForgeFire(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = FIRE.width * FIRE.frames
  canvas.height = FIRE.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const next = random(23)
  const colors = ['#ffe28a', '#ffc35a', '#ff9a3c', '#e2502c', '#a7301e']
  for (let frame = 0; frame < FIRE.frames; frame++) {
    for (let column = 0; column < FIRE.width; column++) {
      const middle = 1 - Math.abs(column - (FIRE.width - 1) / 2) / (FIRE.width / 2)
      const flame = Math.max(2, Math.round(3 + middle * 8 + (next() - .4) * 4))
      for (let row = 0; row < flame; row++) {
        const heat = row / flame
        context.fillStyle = colors[Math.min(colors.length - 1, Math.floor(heat * colors.length + (1 - middle) * 1.2))]
        context.fillRect(frame * FIRE.width + column, FIRE.height - 1 - row, 1, 1)
      }
    }
  }
  return canvas
}

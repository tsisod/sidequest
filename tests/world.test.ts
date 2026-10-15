import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canStand, COLUMNS, fence, gatePoint, heroStart, moveHero, nearestVillager, npcs, props, ROWS, talkSpots, terrainAt, TILE, WORLD } from '../src/game/world.ts'
import type { Point } from '../src/game/world.ts'
import { cameraFor, gateFrame, pixelScale } from '../src/game/farmScene.ts'

const step = 4
function reachable(): Set<string> {
  const key = (point: Point) => `${point.x},${point.y}`
  const start = { x: Math.round(heroStart.x / step) * step, y: Math.round(heroStart.y / step) * step }
  const seen = new Set([key(start)])
  const queue = [start]
  while (queue.length) {
    const point = queue.pop()!
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const next = { x: point.x + dx, y: point.y + dy }
      if (!seen.has(key(next)) && canStand(next)) { seen.add(key(next)); queue.push(next) }
    }
  }
  return seen
}
const walkable = reachable()
const reaches = (point: Point) => {
  for (let dy = -step; dy <= step; dy += step) for (let dx = -step; dx <= step; dx += step) {
    if (walkable.has(`${Math.round(point.x / step) * step + dx},${Math.round(point.y / step) * step + dy}`)) return true
  }
  return false
}

test('the terrain map is a full rectangle of known tiles', () => {
  assert.equal(WORLD.width, COLUMNS * TILE)
  assert.equal(WORLD.height, ROWS * TILE)
  for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
    assert.ok(['grass', 'path', 'water', 'soil'].includes(terrainAt(column, row)))
  }
})

test('the player starts on the road and can walk up to every villager', () => {
  assert.equal(terrainAt(Math.floor(heroStart.x / TILE), Math.floor(heroStart.y / TILE)), 'path')
  assert.equal(canStand(heroStart), true)
  assert.deepEqual(talkSpots.map(spot => spot.npc).sort(), npcs.map(npc => npc.kind).sort())
  for (const spot of talkSpots) {
    assert.ok(reaches(spot.door), `${spot.npc} talk spot is reachable`)
    assert.equal(nearestVillager(spot.door), spot.npc)
  }
  assert.equal(nearestVillager(heroStart), undefined)
})

test('the fenced field is entered through its gate, not through the fence', () => {
  assert.ok(reaches({ x: 700, y: 450 }), 'field interior is reachable')
  assert.equal(canStand({ x: gatePoint.x, y: gatePoint.y - 2 }), true)
  assert.equal(canStand({ x: (fence.gate.column + 3.5) * TILE, y: (fence.top + 1) * TILE - 3 }), false)
  assert.equal(canStand({ x: fence.left * TILE + 8, y: (fence.top + 5) * TILE }), false)
  assert.equal(gateFrame({ x: gatePoint.x, y: gatePoint.y - 4 }), 3)
  assert.equal(gateFrame(heroStart), 0)
})

test('trees, buildings, people and water are solid', () => {
  for (const prop of props) {
    if (['oak', 'round', 'pine', 'fruit', 'cottage', 'library', 'windmill', 'forge'].includes(prop.kind)) assert.equal(canStand({ x: prop.x, y: prop.y - 4 }), false, `${prop.kind} at ${prop.x},${prop.y}`)
  }
  for (const npc of npcs) assert.equal(canStand({ x: npc.x, y: npc.y - 2 }), false, npc.kind)
  assert.equal(canStand({ x: 160, y: 440 }), false)
  assert.equal(reaches({ x: 160, y: 440 }), false)
})

test('the angler stands on the shore and casts into the lake', () => {
  const angler = npcs.find(npc => npc.kind === 'angler')
  assert.ok(angler)
  const tile = (point: Point) => terrainAt(Math.floor(point.x / TILE), Math.floor(point.y / TILE))
  assert.notEqual(tile(angler), 'water')
  assert.equal(tile({ x: angler.x - 40, y: angler.y - 6 }), 'water')
})

test('movement slides along collision boundaries instead of entering them', () => {
  const cottageFront = { x: 210, y: 214 }
  assert.equal(canStand(cottageFront), true)
  const result = moveHero(cottageFront, 3, -20)
  assert.deepEqual(result, { x: 213, y: 214 })
})

test('the camera follows the player, stays inside the map and centers a small map', () => {
  assert.deepEqual(cameraFor({ x: 512, y: 250 }, 720, 450), { x: 152, y: 25 })
  assert.deepEqual(cameraFor({ x: 1000, y: 630 }, 720, 450), { x: WORLD.width - 720, y: WORLD.height - 450 })
  assert.deepEqual(cameraFor({ x: 40, y: 96 }, 720, 450), { x: 0, y: 0 })
  assert.deepEqual(cameraFor(heroStart, 1200, 800), { x: -88, y: -80 })
})

test('art is scaled by whole device pixels', () => {
  assert.equal(pixelScale(1440, 900, 1), 2)
  assert.equal(pixelScale(1440, 900, 2), 4)
  assert.equal(pixelScale(390, 844, 3), 6)
  assert.equal(pixelScale(2560, 1440, 1), 3)
  assert.equal(pixelScale(1280, 720, 1.25), 3)
})

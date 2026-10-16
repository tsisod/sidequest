export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type Terrain = 'grass' | 'path' | 'water' | 'soil'

export const TILE = 16
const terrainRows = [
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '..............##...............................##...............',
  '............#########################################...........',
  '............#########################################...........',
  '...............................##.........##....................',
  '...............................##.........##....................',
  '...............................##.........##....................',
  '...............................##.........##....................',
  '...............................##.........##....................',
  '...............................##.........##....................',
  '........~~~~~~~................##....#############..............',
  '.....~~~~~~~~~~~~~.............##....#############..............',
  '.....~~~~~~~~~~~~~.............##.........#.....................',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.....~~~~~~~~~~~~~.##############......================.........',
  '.....~~~~~~~~~~~~~.##############......================.........',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.....~~~~~~~~~~~~~.............##......================.........',
  '.......~~~~~~~.................##......================.........',
  '...............................##......================.........',
  '...............................##...............................',
  '...............................##...............................',
  '...............................##...............................',
  '...............................##...............................',
  '...............................##...............................',
]
const terrainCodes: Record<string, Terrain> = { '.': 'grass', '#': 'path', '~': 'water', '=': 'soil' }
export const COLUMNS = terrainRows[0].length
export const ROWS = terrainRows.length
export const WORLD = { width: COLUMNS * TILE, height: ROWS * TILE }

export function terrainAt(column: number, row: number): Terrain {
  const code = terrainRows[Math.max(0, Math.min(ROWS - 1, row))][Math.max(0, Math.min(COLUMNS - 1, column))]
  return terrainCodes[code] ?? 'grass'
}

export type PropKind =
  | 'cottage' | 'library' | 'windmill' | 'forge'
  | 'oak' | 'round' | 'pine' | 'fruit'
  | 'bush' | 'rock' | 'stump' | 'log' | 'crate' | 'barrel' | 'scarecrow' | 'tallGrass' | 'reeds' | 'mushrooms'
export type Prop = { kind: PropKind; x: number; y: number }
export type NpcKind = 'angler' | 'smith' | 'librarian' | 'gardener' | 'housekeeper' | 'dog'
export type Npc = { kind: NpcKind; x: number; y: number }

const footprints: Record<PropKind, Rect | null> = {
  cottage: { x: -44, y: -50, w: 88, h: 46 },
  library: { x: -50, y: -52, w: 100, h: 48 },
  windmill: { x: -22, y: -30, w: 44, h: 28 },
  forge: { x: -28, y: -20, w: 60, h: 18 },
  oak: { x: -10, y: -10, w: 20, h: 9 },
  round: { x: -8, y: -9, w: 16, h: 8 },
  pine: { x: -7, y: -8, w: 14, h: 7 },
  fruit: { x: -8, y: -9, w: 16, h: 8 },
  bush: { x: -12, y: -11, w: 24, h: 10 },
  rock: { x: -13, y: -12, w: 26, h: 11 },
  stump: { x: -9, y: -9, w: 18, h: 8 },
  log: { x: -15, y: -10, w: 30, h: 9 },
  crate: { x: -12, y: -10, w: 24, h: 9 },
  barrel: { x: -8, y: -8, w: 16, h: 7 },
  scarecrow: { x: -4, y: -6, w: 8, h: 5 },
  tallGrass: null,
  reeds: null,
  mushrooms: null,
}

const forestEdge: Prop[] = [
  { kind: 'round', x: 24, y: 76 }, { kind: 'oak', x: 150, y: 84 }, { kind: 'pine', x: 300, y: 72 }, { kind: 'round', x: 470, y: 78 },
  { kind: 'oak', x: 700, y: 84 }, { kind: 'pine', x: 846, y: 72 }, { kind: 'round', x: 1000, y: 78 },
  { kind: 'pine', x: 18, y: 250 }, { kind: 'round', x: 14, y: 590 },
  { kind: 'round', x: 1010, y: 236 }, { kind: 'pine', x: 1012, y: 330 },
  { kind: 'pine', x: 40, y: 652 }, { kind: 'oak', x: 392, y: 662 }, { kind: 'round', x: 640, y: 656 }, { kind: 'pine', x: 790, y: 650 }, { kind: 'oak', x: 1000, y: 662 },
]
const village: Prop[] = [
  { kind: 'cottage', x: 240, y: 208 },
  { kind: 'library', x: 768, y: 208 },
  { kind: 'windmill', x: 600, y: 344 },
  { kind: 'forge', x: 752, y: 352 },
  { kind: 'oak', x: 420, y: 168 },
  { kind: 'round', x: 610, y: 130 },
  { kind: 'fruit', x: 900, y: 142 },
  { kind: 'fruit', x: 950, y: 214 },
  { kind: 'fruit', x: 888, y: 244 },
  { kind: 'fruit', x: 90, y: 168 },
  { kind: 'fruit', x: 110, y: 296 },
  { kind: 'fruit', x: 250, y: 326 },
  { kind: 'oak', x: 420, y: 380 },
  { kind: 'round', x: 372, y: 516 },
  { kind: 'pine', x: 452, y: 520 },
  { kind: 'oak', x: 160, y: 586 },
  { kind: 'round', x: 300, y: 590 },
  { kind: 'oak', x: 940, y: 420 },
  { kind: 'pine', x: 972, y: 500 },
  { kind: 'round', x: 930, y: 584 },
  { kind: 'bush', x: 176, y: 214 },
  { kind: 'bush', x: 312, y: 214 },
  { kind: 'bush', x: 692, y: 214 },
  { kind: 'bush', x: 840, y: 214 },
  { kind: 'barrel', x: 300, y: 196 },
  { kind: 'crate', x: 820, y: 196 },
  { kind: 'rock', x: 556, y: 196 },
  { kind: 'rock', x: 384, y: 560 },
  { kind: 'stump', x: 232, y: 552 },
  { kind: 'log', x: 470, y: 600 },
  { kind: 'mushrooms', x: 214, y: 576 },
  { kind: 'mushrooms', x: 444, y: 404 },
  { kind: 'scarecrow', x: 752, y: 476 },
  { kind: 'reeds', x: 96, y: 386 },
  { kind: 'reeds', x: 262, y: 404 },
  { kind: 'reeds', x: 104, y: 512 },
  { kind: 'tallGrass', x: 46, y: 360 },
  { kind: 'tallGrass', x: 312, y: 384 },
  { kind: 'tallGrass', x: 902, y: 352 },
]
export const props: Prop[] = [...forestEdge, ...village]

export const npcs: Npc[] = [
  { kind: 'angler', x: 300, y: 446 },
  { kind: 'smith', x: 788, y: 372 },
  { kind: 'librarian', x: 716, y: 214 },
  { kind: 'gardener', x: 830, y: 470 },
  { kind: 'housekeeper', x: 182, y: 300 },
  { kind: 'dog', x: 280, y: 216 },
]
const talkOffsets: Record<NpcKind, { door: Point; marker: Point }> = {
  angler: { door: { x: 4, y: 14 }, marker: { x: 7, y: -36 } },
  smith: { door: { x: -4, y: 14 }, marker: { x: 4, y: -32 } },
  librarian: { door: { x: 0, y: 14 }, marker: { x: 0, y: -32 } },
  gardener: { door: { x: 0, y: 14 }, marker: { x: 0, y: -32 } },
  housekeeper: { door: { x: 2, y: 14 }, marker: { x: 4, y: -32 } },
  dog: { door: { x: 0, y: 14 }, marker: { x: 0, y: -24 } },
}
const person: Rect = { x: -6, y: -5, w: 12, h: 5 }
const npcFootprints: Record<NpcKind, Rect> = { angler: person, smith: { x: -15, y: -6, w: 27, h: 6 }, librarian: person, gardener: person, housekeeper: person, dog: person }

export const fence = { left: 38, top: 24, right: 55, bottom: 35, gate: { column: 42, row: 24 } }
export const gatePoint: Point = { x: (fence.gate.column + .5) * TILE, y: (fence.gate.row + 1) * TILE }

function fenceBlockers(): Rect[] {
  const { left, top, right, bottom, gate } = fence
  const blockers: Rect[] = []
  for (let column = left; column <= right; column++) {
    if (column !== gate.column || top !== gate.row) blockers.push({ x: column * TILE, y: (top + 1) * TILE - 6, w: TILE, h: 5 })
    blockers.push({ x: column * TILE, y: (bottom + 1) * TILE - 6, w: TILE, h: 5 })
  }
  for (let row = top; row <= bottom; row++) {
    blockers.push({ x: left * TILE + 5, y: row * TILE, w: 6, h: TILE }, { x: right * TILE + 5, y: row * TILE, w: 6, h: TILE })
  }
  return blockers
}

const place = (rect: Rect, at: Point): Rect => ({ x: at.x + rect.x, y: at.y + rect.y, w: rect.w, h: rect.h })
const blockers: Rect[] = [
  ...props.flatMap(prop => { const footprint = footprints[prop.kind]; return footprint ? [place(footprint, prop)] : [] }),
  ...npcs.map(npc => place(npcFootprints[npc.kind], npc)),
  ...fenceBlockers(),
]

const offset = (from: Point, by: Point): Point => ({ x: from.x + by.x, y: from.y + by.y })
export const talkSpots: { npc: NpcKind; door: Point; marker: Point }[] = npcs.map(npc => ({ npc: npc.kind, door: offset(npc, talkOffsets[npc.kind].door), marker: offset(npc, talkOffsets[npc.kind].marker) }))
export const heroStart: Point = { x: 512, y: 250 }
const bounds = { left: 40, top: 96, right: WORLD.width - 40, bottom: WORLD.height - 6 }
const hero = { halfWidth: 5, height: 4 }

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const wet = (x: number, y: number) => terrainAt(Math.floor(x / TILE), Math.floor(y / TILE)) === 'water'
const swimDepth: readonly Point[] = [{ x: 0, y: 0 }, { x: -6, y: 0 }, { x: 6, y: 0 }, { x: 0, y: -6 }, { x: 0, y: 4 }]

export function isSwimming(point: Point): boolean {
  return swimDepth.every(offset => wet(point.x + offset.x, point.y + offset.y))
}

export function canStand(point: Point): boolean {
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return false
  const box = { x: point.x - hero.halfWidth, y: point.y - hero.height, w: hero.halfWidth * 2, h: hero.height }
  return !blockers.some(blocker => overlaps(box, blocker))
}

export function moveHero(point: Point, dx: number, dy: number): Point {
  const nextX = { x: point.x + dx, y: point.y }
  const horizontal = canStand(nextX) ? nextX : point
  const nextY = { x: horizontal.x, y: horizontal.y + dy }
  return canStand(nextY) ? nextY : horizontal
}

export function nearestVillager(point: Point): NpcKind | undefined {
  let nearest: { npc: NpcKind; distance: number } | undefined
  for (const spot of talkSpots) {
    const distance = Math.hypot(point.x - spot.door.x, point.y - spot.door.y)
    if (distance < 30 && (!nearest || distance < nearest.distance)) nearest = { npc: spot.npc, distance }
  }
  return nearest?.npc
}

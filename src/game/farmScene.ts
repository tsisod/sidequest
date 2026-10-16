import { COLUMNS, ROWS, TILE, WORLD, fence, gatePoint, npcs, props, terrainAt } from './world.ts'
import type { NpcKind, Point, PropKind } from './world.ts'
import { seasonArt } from './farmArt.ts'
import type { Crop, Origin, SeasonArt, Sprite } from './farmArt.ts'
import type { Daylight, Season } from './sky.ts'
import { drawParticles, sparkBob } from './effects.ts'
import { drawForge, drawForgeFire, forgeArt, forgeGlow, forgeMouth } from './forge.ts'
import type { Particle, Pose } from './effects.ts'

export type Direction = 'down' | 'up' | 'left' | 'right'
export type Camera = { x: number; y: number; scale: number }
type SpriteActor = { image: CanvasImageSource; crop: Crop; x: number; y: number; depth: number; size?: readonly [number, number]; shadow?: { x: number; radius: number } }
type Actor = SpriteActor | { depth: number; paint: (context: CanvasRenderingContext2D) => void }
export type FarmAssets = { art: SeasonArt; images: Map<string, HTMLImageElement>; terrain: HTMLCanvasElement[]; scenery: SpriteActor[]; forgeFire: HTMLCanvasElement }

const npcArt: Record<NpcKind, { image: string; frames: number; width: number; anchorX: number; frameMs: number }> = {
  angler: { image: 'angler-fishing-left', frames: 5, width: 64, anchorX: 48, frameMs: 320 },
  smith: { image: 'smith-anvil', frames: 5, width: 32, anchorX: 16, frameMs: 180 },
  librarian: { image: 'old-man-cane', frames: 4, width: 32, anchorX: 16, frameMs: 260 },
  gardener: { image: 'girl1-basket', frames: 1, width: 32, anchorX: 16, frameMs: 1000 },
  housekeeper: { image: 'butterfly', frames: 4, width: 32, anchorX: 16, frameMs: 230 },
  dog: { image: 'dog-tail', frames: 4, width: 32, anchorX: 8, frameMs: 200 },
}
const windowGlows: Partial<Record<PropKind, Point[]>> = {
  cottage: [{ x: -8, y: -48 }, { x: 25, y: -26 }],
  library: [{ x: -27, y: -32 }, { x: 22, y: -37 }],
  forge: [forgeGlow],
}
const trees = new Set<PropKind>(['oak', 'round', 'pine', 'fruit'])
const isCrop = (sprite: Sprite): sprite is Crop => typeof sprite[0] === 'number'
const commonImages = ['crops', ...Object.values(npcArt).map(npc => npc.image), ...['down', 'up', 'left', 'right'].flatMap(d => [`farmer-idle-${d}`, `farmer-walk-${d}`])]

function loadImage(name: string, src = `/assets/farm/${name}.png`): Promise<readonly [string, HTMLImageElement]> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve([name, image])
    image.onerror = () => reject(new Error('The village art could not load. Refresh to try again.'))
    image.src = src
  })
}

export async function loadFarmAssets(season: Season): Promise<FarmAssets> {
  const art = seasonArt[season]
  const images = new Map(await Promise.all([...[...commonImages, art.atlas, art.windmill, art.gate].map(name => loadImage(name)), loadImage('spark', '/assets/learnspace-ui/spark-sprite.png')]))
  const atlas = images.get(art.atlas)
  if (!atlas) throw new Error('The village tiles are missing.')
  const plants = images.get('crops')
  if (!plants) throw new Error('The crop art is missing.')
  return { art, images, terrain: [0, 1, 2, 3].map(frame => drawTerrain(art, atlas, frame)), scenery: arrangeScenery(art, atlas, plants, drawForge(season)), forgeFire: drawForgeFire() }
}

function arrangeScenery(art: SeasonArt, atlas: HTMLImageElement, plants: HTMLImageElement, forge: HTMLCanvasElement): SpriteActor[] {
  const scenery: SpriteActor[] = []
  for (const prop of props) {
    if (prop.kind === 'windmill') continue
    if (prop.kind === 'forge') { scenery.push({ image: forge, crop: [0, 0, forgeArt.width, forgeArt.height], x: prop.x - forgeArt.anchor.x, y: prop.y - forgeArt.anchor.y, depth: prop.y }); continue }
    const look = art.props[prop.kind]
    const pieces = isCrop(look) ? [look] : look
    const left = Math.min(...pieces.map(piece => piece[0]))
    const top = Math.min(...pieces.map(piece => piece[1]))
    const width = Math.max(...pieces.map(piece => piece[0] + piece[2])) - left
    const height = Math.max(...pieces.map(piece => piece[1] + piece[3])) - top
    for (const piece of pieces) scenery.push({ image: atlas, crop: piece, x: prop.x - width / 2 + piece[0] - left, y: prop.y - height + piece[1] - top, depth: prop.y })
  }
  const fenceTile = (column: number, row: number, dx: number, dy: number) => scenery.push({ image: atlas, crop: [art.fence.x + dx, art.fence.y + dy, TILE, TILE], x: column * TILE, y: row * TILE, depth: (row + 1) * TILE - 1 })
  for (let column = fence.left; column <= fence.right; column++) {
    const dx = column === fence.left ? 0 : column === fence.right ? 32 : 16
    if (column !== fence.gate.column) fenceTile(column, fence.top, dx, 0)
    fenceTile(column, fence.bottom, dx, 32)
  }
  for (let row = fence.top + 1; row < fence.bottom; row++) { fenceTile(fence.left, row, 0, 16); fenceTile(fence.right, row, 32, 16) }
  const fieldProps = props.filter(prop => terrainAt(Math.floor(prop.x / TILE), Math.floor(prop.y / TILE)) === 'soil')
  const clearing = (column: number, row: number) => fieldProps.some(prop => Math.abs(column - Math.floor(prop.x / TILE)) <= 1 && row * TILE < prop.y && row * TILE > prop.y - 4 * TILE)
  if (art.crops.length) for (let row = fence.top + 2, line = 0; row < fence.bottom; row += 2, line++) {
    const crop = art.crops[line % art.crops.length]
    for (let column = fence.left + 2; column <= fence.right - 2; column++) {
      if (!clearing(column, row)) scenery.push({ image: plants, crop, x: column * TILE, y: row * TILE + 14 - crop[3], depth: row * TILE + 13 })
    }
  }
  return scenery
}

export function pixelScale(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const zoom = Math.max(2, Math.round(Math.min(cssWidth / 720, cssHeight / 450)))
  return Math.max(1, Math.round(zoom * devicePixelRatio))
}

export function cameraFor(hero: Point, viewWidth: number, viewHeight: number): Point {
  const axis = (focus: number, view: number, world: number) => view >= world ? Math.round((world - view) / 2) : Math.round(Math.max(0, Math.min(world - view, focus - view / 2)))
  return { x: axis(hero.x, viewWidth, WORLD.width), y: axis(hero.y, viewHeight, WORLD.height) }
}


type Scene = { hero: Point; spark: Point; direction: Direction; moving: boolean; sprinting: boolean; swimming: boolean; time: number; jumpHeight: number; pose: Pose; dust: readonly Particle[]; splashes: readonly Particle[]; twinkles: readonly Particle[]; smoke: readonly Particle[]; motion: boolean; camera: Camera; viewWidth: number; viewHeight: number; daylight: Daylight }

const SWIM_SHOWN = 24
const RIPPLE_MS = 1200

function paintRipples(context: CanvasRenderingContext2D, x: number, waterline: number, time: number, motion: boolean) {
  context.lineWidth = 1
  const ring = (radius: number, y: number, alpha: number) => {
    context.strokeStyle = `rgb(236 249 255 / ${alpha})`
    context.beginPath(); context.ellipse(x, y, radius, radius * .32, 0, 0, Math.PI * 2); context.stroke()
  }
  if (motion) for (const offset of [0, RIPPLE_MS / 2]) {
    const age = (time + offset) % RIPPLE_MS / RIPPLE_MS
    ring(9 + age * 10, waterline + age, .55 * (1 - age))
  }
  ring(8.5, waterline, .9)
}

export function gateFrame(hero: Point): number {
  const distance = Math.hypot(hero.x - gatePoint.x, hero.y - gatePoint.y)
  return distance < 22 ? 3 : distance < 30 ? 2 : distance < 38 ? 1 : 0
}

export function drawFarm(context: CanvasRenderingContext2D, assets: FarmAssets, { hero, spark, direction, moving, sprinting, swimming, time, jumpHeight, pose, dust, splashes, twinkles, smoke, motion, camera, viewWidth, viewHeight, daylight }: Scene) {
  const { art, images } = assets
  context.imageSmoothingEnabled = false
  context.fillStyle = '#29412e'
  context.fillRect(camera.x, camera.y, viewWidth, viewHeight)
  context.drawImage(assets.terrain[Math.floor(time / 260) % 4], 0, 0)

  const actors: Actor[] = [...assets.scenery]
  const windmill = images.get(art.windmill)
  if (windmill) for (const prop of props) if (prop.kind === 'windmill') actors.push({ image: windmill, crop: [Math.floor(time / 180) % 4 * 96, 0, 96, 128], x: prop.x - 48, y: prop.y - 128, depth: prop.y })
  for (const prop of props) if (prop.kind === 'forge') actors.push({ image: assets.forgeFire, crop: [Math.floor(time / 110) % forgeArt.fire.frames * forgeArt.fire.width, 0, forgeArt.fire.width, forgeArt.fire.height], x: prop.x + forgeMouth.x, y: prop.y + forgeMouth.y, depth: prop.y + .5 })
  const gate = images.get(art.gate)
  if (gate) actors.push({ image: gate, crop: [gateFrame(hero) * TILE, 0, TILE, TILE], x: fence.gate.column * TILE, y: fence.gate.row * TILE, depth: (fence.gate.row + 1) * TILE - 1 })
  for (const npc of npcs) {
    const look = npcArt[npc.kind]
    const sheet = images.get(look.image)
    if (sheet) actors.push({ image: sheet, crop: [Math.floor(time / look.frameMs) % look.frames * look.width, 0, look.width, 32], x: npc.x - look.anchorX, y: npc.y - 31, depth: npc.y, shadow: { x: npc.x, radius: 7 } })
  }
  if (swimming) {
    const swimmer = images.get(`farmer-walk-${direction}`)
    const waterline = hero.y - 2 + (motion ? Math.round(Math.sin(time / 260)) : 0)
    if (swimmer) actors.push({ image: swimmer, crop: [Math.floor(time / (moving ? 190 : 380)) % 4 * 32, 0, 32, SWIM_SHOWN], x: hero.x - 16, y: waterline - SWIM_SHOWN, depth: hero.y })
    actors.push({ depth: hero.y + .1, paint: painter => paintRipples(painter, hero.x, waterline, time, motion) })
  } else {
    const player = images.get(`farmer-${moving ? 'walk' : 'idle'}-${direction}`)
    const heroSize = [Math.round(32 * pose.scaleX), Math.round(32 * pose.scaleY)] as const
    if (player) actors.push({ image: player, crop: [moving ? Math.floor(time / (sprinting ? 85 : 140)) % 4 * 32 : 0, 0, 32, 32], x: hero.x - heroSize[0] / 2, y: hero.y - jumpHeight + 2 - heroSize[1], depth: hero.y, size: heroSize, shadow: { x: hero.x, radius: 8 - jumpHeight / 5 } })
  }

  drawParticles(context, dust, time)
  actors.sort((a, b) => a.depth - b.depth)
  for (const actor of actors) {
    if ('paint' in actor) { actor.paint(context); continue }
    if (actor.shadow) {
      context.fillStyle = '#1d382e40'
      context.beginPath(); context.ellipse(actor.shadow.x, actor.depth - 2, actor.shadow.radius, actor.shadow.radius * .45, 0, 0, Math.PI * 2); context.fill()
    }
    context.drawImage(actor.image, ...actor.crop, Math.round(actor.x), Math.round(actor.y), actor.size?.[0] ?? actor.crop[2], actor.size?.[1] ?? actor.crop[3])
  }

  drawParticles(context, splashes, time)
  drawParticles(context, smoke, time)
  if (daylight.tint) {
    context.globalCompositeOperation = 'multiply'
    context.fillStyle = `rgb(${daylight.tint.join(' ')})`
    context.fillRect(camera.x, camera.y, viewWidth, viewHeight)
    context.globalCompositeOperation = 'lighter'
    for (const prop of props) for (const glow of windowGlows[prop.kind] ?? []) {
      const x = prop.x + glow.x
      const y = prop.y + glow.y
      const light = context.createRadialGradient(x, y, 1, x, y, 20)
      light.addColorStop(0, `rgb(255 196 110 / ${.6 * daylight.glow})`)
      light.addColorStop(1, 'rgb(255 196 110 / 0)')
      context.fillStyle = light
      context.fillRect(x - 20, y - 20, 40, 40)
    }
    context.globalCompositeOperation = 'source-over'
  }
  const fairy = images.get('spark')
  const fairyY = spark.y + (motion ? sparkBob(time) : 0)
  const glow = (.18 + .4 * daylight.glow) * (motion ? .85 + .15 * Math.sin(time / 300) : 1)
  const halo = context.createRadialGradient(spark.x, fairyY, 1, spark.x, fairyY, 14)
  halo.addColorStop(0, `rgb(190 236 255 / ${glow})`)
  halo.addColorStop(1, 'rgb(190 236 255 / 0)')
  context.globalCompositeOperation = 'lighter'
  context.fillStyle = halo
  context.fillRect(spark.x - 14, fairyY - 14, 28, 28)
  context.globalCompositeOperation = 'source-over'
  drawParticles(context, twinkles, time)
  if (fairy) context.drawImage(fairy, Math.floor(time / 160) % 4 * 48, 0, 48, 48, Math.round(spark.x - 18), Math.round(fairyY - 15), 36, 36)
}

function hash(column: number, row: number): number {
  let value = Math.imul(column, 374761393) + Math.imul(row, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

function shoreTile(column: number, row: number): { origin: 'island' | 'cross'; dx: number; dy: number } | null {
  const water = (dc: number, dr: number) => terrainAt(column + dc, row + dr) === 'water'
  const island = (dx: number, dy: number) => ({ origin: 'island' as const, dx, dy })
  const cross = (dx: number, dy: number) => ({ origin: 'cross' as const, dx, dy })
  if (water(0, 0)) {
    const [n, s, e, w] = [!water(0, -1), !water(0, 1), !water(1, 0), !water(-1, 0)]
    if (n && e) return cross(0, 48)
    if (n && w) return cross(48, 48)
    if (s && e) return cross(0, 0)
    if (s && w) return cross(48, 0)
    if (n) return island(32, 64)
    if (s) return island(32, 0)
    if (e) return island(0, 32)
    if (w) return island(64, 32)
    if (!water(1, 1)) return island(0, 0)
    if (!water(-1, 1)) return island(64, 0)
    if (!water(1, -1)) return island(0, 64)
    if (!water(-1, -1)) return island(64, 64)
    return null
  }
  const [n, s, e, w] = [water(0, -1), water(0, 1), water(1, 0), water(-1, 0)]
  if (n && w) return island(16, 16)
  if (n && e) return island(48, 16)
  if (s && w) return island(16, 48)
  if (s && e) return island(48, 48)
  if (n) return island(32, 16)
  if (s) return island(32, 48)
  if (w) return island(16, 32)
  if (e) return island(48, 32)
  if (water(-1, -1)) return cross(16, 16)
  if (water(1, -1)) return cross(32, 16)
  if (water(-1, 1)) return cross(16, 32)
  if (water(1, 1)) return cross(32, 32)
  return null
}

function drawTerrain(art: SeasonArt, atlas: HTMLImageElement, frame: number): HTMLCanvasElement {
  const terrain = document.createElement('canvas')
  terrain.width = WORLD.width
  terrain.height = WORLD.height
  const context = terrain.getContext('2d')
  if (!context) throw new Error('The village could not be drawn.')
  context.imageSmoothingEnabled = false
  const stamp = (crop: Crop, x: number, y: number) => context.drawImage(atlas, ...crop, Math.round(x), Math.round(y), crop[2], crop[3])
  const pick = (crops: Crop[], column: number, row: number) => crops[Math.floor(hash(column, row) * crops.length)]
  const cells = Array.from({ length: ROWS }, (_, row) => Array.from({ length: COLUMNS }, (_, column) => ({ column, row, terrain: terrainAt(column, row) }))).flat()
  const near = (column: number, row: number, kind: string, distance: number) => {
    for (let dr = -distance; dr <= distance; dr++) for (let dc = -distance; dc <= distance; dc++) if (terrainAt(column + dc, row + dr) === kind) return true
    return false
  }

  for (const { column, row } of cells) stamp(pick(art.grass, column, row), column * TILE, row * TILE)
  for (const prop of props) {
    if (trees.has(prop.kind) && !near(Math.floor(prop.x / TILE), Math.floor(prop.y / TILE), 'water', 3)) stamp(art.darkPatch, prop.x - 24, prop.y - 34)
  }
  for (const { column, row, terrain: kind } of cells) {
    if (kind === 'path' && !near(column, row, 'water', 2)) stamp(art.lightPatch, column * TILE - 16, row * TILE - 16)
  }

  const tile = (origin: Origin, dx: number, dy: number): Crop => [origin.x + dx, origin.y + dy, TILE, TILE]
  for (const { column, row, terrain: kind } of cells) {
    if (kind === 'soil' && art.soil) {
      const same = (dc: number, dr: number) => terrainAt(column + dc, row + dr) === 'soil'
      stamp(tile(art.soil, !same(-1, 0) ? 0 : !same(1, 0) ? 32 : 16, !same(0, -1) ? 0 : !same(0, 1) ? 48 : 16), column * TILE, row * TILE)
    }
    if (kind === 'path') stamp(pick(art.stones, column, row), column * TILE, row * TILE)
    if (kind === 'water') stamp([art.water.x + frame * TILE, art.water.y + (hash(row, column) < .5 ? 0 : TILE), TILE, TILE], column * TILE, row * TILE)
    const shore = shoreTile(column, row)
    if (shore) {
      const origin = shore.origin === 'island' ? art.shore.island : art.shore.cross
      stamp([origin.x + shore.dx, origin.y + frame * 80 + shore.dy, TILE, TILE], column * TILE, row * TILE)
    }
    if (kind === 'grass' && !shore && !near(column, row, 'path', 1) && !near(column, row, 'soil', 1) && hash(column * 7, row * 13) < .14) {
      stamp(pick(art.details, row, column), column * TILE, row * TILE)
    }
  }
  for (let x = -32; x < WORLD.width; x += 64) {
    stamp(art.canopy, x, -28)
    if (x + 64 < 470 || x > 560) stamp(art.canopy, x, WORLD.height - 30)
  }
  for (let y = -32; y < WORLD.height; y += 64) { stamp(art.canopy, -38, y); stamp(art.canopy, WORLD.width - 26, y) }
  return terrain
}

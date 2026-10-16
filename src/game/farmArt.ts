import type { PropKind } from './world.ts'
import type { Season } from './sky.ts'

export type Crop = readonly [number, number, number, number]
export type Sprite = Crop | readonly Crop[]
export type Origin = { x: number; y: number }
export type SeasonArt = {
  atlas: string
  windmill: string
  gate: string
  grass: Crop[]
  details: Crop[]
  lightPatch: Crop
  darkPatch: Crop
  canopy: Crop
  stones: Crop[]
  water: Origin
  shore: { island: Origin; cross: Origin }
  fence: Origin
  soil: Origin | null
  crops: Crop[]
  props: Record<Exclude<PropKind, 'windmill' | 'forge'>, Sprite>
}

const tiles = (y: number, xs: number[], size = 16): Crop[] => xs.map(x => [x, y, size, size])

const springSummer = {
  atlas: 'farm-spring',
  windmill: 'windmill-spring',
  gate: 'gate',
  grass: [...tiles(16, [304, 304, 304, 304, 304, 304]), ...tiles(16, [320, 336, 352])],
  lightPatch: [432, 96, 48, 48],
  darkPatch: [528, 96, 48, 48],
  canopy: [0, 0, 64, 64],
  stones: tiles(112, [272, 288, 304]),
  water: { x: 208, y: 304 },
  shore: { island: { x: 0, y: 336 }, cross: { x: 80, y: 336 } },
  fence: { x: 176, y: 192 },
  soil: { x: 640, y: 224 },
} satisfies Partial<SeasonArt>
const oakBesideStump: Sprite = [[1, 148, 78, 58], [1, 206, 70, 17]]

const springSummerProps = {
  cottage: [816, 385, 91, 95], library: [1014, 391, 103, 103],
  oak: oakBesideStump, round: [192, 5, 63, 75], pine: [146, 65, 45, 63],
  bush: [144, 128, 32, 32], rock: [241, 154, 29, 22], stump: [57, 128, 22, 16], log: [208, 113, 32, 15],
  crate: [964, 488, 26, 19], barrel: [55, 279, 18, 25],
  scarecrow: [196, 240, 40, 48], tallGrass: [2, 306, 45, 29], reeds: [162, 308, 28, 21], mushrooms: [246, 80, 20, 16],
} satisfies Record<string, Sprite>

export const seasonArt: Record<Season, SeasonArt> = {
  spring: {
    ...springSummer,
    details: [...tiles(64, [304, 320, 336, 352, 368, 384]), ...tiles(80, [304, 320, 336]), ...tiles(32, [304, 320, 336])],
    crops: [[16, 16, 16, 16], [32, 96, 16, 16], [32, 112, 16, 16], [16, 48, 16, 16]],
    props: { ...springSummerProps, fruit: [581, 395, 74, 69], tallGrass: [400, 48, 32, 16] },
  },
  summer: {
    ...springSummer,
    details: [...tiles(32, [304, 320, 336, 352, 368, 384]), ...tiles(48, [304, 320, 336]), ...tiles(64, [320, 336])],
    crops: [[48, 96, 16, 16], [48, 112, 16, 16], [48, 64, 16, 32], [48, 16, 16, 16], [208, 128, 16, 32]],
    props: { ...springSummerProps, fruit: [661, 395, 74, 69] },
  },
  autumn: {
    atlas: 'farm-autumn',
    windmill: 'windmill-autumn',
    gate: 'gate',
    grass: [...tiles(16, [304, 304, 304, 304, 304, 304]), ...tiles(16, [320, 336, 352])],
    details: [...tiles(32, [304, 320, 336, 352, 368, 384]), ...tiles(48, [304, 320, 336, 352]), ...tiles(64, [320, 336])],
    lightPatch: [432, 96, 48, 48],
    darkPatch: [528, 96, 48, 48],
    canopy: [0, 0, 64, 64],
    stones: tiles(112, [272, 288, 304]),
    water: { x: 208, y: 304 },
    shore: { island: { x: 0, y: 336 }, cross: { x: 80, y: 336 } },
    fence: { x: 176, y: 192 },
    soil: { x: 592, y: 224 },
    crops: [[48, 176, 16, 16], [48, 192, 16, 32], [192, 96, 16, 16], [48, 160, 16, 16]],
    props: {
      cottage: [960, 209, 91, 95], library: [966, 103, 103, 103],
      oak: oakBesideStump, round: [192, 5, 63, 75], pine: [146, 65, 45, 63], fruit: [[661, 395, 74, 56], [661, 451, 56, 13]],
      bush: [176, 128, 32, 32], rock: [241, 154, 29, 22], stump: [57, 128, 22, 16], log: [208, 113, 32, 15],
      crate: [980, 312, 26, 19], barrel: [55, 279, 18, 25],
      scarecrow: [196, 240, 40, 48], tallGrass: [2, 306, 45, 29], reeds: [162, 308, 28, 21], mushrooms: [246, 80, 20, 16],
    },
  },
  winter: {
    atlas: 'farm-winter',
    windmill: 'windmill-winter',
    gate: 'gate-winter',
    grass: tiles(16, [400]),
    details: [[240, 288, 16, 16], [240, 304, 16, 16], [256, 281, 16, 15], [256, 297, 16, 14]],
    lightPatch: [384, 96, 48, 48],
    darkPatch: [480, 96, 48, 48],
    canopy: [0, 0, 64, 64],
    stones: tiles(64, [304, 320, 336]),
    water: { x: 0, y: 336 },
    shore: { island: { x: 0, y: 368 }, cross: { x: 80, y: 368 } },
    fence: { x: 208, y: 176 },
    soil: null,
    crops: [],
    props: {
      cottage: [704, 369, 91, 95], library: [597, 359, 104, 103],
      oak: [1, 148, 78, 75], round: [192, 5, 63, 75], pine: [210, 81, 45, 63], fruit: [416, 392, 43, 56],
      bush: [128, 288, 32, 32], rock: [226, 240, 30, 16], stump: [88, 208, 19, 15], log: [161, 274, 31, 14],
      crate: [32, 224, 32, 27], barrel: [7, 278, 18, 26],
      scarecrow: [164, 288, 40, 48], tallGrass: [240, 288, 16, 16], reeds: [176, 352, 32, 32], mushrooms: [208, 264, 32, 18],
    },
  },
}

type Run = { x: number; y: number; width: number; fill: string }
export type PixelArt = { width: number; height: number; runs: Run[] }

// Each string is one pixel row; '.' is transparent and every other character is a palette key.
function pixelArt(rows: readonly string[], palette: Record<string, string>): PixelArt {
  const width = rows[0].length
  const runs: Run[] = []
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Pixel row ${y} is ${row.length} wide, expected ${width}.`)
    for (let x = 0; x < row.length;) {
      let end = x
      while (end < row.length && row[end] === row[x]) end++
      if (row[x] !== '.') {
        const fill = palette[row[x]]
        if (!fill) throw new Error(`Pixel colour "${row[x]}" is missing.`)
        runs.push({ x, y, width: end - x, fill })
      }
      x = end
    }
  })
  return { width, height: rows.length, runs }
}

const moleColours = { o: '#3b2414', b: '#8a5a3b', d: '#6e4429', l: '#c79c6e', k: '#1d130b', w: '#fffbe9', n: '#e7849a', N: '#ffc2cf', t: '#fff8e7', r: '#c86d5c', c: '#f2e3c6' }
const moleFace = [
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbbbbbbbbbo..',
  '.obbbbbbbbbbbbo.',
]
const moleBody = [
  'obbrrbnnnnbrrbbo',
  'obbbbbnNnnbbbbbo',
  'obbbbbbttbbbbbbo',
  'obdbbllllllbbdbo',
  'occdbllllllbdcco',
  'occdbllllllbdcco',
  'obddbllllllbddbo',
  'obddbbllllbbddbo',
  'obddbbbbbbbbddbo',
]
export const mole = pixelArt([...moleFace, '.obbkwbbbbkwbbo.', '.obbkkbbbbkkbbo.', ...moleBody], moleColours)
export const bonkedMole = pixelArt([...moleFace.slice(0, 3), '.obkbkbbbbkbkbo.', '.obbkbbbbbbkbbo.', '.obkbkbbbbkbkbo.', ...moleBody], moleColours)

export const burrow = pixelArt([
  '......oooooooooo......',
  '...oooDDDDDDDDDDooo...',
  '.ooDDDhhhhhhhhhhDDDoo.',
  'oDDhhhhhhhhhhhhhhhhDDo',
  'oDdhhhhhhhhhhhhhhhhdDo',
  '.oDDdhhhhhhhhhhhhdDDo.',
  '..oooDDDDDDDDDDDDooo..',
  '.....oooooooooooo.....',
], { o: '#4a2e16', D: '#9a6a3a', d: '#7a4f28', h: '#24160c' })

export const alarmClock = pixelArt([
  '.oo........oo.',
  'oyyo......oyyo',
  'oyo.oooooo.oyo',
  '.o.oRRRRRRo.o.',
  '..oRwwwwwwRo..',
  '.oRwwwkwwwwRo.',
  '.oRwwwkwwwwRo.',
  '.oRwwwkkkwwRo.',
  '.oRwwwwwwwwRo.',
  '..oRwwwwwwRo..',
  '...oRRRRRRo...',
  '..oo.oooo.oo..',
], { o: '#39291f', y: '#f2c14e', R: '#c4473a', w: '#fff4dd', k: '#39291f' })

export const sun = pixelArt([
  '.....y....y.....',
  '..y...y..y...y..',
  '...y........y...',
  '......oooo......',
  'y...ooYYYYoo...y',
  '...oYYYYYYYYo...',
  '..oYYYwYYYYYYo..',
  '..oYYwYYYYYYYo..',
  '..oYYYYYYYYYYo..',
  '..oYYYYYYYYYYo..',
  '...oYYYYYYYYo...',
  'y...ooYYYYoo...y',
  '......oooo......',
  '...y........y...',
  '..y...y..y...y..',
  '.....y....y.....',
], { o: '#c9781e', Y: '#f8c943', w: '#fff4c2', y: '#f2c14e' })

export const coin = pixelArt([
  '...oooo...',
  '.ooyyyyoo.',
  '.oyYYYYdo.',
  'oyYwYYYYdo',
  'oyYwYYYYdo',
  'oyYYYYYYdo',
  'oyYYYYYYdo',
  '.oyYYYYdo.',
  '.oodddddo.',
  '...oooo...',
], { o: '#8c4f14', y: '#fff0a8', Y: '#f2c14e', w: '#fffbe0', d: '#c9781e' })

export const star = pixelArt([
  '.......oo.......',
  '......oYYo......',
  '......oYYo......',
  '.....oYwYYo.....',
  'oooooYwYYYYooooo',
  'oYYYYwYYYYYYYYYo',
  '.oYYYYYYYYYYYYo.',
  '..oYYYYYYYYYYo..',
  '...oYYYYYYYYo...',
  '...oYYYYYYYYo...',
  '..oYYYYddYYYYo..',
  '..oYYYdoodYYYo..',
  '.oYYYdo..odYYYo.',
  '.oYYdo....odYYo.',
  'oYYdo......odYYo',
  'oooo........oooo',
], { o: '#a8641a', Y: '#f8c943', w: '#fff4c2', d: '#e09a2a' })

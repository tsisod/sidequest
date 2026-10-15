export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Rgb = readonly [number, number, number]
export type Daylight = { tint: Rgb | null; glow: number }
export type LocalTime = { month: number; dayOfYear: number; hour: number }

const southernHemisphere = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)$|^America\/(Argentina\/.+|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Punta_Arenas)$|^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone|Lusaka|Maseru|Mbabane|Blantyre|Lubumbashi)$|^Indian\/(Mauritius|Reunion|Antananarivo)$/
const seasonsByMonth: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const formatters = new Map<string, Intl.DateTimeFormat>()

export function localTime(instant: number, timeZone: string): LocalTime {
  let format = formatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    formatters.set(timeZone, format)
  }
  const parts = format.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value)
  const [year, month, day] = [part('year'), part('month'), part('day')]
  const dayOfYear = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  return { month, dayOfYear, hour: part('hour') + part('minute') / 60 }
}

export function isSouthern(timeZone: string): boolean {
  return southernHemisphere.test(timeZone)
}

export function seasonFor({ month }: LocalTime, timeZone: string): Season {
  return seasonsByMonth[(month - 1 + (isSouthern(timeZone) ? 6 : 0)) % 12]
}

const night: Rgb = [96, 108, 170]
const dawn: Rgb = [226, 182, 200]
const day: Rgb = [255, 255, 255]
const golden: Rgb = [255, 222, 184]
const dusk: Rgb = [236, 160, 138]

export function daylightAt({ dayOfYear, hour }: LocalTime, timeZone: string): Daylight {
  const midsummer = isSouthern(timeZone) ? 355 : 172
  const length = 12 + 3.5 * Math.cos(2 * Math.PI * (dayOfYear - midsummer) / 365.25)
  const sunrise = 12.5 - length / 2
  const sunset = 12.5 + length / 2
  const keys: [number, Rgb, number][] = [
    [sunrise - 1.2, night, 1], [sunrise - .2, dawn, .6], [sunrise + .8, day, 0],
    [sunset - 1.5, day, 0], [sunset - .4, golden, .1], [sunset + .3, dusk, .6], [sunset + 1.2, night, 1],
  ]
  const after = keys.findIndex(([time]) => hour < time)
  if (after <= 0) return { tint: night, glow: 1 }
  const [startTime, startColor, startGlow] = keys[after - 1]
  const [endTime, endColor, endGlow] = keys[after]
  const progress = (hour - startTime) / (endTime - startTime)
  const mix = (a: number, b: number) => a + (b - a) * progress
  const tint: Rgb = [mix(startColor[0], endColor[0]), mix(startColor[1], endColor[1]), mix(startColor[2], endColor[2])]
  return { tint: tint.every(channel => channel > 254.5) ? null : tint, glow: mix(startGlow, endGlow) }
}

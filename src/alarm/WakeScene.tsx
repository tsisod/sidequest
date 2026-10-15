import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { seasonArt } from '../game/farmArt'
import type { Crop } from '../game/farmArt'
import type { Daylight, Season } from '../game/sky'
import Icon from '../game/GameIcon'
import { alarmClock, coin, sun } from './pixelArt'
import { Pixels } from './Pixels'
import './wakeScene.css'

type Vars = CSSProperties & Record<`--${string}`, string | number>
export type WakeReward = { xp: number; gold: number }

const fieldColour: Record<Season, string> = { spring: '#7da64e', summer: '#77a04a', autumn: '#a08e4c', winter: '#dfe8ec' }
const FIELD_TILES = 12
const TILE = 16

// Same season atlas and grass/detail tiles the village terrain uses, baked into one repeating texture.
function useFieldTexture(season: Season): string | null {
  const [texture, setTexture] = useState<{ season: Season; url: string } | null>(null)
  useEffect(() => {
    const art = seasonArt[season]
    const image = new Image()
    let live = true
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = FIELD_TILES * TILE
      const context = canvas.getContext('2d')
      if (!context || !live) return
      context.imageSmoothingEnabled = false
      const stamp = (crop: Crop, x: number, y: number) => context.drawImage(image, ...crop, x, y, crop[2], crop[3])
      const noise = (column: number, row: number) => { const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453; return value - Math.floor(value) }
      for (let row = 0; row < FIELD_TILES; row++) for (let column = 0; column < FIELD_TILES; column++) {
        stamp(art.grass[Math.floor(noise(column, row) * art.grass.length)], column * TILE, row * TILE)
      }
      for (let row = 0; row < FIELD_TILES; row++) for (let column = 0; column < FIELD_TILES; column++) {
        if (noise(column * 7, row * 13) < .16) stamp(art.details[Math.floor(noise(row, column) * art.details.length)], column * TILE, row * TILE)
      }
      setTexture({ season, url: canvas.toDataURL() })
    }
    image.src = `/assets/farm/${art.atlas}.png`
    return () => { live = false }
  }, [season])
  return texture?.season === season ? texture.url : null
}

const motes = Array.from({ length: 14 }, (_, index) => ({ left: (index * 37 + 11) % 100, delay: (index * 1.7) % 9, duration: 7 + (index * 3) % 6, drift: ((index % 5) - 2) * 14 }))
const drifterColours: Record<Season, string[]> = { spring: ['#f6c1d0', '#fbe3ea', '#e7849a'], summer: ['#a7d16a', '#7fb24a', '#f8e27a'], autumn: ['#d9772b', '#b8461f', '#e8a93a', '#8f5a2b'], winter: ['#ffffff', '#eef6ff', '#dce9f5'] }
const drifters = Array.from({ length: 11 }, (_, index) => ({ left: (index * 29 + 5) % 100, delay: -((index * 2.3) % 14), duration: 11 + (index * 5) % 7, sway: 30 + (index * 17) % 50, size: 5 + (index % 3) * 2 }))

export function WakeScene({ season, daylight, children }: { season: Season; daylight: Daylight; children: ReactNode }) {
  const texture = useFieldTexture(season)
  const style: Vars = { '--field-colour': fieldColour[season], '--field': texture ? `url(${texture})` : 'none', '--dawn': Math.max(.25, daylight.glow).toFixed(2) }
  return <div className="wake-scene" style={style}>
    <div className="wake-field" aria-hidden="true" />
    <div className="wake-sunrise" aria-hidden="true" />
    {children}
    {daylight.tint && <div className="wake-tint" aria-hidden="true" style={{ background: `rgb(${daylight.tint.map(Math.round).join(' ')})` }} />}
    <div className="wake-ambient" aria-hidden="true">
      {motes.map((mote, index) => <i key={index} className="wake-mote" style={{ '--left': `${mote.left}%`, '--delay': `${mote.delay}s`, '--duration': `${mote.duration}s`, '--drift': `${mote.drift}px` } as Vars} />)}
      {drifters.map((drifter, index) => <i key={`drift${index}`} className={`wake-drifter wake-drifter-${season}`} style={{ '--left': `${drifter.left}%`, '--delay': `${drifter.delay}s`, '--duration': `${drifter.duration}s`, '--sway': drifter.sway, '--size': `${drifter.size}px`, '--colour': drifterColours[season][index % drifterColours[season].length] } as Vars} />)}
    </div>
  </div>
}

function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }

export function WakeHud({ reward, ringing, done, total }: { reward: WakeReward | null; ringing: boolean; done: number; total: number }) {
  return <header className="wake-hud">
    <div className="wake-panel wake-hud-reward" role="img" aria-label={reward ? `Wake up now for ${reward.xp} XP and ${reward.gold} gold` : 'Wake-up check'}>
      <Pixels art={alarmClock} className={ringing ? 'wake-clock wake-clock-ringing' : 'wake-clock'} />
      {reward && <>
        <span className="wake-hud-stat wake-hud-xp" key={`xp${reward.xp}`}><Icon name="star" size={22} /><b>{signed(reward.xp)}</b><small>XP</small></span>
        <span className={reward.gold < 0 ? 'wake-hud-stat wake-hud-gold wake-hud-loss' : 'wake-hud-stat wake-hud-gold'} key={`gold${reward.gold}`}><Icon name="coin" size={22} /><b>{signed(reward.gold)}</b></span>
      </>}
    </div>
    <div className="wake-panel wake-hud-progress" role="img" aria-label={`${done} of ${total} done`}>
      {Array.from({ length: total }, (_, index) => <i key={index} className={index < done ? 'wake-pip wake-pip-on' : 'wake-pip'} />)}
    </div>
  </header>
}

type BurstKind = 'stars' | 'dust' | 'leaves' | 'coins'
const burstColours: Record<BurstKind, string[]> = {
  stars: ['#fff4c2', '#f8c943', '#ffffff', '#f2a93b'],
  dust: ['#e4d2a8', '#c9a46a', '#f3e7c9'],
  leaves: ['#7fb24a', '#a7d16a', '#f8c943', '#e7849a'],
  coins: ['#f8c943', '#f2c14e', '#fff0a8', '#c9781e'],
}
/** A one-shot spray of pixel particles; remount it with a new key to fire again. */
export function Burst({ kind, count = 12, spread = 70 }: { kind: BurstKind; count?: number; spread?: number }) {
  const [particles] = useState(() => Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + Math.random() * .6
    const distance = spread * (.55 + Math.random() * .6)
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - (kind === 'dust' ? spread * .35 : 0), size: 3 + Math.floor(Math.random() * 3) * 2, colour: burstColours[kind][index % burstColours[kind].length], delay: Math.random() * 60 }
  }))
  return <span className={`wake-burst wake-burst-${kind}`} aria-hidden="true">{particles.map((particle, index) => <i key={index} style={{ '--dx': `${particle.dx.toFixed(1)}px`, '--dy': `${particle.dy.toFixed(1)}px`, '--size': `${particle.size}px`, '--colour': particle.colour, '--delay': `${particle.delay.toFixed(0)}ms` } as Vars} />)}</span>
}

const coinShower = Array.from({ length: 26 }, (_, index) => ({ left: (index * 41 + 7) % 100, delay: (index * 83) % 900, duration: 1100 + (index * 157) % 700, spin: index % 2 ? 1 : -1 }))

export function WakeCelebration({ reward }: { reward: WakeReward | null }) {
  return <div className="wake-celebration" role="status" aria-label={reward ? `Awake! ${signed(reward.xp)} XP and ${signed(reward.gold)} gold.` : 'Awake! Check-in complete.'}>
    <div className="wake-rays" aria-hidden="true" />
    {reward && reward.gold > 0 && <div className="wake-coin-shower" aria-hidden="true">{coinShower.map((drop, index) => <i key={index} style={{ '--left': `${drop.left}%`, '--delay': `${drop.delay}ms`, '--duration': `${drop.duration}ms`, '--spin': drop.spin } as Vars}><Pixels art={coin} /></i>)}</div>}
    {reward ? <div className="wake-panel wake-reward-card" aria-hidden="true">
      <Pixels art={sun} className="wake-reward-sun" />
      <div className="wake-reward-lines">
        <span className="wake-reward-line wake-reward-xp"><Icon name="star" size={34} /><b>{signed(reward.xp)}</b><small>XP</small></span>
        <span className={reward.gold < 0 ? 'wake-reward-line wake-reward-gold wake-reward-loss' : 'wake-reward-line wake-reward-gold'}><Icon name="coin" size={34} /><b>{signed(reward.gold)}</b></span>
      </div>
      <Burst kind="stars" count={18} spread={150} />
    </div> : <div className="wake-reward-solo" aria-hidden="true"><Pixels art={sun} className="wake-reward-sun" /><Burst kind="stars" count={18} spread={170} /></div>}
  </div>
}

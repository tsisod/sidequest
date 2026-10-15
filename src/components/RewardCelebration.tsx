import { useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../game/GameIcon'
import { coin, star, sun } from './pixelArt'
import { Pixels } from './Pixels'
import './reward.css'

type Vars = CSSProperties & Record<`--${string}`, string | number>
export type Reward = { xp: number; gold: number }

function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }

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
  return <span className={`burst burst-${kind}`} aria-hidden="true">{particles.map((particle, index) => <i key={index} style={{ '--dx': `${particle.dx.toFixed(1)}px`, '--dy': `${particle.dy.toFixed(1)}px`, '--size': `${particle.size}px`, '--colour': particle.colour, '--delay': `${particle.delay.toFixed(0)}ms` } as Vars} />)}</span>
}

const coinShower = Array.from({ length: 26 }, (_, index) => ({ left: (index * 41 + 7) % 100, delay: (index * 83) % 900, duration: 1100 + (index * 157) % 700, spin: index % 2 ? 1 : -1 }))
const emblems = { sun, star }

/** Full-screen XP and gold celebration: rays, a bouncing emblem, the amounts and a coin shower. With no reward it shows the emblem alone. */
export function RewardCelebration({ reward, emblem, announce }: { reward: Reward | null; emblem: keyof typeof emblems; announce: string }) {
  return <div className="reward-celebration" role="status" aria-label={reward ? `${announce} ${signed(reward.xp)} XP and ${signed(reward.gold)} gold.` : announce}>
    <div className="reward-rays" aria-hidden="true" />
    {reward && reward.gold > 0 && <div className="reward-coins" aria-hidden="true">{coinShower.map((drop, index) => <i key={index} style={{ '--left': `${drop.left}%`, '--delay': `${drop.delay}ms`, '--duration': `${drop.duration}ms`, '--spin': drop.spin } as Vars}><Pixels art={coin} /></i>)}</div>}
    {reward ? <div className="reward-card" aria-hidden="true">
      <Pixels art={emblems[emblem]} className="reward-emblem" />
      <div className="reward-lines">
        <span className="reward-line reward-xp"><Icon name="star" size={34} /><b>{signed(reward.xp)}</b><small>XP</small></span>
        <span className={reward.gold < 0 ? 'reward-line reward-gold reward-loss' : 'reward-line reward-gold'}><Icon name="coin" size={34} /><b>{signed(reward.gold)}</b></span>
      </div>
      <Burst kind="stars" count={18} spread={150} />
    </div> : <div className="reward-solo" aria-hidden="true"><Pixels art={emblems[emblem]} className="reward-emblem" /><Burst kind="stars" count={18} spread={170} /></div>}
  </div>
}

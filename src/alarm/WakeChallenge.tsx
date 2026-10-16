import { useEffect, useId, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { WakeGameKind } from '../../shared/domain'
import { randomWakeGame } from '../../shared/wakeAlarm'
import { bonkedMole, burrow, mole } from '../components/pixelArt'
import { PixelRuns } from '../components/Pixels'
import { Burst } from '../components/RewardCelebration'
import { useSound } from '../sound/SoundContext'
import './alarm.css'

type Hud = (done: number, total: number) => ReactNode
export type WakeChallengeProps = { onComplete: (game: WakeGameKind) => void; disabled?: boolean; hud: Hud }
type GameProps = { onComplete: () => void; disabled: boolean; hud: Hud }
type Timers = Set<ReturnType<typeof setTimeout>>

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    const value = result[index]
    result[index] = result[other]
    result[other] = value
  }
  return result
}
function later(timers: Timers, milliseconds: number, run: () => void) {
  const timer = setTimeout(() => { timers.delete(timer); run() }, milliseconds)
  timers.add(timer)
}
function useTimers(): Timers {
  const [timers] = useState<Timers>(() => new Set())
  useEffect(() => () => { for (const timer of timers) clearTimeout(timer); timers.clear() }, [timers])
  return timers
}
function shake(element: HTMLElement | null, strength = 5) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  element.animate([{ translate: '0 0' }, { translate: `${-strength}px ${strength / 2}px` }, { translate: `${strength}px ${-strength / 2}px` }, { translate: `${-strength / 2}px 0` }, { translate: '0 0' }], { duration: 220, easing: 'ease-out' })
}

/** Mount with a new key for each wake-up test so it rolls a fresh random game. */
export default function WakeChallenge({ onComplete, disabled = false, hud }: WakeChallengeProps) {
  const [game] = useState(() => randomWakeGame())
  const Game = game === 'moles' ? Moles : Memory
  return <div className="wake-alarm-control wake-challenge-only"><Game onComplete={() => onComplete(game)} disabled={disabled} hud={hud} /></div>
}

const MOLE_HITS = 8
type Hole = { id: number; state: 'down' | 'up' | 'bonked' }
type MoleField = { holes: Hole[]; hits: number }
type MoleAction = { kind: 'pop'; id: number; roll: number } | { kind: keyof typeof moleMoves; id: number }
const moleMoves = { whack: ['up', 'bonked'], retreat: ['up', 'down'], clear: ['bonked', 'down'] } as const satisfies Record<string, readonly [Hole['state'], Hole['state']]>

function moleField(field: MoleField, action: MoleAction): MoleField {
  if (action.kind === 'pop') {
    const empty = field.holes.flatMap((hole, index) => hole.state === 'down' ? [index] : [])
    const target = empty[Math.floor(action.roll * empty.length)]
    if (target === undefined) return field
    return { ...field, holes: field.holes.map((hole, index) => index === target ? { id: action.id, state: 'up' } : hole) }
  }
  const [from, to] = moleMoves[action.kind]
  if (!field.holes.some(hole => hole.id === action.id && hole.state === from)) return field
  return { holes: field.holes.map(hole => hole.id === action.id ? { ...hole, state: to } : hole), hits: field.hits + (action.kind === 'whack' ? 1 : 0) }
}

function MoleHole({ state }: { state: Hole['state'] }) {
  const clip = useId()
  return <svg className="wake-hole-art" viewBox="0 0 22 24" shapeRendering="crispEdges" aria-hidden="true">
    <defs><clipPath id={clip}><rect x="0" y="-8" width="22" height="28" /></clipPath></defs>
    <PixelRuns art={burrow} y={16} />
    <g clipPath={`url(#${clip})`}><g className="wake-mole-body"><PixelRuns art={state === 'bonked' ? bonkedMole : mole} x={3} y={5} /></g></g>
    {state === 'bonked' && <g transform="translate(11 3)"><g>
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur=".7s" repeatCount="indefinite" />
      {[[-6, 0], [3, -3], [3, 3]].map(([x, y]) => <g key={`${x},${y}`} fill="#f8c943"><rect x={x - 1} y={y} width={3} height={1} /><rect x={x} y={y - 1} width={1} height={3} /></g>)}
    </g></g>}
  </svg>
}

function Moles({ onComplete, disabled, hud }: GameProps) {
  const [field, dispatch] = useReducer(moleField, null, () => ({ holes: Array.from({ length: 9 }, (): Hole => ({ id: 0, state: 'down' })), hits: 0 }))
  const won = field.hits >= MOLE_HITS
  const timers = useTimers()
  const nextId = useRef(0)
  const board = useRef<HTMLDivElement>(null)
  const complete = useRef(onComplete)
  const play = useSound()
  useEffect(() => { complete.current = onComplete })
  // React to hits the reducer actually counted: a tap that loses the race with a retreating mole changes nothing.
  useEffect(() => { if (field.hits > 0) shake(board.current) }, [field.hits])
  // Finishing a beat after the last hit keeps the dialog open, so that tap's click cannot fall through to the page behind it.
  useEffect(() => { if (won) later(timers, 900, () => complete.current()) }, [won, timers])
  useEffect(() => {
    if (disabled || won) return
    let running = true
    const pop = () => {
      if (!running) return
      const id = ++nextId.current
      dispatch({ kind: 'pop', id, roll: Math.random() })
      later(timers, 1000 + Math.random() * 400, () => dispatch({ kind: 'retreat', id }))
      later(timers, 700 + Math.random() * 400, pop)
    }
    later(timers, 500, pop)
    return () => { running = false }
  }, [disabled, won, timers])
  function whack(index: number) {
    const hole = field.holes[index]
    if (disabled || won || hole.state !== 'up') return
    play('hit')
    dispatch({ kind: 'whack', id: hole.id })
    later(timers, 520, () => dispatch({ kind: 'clear', id: hole.id }))
  }
  return <section className="wake-challenge" data-wake-game="moles" aria-label={`Whack-a-mole. Bonk ${MOLE_HITS} moles before they duck back down.`}>
    {hud(field.hits, MOLE_HITS)}
    <div className="wake-board wake-mole-board" ref={board}>{field.holes.map((hole, index) => <button type="button" className="wake-hole" key={index} data-mole={hole.state} disabled={disabled || won} onPointerDown={() => whack(index)} onClick={event => { if (event.detail === 0) whack(index) }} aria-label={hole.state === 'up' ? 'Mole! Bonk it.' : `Burrow ${index + 1}`}>
      <MoleHole state={hole.state} />
      {hole.state !== 'down' && <Burst key={`dust${hole.id}`} kind="dust" count={8} spread={34} />}
      {hole.state === 'bonked' && <Burst key={`bonk${hole.id}`} kind="stars" count={12} spread={80} />}
    </button>)}</div>
  </section>
}

const SACK = { x: 208, y: 192 }
const crops = [
  { name: 'carrot', x: 80, y: 16 }, { name: 'potato', x: 64, y: 48 }, { name: 'corn', x: 80, y: 80 }, { name: 'cabbage', x: 64, y: 96 },
  { name: 'pumpkin', x: 64, y: 176 }, { name: 'grapes', x: 224, y: 16 }, { name: 'strawberry', x: 224, y: 64 }, { name: 'beetroot', x: 208, y: 112 },
  { name: 'tomato', x: 224, y: 144 }, { name: 'pepper', x: 224, y: 176 }, { name: 'apple', x: 144, y: 192 }, { name: 'cherries', x: 192, y: 192 },
] as const
function CropSprite({ x, y }: { x: number; y: number }) {
  return <i className="wake-crop" style={{ '--x': x, '--y': y } as CSSProperties} />
}

function Memory({ onComplete, disabled, hud }: GameProps) {
  const [deck] = useState(() => {
    const faces = shuffled(crops).slice(0, 3)
    return shuffled([...faces, ...faces])
  })
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<number[]>([])
  const [wrong, setWrong] = useState<number[]>([])
  const turnLocked = useRef(false)
  const won = useRef(false)
  const timers = useTimers()
  const play = useSound()
  function flip(index: number) {
    if (disabled || won.current || turnLocked.current || matched.includes(index) || flipped.includes(index)) return
    play('flip')
    if (!flipped.length) { setFlipped([index]); return }
    const first = flipped[0]
    setFlipped([first, index])
    if (deck[first] === deck[index]) {
      play('match', .3)
      const next = [...matched, first, index]
      turnLocked.current = true
      later(timers, 380, () => { setMatched(next); setFlipped([]); turnLocked.current = false })
      if (next.length === 6) { won.current = true; later(timers, 900, onComplete) }
    } else {
      turnLocked.current = true
      play('mismatch', .56)
      later(timers, 560, () => setWrong([first, index]))
      later(timers, 1050, () => { setFlipped([]); setWrong([]); turnLocked.current = false })
    }
  }
  return <section className="wake-challenge" data-wake-game="memory" aria-label="Memory wake-up challenge. Find all three matching pairs.">
    {hud(matched.length / 2, 3)}
    <div className="wake-board wake-memory-board">{deck.map((face, index) => {
      const isMatched = matched.includes(index)
      const visible = flipped.includes(index) || isMatched
      return <button type="button" className="wake-card" key={index} data-face={visible ? 'up' : 'down'} data-matched={isMatched || undefined} data-wrong={wrong.includes(index) || undefined} disabled={disabled} aria-disabled={isMatched || undefined} aria-label={visible ? `${face.name} card ${index + 1}${isMatched ? ', matched' : ', revealed'}` : `Card ${index + 1}, face down`} onClick={() => flip(index)}>
        <span className="wake-card-inner">
          <span className="wake-card-face wake-card-back"><CropSprite {...SACK} /></span>
          <span className="wake-card-face wake-card-front"><CropSprite x={face.x} y={face.y} /></span>
        </span>
        {isMatched && <Burst key="match" kind="leaves" count={14} spread={90} />}
      </button>
    })}</div>
  </section>
}

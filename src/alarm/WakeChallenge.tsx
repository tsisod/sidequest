import { useEffect, useId, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { WakeGameKind } from '../../shared/domain'
import Icon from '../game/GameIcon'
import { bonkedMole, burrow, mole } from './pixelArt'
import { PixelRuns } from './Pixels'
import { Burst } from './WakeScene'
import './alarm.css'

type Hud = (done: number, total: number) => ReactNode
export type WakeChallengeProps = { game: WakeGameKind; attemptKey: string; onComplete: () => void; disabled?: boolean; hud: Hud }
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

export default function WakeChallenge({ game, attemptKey, ...props }: WakeChallengeProps) {
  const playProps = { ...props, disabled: props.disabled ?? false }
  return <div className="wake-alarm-control wake-challenge-only">
    {game === 'moles' ? <Moles key={`${game}:${attemptKey}`} {...playProps} /> : game === 'memory' ? <Memory key={`${game}:${attemptKey}`} {...playProps} /> : <Numbers key={`${game}:${attemptKey}`} {...playProps} />}
  </div>
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
    dispatch({ kind: 'whack', id: hole.id })
    shake(board.current)
    later(timers, 520, () => dispatch({ kind: 'clear', id: hole.id }))
    // Hits land on pointerdown; finishing a beat later keeps the dialog open so this tap's click cannot fall through to the page behind it.
    if (field.hits + 1 === MOLE_HITS) later(timers, 900, onComplete)
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
  function flip(index: number) {
    if (disabled || won.current || turnLocked.current || matched.includes(index) || flipped.includes(index)) return
    if (!flipped.length) { setFlipped([index]); return }
    const first = flipped[0]
    setFlipped([first, index])
    if (deck[first] === deck[index]) {
      const next = [...matched, first, index]
      turnLocked.current = true
      later(timers, 380, () => { setMatched(next); setFlipped([]); turnLocked.current = false })
      if (next.length === 6) { won.current = true; later(timers, 900, onComplete) }
    } else {
      turnLocked.current = true
      later(timers, 560, () => setWrong([first, index]))
      later(timers, 1050, () => { setFlipped([]); setWrong([]); turnLocked.current = false })
    }
  }
  return <section className="wake-challenge" data-wake-game="memory" aria-label="Memory wake-up challenge. Find all three matching pairs.">
    {hud(matched.length / 2, 3)}
    <div className="wake-board wake-memory-board">{deck.map((face, index) => {
      const isMatched = matched.includes(index)
      const visible = flipped.includes(index) || isMatched
      return <button type="button" className="wake-card" key={index} data-face={visible ? 'up' : 'down'} data-matched={isMatched || undefined} data-wrong={wrong.includes(index) || undefined} disabled={disabled || isMatched} aria-label={visible ? `${face.name} card ${index + 1}${isMatched ? ', matched' : ', revealed'}` : `Card ${index + 1}, face down`} onClick={() => flip(index)}>
        <span className="wake-card-inner">
          <span className="wake-card-face wake-card-back"><CropSprite {...SACK} /></span>
          <span className="wake-card-face wake-card-front"><CropSprite x={face.x} y={face.y} /></span>
        </span>
        {isMatched && <Burst key="match" kind="leaves" count={14} spread={90} />}
      </button>
    })}</div>
  </section>
}

function Numbers({ onComplete, disabled, hud }: GameProps) {
  const [numbers] = useState(() => shuffled(Array.from({ length: 20 }, (_, index) => index + 1)).slice(0, 6))
  const [order] = useState(() => [...numbers].sort((a, b) => a - b))
  const [found, setFound] = useState(0)
  const [wrong, setWrong] = useState<{ value: number; key: number } | null>(null)
  const foundRef = useRef(0)
  const misses = useRef(0)
  const timers = useTimers()
  function choose(value: number) {
    if (disabled || foundRef.current >= order.length) return
    if (value !== order[foundRef.current]) {
      const key = ++misses.current
      setWrong({ value, key })
      later(timers, 420, () => setWrong(current => current?.key === key ? null : current))
      return
    }
    foundRef.current++
    setFound(foundRef.current)
    if (foundRef.current === order.length) later(timers, 700, onComplete)
  }
  return <section className="wake-challenge" data-wake-game="numbers" aria-label="Number wake-up challenge. Tap the numbers from smallest to largest.">
    {hud(found, order.length)}
    <div className="wake-board wake-number-board">{numbers.map(value => {
      const done = order.indexOf(value) < found
      return <button key={value} type="button" className="wake-sign" data-found={done || undefined} data-wrong={wrong?.value === value || undefined} disabled={disabled || done} aria-label={`Number ${value}${done ? ', found' : ''}`} onClick={() => choose(value)}>
        <span className="wake-sign-board" key={wrong?.value === value ? wrong.key : 'sign'}><b>{value}</b>{done && <span className="wake-sign-check"><Icon name="check" size={22} /></span>}</span>
        {done && <Burst key="found" kind="stars" count={10} spread={70} />}
      </button>
    })}</div>
  </section>
}

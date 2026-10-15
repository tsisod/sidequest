import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Place } from '../../shared/domain'
import { cameraFor, drawFarm, loadFarmAssets, pixelScale } from './farmScene'
import type { Camera, Direction } from './farmScene'
import { isJumping, jumpHeight } from './jump'
import { dust, heroPose, liveParticles, smoke, sparkDrift, twinkle } from './effects'
import { forgeChimneyTop } from './forge'
import type { Particle } from './effects'
import { actionFor, heldDirection, keyLabel } from '../../shared/keybinds'
import type { Keybinds } from '../../shared/keybinds'
import { daylightAt, localTime, seasonFor } from './sky'
import type { Daylight, Season } from './sky'
import { villagers } from './villagers'
import { heroStart, moveHero, nearestVillager, props, talkSpots } from './world'
import type { NpcKind, Point } from './world'
import './world.css'

type PixelWorldProps = { canMove: boolean; now: number; timeZone: string; openQuests: ReadonlyMap<Place, number>; keybinds: Keybinds; onTalk: (npc: NpcKind) => void }
const forgeAt = props.find(prop => prop.kind === 'forge')
const chimney = forgeAt ? { x: forgeAt.x + forgeChimneyTop.x, y: forgeAt.y + forgeChimneyTop.y } : null
const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const previewSeason = seasons.find(season => season === preview?.get('season')) ?? null
const previewHour = preview?.has('hour') ? Number(preview.get('hour')) : null
const SPRINT = 1.8
// Shift turns number keys into symbols, so read the physical digit to keep number keybinds working while sprinting.
const pressedKey = (event: KeyboardEvent) => event.shiftKey && /^Digit\d$/.test(event.code) ? event.code.slice(5) : event.key.toLowerCase()

export default function PixelWorld({ canMove, now, timeZone, openQuests, keybinds, onTalk }: PixelWorldProps) {
  const map = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef(new Map<NpcKind, HTMLButtonElement>())
  const keys = useRef(new Set<string>())
  const sprinting = useRef(false)
  const destination = useRef<Point | null>(null)
  const jumpStartedAt = useRef<number | null>(null)
  const onTalkRef = useRef(onTalk)
  const canMoveRef = useRef(canMove)
  const keybindsRef = useRef(keybinds)
  const player = useRef<{ point: Point; direction: Direction }>({ point: heroStart, direction: 'down' })
  const spark = useRef<Point>({ x: heroStart.x + 14, y: heroStart.y - 28 })
  const effects = useRef({ dust: [] as Particle[], twinkles: [] as Particle[], smoke: [] as Particle[], lastDust: 0, lastTwinkle: 0, lastSmoke: 0, airborne: false, landedAt: -Infinity })
  const camera = useRef<Camera & { cssScale: number }>({ x: 0, y: 0, scale: 2, cssScale: 2 })
  const [error, setError] = useState('')
  const season = previewSeason ?? seasonFor(localTime(now, timeZone), timeZone)

  useEffect(() => { onTalkRef.current = onTalk }, [onTalk])
  useEffect(() => { canMoveRef.current = canMove }, [canMove])
  useEffect(() => { keybindsRef.current = keybinds }, [keybinds])

  const beginMove = useCallback((key: string) => {
    if (!canMove || document.hidden || document.querySelector('dialog[open]') || keys.current.has(key)) return
    destination.current = null
    const { dx, dy } = heldDirection(keybindsRef.current, [key])
    player.current.point = moveHero(player.current.point, dx * 3, dy * 3)
    player.current.direction = dx ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
    keys.current.add(key)
  }, [canMove])

  const beginJump = useCallback(() => {
    if (!canMove || document.hidden || document.querySelector('dialog[open]')) return
    const now = performance.now()
    if (!isJumping(jumpStartedAt.current, now)) jumpStartedAt.current = now
  }, [canMove])

  useEffect(() => {
    map.current?.focus({ preventScroll: true })
    const element = canvas.current
    const host = map.current
    const context = element?.getContext('2d')
    if (!element || !host || !context) return
    let disposed = false
    let frame = 0
    let last = 0
    let pixelRatio = 1
    let daylight: Daylight = { tint: null, glow: 0 }
    let daylightSecond = -1
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const resize = () => {
      const bounds = host.getBoundingClientRect()
      pixelRatio = window.devicePixelRatio || 1
      element.width = Math.round(bounds.width * pixelRatio)
      element.height = Math.round(bounds.height * pixelRatio)
      const scale = pixelScale(bounds.width, bounds.height, pixelRatio)
      camera.current = { ...camera.current, scale, cssScale: scale / pixelRatio }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    void loadFarmAssets(season).then(assets => {
      if (disposed) return
      const tick = (time: number) => {
        const step = Math.min((time - (last || time)) / 1000, .04) * 90
        last = time
        if (document.hidden || document.querySelector('dialog[open]')) { keys.current.clear(); destination.current = null; jumpStartedAt.current = null; sprinting.current = false }
        if (!isJumping(jumpStartedAt.current, time)) jumpStartedAt.current = null
        let { dx, dy } = heldDirection(keybindsRef.current, keys.current)
        if (dx || dy) destination.current = null
        const target = destination.current
        const previous = player.current.point
        if (target) {
          const distance = Math.hypot(target.x - previous.x, target.y - previous.y)
          if (distance < 3) destination.current = null
          else { dx = (target.x - previous.x) / distance; dy = (target.y - previous.y) / distance }
        }
        let moving = false
        const sprint = sprinting.current
        if (canMoveRef.current && (dx || dy)) {
          const magnitude = Math.hypot(dx, dy)
          const stride = step * (sprint ? SPRINT : 1)
          const next = moveHero(previous, dx / magnitude * stride, dy / magnitude * stride)
          moving = next.x !== previous.x || next.y !== previous.y
          player.current.point = next
          player.current.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
          if (!moving) destination.current = null
        }
        const instant = Date.now()
        if (Math.floor(instant / 1000) !== daylightSecond) {
          daylightSecond = Math.floor(instant / 1000)
          const clock = localTime(instant, timeZone)
          daylight = daylightAt(previewHour === null ? clock : { ...clock, hour: previewHour }, timeZone)
        }
        const hero = { x: Math.round(player.current.point.x), y: Math.round(player.current.point.y) }
        const motion = !reducedMotion.matches
        const drift = sparkDrift(time, motion && !moving)
        const perch = { x: hero.x + (player.current.direction === 'right' ? -14 : 14) + drift.x, y: hero.y - 28 + drift.y }
        const follow = motion ? Math.min(1, step * .05) : 1
        const sparkFrom = spark.current
        spark.current = { x: sparkFrom.x + (perch.x - sparkFrom.x) * follow, y: sparkFrom.y + (perch.y - sparkFrom.y) * follow }
        const fx = effects.current
        const lift = canMoveRef.current ? jumpHeight(jumpStartedAt.current, time) : 0
        if (fx.airborne && lift === 0) { fx.landedAt = time; if (motion) fx.dust.push(...dust(hero, time, 5)) }
        fx.airborne = lift > 0
        if (motion && moving && !fx.airborne && time - fx.lastDust > (sprint ? 80 : 170)) { fx.dust.push(...dust(hero, time, sprint ? 3 : 2)); fx.lastDust = time }
        if (motion && time - fx.lastTwinkle > (Math.hypot(spark.current.x - sparkFrom.x, spark.current.y - sparkFrom.y) > .4 ? 70 : 380)) { fx.twinkles.push(twinkle(spark.current, time)); fx.lastTwinkle = time }
        if (motion && chimney && time - fx.lastSmoke > 280) { fx.smoke.push(smoke(chimney, time)); fx.lastSmoke = time }
        fx.dust = liveParticles(fx.dust, time)
        fx.smoke = liveParticles(fx.smoke, time)
        fx.twinkles = liveParticles(fx.twinkles, time)
        const { scale, cssScale } = camera.current
        const viewWidth = element.width / scale
        const viewHeight = element.height / scale
        const focus = cameraFor(hero, viewWidth, viewHeight)
        camera.current = { x: focus.x, y: focus.y, scale, cssScale }
        context.setTransform(scale, 0, 0, scale, -focus.x * scale, -focus.y * scale)
        drawFarm(context, assets, { hero, spark: spark.current, direction: player.current.direction, moving, sprinting: sprint && moving, time: reducedMotion.matches && !moving ? 0 : time, jumpHeight: lift, pose: heroPose({ time, moving, airborne: fx.airborne, landedAt: fx.landedAt, motion }), dust: fx.dust, twinkles: fx.twinkles, smoke: fx.smoke, motion, camera: camera.current, viewWidth, viewHeight, daylight })
        const nearby = nearestVillager(hero)
        for (const spot of talkSpots) {
          const marker = markers.current.get(spot.npc)
          if (!marker) continue
          marker.style.transform = `translate3d(${(spot.marker.x - focus.x) * cssScale}px, ${(spot.marker.y - focus.y) * cssScale}px, 0) translate(-50%, -100%)`
          marker.classList.toggle('world-place-near', nearby === spot.npc)
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }).catch(() => { if (!disposed) setError('The village art could not load. Refresh to try again.') })
    const clear = () => { keys.current.clear(); destination.current = null; jumpStartedAt.current = null; sprinting.current = false }
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear) }
  }, [season, timeZone])

  useEffect(() => {
    if (!canMove) return
    const pressedKeys = keys.current
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (event.defaultPrevented) return
      if (document.hidden || document.querySelector('dialog[open]')) {
        keys.current.clear()
        destination.current = null
        jumpStartedAt.current = null
        sprinting.current = false
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('form, input, select, textarea, [role="textbox"], [role="slider"], [role="spinbutton"], [contenteditable]:not([contenteditable="false"])')) {
        keys.current.clear()
        destination.current = null
        return
      }
      const key = pressedKey(event)
      const action = actionFor(keybindsRef.current, key)
      // Shift may already be held when the game gets focus, so read its live state on every key press.
      if (keybindsRef.current.sprint === 'shift') sprinting.current = event.shiftKey
      if (action === 'sprint') {
        event.preventDefault()
        sprinting.current = true
      } else if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        event.preventDefault()
        map.current?.focus({ preventScroll: true })
        beginMove(key)
      } else if (action === 'jump') {
        if (key === ' ' && target?.closest('button, a[href], summary, [role="button"], [role="link"]')) return
        event.preventDefault()
        if (!event.repeat) beginJump()
      } else if (action === 'interact' && !event.repeat) {
        const npc = nearestVillager(player.current.point)
        if (npc) { event.preventDefault(); onTalkRef.current(npc) }
      }
    }
    const keyUp = (event: KeyboardEvent) => {
      if (pressedKey(event) === keybindsRef.current.sprint) sprinting.current = false
      keys.current.delete(event.key.toLowerCase())
      keys.current.delete(pressedKey(event))
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      pressedKeys.clear()
      destination.current = null
      jumpStartedAt.current = null
    }
  }, [canMove, beginMove, beginJump])

  const walkTo = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canMove || document.hidden || document.querySelector('dialog[open]')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const { x, y, cssScale } = camera.current
    destination.current = { x: (event.clientX - bounds.left) / cssScale + x, y: (event.clientY - bounds.top) / cssScale + y }
    map.current?.focus({ preventScroll: true })
  }
  return <div className="world-shell">
    <div ref={map} className="world-map" tabIndex={0} role="group" aria-label={`Willowbrook farm. Arrow keys or ${[keybinds.up, keybinds.left, keybinds.down, keybinds.right].map(keyLabel).join(' ')} to walk, hold ${keyLabel(keybinds.sprint)} to sprint, ${keyLabel(keybinds.jump)} to jump, ${keyLabel(keybinds.interact)} to talk to someone nearby, Escape for the menu.`}>
      <canvas ref={canvas} className="world-art" aria-hidden="true" onPointerDown={walkTo} />
      {error && <p className="world-error" role="alert">{error}</p>}
      {talkSpots.map(({ npc }) => {
        const villager = villagers[npc]
        const left = villager.role === 'quests' ? openQuests.get(villager.place) ?? 0 : 0
        if (villager.role !== 'quests' || !left) return null
        return <button type="button" key={npc} ref={element => { if (element) markers.current.set(npc, element); else markers.current.delete(npc) }} className="world-place" onClick={() => onTalk(npc)} aria-label={`Talk to ${villager.name}. ${left} ${left === 1 ? villager.noun : `${villager.noun}s`} left`}><span className="world-place-badge">{left}</span></button>
      })}
    </div>
    <div className="world-controls"><div className="world-dpad" aria-label="Movement controls">{[{ key: 'arrowleft', symbol: '←', label: 'Walk left' }, { key: 'arrowup', symbol: '↑', label: 'Walk up' }, { key: 'arrowdown', symbol: '↓', label: 'Walk down' }, { key: 'arrowright', symbol: '→', label: 'Walk right' }].map(control => <button type="button" key={control.key} disabled={!canMove} aria-label={control.label} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginMove(control.key) }} onPointerUp={() => keys.current.delete(control.key)} onPointerCancel={() => keys.current.delete(control.key)} onLostPointerCapture={() => keys.current.delete(control.key)} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); beginMove(control.key) } }} onKeyUp={() => keys.current.delete(control.key)}>{control.symbol}</button>)}</div><button type="button" className="world-jump" disabled={!canMove} onClick={beginJump}>Jump</button></div>
  </div>
}

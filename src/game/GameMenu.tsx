import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import Icon from './GameIcon'
import type { GameIconName } from './learnspace/GameIcon'
import type { DialogueAudio } from './dialogue/DialogueAudio'
import { defaultKeybinds, gameActions, keyLabel, rebind } from '../../shared/keybinds'
import type { GameAction, Keybinds } from '../../shared/keybinds'
import { sparkVoices } from '../../shared/spark'
import type { SparkSettings } from '../../shared/spark'
import type { Speak } from '../../shared/speech'
import SparkSettingsPane from './spark/SparkSettingsPane'
import './menu.css'

type Pane = 'alarm' | 'keybinds' | 'settings' | 'spark'
const panes: Record<Pane, { title: string; icon: GameIconName }> = {
  alarm: { title: 'Alarm clock', icon: 'sun' },
  keybinds: { title: 'Keybinds', icon: 'controls' },
  settings: { title: 'Settings', icon: 'settings' },
  spark: { title: 'AI helper', icon: 'sparkle' },
}

type GameMenuProps = {
  alarmStatus: string
  alarmHost: (element: HTMLDivElement | null) => void
  audio: DialogueAudio
  keybinds: Keybinds
  onKeybinds: (keybinds: Keybinds) => void
  spark: SparkSettings
  onSpark: (spark: SparkSettings) => void
  childName: string
  speak: Speak
  onClose: () => void
}

export default function GameMenu({ alarmStatus, alarmHost, audio, keybinds, onKeybinds, spark, onSpark, childName, speak, onClose }: GameMenuProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pane, setPane] = useState<Pane | null>(null)
  const [returnTo, setReturnTo] = useState<Pane | null>(null)

  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  useLayoutEffect(() => {
    const target = pane ? dialog.current?.querySelector<HTMLElement>('.game-menu-back') : dialog.current?.querySelector<HTMLElement>(returnTo ? `[data-pane="${returnTo}"]` : '.game-menu-item')
    target?.focus({ preventScroll: true })
  }, [pane, returnTo])

  function back() { setReturnTo(pane); setPane(null) }
  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.game-menu-item:not(:disabled)')]
    items[(items.indexOf(document.activeElement as HTMLButtonElement) + step + items.length) % items.length]?.focus()
  }

  return <dialog ref={dialog} className="game-menu" aria-labelledby="game-menu-title" onCancel={event => { if (pane) { event.preventDefault(); back() } }} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
    <div className="game-menu-top">
      {pane ? <button type="button" className="icon-button game-menu-back" onClick={back} aria-label="Back to menu"><Icon className="game-menu-back-icon" name="chevron" size={20} /></button> : null}
      <h2 id="game-menu-title">{pane ? <><Icon name={panes[pane].icon} size={22} />{panes[pane].title}</> : 'Menu'}</h2>
      <button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label="Close menu"><Icon name="close" size={20} /></button>
    </div>
    {pane === null && <nav className="game-menu-list" aria-label="Menu" onKeyDown={moveFocus}>
      {(Object.keys(panes) as Pane[]).map(key => <button type="button" key={key} className="game-menu-item" data-pane={key} onClick={() => setPane(key)}>
        <Icon className="menu-cursor" name="cursor" size={16} /><Icon name={panes[key].icon} size={22} /><span>{panes[key].title}{key === 'alarm' && <small>{alarmStatus}</small>}{key === 'spark' && <small>{spark.name} · {sparkVoices.find(option => option.voice === spark.voice)?.label} voice</small>}</span>
      </button>)}
    </nav>}
    {pane === 'alarm' && <div className="game-menu-pane" ref={alarmHost} />}
    {pane === 'keybinds' && <KeybindSettings keybinds={keybinds} onKeybinds={onKeybinds} />}
    {pane === 'settings' && <GeneralSettings audio={audio} />}
    {pane === 'spark' && <SparkSettingsPane spark={spark} childName={childName} speak={speak} onSpark={onSpark} />}
    <p className="game-menu-hint"><kbd>Esc</kbd>{pane ? 'Back' : 'Back to game'}</p>
  </dialog>
}

const actionLabel = (action: GameAction) => gameActions.find(entry => entry.action === action)?.label ?? action

function KeybindSettings({ keybinds, onKeybinds }: { keybinds: Keybinds; onKeybinds: (keybinds: Keybinds) => void }) {
  const [listening, setListening] = useState<GameAction | null>(null)
  const [notice, setNotice] = useState('')
  const pressed = useRef<string | null>(null)

  useEffect(() => {
    if (!listening) return
    const down = (event: globalThis.KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (pressed.current || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      pressed.current = event.code
      if (event.key === 'Escape') { setNotice(`${actionLabel(listening)} stays ${keyLabel(keybinds[listening])}.`); return }
      const result = rebind(keybinds, listening, event.key.toLowerCase())
      if (!result.ok) { setNotice(result.message); return }
      onKeybinds(result.keybinds)
      setNotice(`${actionLabel(listening)} is now ${keyLabel(result.keybinds[listening])}.${result.swapped ? ` ${actionLabel(result.swapped)} moved to ${keyLabel(result.keybinds[result.swapped])}.` : ''}`)
    }
    const up = (event: globalThis.KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (pressed.current === event.code) setListening(null)
    }
    const stop = () => setListening(null)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', stop)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', stop) }
  }, [listening, keybinds, onKeybinds])

  return <div className="game-menu-pane">
    <p className="game-menu-note">Choose an action, then press the key you want. Arrow keys always walk too.</p>
    <ul className="keybind-list">{gameActions.map(({ action, label }) => <li key={action} className="keybind-row">
      <span>{label}</span>
      <button type="button" className="keybind-key" aria-pressed={listening === action} aria-label={listening === action ? `Press a key for ${label}` : `${label}: ${keyLabel(keybinds[action])}. Change key`} onClick={() => { pressed.current = null; setNotice(''); setListening(current => current === action ? null : action) }}>{listening === action ? 'Press a key…' : keyLabel(keybinds[action])}</button>
    </li>)}
      <li className="keybind-row keybind-row-fixed"><span>Menu</span><kbd className="keybind-key">Esc</kbd></li>
    </ul>
    <p className="game-menu-status" role="status">{notice}</p>
    <button type="button" className="game-menu-button" disabled={gameActions.every(({ action }) => keybinds[action] === defaultKeybinds[action])} onClick={() => { setListening(null); onKeybinds(defaultKeybinds); setNotice('Keys are back to W A S D, Space, E and Q.') }}><Icon name="restore" size={16} />Reset to default keys</button>
  </div>
}

const getVoiceDefault = () => true

function GeneralSettings({ audio }: { audio: DialogueAudio }) {
  const voiceEnabled = useSyncExternalStore(audio.subscribe, audio.getVoiceEnabled, getVoiceDefault)
  return <div className="game-menu-pane">
    <label className="game-menu-toggle"><span><strong>Villager voices</strong><small>Read dialogue aloud when you talk to someone.</small></span><input type="checkbox" checked={voiceEnabled} onChange={event => audio.setVoiceEnabled(event.target.checked)} /></label>
  </div>
}

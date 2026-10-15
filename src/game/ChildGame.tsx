import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionResult, Family, FamilyCommand, Place, Quest } from '../../shared/domain'
import { earnedGold, earnedXp, projectDay, remainingMs, screenUnlocked } from '../../shared/sidequest'
import Icon from './GameIcon'
import PixelWorld from './PixelWorld'
import WakeAlarmPanel from '../alarm/WakeAlarmPanel'
import type { Speak } from '../../shared/speech'
import { parseSparkSettings } from '../../shared/spark'
import type { AskSpark, SparkTurn } from '../../shared/spark'
import SparkDialogue from './spark/SparkDialogue'
import { DialogueAudio } from './dialogue/DialogueAudio'
import ChatDialogue from './ChatDialogue'
import GameMenu from './GameMenu'
import { defaultKeybinds, parseKeybinds } from '../../shared/keybinds'
import { useStoredPreference } from './preferences'
import QuestGiverDialogue from './QuestGiverDialogue'
import { villagers } from './villagers'
import type { NpcKind } from './world'
import './child.css'

const places = {
  library: { title: 'Study with the librarian', icon: 'book', color: 'blue' },
  cottage: { title: 'Chores with the housekeeper', icon: 'house', color: 'peach' },
  chores: { title: 'Exercise with the blacksmith', icon: 'jump', color: 'green' },
} satisfies Record<Place, { title: string; icon: 'book' | 'house' | 'jump'; color: string }>

function timeString(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

type ChildGameProps = {
  family: Family
  now: number
  onCommand: (command: FamilyCommand) => Promise<ActionResult>
  onSpeak: Speak
  onAsk: AskSpark
}

export default function ChildGame({ family, now, onCommand, onSpeak, onAsk }: ChildGameProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const journalDialog = useRef<HTMLDialogElement>(null)
  const [audio] = useState(() => new DialogueAudio())
  const [talking, setTalking] = useState<NpcKind | null>(null)
  const [chatTurns, setChatTurns] = useState<Partial<Record<NpcKind, number>>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [alarmHost, setAlarmHost] = useState<HTMLDivElement | null>(null)
  const [keybinds, setKeybinds] = useStoredPreference('sidequest-keybinds-v1', saved => saved ? parseKeybinds(JSON.parse(saved)) : defaultKeybinds, JSON.stringify)
  const [spark, setSpark] = useStoredPreference('sidequest-spark-v1', saved => parseSparkSettings(saved ? JSON.parse(saved) : null), JSON.stringify)
  const [sparkOpen, setSparkOpen] = useState(false)
  const [sparkTurns, setSparkTurns] = useState<SparkTurn[]>([])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const clearForAlarm = useCallback(() => { setMenuOpen(false); setSparkOpen(false) }, [])
  useEffect(() => audio.attach(), [audio])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(true) }
      else if (event.key.toLowerCase() === keybinds.helper && !(event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])'))) { event.preventDefault(); setSparkOpen(true) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [keybinds.helper])
  const remaining = remainingMs(family.clock, now)
  const unlocked = screenUnlocked(family)
  const clockRunning = unlocked && family.clock.kind === 'running' && remaining > 0
  const blocked = family.clock.kind === 'blocked'
  const todaysQuests = projectDay(family, family.sessionDay).quests
  const xp = earnedXp(family)
  const gold = earnedGold(family)
  const level = 1 + Math.floor(xp / 100)
  const currentXp = xp % 100

  async function command(action: FamilyCommand, key: string): Promise<boolean> {
    if (busy) return false
    setBusy(key)
    setMessage('')
    try {
      const result = await onCommand(action)
      if (!result.ok) setMessage(result.message)
      return result.ok
    } catch {
      setMessage('That change could not be saved. Please try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const journal = <QuestJournal quests={todaysQuests} busy={busy} onSubmit={questId => void command({ kind: 'submit', questId }, questId)} />
  const finished = todaysQuests.filter(quest => quest.status === 'approved').length
  const villager = talking ? villagers[talking] : null
  const openQuests = new Map<Place, number>()
  for (const quest of todaysQuests) if (quest.status === 'todo') openQuests.set(quest.place, (openQuests.get(quest.place) ?? 0) + 1)

  return <main className="child-app" aria-label="Willowbrook game">
    <div className="child-world"><PixelWorld canMove={!blocked} now={now} timeZone={family.timeZone} openQuests={openQuests} keybinds={keybinds} onTalk={setTalking} /></div>

    <header className="game-hud">
      <div className="game-player game-panel"><img src="/assets/farm/farmer-idle-down.png" alt="" /><div className="game-player-info"><strong><span className="game-player-name">{family.childName}</span><span className="game-player-level">Lv {level}</span></strong><progress value={currentXp} max={100} aria-label={`Level progress, ${currentXp} of 100 XP`} /><span className="game-player-xp">{currentXp} / 100 XP</span></div><div className="game-wallet" aria-label={`${gold} gold`}><Icon name="coin" size={18} /><span>{gold}</span></div></div>
      <div className="game-hud-right">
        <button type="button" className="game-spark game-panel" onClick={() => setSparkOpen(true)} aria-label={`Talk to ${spark.name}, your AI helper`} aria-haspopup="dialog"><span className="game-spark-avatar" aria-hidden="true"><img src="/assets/learnspace-ui/spark-preview.png" alt="" width={48} height={48} /></span><span>Ask<strong>{spark.name}</strong></span></button>
        <button type="button" className="game-journal game-panel" onClick={() => journalDialog.current?.showModal()} aria-label={`Quest journal, ${finished} of ${todaysQuests.length} done`}><Icon name="book" size={20} /><span>Journal<strong>{finished}/{todaysQuests.length}</strong></span></button>
        {(blocked || unlocked) && <div className="game-time game-panel"><Icon name={blocked ? 'pause' : 'clock'} size={20} /><div><span>Screen time</span><strong role={clockRunning ? 'timer' : undefined} aria-label={blocked ? 'Paused by your parent' : `${Math.ceil(remaining / 1000)} seconds of screen time`}>{blocked ? 'Paused' : timeString(remaining)}</strong></div>{!blocked && remaining > 0 && <button type="button" className="game-icon" disabled={busy !== null} onClick={() => void command({ kind: clockRunning ? 'pause-play' : 'start-play' }, 'clock')} aria-label={clockRunning ? 'Pause screen time' : 'Start screen time'}><Icon name={clockRunning ? 'pause' : 'play'} size={18} /></button>}</div>}
        <button type="button" className="game-menu-open game-panel" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="settings" size={22} /></button>
      </div>
    </header>
    <WakeAlarmPanel family={family} now={now} onCommand={onCommand} settingsHost={alarmHost} onChallenge={clearForAlarm} />

    {villager?.role === 'quests' && <QuestGiverDialogue giver={villager} audio={audio} childName={family.childName} quests={todaysQuests.filter(quest => quest.place === villager.place)} busy={busy !== null} speak={onSpeak} onSubmit={questId => command({ kind: 'submit', questId }, questId)} onClose={() => setTalking(null)} />}
    {talking && villager?.role === 'chat' && <ChatDialogue chatter={villager} audio={audio} childName={family.childName} start={chatTurns[talking] ?? 0} speak={onSpeak} onClose={next => { setChatTurns(turns => ({ ...turns, [talking]: next })); setTalking(null) }} />}

    {message && <div className="child-message" role="alert">{message}<button type="button" className="icon-button" onClick={() => setMessage('')} aria-label="Dismiss message"><Icon name="close" size={17} /></button></div>}

    {sparkOpen && <SparkDialogue spark={spark} childName={family.childName} keybinds={keybinds} turns={sparkTurns} audio={audio} speak={onSpeak} ask={onAsk} onTurns={setSparkTurns} onClose={() => setSparkOpen(false)} />}
    {menuOpen && <GameMenu alarmStatus={family.wakeAlarm.enabled ? `${family.wakeAlarm.time} every day` : 'Off'} alarmHost={setAlarmHost} audio={audio} keybinds={keybinds} onKeybinds={setKeybinds} spark={spark} onSpark={setSpark} childName={family.childName} speak={onSpeak} onClose={closeMenu} />}

    <dialog className="child-journal-dialog" ref={journalDialog} aria-label="Quest journal" onClick={event => { if (event.target === event.currentTarget) journalDialog.current?.close() }}><div className="child-journal-dialog-top"><span><Icon name="book" size={19} />Quest journal</span><button type="button" className="icon-button" onClick={() => journalDialog.current?.close()} aria-label="Close quest journal"><Icon name="close" size={20} /></button></div>{journal}<div className="child-journal-total"><span><Icon name="star" size={16} />{xp} XP earned</span><span><Icon name="coin" size={16} />{gold} gold</span></div></dialog>
  </main>

}

function QuestJournal({ quests, busy, onSubmit }: { quests: readonly Quest[]; busy: string | null; onSubmit: (id: string) => void }) {
  const done = quests.filter(quest => quest.status === 'approved').length
  return <section className="child-journal">{quests.length > 0 && <div className="child-journal-heading"><span>{done === quests.length ? 'All quests complete!' : `${done} of ${quests.length} complete`}</span><progress value={done} max={quests.length} aria-label={`${done} of ${quests.length} quests complete`} /></div>}
    <div className="child-quest-list">{quests.length === 0 ? <div className="child-empty"><Icon name="flag" size={28} /><p>No quests here yet.</p><span>Check back with your parent.</span></div> : quests.map(quest => <article key={quest.id} className={`child-quest child-quest-${quest.status}`}><div className="child-quest-top"><span className={`child-quest-icon child-quest-icon-${places[quest.place].color}`}><Icon name={places[quest.place].icon} size={22} /></span><span className="child-quest-copy"><h3>{quest.title}</h3><span className="child-quest-location">{places[quest.place].title}</span></span><span className="child-quest-reward"><span>+{quest.xp} XP</span><span>+{quest.gold} gold</span></span></div>{quest.status === 'todo' ? <button type="button" className="child-quest-submit" disabled={busy !== null} onClick={() => onSubmit(quest.id)}>{busy === quest.id ? 'Sending…' : 'I did it'}<Icon name="check" size={16} /></button> : <div className={`child-quest-status child-quest-status-${quest.status}`}><Icon name={quest.status === 'approved' ? 'check' : 'clock'} size={16} />{quest.status === 'approved' ? 'Quest complete' : 'Waiting for approval'}</div>}</article>)}</div>
  </section>
}

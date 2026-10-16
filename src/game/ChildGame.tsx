import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import type { ActionResult, Family, FamilyCommand, Place, Quest } from '../../shared/domain'
import { earnedGold, earnedXp, eventReminders, levelProgress, projectDay, questEarnings } from '../../shared/sidequest'
import { RewardCelebration } from '../components/RewardCelebration'
import { coin } from '../components/pixelArt'
import { Pixels } from '../components/Pixels'
import { useQuestRewards } from './useQuestRewards'
import Icon from './GameIcon'
import PixelWorld from './PixelWorld'
import WakeAlarmPanel from '../alarm/WakeAlarmPanel'
import type { Speak } from '../../shared/speech'
import { parseSparkSettings, sparkReminder } from '../../shared/spark'
import type { AskSpark, HearSpark, SparkTurn } from '../../shared/spark'
import SparkDialogue from './spark/SparkDialogue'
import { DialogueAudio } from './dialogue/DialogueAudio'
import { GameSounds } from '../sound/GameSounds'
import { SoundContext } from '../sound/SoundContext'
import ChatDialogue from './ChatDialogue'
import GameMenu from './GameMenu'
import ChildCalendar from './ChildCalendar'
import KeyHints from './KeyHints'
import { nextEventLabel } from '../calendar/format'
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

function parseSeenReminders(saved: string | null): string[] {
  const value: unknown = saved ? JSON.parse(saved) : []
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []
}

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}
const pageVisible = () => !document.hidden

type ChildGameProps = {
  family: Family
  now: number
  onCommand: (command: FamilyCommand) => Promise<ActionResult>
  onSpeak: Speak
  onAsk: AskSpark
  onHear: HearSpark
}

export default function ChildGame({ family, now, onCommand, onSpeak, onAsk, onHear }: ChildGameProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const journalDialog = useRef<HTMLDialogElement>(null)
  const [audio] = useState(() => new DialogueAudio())
  const [sounds] = useState(() => new GameSounds())
  const [talking, setTalking] = useState<NpcKind | null>(null)
  const [chatTurns, setChatTurns] = useState<Partial<Record<NpcKind, number>>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [alarmHost, setAlarmHost] = useState<HTMLDivElement | null>(null)
  const [keybinds, setKeybinds] = useStoredPreference('sidequest-keybinds-v1', saved => saved ? parseKeybinds(JSON.parse(saved)) : defaultKeybinds, JSON.stringify)
  const [spark, setSpark] = useStoredPreference('sidequest-spark-v1', saved => parseSparkSettings(saved ? JSON.parse(saved) : null), JSON.stringify)
  const [sparkOpen, setSparkOpen] = useState(false)
  const [sparkTurns, setSparkTurns] = useState<SparkTurn[]>([])
  const [seenReminders, setSeenReminders] = useStoredPreference('sidequest-seen-reminders-v1', parseSeenReminders, JSON.stringify)
  const reminders = eventReminders(family)
  const unseenReminders = reminders.filter(reminder => !seenReminders.includes(reminder.key))
  const unseenKey = unseenReminders.map(reminder => reminder.key).join()
  function openSpark() {
    sounds.play('spark')
    if (unseenReminders.length) {
      setSparkTurns(turns => [...turns, { role: 'spark', text: sparkReminder(family.childName, unseenReminders) }])
      setSeenReminders(reminders.map(reminder => reminder.key))
    }
    setSparkOpen(true)
  }
  const openSparkFromKey = useEffectEvent(openSpark)
  const [hintsShown, setHintsShown] = useStoredPreference('sidequest-key-hints-v1', saved => saved !== 'hidden', shown => shown ? 'shown' : 'hidden')
  function toggleHints() { sounds.play('tap'); setHintsShown(!hintsShown) }
  const toggleHintsFromKey = useEffectEvent(toggleHints)
  const closeMenu = useCallback(() => { sounds.play('close'); setMenuOpen(false) }, [sounds])
  const talkTo = useCallback((npc: NpcKind) => { sounds.play('talk'); setTalking(npc) }, [sounds])
  // Back to the plain village view: used when the alarm takes over and when a reward celebration plays.
  const clearToGame = useCallback(() => { setMenuOpen(false); setSparkOpen(false); setTalking(null); journalDialog.current?.close() }, [])
  useEffect(() => audio.attach(), [audio])
  useEffect(() => sounds.attach(), [sounds])
  useEffect(() => { if (unseenKey) return sounds.play('reminder') }, [unseenKey, sounds])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') { event.preventDefault(); sounds.play('open'); setMenuOpen(true) }
      else if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return
      else if (event.key.toLowerCase() === keybinds.helper) { event.preventDefault(); openSparkFromKey() }
      else if (event.key.toLowerCase() === keybinds.hints) { event.preventDefault(); toggleHintsFromKey() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [keybinds.helper, keybinds.hints, sounds])
  const blocked = family.clock.kind === 'blocked'
  const todaysQuests = projectDay(family, family.sessionDay).quests
  const xp = earnedXp(family)
  const gold = earnedGold(family)
  const { level, into: currentXp, needed: levelXp } = levelProgress(xp)
  const questTotals = questEarnings(family)
  const soundStatus = useSyncExternalStore(sounds.subscribe, sounds.getStatus)
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible)
  const questRewards = useQuestRewards(family.id, questTotals.xp, questTotals.gold, visible && soundStatus !== 'locked', clearToGame)

  async function command(action: FamilyCommand, key: string): Promise<boolean> {
    if (busy) return false
    setBusy(key)
    setMessage('')
    try {
      const result = await onCommand(action)
      if (!result.ok) { setMessage(result.message); sounds.play('error') }
      else if (action.kind === 'submit') sounds.play('confirm')
      return result.ok
    } catch {
      setMessage('That change could not be saved. Please try again.')
      sounds.play('error')
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

  return <SoundContext value={sounds.play}><main className="child-app" aria-label="Willowbrook game">
    <div className="child-world"><PixelWorld canMove={!blocked} now={now} timeZone={family.timeZone} openQuests={openQuests} keybinds={keybinds} onTalk={talkTo} /></div>

    <header className="game-hud">
      <div className="game-player game-panel"><img src="/assets/farm/farmer-idle-down.png" alt="" /><div className="game-player-info"><strong><span className="game-player-name">{family.childName}</span><span className="game-player-level">Lv {level}</span></strong><progress value={currentXp} max={levelXp} aria-label={`Level progress, ${currentXp} of ${levelXp} XP`} /><span className="game-player-xp">{currentXp} / {levelXp} XP</span></div><div className="game-wallet" aria-label={`${gold} gold`}><Icon name="coin" size={18} /><span>{gold}</span></div></div>
      <div className="game-hud-right">
        <button type="button" className="game-spark game-panel" onClick={openSpark} aria-label={`Talk to ${spark.name}, your AI helper${unseenReminders.length ? ', new reminder' : ''}`} aria-haspopup="dialog"><span className="game-spark-avatar" aria-hidden="true"><img src="/assets/learnspace-ui/spark-preview.png" alt="" width={48} height={48} /></span><span>Ask<strong>{spark.name}</strong></span>{unseenReminders.length > 0 && <span className="game-spark-alert" aria-hidden="true">!</span>}</button>
        <button type="button" className="game-journal game-panel" onClick={() => { sounds.play('open'); journalDialog.current?.showModal() }} aria-label={`Quest journal, ${finished} of ${todaysQuests.length} done`}><Icon name="book" size={20} /><span>Journal<strong>{finished}/{todaysQuests.length}</strong></span></button>
        {blocked && <div className="game-paused game-panel" role="status"><Icon name="pause" size={20} /><span>Paused by your parent</span></div>}
        <button type="button" className="game-menu-open game-panel" onClick={() => { sounds.play('open'); setMenuOpen(true) }} aria-label="Open menu"><Icon name="settings" size={22} /></button>
      </div>
    </header>
    <KeyHints keybinds={keybinds} helperName={spark.name} shown={hintsShown} onToggle={toggleHints} />
    <WakeAlarmPanel family={family} now={now} onCommand={onCommand} settingsHost={alarmHost} onChallenge={clearToGame} />
    {questRewards.shown && <RewardCelebration key={questRewards.shown.id} reward={questRewards.shown.reward} emblem="star" announce="Quest reward!" />}
    {questRewards.waiting && !questRewards.shown && <button type="button" className="game-reward-waiting game-panel" onClick={sounds.unlock}><Pixels art={coin} className="game-reward-coin" /><span>Rewards waiting!<strong>Tap to collect</strong></span></button>}

    {villager?.role === 'quests' && <QuestGiverDialogue giver={villager} audio={audio} childName={family.childName} quests={todaysQuests.filter(quest => quest.place === villager.place)} busy={busy !== null} speak={onSpeak} onSubmit={questId => command({ kind: 'submit', questId }, questId)} onClose={() => { sounds.play('close'); setTalking(null) }} />}
    {talking && villager?.role === 'chat' && <ChatDialogue chatter={villager} audio={audio} childName={family.childName} start={chatTurns[talking] ?? 0} speak={onSpeak} onClose={next => { sounds.play('close'); setChatTurns(turns => ({ ...turns, [talking]: next })); setTalking(null) }} />}

    {message && <div className="child-message" role="alert">{message}<button type="button" className="icon-button" onClick={() => setMessage('')} aria-label="Dismiss message"><Icon name="close" size={17} /></button></div>}

    {sparkOpen && <SparkDialogue spark={spark} childName={family.childName} keybinds={keybinds} turns={sparkTurns} audio={audio} speak={onSpeak} ask={onAsk} hear={onHear} onTurns={setSparkTurns} onClose={() => { sounds.play('close'); setSparkOpen(false) }} />}
    {menuOpen && <GameMenu sounds={sounds} alarmStatus={family.wakeAlarm.enabled ? `${family.wakeAlarm.time} every day` : 'Off'} alarmHost={setAlarmHost} calendar={<ChildCalendar family={family} helperName={spark.name} onCommand={onCommand} />} calendarStatus={nextEventLabel(family)} audio={audio} keybinds={keybinds} onKeybinds={setKeybinds} spark={spark} onSpark={setSpark} childName={family.childName} speak={onSpeak} onClose={closeMenu} />}

    <dialog className="child-journal-dialog" ref={journalDialog} aria-label="Quest journal" onClose={() => sounds.play('close')} onClick={event => { if (event.target === event.currentTarget) journalDialog.current?.close() }}><div className="child-journal-dialog-top"><span><Icon name="book" size={19} />Quest journal</span><button type="button" className="icon-button" onClick={() => journalDialog.current?.close()} aria-label="Close quest journal"><Icon name="close" size={20} /></button></div>{journal}<div className="child-journal-total"><span><Icon name="star" size={16} />{xp} XP earned</span><span><Icon name="coin" size={16} />{gold} gold</span></div></dialog>
  </main></SoundContext>

}

function QuestJournal({ quests, busy, onSubmit }: { quests: readonly Quest[]; busy: string | null; onSubmit: (id: string) => void }) {
  const done = quests.filter(quest => quest.status === 'approved').length
  return <section className="child-journal">{quests.length > 0 && <div className="child-journal-heading"><span>{done === quests.length ? 'All quests complete!' : `${done} of ${quests.length} complete`}</span><progress value={done} max={quests.length} aria-label={`${done} of ${quests.length} quests complete`} /></div>}
    <div className="child-quest-list">{quests.length === 0 ? <div className="child-empty"><Icon name="flag" size={28} /><p>No quests here yet.</p><span>Check back with your parent.</span></div> : quests.map(quest => <article key={quest.id} className={`child-quest child-quest-${quest.status}`}><div className="child-quest-top"><span className={`child-quest-icon child-quest-icon-${places[quest.place].color}`}><Icon name={places[quest.place].icon} size={22} /></span><span className="child-quest-copy"><h3>{quest.title}</h3><span className="child-quest-location">{places[quest.place].title}</span></span><span className="child-quest-reward"><span>+{quest.xp} XP</span><span>+{quest.gold} gold</span></span></div>{quest.status === 'todo' ? <button type="button" className="child-quest-submit" disabled={busy !== null} onClick={() => onSubmit(quest.id)}>{busy === quest.id ? 'Sending…' : 'I did it'}<Icon name="check" size={16} /></button> : <div className={`child-quest-status child-quest-status-${quest.status}`}><Icon name={quest.status === 'approved' ? 'check' : 'clock'} size={16} />{quest.status === 'approved' ? 'Quest complete' : 'Waiting for approval'}</div>}</article>)}</div>
  </section>
}

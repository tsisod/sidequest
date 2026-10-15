import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import type { ActionResult, DateKey, Family, FamilyCommand, Place, ProjectDay, Quest, Schedule, TaskTemplate, Weekday } from '../../shared/domain'
import { addDays, parseDateKey, startOfWeek, weekdayOf } from '../../shared/calendar'
import { projectDay, remainingMs, screenUnlocked } from '../../shared/sidequest'
import { routes } from '../routes'
import type { ParentView } from '../routes'
import type { SparkAlert, SparkInboxChange } from '../../shared/spark'
import type { VoiceApi } from '../../shared/parentVoice'
import VoiceAssistant from './VoiceAssistant'
import ParentInbox from './ParentInbox'
import Icon from '../components/Icon'
import ParentWakeAlarm from './ParentWakeAlarm'
import type { IconName } from '../components/Icon'
import { parentThemes, parseParentTheme, readParentTheme, saveParentTheme, themeStorageKey } from './themes'
import type { ParentTheme } from './themes'
import './theme.css'
import './parent.css'

type ParentDashboardProps = {
  family: Family
  now: number
  mode: 'local' | 'hosted'
  onCommand: (command: FamilyCommand) => Promise<ActionResult>
  onOpenGame: () => void
  view: ParentView
  inbox: SparkAlert[] | null
  onEditInbox: (change: SparkInboxChange) => Promise<ActionResult>
  onVoice: VoiceApi
}
type DialogKind = 'add' | 'screen-time' | 'pair' | 'rename' | 'retire' | null
type Filter = 'day' | 'pending' | 'approved'
type Repeat = Schedule['kind']

const places: { value: Place; label: string; icon: IconName }[] = [
  { value: 'library', label: 'Study · Librarian', icon: 'book' },
  { value: 'cottage', label: 'Chores · Housekeeper', icon: 'house' },
  { value: 'chores', label: 'Exercise · Blacksmith', icon: 'spark' },
]
const weekdays: { value: Weekday; short: string; label: string }[] = [
  { value: 1, short: 'M', label: 'Monday' }, { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' }, { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' }, { value: 6, short: 'S', label: 'Saturday' },
  { value: 7, short: 'S', label: 'Sunday' },
]
function isPlace(value: string): value is Place { return places.some(item => item.value === value) }
function isRepeat(value: string): value is Repeat { return value === 'once' || value === 'daily' || value === 'weekly' }
function formatDate(date: DateKey, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
function scheduleLabel(template: TaskTemplate | undefined): string {
  if (!template || template.schedule.kind === 'once') return 'Once'
  if (template.schedule.kind === 'daily') return 'Daily'
  return `Weekly · ${template.schedule.weekdays.map(day => weekdays.find(item => item.value === day)?.label.slice(0, 3)).join(', ')}`
}
function firstDate(schedule: Schedule): DateKey {
  if (schedule.kind === 'once') return schedule.date
  if (schedule.kind === 'daily') return schedule.from
  let date = schedule.from
  for (let offset = 0; offset < 7; offset++) {
    if (schedule.weekdays.includes(weekdayOf(date))) return date
    date = addDays(date, 1)
  }
  return schedule.from
}
function questStatus(quest: Quest, today: DateKey): string {
  if (quest.status === 'approved') return 'Completed'
  if (quest.status === 'pending') return 'To review'
  return quest.date > today ? 'Scheduled' : quest.date < today ? 'Missed' : 'To do'
}

export default function ParentDashboard({ family, now, mode, onCommand, onOpenGame, view, inbox, onEditInbox, onVoice }: ParentDashboardProps) {
  const [voiceOpen, setVoiceOpen] = useState(false)
  const today = family.sessionDay
  const [theme, setTheme] = useState<ParentTheme>(readParentTheme)
  const [selectedDay, setSelectedDay] = useState<DateKey>(today)
  const [filter, setFilter] = useState<Filter>('day')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [title, setTitle] = useState('')
  const [xpReward, setXpReward] = useState('50')
  const [goldReward, setGoldReward] = useState('10')
  const [place, setPlace] = useState<Place>('library')
  const [repeat, setRepeat] = useState<Repeat>('once')
  const [dateInput, setDateInput] = useState<string>(today)
  const [chosenDays, setChosenDays] = useState<Weekday[]>([weekdayOf(today)])
  const [allowance, setAllowance] = useState(String(family.screenMinutes))
  const [childName, setChildName] = useState(family.childName)
  const [retireTarget, setRetireTarget] = useState<TaskTemplate | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const profileRef = useRef<HTMLDetailsElement>(null)
  const previousToday = useRef(today)
  const commandLock = useRef(false)
  const draftId = useRef<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = pending !== null
  const todayQuests = projectDay(family, today).quests
  const todayApproved = todayQuests.filter(quest => quest.status === 'approved').length
  const todayPending = todayQuests.filter(quest => quest.status === 'pending').length
  const allPending = family.quests.filter(quest => quest.status === 'pending').sort((left, right) => left.date.localeCompare(right.date))
  const selectedQuests = projectDay(family, selectedDay).quests
  const visibleQuests = filter === 'pending' ? allPending : selectedQuests.filter(quest => filter !== 'approved' || quest.status === 'approved')
  const weekStart = startOfWeek(selectedDay)
  const week: ProjectDay[] = Array.from({ length: 7 }, (_, index) => projectDay(family, addDays(weekStart, index)))
  const weekQuests = week.flatMap(day => day.quests)
  const weekApproved = weekQuests.filter(quest => quest.status === 'approved')
  const weekPending = weekQuests.filter(quest => quest.status === 'pending').length
  const weekXp = weekApproved.reduce((sum, quest) => sum + quest.xp, 0)
  const weekGold = weekApproved.reduce((sum, quest) => sum + quest.gold, 0)
  const available = remainingMs(family.clock, now)
  const unlocked = screenUnlocked(family)
  const blocked = family.clock.kind === 'blocked'
  const running = unlocked && family.clock.kind === 'running' && available > 0
  const minutes = unlocked ? Math.ceil(available / 60_000) : family.screenMinutes
  const clockStatus = blocked ? 'Blocked' : !unlocked ? 'Locked' : running ? 'Playing' : available <= 0 ? 'Used up' : available < family.screenMinutes * 60_000 ? 'Paused' : 'Unlocked'
  const progress = todayQuests.length ? todayApproved / todayQuests.length : 0
  const joinUrl = new URL(routes.game, window.location.origin)
  joinUrl.hash = new URLSearchParams({ join: family.code }).toString()
  const selectedDate = parseDateKey(dateInput)
  const previewDate = selectedDate ? formatDate(selectedDate, { month: 'long', day: 'numeric' }) : null
  const schedulePreview = previewDate ? repeat === 'once' ? `On ${previewDate}` : repeat === 'daily' ? `Every day from ${previewDate}` : chosenDays.length ? `Every ${weekdays.filter(day => chosenDays.includes(day.value)).map(day => day.label).join(', ')} from ${previewDate}` : 'Choose at least one weekday.' : 'Choose a date.'

  useEffect(() => {
    const before = previousToday.current
    if (before !== today) {
      setSelectedDay(current => current === before ? today : current)
      previousToday.current = today
    }
  }, [today])
  useEffect(() => {
    const element = dialogRef.current
    if (dialog && element && !element.open) {
      element.showModal()
      if (dialog === 'add' || dialog === 'rename' || dialog === 'screen-time') element.querySelector('input')?.focus({ preventScroll: true })
    }
    if (!dialog && element?.open) element.close()
  }, [dialog])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (profileRef.current && !profileRef.current.contains(event.target)) profileRef.current.open = false
    }
    const storage = (event: StorageEvent) => {
      if (event.key === themeStorageKey) setTheme(parseParentTheme(event.newValue) ?? 'sage')
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('storage', storage)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('storage', storage) }
  }, [])
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  function openDialog(kind: Exclude<DialogKind, null>) {
    setError(null)
    setCopied(false)
    if (profileRef.current) profileRef.current.open = false
    if (kind === 'add') {
      draftId.current = crypto.randomUUID()
      const initialDate = selectedDay < today ? today : selectedDay
      setRepeat('once')
      setDateInput(initialDate)
      setChosenDays([weekdayOf(initialDate)])
    }
    if (kind === 'rename') setChildName(family.childName)
    if (kind === 'screen-time') setAllowance(String(family.screenMinutes))
    setDialog(kind)
  }
  function chooseDay(date: DateKey) { setSelectedDay(date); setFilter('day') }
  function chooseTheme(value: ParentTheme) {
    setTheme(value)
    if (!saveParentTheme(value)) setNotice('Theme changed for this visit. Browser storage is unavailable.')
  }
  function openGame(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onOpenGame()
  }
  async function execute(command: FamilyCommand, message: string): Promise<boolean> {
    if (commandLock.current) return false
    commandLock.current = true
    setPending('questId' in command ? `${command.kind}:${command.questId}` : command.kind)
    setError(null)
    setNotice(null)
    try {
      const result = await onCommand(command)
      if (!result.ok) { setError(result.message); return false }
      setNotice(message)
      return true
    } catch {
      setError('That change could not be saved. Please try again.')
      return false
    } finally { commandLock.current = false; setPending(null) }
  }
  async function submitQuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const date = parseDateKey(dateInput)
    const xp = Number(xpReward)
    const gold = Number(goldReward)
    if (!date || date < today) { setError('Choose today or a future date.'); return }
    if (!title.trim() || !Number.isInteger(xp) || xp < 1 || xp > 500 || !Number.isInteger(gold) || gold < 1 || gold > 100) { setError('Use a title, 1 to 500 XP, and 1 to 100 gold.'); return }
    if (repeat === 'weekly' && !chosenDays.length) { setError('Choose at least one weekday.'); return }
    const schedule: Schedule = repeat === 'once' ? { kind: 'once', date } : repeat === 'daily' ? { kind: 'daily', from: date } : { kind: 'weekly', from: date, weekdays: [...chosenDays].sort((left, right) => left - right) }
    const id = draftId.current ?? crypto.randomUUID()
    draftId.current = id
    if (await execute({ kind: 'add-template', id, title: title.trim(), xp, gold, place, schedule }, repeat === 'once' ? 'Quest added.' : 'Repeating quest added.')) {
      setDialog(null)
      setTitle('')
      chooseDay(firstDate(schedule))
    }
  }
  async function submitAllowance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(allowance)
    if (!Number.isInteger(value) || value < 1 || value > 120) { setError('Choose 1 to 120 whole minutes.'); return }
    if (await execute({ kind: 'set-screen-time', minutes: value }, `Screen time set to ${value} minutes.`)) setDialog(null)
  }
  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await execute({ kind: 'rename-child', name: childName.trim() }, 'Child profile updated.')) setDialog(null)
  }
  async function retireTemplate() {
    if (!retireTarget) return
    if (await execute({ kind: 'remove-template', templateId: retireTarget.id }, retireTarget.schedule.kind === 'once' ? 'Quest removed.' : 'Repeating quest stopped.')) setDialog(null)
  }
  async function copyLink() {
    setError(null)
    try {
      await navigator.clipboard.writeText(joinUrl.toString())
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    } catch { setError('Copy is unavailable. Select and copy the game link below.') }
  }

  const unreadAlerts = inbox?.filter(alert => alert.readAt === null).length ?? 0
  const dialogTitle = dialog === 'add' ? 'Add a quest' : dialog === 'screen-time' ? 'Set screen time' : dialog === 'rename' ? 'Child profile' : dialog === 'retire' ? retireTarget?.schedule.kind === 'once' ? 'Remove this quest?' : 'Stop this repeating quest?' : `Link ${family.childName}'s game`
  const emptyTitle = filter === 'pending' ? 'All caught up' : filter === 'approved' ? 'No completed quests for this day' : 'No quests scheduled'
  const boardTitle = filter === 'pending' ? 'All quests to review' : selectedDay === today ? "Today's quests" : formatDate(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' })

  return <div className="p-app" data-theme={theme}>
    <a className="p-skip" href="#parent-main">Skip to dashboard</a>
    <header className="p-topbar"><div className="p-topbar-inner">
        <a className="p-brand" href={routes.parents} aria-label="Sidequest parent dashboard"><span className="p-brand-mark" aria-hidden="true">✦</span><span className="pixel-font">sidequest</span></a>
        <nav className="p-route-nav" aria-label="Views"><a href={joinUrl.toString()} onClick={openGame}><Icon name="play" size={14} />Game</a><a href={routes.parents} aria-current={view === 'dashboard' ? 'page' : undefined}><Icon name="home" size={16} />Parents</a></nav>
        <div className="p-header-actions">
          <a className="p-inbox-button" href={routes.inbox} aria-current={view === 'inbox' ? 'page' : undefined} aria-label={unreadAlerts ? `Inbox, ${unreadAlerts} new` : 'Inbox'} title="Inbox"><Icon name="inbox" size={20} />{unreadAlerts > 0 && <span className="p-nav-count" aria-hidden="true">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>}</a>
          <details className="p-menu p-profile-menu" ref={profileRef} onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.open = false }}>
            <summary aria-label={`Account menu for ${family.childName}`}><Icon name="menu" size={16} /><span className="p-avatar" aria-hidden="true">{family.childName.slice(0, 1).toUpperCase()}</span></summary>
            <div className="p-menu-panel">
              <div className="p-menu-profile"><span className="p-avatar" aria-hidden="true">{family.childName.slice(0, 1).toUpperCase()}</span><span><strong>{family.childName}</strong><small><span className="p-mode-dot" />{mode === 'local' ? 'On this browser' : 'Connected across devices'}</small></span></div>
              <button type="button" onClick={() => openDialog('rename')}><Icon name="user" size={17} />Rename child</button>
              <button type="button" onClick={() => openDialog('pair')}><Icon name="link" size={17} />Link a device</button>
              <fieldset className="p-theme-options"><legend>Theme</legend>{parentThemes.map(item => <label className="p-theme-option" key={item.value}><span className={`p-theme-swatch p-swatch-${item.value}`} aria-hidden="true" /><span>{item.label}</span><input type="radio" name="parent-theme" value={item.value} checked={theme === item.value} onChange={() => chooseTheme(item.value)} /></label>)}</fieldset>
            </div>
          </details>
        </div>
    </div></header>
    <div className="p-shell">
      <main id="parent-main">{view === 'inbox' ? <ParentInbox family={family} now={now} mode={mode} inbox={inbox} onEdit={onEditInbox} /> : <>
        <div className="p-page-heading"><div><h1>{family.childName}'s day</h1><p>{formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div><div className="p-heading-actions"><button className="button button-secondary p-voice-button" type="button" onClick={() => setVoiceOpen(true)} aria-label="Talk to Sidequest" title="Talk to Sidequest"><Icon name="mic" size={20} /></button><button className="button button-primary" type="button" disabled={busy} onClick={() => openDialog('add')}><Icon name="plus" size={18} />Add quest</button></div></div>
        <div className="p-feedback" aria-live="polite" aria-atomic="true">
          {notice && <div className="p-notice"><Icon name="check" size={18} /><span>{notice}</span><button className="icon-button" type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><Icon name="close" size={16} /></button></div>}
          {error && !dialog && <div className="p-error" role="alert"><span>{error}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
        </div>
        <div className="p-summary-grid">
          <section className="p-card p-today-card" aria-labelledby="today-heading"><div className="p-card-title"><h2 id="today-heading">Today</h2><span className="p-today-date">{formatDate(today, { month: 'short', day: 'numeric' })}</span></div>
            <div className="p-today-progress"><div className="p-ring" role="progressbar" aria-label="Today's quest completion" aria-valuemin={0} aria-valuemax={todayQuests.length || 1} aria-valuenow={todayApproved} aria-valuetext={`${todayApproved} of ${todayQuests.length} quests completed`}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="p-ring-track" cx="60" cy="60" r="50" /><circle className="p-ring-fill" cx="60" cy="60" r="50" strokeDasharray={`${progress * 314.159} 314.159`} visibility={todayApproved === 0 ? 'hidden' : undefined} /></svg><span><strong>{todayApproved}<small>/{todayQuests.length}</small></strong><span>completed</span></span></div><div className="p-today-copy"><strong>{todayQuests.length === 0 ? 'A clear day' : todayApproved === todayQuests.length ? 'All done for today' : `${todayQuests.length - todayApproved} ${todayQuests.length - todayApproved === 1 ? 'quest' : 'quests'} to go`}</strong>{todayPending > 0 ? <button className="p-text-button" type="button" onClick={() => { setFilter('pending'); document.getElementById('quest-board')?.scrollIntoView({ block: 'start' }) }}>{todayPending} to review<Icon name="arrow" size={15} /></button> : <p>{todayQuests.length === 0 ? 'Add a quest when you are ready.' : todayApproved === todayQuests.length ? 'Every quest approved.' : 'Due today.'}</p>}</div></div>
            <div className="p-screen-summary"><div><span>Screen time</span><span className={`p-clock-status ${blocked ? 'p-status-blocked' : unlocked ? 'p-status-approved' : ''}`}>{clockStatus}</span></div><strong>{minutes}<span> min</span></strong></div><p className="p-clock-help">{blocked ? 'Movement is blocked. The journal stays open.' : !unlocked ? "Complete today's quests to unlock." : available <= 0 ? "Today's screen time is used up." : running ? 'The countdown is running.' : 'Ready to start from the game.'}</p>
            <div className="p-time-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => openDialog('screen-time')}><Icon name="clock" size={16} />Set screen time</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => { void execute({ kind: 'set-blocked', blocked: !blocked }, blocked ? 'Game unblocked.' : 'Game blocked. Remaining time is saved.') }}><Icon name={blocked ? 'play' : 'pause'} size={15} />{pending === 'set-blocked' ? 'Saving…' : blocked ? 'Unblock game' : 'Block game'}</button></div>
          </section>
          <section className="p-card p-week-card" aria-labelledby="week-heading"><div className="p-card-title p-week-heading"><div><h2 id="week-heading">{weekStart === startOfWeek(today) ? 'This week' : 'Week overview'}</h2><p>{formatDate(weekStart, { month: 'long', day: 'numeric' })} – {formatDate(addDays(weekStart, 6), { month: 'short', day: 'numeric' })}</p></div><div className="p-week-navigation"><button className="icon-button" type="button" aria-label="Previous week" onClick={() => chooseDay(addDays(selectedDay, -7))}><Icon name="chevron" className="p-chevron-left" size={17} /></button><button className="p-today-button" type="button" onClick={() => chooseDay(today)}>Today</button><button className="icon-button" type="button" aria-label="Next week" onClick={() => chooseDay(addDays(selectedDay, 7))}><Icon name="chevron" size={17} /></button></div></div>
            <dl className="p-week-stats"><div><dt>Completed</dt><dd>{weekApproved.length}<small>/{weekQuests.length}</small></dd></div><div><dt>To review</dt><dd>{weekPending}</dd></div><div><dt>XP earned</dt><dd>{weekXp}<Icon name="star" size={14} /></dd></div><div><dt>Gold earned</dt><dd>{weekGold}<Icon name="coin" size={14} /></dd></div></dl>
            <div className="p-week-calendar" aria-label="Select a day">{week.map(day => {
              const approved = day.quests.filter(quest => quest.status === 'approved').length
              const ratio = day.quests.length ? approved / day.quests.length : 0
              return <button className={`p-day ${day.date === selectedDay ? 'p-day-selected' : ''} ${day.date === today ? 'p-day-today' : ''}`} key={day.date} type="button" aria-pressed={day.date === selectedDay} aria-current={day.date === today ? 'date' : undefined} aria-label={`${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}. ${approved} of ${day.quests.length} quests completed.`} onClick={() => chooseDay(day.date)}><span className="p-day-count">{approved}<span>/{day.quests.length}</span></span><span className="p-day-bar" aria-hidden="true"><span style={{ height: `${ratio * 100}%` }} /></span><span className="p-day-name">{formatDate(day.date, { weekday: 'short' })}</span><span className="p-day-date">{formatDate(day.date, { day: 'numeric' })}</span></button>
            })}</div>
          </section>
        </div>
        <ParentWakeAlarm family={family} now={now} disabled={busy} onCommand={onCommand} />
        <section className="p-card p-quest-board" id="quest-board" aria-labelledby="quest-heading"><div className="p-board-heading"><div><h2 id="quest-heading">{boardTitle}</h2><span>{visibleQuests.length} {visibleQuests.length === 1 ? 'quest' : 'quests'}{filter === 'pending' ? ' · all dates' : selectedDay > today ? ' · preview' : ''}</span></div><button className="icon-button" type="button" aria-label="Add a quest" disabled={busy} onClick={() => openDialog('add')}><Icon name="plus" size={21} /></button></div>
          <div className="p-filters" aria-label="Quest filters"><button type="button" className={filter === 'day' ? 'p-filter p-filter-active' : 'p-filter'} aria-pressed={filter === 'day'} onClick={() => setFilter('day')}>All for this day</button><button type="button" className={filter === 'pending' ? 'p-filter p-filter-active' : 'p-filter'} aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>To review{allPending.length > 0 && <span>{allPending.length}</span>}</button><button type="button" className={filter === 'approved' ? 'p-filter p-filter-active' : 'p-filter'} aria-pressed={filter === 'approved'} onClick={() => setFilter('approved')}>Completed</button></div>
          <div className="p-quest-list">{visibleQuests.length === 0 ? <div className="p-empty"><Icon name={filter === 'pending' ? 'check' : 'flag'} size={28} /><h3>{emptyTitle}</h3><p>{filter === 'pending' ? 'New submissions will appear here.' : filter === 'approved' ? 'Approved quests will appear here.' : formatDate(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' })}</p>{filter === 'day' && <button className="p-text-button" type="button" disabled={busy} onClick={() => openDialog('add')}><Icon name="plus" size={17} />Add a quest</button>}</div> : visibleQuests.map(quest => {
            const location = places.find(item => item.value === quest.place)
            const template = family.templates.find(item => item.id === quest.templateId)
            const status = questStatus(quest, today)
            const canReview = quest.status === 'pending' && quest.date <= today
            const canRetire = quest.date >= today && template && template.endsBefore === null && (quest.status !== 'approved' || template.schedule.kind !== 'once')
            return <article className={`p-quest p-quest-${quest.status}`} key={quest.id}><span className="p-place-icon"><Icon name={location?.icon ?? 'flag'} size={21} /></span><div className="p-quest-content"><div className="p-quest-title"><h3>{quest.title}</h3><div className="p-rewards"><span className="p-xp">+{quest.xp} XP</span><span className="p-gold">+{quest.gold} gold</span></div></div><div className="p-quest-meta"><span>{location?.label}</span><span>{scheduleLabel(template)}</span>{filter === 'pending' && <span>{formatDate(quest.date, { month: 'short', day: 'numeric' })}</span>}<span className={`p-quest-status p-status-${status === 'To review' ? 'pending' : status === 'Completed' ? 'approved' : 'neutral'}`}>{quest.status === 'approved' && <Icon name="check" size={13} />}{status}</span></div>{canReview && <div className="p-review-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => { void execute({ kind: 'approve', questId: quest.id }, `Quest approved. ${quest.xp} XP and ${quest.gold} gold earned.`) }}><Icon name="check" size={16} />{pending === `approve:${quest.id}` ? 'Approving…' : 'Approve'}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => { void execute({ kind: 'return', questId: quest.id }, 'Submission returned.') }}>{pending === `return:${quest.id}` ? 'Returning…' : 'Send back'}</button></div>}</div>{canRetire && <button className="icon-button p-retire-button" type="button" disabled={busy} aria-label={`${template.schedule.kind === 'once' ? 'Remove' : 'Stop repeating'} ${quest.title}`} title={template.schedule.kind === 'once' ? 'Remove quest' : 'Stop repeating'} onClick={() => { setRetireTarget(template); openDialog('retire') }}><Icon name="trash" size={17} /></button>}</article>
          })}</div>
        </section>
      </>}</main>
    </div>
    {voiceOpen && <VoiceAssistant childName={family.childName} voice={onVoice} onClose={() => setVoiceOpen(false)} />}
    <dialog className="dialog-shell p-dialog" ref={dialogRef} aria-labelledby="parent-dialog-title" onClose={() => setDialog(null)} onCancel={event => { if (busy) event.preventDefault(); else setDialog(null) }} onClick={event => { if (event.target === event.currentTarget && !busy) setDialog(null) }}>
      <div className="p-dialog-heading"><button className="icon-button" type="button" aria-label="Close dialog" disabled={busy} onClick={() => setDialog(null)}><Icon name="close" size={18} /></button><h2 id="parent-dialog-title">{dialogTitle}</h2></div>
      {dialog === 'add' && <form onSubmit={event => { void submitQuest(event) }}><label className="p-field">Quest title<input autoFocus required maxLength={80} placeholder="Read for 20 minutes" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label><div className="p-form-row"><label className="p-field">Repeat<select value={repeat} onChange={event => { if (isRepeat(event.target.value)) setRepeat(event.target.value) }} disabled={busy}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label className="p-field">{repeat === 'once' ? 'Due on' : 'Starts on'}<input type="date" required min={today} value={dateInput} onChange={event => setDateInput(event.target.value)} disabled={busy} /></label></div>{repeat === 'weekly' && <fieldset className="p-weekday-field"><legend>Repeat on</legend><div>{weekdays.map(day => <button key={day.value} type="button" aria-label={day.label} aria-pressed={chosenDays.includes(day.value)} className={chosenDays.includes(day.value) ? 'p-weekday p-weekday-selected' : 'p-weekday'} disabled={busy} onClick={() => setChosenDays(current => current.includes(day.value) ? current.filter(value => value !== day.value) : [...current, day.value])}>{day.short}</button>)}</div></fieldset>}<p className="p-schedule-preview">{schedulePreview}</p><div className="p-form-row"><label className="p-field">XP reward<input required type="number" min={1} max={500} step={1} value={xpReward} onChange={event => setXpReward(event.target.value)} disabled={busy} /></label><label className="p-field">Gold reward<input required type="number" min={1} max={100} step={1} value={goldReward} onChange={event => setGoldReward(event.target.value)} disabled={busy} /></label></div><label className="p-field">Place<select value={place} onChange={event => { if (isPlace(event.target.value)) setPlace(event.target.value) }} disabled={busy}>{places.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="p-date-zone">Dates use {family.timeZone}.</p>{error && <p className="p-dialog-error" role="alert">{error}</p>}<div className="p-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Adding…' : repeat === 'once' ? 'Add quest' : 'Add repeating quest'}<Icon name="plus" size={17} /></button></div></form>}
      {dialog === 'screen-time' && <form onSubmit={event => { void submitAllowance(event) }}><p className="p-dialog-description">The daily allowance unlocks after every required quest is approved.</p><label className="p-field">Minutes per day<input autoFocus required type="number" min={1} max={120} step={1} value={allowance} onChange={event => setAllowance(event.target.value)} disabled={busy} /></label><div className="p-minute-options">{[15, 20, 30, 60].map(value => <button key={value} type="button" aria-pressed={allowance === String(value)} className={allowance === String(value) ? 'p-minute-option p-minute-selected' : 'p-minute-option'} disabled={busy} onClick={() => setAllowance(String(value))}>{value} min</button>)}</div>{error && <p className="p-dialog-error" role="alert">{error}</p>}<div className="p-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save screen time'}</button></div></form>}
      {dialog === 'rename' && <form onSubmit={event => { void submitName(event) }}><label className="p-field">Child's name<input autoFocus required maxLength={24} value={childName} onChange={event => setChildName(event.target.value)} disabled={busy} /></label>{error && <p className="p-dialog-error" role="alert">{error}</p>}<div className="p-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save name'}</button></div></form>}
      {dialog === 'pair' && <><p className="p-dialog-description">{mode === 'local' ? 'Use another tab on this browser. A hosted connection is needed for a separate device.' : "Open this invitation link on your child's device to connect it to this family."}</p><div className="p-pair-code"><span>Pairing code</span><strong className="pixel-font">{family.code}</strong></div><label className="p-field">Game link<input readOnly value={joinUrl.toString()} onFocus={event => event.target.select()} /></label>{error && <p className="p-dialog-error" role="alert">{error}</p>}<div className="p-dialog-actions"><a className="button button-secondary" href={joinUrl.toString()} onClick={openGame}>Open game<Icon name="external" size={17} /></a><button className="button button-primary" type="button" onClick={() => { void copyLink() }}><Icon name={copied ? 'check' : 'copy'} size={17} />{copied ? 'Copied' : 'Copy link'}</button></div></>}
      {dialog === 'retire' && retireTarget && <><p className="p-dialog-description">{retireTarget.schedule.kind === 'once' ? `Remove "${retireTarget.title}" from ${formatDate(retireTarget.schedule.date, { month: 'long', day: 'numeric' })}?` : `"${retireTarget.title}" will stop repeating. Future occurrences and today's unfinished quest will be removed. Approved history and older submissions stay saved.`}</p>{error && <p className="p-dialog-error" role="alert">{error}</p>}<div className="p-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Keep quest</button><button className="button p-button-danger" type="button" disabled={busy} onClick={() => { void retireTemplate() }}>{busy ? 'Saving…' : retireTarget.schedule.kind === 'once' ? 'Remove quest' : 'Stop repeating'}</button></div></>}
    </dialog>
  </div>
}

import { lazy, Suspense, useEffect, useState } from 'react'
import type { FamilyConnection, Role } from '../shared/domain'
import { reconcileFamily } from '../shared/sidequest'
import { useSidequest } from './state/useSidequest'
import Icon, { PixelStar } from './components/Icon'
import ParentDashboard from './parent/ParentDashboard'
import ChildGame from './game/ChildGame'
import { parentViewForPathname, roleForPathname, routes } from './routes'

function useClockNow(offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset)
    const interval = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick) }
  }, [offset])
  return now
}

const AlarmLab = import.meta.env.DEV ? lazy(() => import('./alarm/AlarmLab')) : null

export default function App() {
  return AlarmLab && window.location.pathname === '/alarm-lab'
    ? <Suspense fallback={<p>Opening alarm lab…</p>}><AlarmLab /></Suspense>
    : <ConnectedApp />
}

function ConnectedApp() {
  const role = roleForPathname(window.location.pathname)
  const connection = useSidequest(role)
  const now = useClockNow(connection.state.kind === 'ready' ? connection.state.serverOffsetMs : 0)

  useEffect(() => {
    document.title = role === 'child' ? 'Willowbrook · Sidequest' : parentViewForPathname(window.location.pathname) === 'inbox' ? 'Inbox · Sidequest' : 'Parent dashboard · Sidequest'
  }, [role])

  if (connection.state.kind !== 'ready') return <ConnectionGate connection={connection} role={role} />
  const family = reconcileFamily(connection.state.family, now)
  return role === 'parent'
    ? <ParentDashboard family={family} now={now} mode={connection.mode} onCommand={connection.execute} onOpenGame={() => window.location.assign(`${routes.game}#join=${encodeURIComponent(family.code)}`)} view={parentViewForPathname(window.location.pathname)} inbox={connection.inbox} onEditInbox={connection.editInbox} />
    : <ChildGame family={family} now={now} onCommand={connection.execute} onSpeak={connection.speak} onAsk={connection.ask} />
}

function ConnectionGate({ connection, role }: { connection: FamilyConnection; role: Role }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (connection.state.kind === 'loading') return <main className="connection-screen"><div className="connection-mark"><PixelStar size={40} /></div><h1>Opening Sidequest…</h1></main>

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const result = role === 'child' ? await connection.join(code.trim().toUpperCase()) : await connection.create()
      if (!result.ok) setError(result.message)
    } catch {
      setError('Could not connect. Please try again.')
    } finally { setBusy(false) }
  }

  const separateFamily = role === 'parent' && connection.state.kind === 'unpaired'
  return <main className="connection-screen"><div className="connection-card">
    <a className="connection-brand" href={role === 'child' ? routes.game : routes.parents}><PixelStar size={28} />sidequest</a>
    <h1>{role === 'child' ? 'Join your family' : separateFamily ? 'This is a child device' : 'Open your parent dashboard'}</h1>
    <p>{role === 'child' ? 'Open your parent’s invitation link or enter their family code.' : separateFamily ? 'Your family’s parent dashboard is on the browser that created it. You can also create a separate family here.' : 'Reconnect to your saved family board.'}</p>
    <form onSubmit={event => { event.preventDefault(); void connect() }}>
      {role === 'child' && <><label htmlFor="family-code">Family code</label><input id="family-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" maxLength={24} placeholder="Enter your code" required /></>}
      {(error || connection.state.kind === 'error') && <p className="connection-error" role="alert">{error || (connection.state.kind === 'error' ? connection.state.message : '')}</p>}
      <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Connecting…' : role === 'child' ? 'Join the game' : separateFamily ? 'Create a separate family' : 'Reconnect'}<Icon name="arrow" size={18} /></button>
    </form>
    {role === 'parent' && <a className="connection-parent" href={routes.game}>Back to game<Icon name="external" size={15} /></a>}
  </div></main>
}

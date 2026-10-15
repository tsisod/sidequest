import { useEffect, useState } from 'react'
import type { ActionResult, Family } from '../../shared/domain'
import type { SparkAlert, SparkAlertKind, SparkInboxChange } from '../../shared/spark'
import Icon from '../components/Icon'
import type { IconName } from '../components/Icon'
import './parentInbox.css'

type ParentInboxProps = { family: Family; now: number; mode: 'local' | 'hosted'; inbox: SparkAlert[] | null; onEdit: (change: SparkInboxChange) => Promise<ActionResult> }

const kinds: Record<SparkAlertKind, { label: string; icon: IconName; note: (child: string) => string }> = {
  support: { label: 'May need your help', icon: 'shield', note: child => `Spark thinks ${child} may be upset or unsafe and told them to talk to a trusted adult right away. Consider checking in calmly and listening first. If you are worried about their safety, contact your local child protection service, or emergency services if they are in danger.` },
  blocked: { label: 'Inappropriate request', icon: 'flag', note: child => `${child} asked Spark for something that is not suitable for children. Spark declined and suggested something else.` },
  reply: { label: 'Spark answer held back', icon: 'close', note: child => `Spark's safety check stopped one of its own answers, so ${child} never saw it.` },
}

export default function ParentInbox({ family, now, mode, inbox, onEdit }: ParentInboxProps) {
  const [openedAt] = useState(now)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unread = inbox?.filter(alert => alert.readAt === null).map(alert => alert.id).join(',') ?? ''
  const when = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: family.timeZone })

  useEffect(() => {
    if (unread) void onEdit({ kind: 'read' })
  }, [unread, onEdit])

  async function remove(id: string) {
    setRemoving(id)
    setError(null)
    const result = await onEdit({ kind: 'remove', id })
    if (!result.ok) setError(result.message)
    setRemoving(null)
  }

  return <section className="p-inbox" aria-labelledby="inbox-heading">
    <div className="p-page-heading"><div><h1 id="inbox-heading">Inbox</h1><p>Messages that Spark's safety checks flagged in {family.childName}'s chats.</p></div></div>
    {error && <div className="p-error" role="alert"><span>{error}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    {mode === 'local' || inbox === null
      ? <div className="p-card p-empty"><Icon name="inbox" size={28} /><h3>{mode === 'local' ? 'The inbox needs a hosted connection' : 'Opening the inbox…'}</h3>{mode === 'local' && <p>Spark and its safety alerts work when the family is connected across devices.</p>}</div>
      : inbox.length === 0
        ? <div className="p-card p-empty"><Icon name="check" size={28} /><h3>Nothing flagged</h3><p>If Spark spots something worrying or inappropriate, it will appear here.</p></div>
        : <div className="p-alert-list">{inbox.map(alert => {
          const kind = kinds[alert.kind]
          const isNew = alert.readAt === null || alert.readAt >= openedAt - 5_000
          return <article key={alert.id} className={`p-card p-alert p-alert-${alert.kind}${isNew ? ' p-alert-new' : ''}`} aria-label={`${kind.label}${isNew ? ', new' : ''}`}>
            <div className="p-alert-top">
              <span className="p-alert-badge"><Icon name={kind.icon} size={15} />{kind.label}</span>
              {isNew && <span className="p-alert-fresh">New</span>}
              <time dateTime={new Date(alert.createdAt).toISOString()}>{when.format(alert.createdAt)}</time>
              <button className="icon-button" type="button" aria-label="Remove this message" disabled={removing !== null} onClick={() => { void remove(alert.id) }}><Icon name="trash" size={17} /></button>
            </div>
            <blockquote className="p-alert-message"><span>{family.childName} wrote</span>{alert.message}</blockquote>
            {alert.reply && <details className="p-alert-answer"><summary>Show Spark's blocked answer</summary><p>{alert.reply}</p></details>}
            <p className="p-alert-note">{kind.note(family.childName)}</p>
          </article>
        })}</div>}
  </section>
}

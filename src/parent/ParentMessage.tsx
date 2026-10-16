import Icon from '../components/Icon'
import { useAutoDismiss } from './useAutoDismiss'

type ParentMessageProps = { kind: 'notice' | 'error'; message: string; onDismiss: () => void }

export default function ParentMessage({ kind, message, onDismiss }: ParentMessageProps) {
  useAutoDismiss(message, onDismiss)
  return kind === 'notice'
    ? <div className="p-notice p-message" key={message}><Icon name="check" size={18} /><span>{message}</span><button className="icon-button" type="button" aria-label="Dismiss message" onClick={onDismiss}><Icon name="close" size={16} /></button></div>
    : <div className="p-error p-message" key={message} role="alert"><span>{message}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={onDismiss}><Icon name="close" size={16} /></button></div>
}

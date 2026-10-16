import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Icon, { PixelStar } from './Icon'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() { return { crashed: true } }

  componentDidCatch(error: unknown, info: ErrorInfo) { console.error('Sidequest stopped unexpectedly', error, info.componentStack) }

  render() {
    if (!this.state.crashed) return this.props.children
    return <main className="connection-screen" role="alert"><div className="connection-card">
      <span className="connection-mark"><PixelStar size={28} /></span>
      <h1>Something went wrong</h1>
      <p>Sidequest stopped unexpectedly. Quests, rewards and settings are saved, so reloading picks up where you left off.</p>
      <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Reload<Icon name="arrow" size={18} /></button>
    </div></main>
  }
}

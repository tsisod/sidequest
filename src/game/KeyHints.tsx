import type { GameAction, Keybinds } from '../../shared/keybinds'
import { keyLabel } from '../../shared/keybinds'
import './keyHints.css'

type KeyHintsProps = { keybinds: Keybinds; helperName: string; shown: boolean; onToggle: () => void }

export default function KeyHints({ keybinds, helperName, shown, onToggle }: KeyHintsProps) {
  const key = (action: GameAction) => <kbd>{keyLabel(keybinds[action])}</kbd>
  if (!shown) return null
  return <section className="key-hints game-panel" aria-label="Key hints">
    <div className="key-hints-walk">
      <div className="key-hints-pad" aria-hidden="true"><span />{key('up')}<span />{key('left')}{key('down')}{key('right')}</div>
      <span>Walk</span>
    </div>
    <ul>
      <li>{key('sprint')}<span>Sprint</span></li>
      <li>{key('jump')}<span>Jump</span></li>
      <li>{key('interact')}<span>Talk</span></li>
      <li>{key('helper')}<span>Ask {helperName}</span></li>
      <li><kbd>Esc</kbd><span>Menu</span></li>
    </ul>
    <button type="button" className="key-hints-hide" onClick={onToggle} aria-label={`Hide key hints (${keyLabel(keybinds.hints)})`}>{key('hints')}<span>Hide</span></button>
  </section>
}

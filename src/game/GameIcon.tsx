import type { IconName } from '../components/Icon'
import { GameIcon as LearnspaceIcon } from './learnspace/GameIcon'
import type { GameIconName } from './learnspace/GameIcon'
import './game-ui.css'

const aliases = {
  home: 'account', clock: 'computer', check: 'check', plus: 'extras', arrow: 'chevron',
  'arrow-left': 'back', close: 'close', book: 'quest', leaf: 'leaf', house: 'account',
  star: 'skills', coin: 'wallet', link: 'interact', copy: 'save', external: 'exit',
  trash: 'trash', settings: 'settings', chevron: 'chevron', shield: 'heart', flag: 'quest',
  spark: 'sparkle', user: 'account', volume: 'sound-on', moon: 'moon', help: 'controls', inbox: 'quest', menu: 'menu',
} satisfies Record<Exclude<IconName, 'play' | 'pause'>, GameIconName>

function isAlias(name: IconName | GameIconName): name is keyof typeof aliases { return Object.hasOwn(aliases, name) }

export default function GameIcon({ name, size = 20, className = '' }: { name: IconName | GameIconName; size?: number; className?: string }) {
  if (name === 'play' || name === 'pause') return <span className={`game-ui-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true"><img src={`/assets/learnspace-ui/${name}.png`} alt="" draggable={false} /></span>
  const original = isAlias(name) ? aliases[name] : name
  return <span className={`game-ui-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true"><LearnspaceIcon name={original} /></span>
}

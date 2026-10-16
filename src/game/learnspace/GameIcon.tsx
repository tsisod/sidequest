export type GameIconName =
  | 'account'
  | 'back'
  | 'backpack'
  | 'bow'
  | 'calendar'
  | 'check'
  | 'close'
  | 'chevron'
  | 'computer'
  | 'controls'
  | 'cursor'
  | 'crouch'
  | 'exit'
  | 'extras'
  | 'face'
  | 'fullscreen'
  | 'hair'
  | 'heart'
  | 'interact'
  | 'jump'
  | 'menu'
  | 'mic'
  | 'moon'
  | 'outfit'
  | 'primary'
  | 'quest'
  | 'rotate'
  | 'rename'
  | 'trash'
  | 'restore'
  | 'save'
  | 'leaf'
  | 'skills'
  | 'settings'
  | 'sound-on'
  | 'sound-off'
  | 'sparkle'
  | 'sun'
  | 'wardrobe'
  | 'wallet'
  | 'leaderboard'

const ICON_PATHS: Record<GameIconName, string> = {
  account: 'M5 1h6v6H5zM4 9h8v2h2v4H2v-4h2z',
  leaderboard: 'M6 1h4v13H6zM1 6h4v8H1zm10 3h4v5h-4z',
  back: 'M4 7h3V4h2v3h5v3H9v3H7v-3H4z',
  backpack: 'M5 1h6v3h2v2h1v8H2V6h1V4h2zm2 2v1h2V3zM4 6v2h8V6zm1 4v2h6v-2z',
  bow: 'M2 2h2v2h1v2h1v4H5v2H4v2H2v-2h1v-2h1V6H3V4H2zm4 5h8v2H6zm5-3h2v2h1v2h-2V6h-1z',
  calendar: 'M4 1h2v2h4V1h2v2h3v12H1V3h3zM3 7v6h10V7zm1 2h2v2H4zm3 0h2v2H7zm3 0h2v2h-2z',
  mic: 'M7 1h2v1h1v7h-1v1H7V9H6V2h1zM3 6h2v3H3zm8 0h2v3h-2zM4 9h2v2H4zm6 0h2v2h-2zm-4 1h4v2H6zm1 2h2v2H7zm-2 2h6v1H5z',
  check: 'M2 8h3v3h2v2h2v-2h2V9h2V6h2V3h-3v3h-2v2H8v2H7V8H5V6H2z',
  close: 'M3 2h2v2h2v2h2V4h2V2h2v3h-2v2H9v2h2v2h2v3h-2v-2H9v-2H7v2H5v2H3v-3h2V9h2V7H5V5H3z',
  chevron: 'M5 2h3v2h2v2h2v4h-2v2H8v2H5v-3h2V9h2V7H7V5H5z',
  computer: 'M1 2h14v9H9v2h3v2H4v-2h3v-2H1zm2 2v5h10V4z',
  controls: 'M3 4h10v2h2v6h-3v-2H9v2H7v-2H4v2H1V6h2zm2 2v2H3v2h2V8h2V6zm6 0v2H9v2h2V8h2V6z',
  cursor: 'M3 2h3v2h3v2h3v4H9v2H6v2H3z',
  crouch: 'M5 2h4v4H5zm-2 5h7v2h3v3H9v2H3v-2h4v-2H3z',
  exit: 'M2 2h7v2H4v8h5v2H2zm7 4h3V4l4 4-4 4v-2H8V6z',
  extras: 'M7 1h2v4h4v2h3v2h-3v2H9v4H7v-4H3V9H0V7h3V5h4zM1 1h3v3H1zm11 11h3v3h-3z',
  face: 'M4 1h8v2h2v10h-2v2H4v-2H2V3h2zm1 5h2v2H5zm4 0h2v2H9zm-2 5h2v1H7z',
  fullscreen: 'M2 2h5v2H4v3H2zm7 0h5v5h-2V4H9zM2 9h2v3h3v2H2zm10 0h2v5H9v-2h3z',
  hair: 'M3 3h2V1h7v2h2v8h-2V7h-2V5H6v2H4v4H2V5h1z',
  heart: 'M2 3h4v2h4V3h4v2h2v5h-2v2h-2v2h-2v2H6v-2H4v-2H2v-2H0V5h2z',
  interact: 'M2 2h12v9H8l-3 3v-3H2zm3 3v2h2V5zm4 0v2h2V5z',
  jump: 'M7 1h2v2h2v2h2v2h-3v7H6V7H3V5h2V3h2z',
  menu: 'M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z',
  moon: 'M7 1h5v2H8v2H6v6h2v2h5v-2h2v3h-3v2H6v-2H3v-3H1V6h2V3h4z',
  outfit: 'M5 1h6l1 3 3 2-2 4-2-1v6H5V9l-2 1-2-4 3-2z',
  primary: 'M7 1h2v3h3v2h3v4h-3v2H9v3H7v-3H4v-2H1V6h3V4h3z',
  quest: 'M3 1h10v14l-5-2-5 2zm3 3h4v2H6zm0 4h4v2H6z',
  rename: 'M10 1h3v1h1v3h-1v1h-3V5H9V2h1zM8 4h1v2h2v1L5 13H1v-4zm-5 6v1h1l5-5H8z',
  trash: 'M5 1h6v2h3v2H2V3h3zm-2 5h10v8H3zm2 1v5h2V7zm4 0v5h2V7z',
  restore: 'M5 1h2v6H1V5h4zm4 0h2v4h4v2H9zM1 9h6v6H5v-4H1zm8 0h6v2h-4v4H9z',
  rotate: 'M5 1h6v2h2v2h-2V3H5v2H3v6h2v2h6v-2h2v2h-2v2H5v-2H3v-2H1V5h2V3h2zM9 5h6v2h-2v2h-2V7H9z',
  save: 'M3 2h8l2 2v10H3zm2 2v3h6V4zm1 6v2h4v-2z',
  leaf: 'M8 1h7v7h-2v3h-3v2H5v2H2v-3h2V7h2V4h2zm3 3v2H9v2H7v2H5v2h2v-2h2V8h2V6h2V4z',
  skills: 'M7 1h2v3h3v2h3v3h-3v2H9v4H7v-4H4V9H1V6h3V4h3zM6 6v3h4V6z',
  settings: 'M6 1h4l1 3 3 1v4l-3 1-1 4H6l-1-4-3-1V5l3-1zm2 4L6 7l2 2 2-2z',
  'sound-on': 'M1 6h3V4h2V2h2v12H6v-2H4v-2H1zm9-1h2v6h-2zm3-3h2v3h1v6h-1v3h-2v-3h1V5h-1z',
  'sound-off': 'M1 6h3V4h2V2h2v12H6v-2H4v-2H1zm9-1h2v2h2V5h2v2h-2v2h2v2h-2V9h-2v2h-2V9h2V7h-2z',
  sparkle: 'M7 1h2v4h4v2h3v2h-3v2H9v4H7v-4H3V9H0V7h3V5h4z',
  sun: 'M7 0h2v3H7zm0 13h2v3H7zM0 7h3v2H0zm13 0h3v2h-3zM2 2h2v2H2zm10 0h2v2h-2zM2 12h2v2H2zm10 0h2v2h-2zM6 4h4v2h2v4h-2v2H6v-2H4V6h2z',
  wardrobe: 'M6 1h4v4H6zM3 6h10v8H9v-4H7v4H3z',
  wallet: 'M2 3h10v2h2v2h1v6H2zm2 2v1h6V5zm6 4v2h3V9z',
}

export function GameIcon({ className = '', name }: { className?: string, name: GameIconName }) {
  return (
    <svg aria-hidden="true" className={`game-icon ${className}`.trim()} viewBox="0 0 16 16">
      <path className="game-icon__shadow" d={ICON_PATHS[name]} transform="translate(1 1)" />
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

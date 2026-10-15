import type { ReactNode } from 'react'

const paths = {
  home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-7h6v7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  'arrow-left': <path d="M20 12H4m6-6-6 6 6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  book: <><path d="M12 5v16M12 5C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 1Z" /></>,
  leaf: <><path d="M20 3C8 2 3 8 5 15c7 4 14-1 15-12Z" /><path d="m4 21 11-12" /></>,
  house: <><path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7" /><path d="M17 3v4" /></>,
  star: <path d="m12 2 3.1 6.3 7 .9-5 4.9 1.2 7-6.3-3.3-6.3 3.3 1.2-7-5-4.9 7-.9L12 2Z" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 6v12m3-10h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9" /></>,
  link: <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.92)" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" /></>,
  pause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
  play: <path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke="none" />,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--surface, #f7f8f3)" /><circle cx="16" cy="17" r="3" fill="var(--surface, #f7f8f3)" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  shield: <><path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6l-9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  flag: <><path d="M5 22V3m0 1c5-5 9 4 15 0v11c-6 4-10-5-15 0" /></>,
  spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></>,
  volume: <><path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  inbox: <><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5.5 5h13L21 13v6H3v-6l2.5-8Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.1" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export default function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function PixelStar({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" d="M8 1h4v5h2v2h5v4h-5v2h-2v5H8v-5H6v-2H1V8h5V6h2Z" /><path fill="#ffffff55" d="M8 5h2v4H5V8h3Z" /></svg>
}

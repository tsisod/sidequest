import type { PixelArt } from './pixelArt'

export function PixelRuns({ art, x = 0, y = 0 }: { art: PixelArt; x?: number; y?: number }) {
  return <>{art.runs.map(run => <rect key={`${run.x},${run.y}`} x={x + run.x} y={y + run.y} width={run.width} height={1} fill={run.fill} />)}</>
}

export function Pixels({ art, className }: { art: PixelArt; className?: string }) {
  return <svg className={className} viewBox={`0 0 ${art.width} ${art.height}`} shapeRendering="crispEdges" aria-hidden="true"><PixelRuns art={art} /></svg>
}

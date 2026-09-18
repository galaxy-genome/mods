import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '@/i18n'
import { FULL_MAP_URL, useOpenFullMap } from './MapRoute'
import { splitViewId } from '@/lib/mods'
import type { StarsView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useEditor } from '@/store/editor'
import { type Camera, sx, sy } from './camera'
import { INK, Labels, drawGrid, drawSystems, loadGalaxy, loadGeneration, useGalaxy } from './galaxy'
import { type PlaceContext, makeResolver, placeContext } from './places'

const MINI_H = 140

/** The stars mods the game would load alongside the catalogue: `ownModId`'s first, then favorites. */
export function useStarsMods(ownModId?: string) {
  const parts = useEditor((s) => s.parts)
  return React.useMemo(() => parts.filter((m): m is StarsView => m.meta.type === 'stars' && (m.meta.favorite || splitViewId(m.meta.id).modId === ownModId))
    .toSorted((a, b) => Number(splitViewId(b.meta.id).modId === ownModId) - Number(splitViewId(a.meta.id).modId === ownModId)), [parts, ownModId])
}

/** The shared resolver over the galaxy and stars mods: `ownModId`'s stars first, then favorites. Null until the galaxy loads. */
export function useResolver(ownModId?: string) {
  const { galaxy, maps } = useGalaxy()
  React.useEffect(() => { loadGalaxy().then(loadGeneration).catch(() => {}) }, [])
  const stars = useStarsMods(ownModId)
  // `maps` turns approximate generated positions into exact ones.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => (galaxy ? makeResolver(galaxy, stars) : null), [galaxy, maps, stars])
}

/** "Sol: Gamma Orbital": how a station is named wherever one is shown. */
export const stationLabel = (system: string | undefined, station: string) => (system ? `${system}: ${station}` : station)

/** A station name's label, resolving its system through the shared resolver. */
export function useStationLabel() {
  const resolve = useResolver(splitViewId(useParams().modId ?? '').modId)
  return (station: string) => stationLabel(resolve?.station(station)?.system, station)
}

/** Context for a station or system name in the current mod; null until the galaxy loads or when the name does not resolve. */
export function usePlaceContext(kind: 'system' | 'station', name: string, count = 3) {
  const resolve = useResolver(splitViewId(useParams().modId ?? '').modId)
  const { galaxy } = useGalaxy()
  return React.useMemo(() => (galaxy && resolve && name ? placeContext(galaxy, resolve, kind, name, count) : null), [galaxy, resolve, kind, name, count])
}

/** "6 ly from Sol, north-west", or "Sol (start)" at Sol. */
export function usePlaceLine() {
  const t = useT()
  return (ctx: Pick<PlaceContext, 'ly' | 'direction'>) =>
    ctx.direction ? t('map.contextFromSol', { ly: Math.round(ctx.ly).toLocaleString('en-US'), direction: t(`map.dir_${ctx.direction}`) }) : t('map.contextSol')
}

/** A station or system's context line and, with `map`, a small static map around it that opens the full map. */
export function PlaceContextView({ kind, name, map = true, className }: { kind: 'system' | 'station'; name: string; map?: boolean; className?: string }) {
  const ctx = usePlaceContext(kind, name, map ? 3 : 0)
  const line = usePlaceLine()
  if (!ctx) return null
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <p className="font-mono text-[12px] text-dim">{line(ctx)}</p>
      {map && <MiniMap ctx={ctx} />}
    </div>
  )
}

function MiniMap({ ctx }: { ctx: PlaceContext }) {
  const t = useT()
  const openFullMap = useOpenFullMap()
  const { galaxy } = useGalaxy()
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const el = canvas.current
    if (!el || !galaxy) return
    const W = el.clientWidth, H = MINI_H, dpr = window.devicePixelRatio || 1
    el.width = W * dpr; el.height = H * dpr
    const g = el.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const reach = Math.max(4, ...ctx.nearest.map((n) => n.ly)) * 1.35
    const c: Camera = { cx: ctx.at.x, cz: ctx.at.y, scale: H / (2 * reach), W, H }
    g.fillStyle = '#05080c'
    g.fillRect(0, 0, W, H)
    drawGrid(g, c)
    const types = galaxy.data.types
    drawSystems(g, c, galaxy.reachable.map((r) => ({ x: r[1], z: r[2], colour: types[r[3]][1] })), 2.5)
    const px = sx(c, ctx.at.x), py = sy(c, ctx.at.y)
    g.strokeStyle = '#35e0f5'; g.lineWidth = 1.5
    g.beginPath(); g.arc(px, py, 7, 0, 6.283); g.stroke()
    const labels = new Labels()
    labels.add({ px, py, rank: 0, key: ctx.system, text: ctx.system, colour: '#35e0f5', always: true, leftOf: px })
    ctx.nearest.forEach((n, i) => { const x = sx(c, n.x); labels.add({ px: x, py: sy(c, n.y), rank: i + 1, key: n.name, text: n.name, colour: INK, leftOf: x }) })
    labels.draw(g, { ...c, W: W + 60 })
  }, [ctx, galaxy])
  return (
    <button type="button" onClick={() => openFullMap(`${FULL_MAP_URL}?system=${encodeURIComponent(ctx.system)}`)} aria-label={t('map.miniMap', { name: ctx.system })}
      className="block w-full overflow-hidden rounded-[2px] border border-edge hover:border-cyan">
      <canvas ref={canvas} className="block w-full" style={{ height: MINI_H }} />
    </button>
  )
}

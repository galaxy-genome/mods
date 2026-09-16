import { X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { type Location, useLocation, useNavigate, useParams } from 'react-router-dom'
import { matches } from '@/components/pickers/common'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui/feedback'
import { RadiusSlider, SearchInput } from '@/components/ui/inputs'
import { NumberInput } from '@/features/stars/common'
import { useT } from '@/i18n'
import type { StarsView } from '@/lib/types'
import { useEditor } from '@/store/editor'
import { useGalaxy } from './galaxy'
import { StarMap } from './StarMap'

/** The game compares distance < radius, so 0 matches nothing; it sets no upper bound. */
const QUEST_RADIUS_MAX = 1000

export type MapRequest =
  | { mode: 'point'; x: number; y: number; modId?: string; starId?: string; title?: string }
  | { mode: 'circle'; x: number; y: number; r: number; title?: string }
  /** `generated` lets a pick return a generated system. */
  | { mode: 'pick'; system?: string; title?: string; generated?: boolean }

type ResultOf<R extends MapRequest> = R['mode'] extends 'point' ? { x: number; y: number }
  : R['mode'] extends 'circle' ? { x: number; y: number; r: number } : { name: string }

interface MapState { mapBackground?: Location; map?: MapRequest & { key: string } }

/** Result callbacks by request key. The page that opened the map stays mounted underneath, so its callback still applies. */
const pending = new Map<string, (result: never) => void>()

export const fullMapCircleUrl = (x: number, y: number, r: number) =>
  `https://galaxy-genome.github.io/map/?at=${x},${y}&ly=${Math.max(1, 3 * r)}&draw=${encodeURIComponent(JSON.stringify({ circle: [x, y, r] }))}`

/** Opens the full-screen map route over the current page; `onResult` runs on Done (or on a pick), not on Cancel. */
export function useOpenMap() {
  const navigate = useNavigate()
  const location = useLocation()
  return <R extends MapRequest>(request: R, onResult: (result: ResultOf<R>) => void) => {
    const key = crypto.randomUUID()
    pending.set(key, onResult as (result: never) => void)
    // A focused field inside an open sheet would pull focus back from the map.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const back = (location.state as MapState | null)?.mapBackground ?? location
    navigate(`/map/${request.mode}?return=${encodeURIComponent(back.pathname + back.search)}`, { state: { mapBackground: back, map: { ...request, key } } satisfies MapState })
  }
}

export const mapBackground = (location: Location) => (location.state as MapState | null)?.mapBackground

// Events stop at the layer, so an open sheet underneath neither closes on a tap here nor takes focus or keys from it.
const STOPPED = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend', 'focusin', 'focusout', 'keydown', 'keyup', 'wheel']

/** The map route drawn over the page that opened it. */
export function MapLayer() {
  const [host] = React.useState(() => {
    const el = document.createElement('div')
    el.style.pointerEvents = 'auto'
    return el
  })
  React.useLayoutEffect(() => {
    document.body.append(host)
    const stop = (e: Event) => e.stopPropagation()
    STOPPED.forEach((type) => host.addEventListener(type, stop))
    return () => { STOPPED.forEach((type) => host.removeEventListener(type, stop)); host.remove() }
  }, [host])
  return createPortal(<MapRoute />, host)
}

export function MapRoute() {
  const t = useT()
  const location = useLocation()
  // Drawn over a page, the layer sits outside <Routes> and has no params of its own.
  const mode = useParams().mode ?? location.pathname.split('/')[2] ?? 'pick'
  const navigate = useNavigate()
  const state = (location.state ?? {}) as MapState
  const request = state.map?.mode === mode ? state.map : undefined
  const parts = useEditor((s) => s.parts)
  const { galaxy } = useGalaxy()

  const favorites = React.useMemo(() => parts.filter((m): m is StarsView => m.meta.type === 'stars' && m.meta.favorite), [parts])
  const ownMod = request?.mode === 'point' && request.modId ? parts.find((m): m is StarsView => m.meta.id === request.modId && m.meta.type === 'stars') : undefined
  const stars = React.useMemo(() => (ownMod?.stars ?? []).filter((s) => request?.mode !== 'point' || s.id !== request.starId), [ownMod, request])
  const otherStars = React.useMemo(() => favorites.filter((m) => m !== ownMod).flatMap((m) => m.stars), [favorites, ownMod])

  const [point, setPoint] = React.useState(() => request && request.mode !== 'pick' ? { x: request.x, y: request.y } : { x: 0, y: 0 })
  const [radius, setRadius] = React.useState(() => (request?.mode === 'circle' ? request.r : 100))
  const [focus, setFocus] = React.useState(() => {
    if (request?.mode === 'circle') return { x: request.x, y: request.y, ly: Math.max(150, 3 * request.r) }
    if (request?.mode === 'point') return { x: request.x, y: request.y, ly: 150 }
    return undefined
  })
  // A picked system that is not reachable on the map still has a position to start at.
  React.useEffect(() => {
    if (focus || request?.mode !== 'pick' || !request.system) return
    const s = galaxy?.byName.get(request.system) ?? favorites.flatMap((m) => m.stars).find((st) => st.name === request.system)
    if (s) setFocus(Array.isArray(s) ? { x: s[1], y: s[2], ly: 150 } : { x: s.x, y: s.y, ly: 150 })
  }, [galaxy, focus, request, favorites])

  const [q, setQ] = React.useState('')
  const found = q.trim() && galaxy ? [
    ...favorites.flatMap((m) => m.stars).filter((s) => matches(q, s.name)).map((s) => ({ name: s.name, x: s.x, y: s.y })),
    ...galaxy.reachable.filter((s) => matches(q, s[0])).slice(0, 8).map((s) => ({ name: s[0], x: s[1], y: s[2] })),
  ].slice(0, 6) : []

  const close = () => {
    if (state.mapBackground) navigate(-1)
    else navigate(new URLSearchParams(location.search).get('return') ?? '/', { replace: true })
  }
  const finish = (result: unknown) => {
    const key = state.map?.key
    const callback = key ? pending.get(key) : undefined
    if (key) pending.delete(key)
    close()
    // After the route closes, so the result lands on the page underneath rather than on the map.
    if (callback) setTimeout(() => (callback as (r: unknown) => void)(result))
  }
  const done = () => finish(mode === 'circle' ? { x: Math.round(point.x), y: Math.round(point.y), r: Math.round(radius) } : point)

  const title = request?.title ?? t(`map.title_${mode}`)
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void">
      <header className="flex min-h-14 items-center gap-2 border-b border-edge bg-deep px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" aria-label={t('map.cancel')} onClick={close} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white"><X className="size-5" /></button>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-white">{title}</h1>
        {mode !== 'pick' && <Button variant="primary" size="sm" onClick={done} disabled={!request}>{t('map.done')}</Button>}
      </header>
      <div className="relative z-10 border-b border-edge bg-deep px-3 py-2">
        <SearchInput value={q} onChange={setQ} placeholder={t('map.centreOnSystem')} />
        {found.length > 0 && (
          <div className="absolute inset-x-3 top-14 rounded-[2px] border border-edge bg-deep">
            {found.map((s) => (
              <button key={`${s.name}:${s.x}`} type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left text-[15px] text-white hover:bg-white/[0.04]"
                onClick={() => { setFocus({ x: s.x, y: s.y, ly: Math.max(focus?.ly ?? 150, 75) }); setQ('') }}>
                {s.name}<span className="font-mono text-[11px] text-dim">{s.x}, {s.y}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <StarMap
        className="min-h-0 flex-1"
        mode={mode as 'point' | 'circle' | 'pick'}
        stars={stars}
        otherStars={otherStars}
        point={mode === 'point' ? point : undefined}
        circle={mode === 'circle' ? { ...point, r: radius } : undefined}
        focus={focus}
        onPoint={(x, y) => setPoint({ x, y })}
        onCircle={(x, y, r) => { setPoint({ x, y }); setRadius(r) }}
        pickGenerated={request?.mode === 'pick' && !!request.generated}
        showGenerated={request?.mode === 'pick' && !!request.generated}
        onPick={(name) => finish({ name })}
      />
      {mode !== 'pick' ? (
        <div className="flex flex-col gap-2 border-t border-edge bg-deep px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2">
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-dim">X<NumberInput aria-label="X" value={point.x} onChange={(x) => setPoint((p) => ({ ...p, x }))} /></label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-dim">Y<NumberInput aria-label="Y" value={point.y} onChange={(y) => setPoint((p) => ({ ...p, y }))} /></label>
          </div>
          {mode === 'circle' && <RadiusSlider label={t('map.radius')} value={radius} max={QUEST_RADIUS_MAX} onChange={setRadius} />}
          <p className="text-[12px] leading-snug text-ink/75">{t('map.help')}</p>
          {mode === 'circle' && <ExternalLink href={fullMapCircleUrl(Math.round(point.x), Math.round(point.y), Math.round(radius))} className="self-start text-[13px]">{t('map.openFullMapCircle')}</ExternalLink>}
        </div>
      ) : (
        <p className="border-t border-edge bg-deep px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 text-[13px] text-ink/75">{t('map.pickHelp')}</p>
      )}
    </div>
  )
}

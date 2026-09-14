import { AlertTriangle, Eye, EyeOff, Map as MapIcon } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { describeCondition } from '@/lib/conditions'
import { splitViewId } from '@/lib/mods'
import type { QuestContent, QuestView, StarsView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { questOf, useEditor } from '@/store/editor'
import { loadGalaxy, loadGeneration, useGalaxy } from './galaxy'
import { type Place, ONE_JUMP_LY, distanceLy, makeResolver, placeLabel, placeRoutes, questPlaces, routeLegs, seriesPlaces, sharedPlaces } from './places'
import { FIT_MIN_LY } from './declutter'
import { type MapOverlay, type OverlayPin, StarMap } from './StarMap'

const START = '#ffb454'
const NEXT = '#8fb3bf'
const CHOICE = '#35e0f5'
/** Quest colours in the series map, cycled; readable on the void background and apart from the start-area amber. */
const SERIES = ['#35e0f5', '#ff6fb1', '#9dff6a', '#b28dff', '#ffd84d', '#4d9dff', '#ff8a4d', '#4dffd2', '#e0e0e0', '#ff4d6a']

const NO_STARS: never[] = []
const posKey = (p: { x: number; y: number }) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`


/** The shared resolver over the galaxy and stars mods: `ownModId`'s stars first, then favorites. Null until the galaxy loads. */
function useResolver(ownModId?: string) {
  const { galaxy, maps } = useGalaxy()
  const parts = useEditor((s) => s.parts)
  React.useEffect(() => { loadGalaxy().then(loadGeneration).catch(() => {}) }, [])
  const stars = React.useMemo(() => parts.filter((m): m is StarsView => m.meta.type === 'stars' && (m.meta.favorite || splitViewId(m.meta.id).modId === ownModId))
    .toSorted((a, b) => Number(splitViewId(b.meta.id).modId === ownModId) - Number(splitViewId(a.meta.id).modId === ownModId)), [parts, ownModId])
  // `maps` turns approximate generated positions into exact ones.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => (galaxy ? makeResolver(galaxy, stars) : null), [galaxy, maps, stars])
}

/* ---------- quest overview ---------- */

/** One quest's steps as numbered pins where they happen, joined in step order with forks, merges and loops. */
export function QuestOverviewMap({ q, modId }: { q: QuestContent; modId: string }) {
  const t = useT()
  const navigate = useNavigate()
  const resolve = useResolver(splitViewId(modId).modId)
  const [selected, setSelected] = React.useState<number | null>(null)

  const model = React.useMemo(() => {
    if (!resolve) return null
    const places = questPlaces(q, resolve)
    const routes = placeRoutes(q, places)
    const problemSteps = new Set(places.unresolved.filter((u) => u.place.kind !== 'planet').map((u) => u.step))

    const pins = new Map<string, OverlayPin & { steps: number[]; places: Place[] }>()
    places.steps.forEach((list, i) => list.forEach((p) => {
      const key = p.kind === 'area' ? `area:${posKey(p)}` : posKey(p)
      const pin = pins.get(key) ?? { id: key, x: p.x, y: p.y, text: '', colour: CHOICE, steps: [], places: [] as Place[] }
      if (!pin.steps.includes(i)) pin.steps.push(i)
      pin.places.push(p)
      if (i === 0 && (p.role === 'offer' || p.role === 'start')) { pin.start = true; pin.colour = START }
      pin.problem ||= problemSteps.has(i)
      pins.set(key, pin)
    }))
    for (const pin of pins.values()) { pin.text = pin.steps.map((i) => i + 1).join('·'); pin.label = placeLabel(pin.places, t('output.qmStartArea')); if (pin.start) { pin.text = `▶${pin.text}`; pin.label = t('output.qmStartPin', { place: pin.label }) } }

    const overlay: MapOverlay = { areas: [], lines: [], pins: [...pins.values()] }
    places.steps[0]?.forEach((p) => { if (p.kind === 'area') overlay.areas.push({ x: p.x, y: p.y, r: p.r ?? 0, colour: START }) })
    // A step with several places: its places joined faintly.
    places.steps.forEach((list) => list.slice(1).forEach((p, k) => overlay.lines.push({ x1: list[k].x, y1: list[k].y, x2: p.x, y2: p.y, colour: NEXT, width: 1, dash: true, dim: false })))
    const fit = places.steps.flat()
    const xs = fit.map((p) => p.x), ys = fit.map((p) => p.y)
    const span = fit.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), FIT_MIN_LY) : FIT_MIN_LY
    const { legs, waypoints } = routeLegs(routes, places, span * 0.3)
    const siblings = new Map<number, number>()
    const order = new Map<(typeof routes)[number], number>()
    for (const { route: r, first, ...at } of legs) {
      if (first) { order.set(r, siblings.get(r.from) ?? 0); siblings.set(r.from, order.get(r)! + 1) }
      const n = order.get(r)!
      const fork = routes.filter((o) => o.from === r.from).length > 1
      const round = r.via.length > 0 && places.steps[r.from].at(-1)!.x === places.steps[r.to][0].x && places.steps[r.from].at(-1)!.y === places.steps[r.to][0].y
      overlay.lines.push({
        ...at, colour: r.kind === 'choice' ? CHOICE : NEXT, width: 1.6, arrow: true, dash: r.back,
        bend: round ? 0.3 : r.back ? 0.3 + n * 0.12 : fork ? (n % 2 ? -1 : 1) * (0.12 + 0.08 * Math.floor(n / 2)) : 0,
        label: first && r.kind === 'choice' ? `${r.back ? '↻ ' : ''}${clip(r.label || t('output.flChoice'), 40)}` : undefined,
      })
    }
    // Steps without a place that a route passes through: small hollow pins on the way.
    for (const w of waypoints) {
      const id = `via:${w.step}`
      pins.set(id, { id, x: w.x, y: w.y, text: String(w.step + 1), colour: NEXT, hollow: true, steps: [w.step], places: [], problem: problemSteps.has(w.step) })
      overlay.pins.push(pins.get(id)!)
    }
    const onRoute = new Set(waypoints.map((w) => w.step))
    const strip = q.steps.map((_, i) => i).filter((i) => !places.steps[i].length && !onRoute.has(i))
    const startPlaces = places.steps[0]?.filter((p) => p.role === 'offer' || p.role === 'start') ?? []
    const offer = startPlaces.find((p) => p.role === 'offer')
    const start = offer ? t('output.qmStartLine', { station: offer.name, system: offer.system }) : startPlaces.length ? t('output.qmStartPin', { place: t('output.qmStartArea') }) : ''
    return { places, overlay, pins, strip, problemSteps, fit, start }
  }, [q, resolve, t])

  if (!model) return <p className="py-10 text-center font-mono text-[12px] text-dim">{t('map.loading')}</p>
  const { places, overlay, pins, strip, fit, start } = model
  const pinOfStep = (i: number) => [...pins.values()].find((p) => p.steps.includes(i))?.id ?? null
  const onPin = (id: string | null) => {
    if (!id) { setSelected(null); return }
    const steps = pins.get(id)!.steps
    // Repeated taps on a shared pin walk through its steps.
    const at = selected === null ? -1 : steps.indexOf(selected)
    setSelected(steps[(at + 1) % steps.length])
  }
  const step = selected === null ? null : q.steps[selected]
  const stepPlaces = selected === null ? [] : places.steps[selected]
  const stepUnresolved = places.unresolved.filter((u) => u.step === selected)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge icon={<span className="block h-px w-3" style={{ background: NEXT }} />}>{t('output.flNext')}</Badge>
        <Badge tone="cyan" icon={<span className="block h-px w-3 bg-cyan" />}>{t('output.flChoice')}</Badge>
        <Badge tone="cyan" icon={<span className="block w-3 border-t border-dashed border-cyan" />}>{t('output.qmLoop')}</Badge>
        {q.settings.startMode !== 'bar' && <Badge tone="amber" icon={<span className="block size-2.5 rounded-full border border-dashed border-amber" />}>{t('output.qmStartArea')}</Badge>}
      </div>
      <div className="relative">
        <StarMap
          className="h-[56dvh] min-h-[320px] rounded-[4px] border border-edge"
          mode="view"
          stars={NO_STARS}
          fit={fit}
          overlay={overlay}
          selectedPin={selected === null ? null : pinOfStep(selected)}
          onPin={onPin}
        />
        {!fit.length && <p className="pointer-events-none absolute inset-x-4 top-1/3 text-center text-[13px] text-ink">{t('output.qmNoPlaces')}</p>}
        {step && selected !== null && (
          <Card className="absolute inset-x-2 bottom-2 flex flex-col gap-1.5 bg-deep/95 p-3 sm:right-auto sm:w-[340px]">
            <p className="flex items-center gap-2 text-[15px] text-white">
              <span className="font-mono text-[12px] text-dim">{selected + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{step.name || t('output.untitled')}</span>
            </p>
            <p className="text-[13px] text-ink">{describeCondition(step.finishWhen)}</p>
            {stepPlaces.length > 0 && <p className="font-mono text-[12px] text-dim">{placeLabel(stepPlaces, t('output.qmStartArea'))}</p>}
            {stepUnresolved.map((u) => <p key={u.place.name} className="flex items-center gap-1.5 text-[12px] text-amber"><AlertTriangle className="size-3.5" />{t('output.qmNotFound', { name: u.place.name })}</p>)}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => navigate(`/mod/${modId}/steps/${step.id}`)}>{t('output.qmOpenStep')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>{t('common.close')}</Button>
            </div>
          </Card>
        )}
      </div>
      {start && <p className="text-[14px] text-white"><span className="text-amber">▶</span> {start}</p>}
      {strip.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-dim">{t('output.qmStrip')}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {strip.map((i) => (
              <button key={q.steps[i].id} type="button" onClick={() => setSelected(i)} aria-pressed={selected === i}
                className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-[2px] border px-3 text-[13px]', selected === i ? 'border-cyan text-white' : 'border-edge text-ink')}>
                <span className="font-mono text-[12px] text-dim">{i + 1}</span>{clip(q.steps[i].name || t('output.untitled'), 22)}
                {model.problemSteps.has(i) && <AlertTriangle className="size-3.5 text-amber" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {places.unresolved.length > 0 && (
        <Card tone="amber" className="flex flex-col gap-2 p-3">
          <p className="flex items-start gap-2 text-[14px] text-white">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />
            {t('output.qmUnresolved', { count: places.unresolved.length, names: [...new Set(places.unresolved.map((u) => u.place.name))].join(', ') })}
          </p>
          <Button variant="warning" size="sm" className="self-start" onClick={() => dispatchEvent(new Event('open-problems'))}>{t('output.qmShowProblems')}</Button>
        </Card>
      )}
    </div>
  )
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/* ---------- quest series ---------- */

/** `/series/:modId` draws one mod's quests; `/series` draws every favorite mod's quests. */
export function SeriesMapPage() {
  const t = useT()
  const navigate = useNavigate()
  const { modId } = useParams()
  const parts = useEditor((s) => s.parts)
  const mods = useEditor((s) => s.mods)
  const resolve = useResolver(modId)
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [selectedPin, setSelectedPin] = React.useState<string | null>(null)
  const favorites = !modId

  const input = React.useMemo(() => parts
    .filter((m): m is QuestView => m.meta.type === 'quest' && (favorites ? m.meta.favorite : splitViewId(m.meta.id).modId === modId))
    .map((m) => {
      const owner = splitViewId(m.meta.id).modId
      const content = questOf(m)!
      return { key: m.meta.id, modId: owner, modTitle: mods.find((b) => b.meta.id === owner)?.meta.title ?? '', title: content.settings.questName || m.meta.title, content }
    }), [parts, mods, modId, favorites])

  const series = React.useMemo(() => (resolve ? seriesPlaces(input, resolve) : null), [input, resolve])
  const colourOf = React.useMemo(() => new Map(series?.quests.map((q, i) => [q.key, SERIES[i % SERIES.length]]) ?? []), [series])
  const numberOf = React.useMemo(() => new Map(series?.quests.map((q, i) => [q.key, i + 1]) ?? []), [series])
  // Framed once, on everything, so toggling quests does not move the camera.
  const fit = React.useMemo(() => series?.quests.flatMap((q) => q.beats), [series])

  const model = React.useMemo(() => {
    if (!series) return null
    const visible = series.quests.filter((q) => !hidden.has(q.key))
    const shared = favorites ? sharedPlaces(visible) : new Set<string>()
    const overlay: MapOverlay = { areas: [], lines: [], pins: [] }
    const pins = new Map<string, OverlayPin & { quests: string[]; names: string[] }>()
    const areas = new Map<string, { x: number; y: number; r: number; colour: string; n: number }>()
    for (const q of visible) {
      const colour = colourOf.get(q.key)!
      q.beats.forEach((b, k) => {
        if (b.kind === 'area') {
          // Quests sharing one start area draw it once, grey when more than one quest owns it.
          const k = `${posKey(b)}:${b.r}`
          const a = areas.get(k)
          if (a) { a.n++; a.colour = '#8fb3bf' } else areas.set(k, { x: b.x, y: b.y, r: b.r ?? 0, colour, n: 1 })
        }
        const key = posKey(b)
        const pin = pins.get(key) ?? { id: key, x: b.x, y: b.y, text: '', colour, quests: [], names: [], ring: shared.has(b.system) }
        if (!pin.quests.includes(q.key)) pin.quests.push(q.key)
        const name = b.kind === 'area' ? t('output.qmStartArea') : b.name
        if (!pin.names.includes(name)) pin.names.push(name)
        pins.set(key, pin)
        const prev = q.beats[k - 1]
        const ly = prev ? distanceLy(prev, b) : 0
        // A start area and a station at its centre are one pin; a line between them would draw as a loop.
        if (!ly) return
        const far = ly > ONE_JUMP_LY
        overlay.lines.push({ x1: prev.x, y1: prev.y, x2: b.x, y2: b.y, colour, width: 2, arrow: true, dash: far, label: ly >= 1 ? `${Math.round(ly).toLocaleString()} ly` : undefined })
      })
    }
    for (const g of series.gates) {
      const from = visible.find((q) => q.key === g.from), to = visible.find((q) => q.key === g.to)
      const a = from?.beats[from.beats.length - 1], b = to?.beats[0]
      if (a && b) overlay.lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, colour: '#ffffff', width: 1.2, dash: true, arrow: true, bend: 0.2, label: t('output.smUnlocks') })
    }
    overlay.areas = [...areas.values()]
    for (const pin of pins.values()) {
      pin.text = pin.quests.length > 3 ? t('output.smQuestCount', { count: pin.quests.length }) : pin.quests.map((k) => numberOf.get(k)).join('·')
      if (pin.quests.length > 1) pin.colour = '#ffffff'
      pin.label = pin.names.join(', ')
      overlay.pins.push(pin)
    }
    return { overlay, pins }
  }, [series, hidden, favorites, colourOf, numberOf, t])

  const title = favorites ? t('output.smFavoritesTitle') : mods.find((b) => b.meta.id === modId)?.meta.title ?? ''
  const pin = selectedPin ? model?.pins.get(selectedPin) : undefined
  const byMod = series ? [...new Set(series.quests.map((q) => q.modId))].map((id) => ({ id, quests: series.quests.filter((q) => q.modId === id) })) : []
  const toggle = (keys: string[], on: boolean) => setHidden((h) => { const n = new Set(h); keys.forEach((k) => (on ? n.delete(k) : n.add(k))); return n })

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <AppBar back={() => navigate(-1)} title={title} subtitle={t('output.smSubtitle')} />
      {input.length === 0 ? (
        <EmptyState icon={<MapIcon />} className="m-4" title={t(favorites ? 'output.smNoFavorites' : 'output.smNoQuests')} body={t('output.smEmptyBody')} />
      ) : (
        <>
          <div className="relative">
            <StarMap className="h-[58dvh] min-h-[300px] border-b border-edge" mode="view" stars={NO_STARS} fit={fit} overlay={model?.overlay} selectedPin={selectedPin} onPin={setSelectedPin} />
            {pin && series && (
              <Card className="absolute inset-x-2 bottom-2 flex flex-col gap-1.5 max-h-[70%] overflow-y-auto bg-deep/95 p-3 sm:right-auto sm:w-[340px]">
                <p className="text-[15px] font-semibold text-white">{pin.names.join(', ')}</p>
                {pin.quests.map((k) => {
                  const q = series.quests.find((x) => x.key === k)!
                  return (
                    <button key={k} type="button" onClick={() => navigate(`/mod/${k}/flow?view=map`)} className="flex min-h-11 items-center gap-2 text-left text-[14px] text-ink hover:text-white">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colourOf.get(k) }} />
                      <span className="min-w-0 flex-1 truncate">{numberOf.get(k)}. {q.title}</span>
                      {favorites && <span className="truncate font-mono text-[11px] text-dim">{q.modTitle}</span>}
                    </button>
                  )
                })}
              </Card>
            )}
          </div>
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
            <p className="text-[12px] text-dim">{t('output.smHelp', { ly: ONE_JUMP_LY })}</p>
            {byMod.map(({ id, quests }) => (
              <section key={id} className="flex flex-col gap-1">
                {favorites && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-white">{quests[0].modTitle}</h2>
                    <Button variant="text" size="sm" onClick={() => toggle(quests.map((q) => q.key), quests.every((q) => hidden.has(q.key)))}>
                      {t(quests.every((q) => hidden.has(q.key)) ? 'output.smShowAll' : 'output.smHideAll')}
                    </Button>
                  </div>
                )}
                <ul className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
                  {quests.map((q) => {
                    const off = hidden.has(q.key)
                    return (
                      <li key={q.key}>
                        <button type="button" aria-pressed={!off} onClick={() => toggle([q.key], off)} className={cn('flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left', off && 'opacity-50')}>
                          <span className="size-3 shrink-0 rounded-full" style={{ background: colourOf.get(q.key) }} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[14px] text-white">{numberOf.get(q.key)}. {q.title}</span>
                            <span className="truncate font-mono text-[11px] text-dim">
                              {q.beats.length ? t('output.smPlaces', { count: q.beats.length }) : t('output.smNoPlaces')}
                              {q.requires.length > 0 && ` · ${t('output.smRequires', { ids: q.requires.map((id) => series?.quests.find((o) => o.questId === id)?.title ?? id).join(', ') })}`}
                            </span>
                          </span>
                          {q.unresolved.length > 0 && <Badge tone="amber">{t('output.smNotFound', { count: q.unresolved.length })}</Badge>}
                          {off ? <EyeOff className="size-4 shrink-0 text-dim" /> : <Eye className="size-4 shrink-0 text-ink" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

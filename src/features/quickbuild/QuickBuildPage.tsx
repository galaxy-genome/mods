import { Wand2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { RadiusSlider, Stepper } from '@/components/ui/inputs'
import { StarMap } from '@/features/map/StarMap'
import { useGalaxy } from '@/features/map/galaxy'
import { useStarsView } from '@/features/stars/common'
import { useT } from '@/i18n'
import { updateStars, updateWithUndo, useEditor } from '@/store/editor'
import type { StarsView } from '@/lib/types'
import { BATCH_MAX, applyBatch, generate, presetKnobs } from './generate'

const RADIUS_MAX = 500

/** Pan the map to put the centre where systems go, size the circle, and create random systems inside it. */
export function QuickBuildPage() {
  const t = useT()
  const { modId, mod } = useStarsView()
  const { galaxy } = useGalaxy()
  // A flight still under way keeps its target for the other axis, so committing Y right after X keeps the typed X.
  const flight = React.useRef<{ x: number; y: number; at: number } | null>(null)
  const flyTo = (to: { x?: number; y?: number }) => {
    const base = flight.current && performance.now() - flight.current.at < 1500 ? flight.current : centre
    const next = { x: to.x ?? base.x, y: to.y ?? base.y }
    flight.current = { ...next, at: performance.now() }
    setFocus((f) => ({ ...next, seq: (f.seq ?? 0) + 1 }))
  }
  const [focus, setFocus] = React.useState<{ x: number; y: number; ly?: number; seq?: number }>(() => { const last = mod?.stars.at(-1); return { x: last?.x ?? 0, y: last?.y ?? 0, ly: 300 } })
  const [centre, setCentre] = React.useState({ x: focus.x, y: focus.y })
  const [radius, setRadius] = React.useState(40)
  const [count, setCount] = React.useState(3)
  const [result, setResult] = React.useState<string | null>(null)
  const parts = useEditor((s) => s.parts)
  const otherStars = React.useMemo(() => parts.filter((m): m is StarsView => m.meta.type === 'stars' && m.meta.favorite && m.meta.id !== modId).flatMap((m) => m.stars), [parts, modId])
  if (!mod) return null
  const readOnly = mod.meta.origin === 'game'

  const create = () => {
    const knobs = { ...presetKnobs('random', { ...centre, seed: 1 + Math.floor(Math.random() * 999_999), mode: 'region' }), radius, count }
    const batch = generate(knobs, galaxy, mod, false, {}, otherStars)
    const n = batch.systems.length
    if (n) updateWithUndo(modId, t('quickbuild.created', { count: n }), () => updateStars(modId, (m) => applyBatch(m, batch.systems, false)))
    const why = t(`quickbuild.shortfall${batch.blocked ? batch.blocked[0].toUpperCase() + batch.blocked.slice(1) : ''}`, { placed: n, requested: count })
    setResult(n < count ? why : null)
  }

  return (
    <div className="flex h-[calc(100dvh-56px-68px-env(safe-area-inset-bottom))] min-h-[520px] flex-col lg:h-[calc(100dvh-56px)]">
      <StarMap
        className="min-h-[240px] flex-1 border-b border-edge"
        mode="view"
        readOnly
        stars={mod.stars}
        otherStars={otherStars}
        focus={focus}
        centreCircle={radius}
        onCentre={(x, y) => setCentre({ x, y })}
      />
      <div className="safe-bottom flex shrink-0 flex-col gap-3 bg-deep px-4 py-3">
        <div className="flex items-center gap-3">
          <CoordInput id="qb-x" label={t('quickbuild.x')} value={centre.x} onCommit={(x) => flyTo({ x })} />
          <CoordInput id="qb-y" label={t('quickbuild.y')} value={centre.y} onCommit={(y) => flyTo({ y })} />
        </div>
        <p className="text-[13px] leading-snug text-dim">{t('quickbuild.help')}</p>
        <RadiusSlider label={t('quickbuild.radius')} value={radius} max={RADIUS_MAX} onChange={setRadius} />
        <div className="flex items-center gap-3">
          <label htmlFor="qb-count" className="flex-1 text-[14px] text-ink">{t('quickbuild.count')}</label>
          <Stepper id="qb-count" className="w-36" value={count} min={1} max={BATCH_MAX} onChange={setCount} />
        </div>
        <Button variant="solid" size="lg" disabled={readOnly || !galaxy} onClick={create}><Wand2 className="size-5" />{t('quickbuild.generate')}</Button>
        {result && <p role="status" className="text-[13px] text-ink">{result}</p>}
      </div>
    </div>
  )
}

/** A map-centre coordinate: follows `value` until the user types, and commits a typed number on Enter or blur. */
function CoordInput({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const commit = () => {
    const n = Number(draft)
    if (draft !== null && draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(Math.round(n * 10) / 10)
    setDraft(null)
  }
  return (
    <div className="flex flex-1 items-center gap-2">
      <label htmlFor={id} className="text-[14px] text-ink">{label}</label>
      <input id={id} inputMode="decimal" className="h-9 w-full min-w-0 rounded-md border border-edge bg-void px-2 font-mono text-[13px] text-cyan"
        value={draft ?? value.toFixed(1)} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    </div>
  )
}

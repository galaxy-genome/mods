import { ChevronRight, Info, Plus, Search, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sheet } from '@/components/ui/sheet'
import { Input, SearchInput } from '@/components/ui/inputs'
import { SwipeRow } from '@/components/ui/gestures'
import { PLANET_TYPES, STAR_TYPE_GROUPS, SYSTEMS } from '@/lib/reference'
import { loadedPlanets } from '@/lib/rules'
import type { ModStation, StarsView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { t, useT } from '@/i18n'
import { updateStars, updateWithUndo, usePart } from '@/store/editor'

export function useStarsView() {
  const { modId = '', itemId } = useParams()
  const mod = usePart(modId) as StarsView | undefined
  const navigate = useNavigate()
  return { modId, itemId, mod, go: (path: string) => navigate(`/mod/${modId}/${path}`) }
}

type ListKey = 'stars' | 'planets' | 'stations'

/** Removes an item with a 10-second undo toast. */
export function removeItem(modId: string, key: ListKey, id: string, name: string) {
  updateWithUndo(modId, t('stars.deleted', { name: name || t('stars.untitled') }), () => updateStars(modId, (m) => {
    const list = m[key] as { id: string }[]
    const index = list.findIndex((i) => i.id === id)
    if (index >= 0) list.splice(index, 1)
  }))
}

export function starColour(type: string) {
  return STAR_TYPE_GROUPS.find((g) => g.items.includes(type))?.colour ?? STAR_TYPE_GROUPS[0].colour
}

/** Readable star or planet type: "M-RedDwarf" is "Red dwarf (M)", "GasGiantClassIV" is "Gas giant class IV". */
export function typeLabel(key: string) {
  const dash = key.indexOf('-')
  const code = dash > 0 ? key.slice(0, dash) : ''
  const words = key.slice(dash + 1).replace(/with/g, 'With').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Class([IV]+)$/, 'Class $1').split(' ')
  const text = words.map((w, i) => (/^[IV]+$/.test(w) || i === 0 ? w : w.toLowerCase())).join(' ')
  return code ? `${text} (${code})` : text
}

export const isGameSystem = (name: string) => SYSTEMS.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())

export interface BodyRow { index: number; name: string; kind: 'star' | 'planet' | 'other' }

/** A system's PlanetID targets: the planets of this file the game loads in that system, in file order. Stars and the game's own planets do not count. */
export function bodiesOf(mod: StarsView, system: string): BodyRow[] {
  return loadedPlanets(mod).filter((p) => p.system === system)
    .map((p, i) => ({ index: i + 1, name: p.name || t('stars.untitledPlanet'), kind: 'planet' as const }))
}

export function stationOnPlanet(mod: StarsView, st: ModStation) {
  return bodiesOf(mod, st.system)[st.bodyIndex - 1]
}

/** Number input that keeps the typed text while it is not yet a number ("-", "1."). */
export function NumberInput({ value, onChange, id, invalid, className, 'aria-label': ariaLabel }: {
  value: number; onChange: (n: number) => void; id?: string; invalid?: boolean; className?: string; 'aria-label'?: string
}) {
  const [draft, setDraft] = React.useState(String(value))
  React.useEffect(() => { if (Number(draft) !== value) setDraft(String(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      invalid={invalid}
      className={className}
      value={draft}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d.-]/g, '')
        setDraft(v)
        if (v !== '' && v !== '-' && Number.isFinite(Number(v))) onChange(Number(v))
      }}
      onBlur={() => setDraft(String(value))}
    />
  )
}

/** A field-sized button that opens a picker. */
export function PickerButton({ id, children, onClick, invalid, placeholder, leading }: {
  id?: string; children?: React.ReactNode; onClick: () => void; invalid?: boolean; placeholder: string; leading?: React.ReactNode
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-invalid={invalid || undefined}
      className="flex h-11 w-full items-center gap-2 rounded-[2px] border border-edge bg-field px-3 text-left font-mono text-[15px] text-ink transition-colors hover:border-grid-strong focus-visible:border-cyan aria-[invalid=true]:border-danger"
    >
      {leading}
      <span className={cn('min-w-0 flex-1 truncate', !children && 'text-dim')}>{children || placeholder}</span>
      <ChevronRight className="size-4 shrink-0 text-dim" />
    </button>
  )
}

export function InfoLine({ children, tone = 'cyan' }: { children: React.ReactNode; tone?: 'cyan' | 'dim' }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-[12px] leading-snug', tone === 'cyan' ? 'text-cyan' : 'text-ink/75')}>
      <Info className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[4px] border border-grid-strong bg-cyan/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-ink">
      <Info className="mt-0.5 size-4 shrink-0 text-cyan" />
      <p>{children}</p>
    </div>
  )
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 items-center gap-2 rounded-full border border-cyan bg-cyan px-5 font-ui text-[15px] font-semibold text-void transition-transform active:scale-95 lg:bottom-6"
    >
      <Plus className="size-5" />{label}
    </button>
  )
}

/** A list card with swipe-to-delete and a visible delete button on wide screens. */
export function ItemCard({ onOpen, onDelete, leading, title, subtitle, trailing, tone, navKey }: {
  onOpen: () => void; onDelete: () => void; leading: React.ReactNode; title: React.ReactNode; subtitle: React.ReactNode; trailing?: React.ReactNode; tone?: 'danger'
  /** The row's `<param>:<key>` place in the address. */
  navKey?: string
}) {
  const t = useT()
  const origin = useStarsView().mod?.meta.origin
  const readOnly = origin === 'game'
  return (
    <SwipeRow disabled={readOnly} actions={[{ label: t('stars.delete'), icon: <Trash2 />, tone: 'danger', onAction: onDelete }]}>
      <div className={cn('group flex items-center rounded-[4px] border bg-panel', tone === 'danger' ? 'border-danger/70' : 'border-edge')}>
        <button type="button" data-opt data-nav={navKey} onClick={onOpen} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03]">
          <span className="shrink-0">{leading}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] text-white">{title}</span>
            <span className="truncate font-mono text-[12px] text-dim">{subtitle}</span>
          </span>
          {trailing}
          <ChevronRight className="size-4 shrink-0 text-dim" />
        </button>
        {!readOnly && <button type="button" aria-label={t('stars.delete')} onClick={onDelete} className="hidden size-11 shrink-0 place-items-center text-dim hover:text-danger sm:grid">
          <Trash2 className="size-4" />
        </button>}
      </div>
    </SwipeRow>
  )
}

export function StarSwatch({ type, size = 28 }: { type: string; size?: number }) {
  const c = starColour(type)
  const black = type === 'BlackHole'
  return (
    <span aria-hidden className="grid place-items-center rounded-full border border-edge" style={{ width: size, height: size, background: black ? '#000' : undefined }}>
      <span className="rounded-full" style={{ width: size * 0.55, height: size * 0.55, background: black ? 'transparent' : c, boxShadow: black ? `0 0 0 2px ${c}` : `0 0 ${size / 3}px ${c}` }} />
    </span>
  )
}

const PLANET_LOOK: Record<string, { a: string; b: string; bands?: boolean; ring?: boolean }> = {
  EarthLikePlanet: { a: '#3a8fd8', b: '#4fb06a' },
  GasGiantClassI: { a: '#d9b27a', b: '#a8764a', bands: true },
  GasGiantClassII: { a: '#e8d9a8', b: '#bba06a', bands: true },
  GasGiantClassIII: { a: '#c9d8e8', b: '#8aa6c0', bands: true },
  GasGiantClassIV: { a: '#7aa6d8', b: '#3f6aa0', bands: true },
  GasGiantClassV: { a: '#e8f0ff', b: '#b0c4e0', bands: true },
  HeliumRichGasGiant: { a: '#f0e6d0', b: '#c8b48c', bands: true, ring: true },
  GasGiantwithAmmoniaLife: { a: '#d8a86a', b: '#8a5a2a', bands: true },
  GasGiantwithWaterLife: { a: '#6ac0c8', b: '#2a7a8a', bands: true },
  WaterWorld: { a: '#2a7ad8', b: '#1a4a9a' },
  IcePlanet: { a: '#e0f4ff', b: '#9cc4dc' },
  RockPlanet: { a: '#9a8a7a', b: '#5a4e44' },
  HighMetalPlanet: { a: '#b08a6a', b: '#6a4a3a' },
  MetalRichPlanet: { a: '#c0c0c8', b: '#6a6a78' },
  AmmoniaPlanet: { a: '#c8b060', b: '#7a6a30' },
  WaterGiant: { a: '#4ab0e8', b: '#1a5a9a', ring: true },
}

export function PlanetThumb({ type, size = 36 }: { type: string; size?: number }) {
  const look = PLANET_LOOK[type] ?? { a: '#5f7f8e', b: '#16455a' }
  const gid = `pg-${type}`
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <radialGradient id={gid} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor={look.a} />
          <stop offset="100%" stopColor={look.b} />
        </radialGradient>
        <clipPath id={`${gid}-c`}><circle cx="20" cy="20" r="12" /></clipPath>
      </defs>
      <circle cx="20" cy="20" r="12" fill={`url(#${gid})`} />
      {look.bands && (
        <g clipPath={`url(#${gid}-c)`} stroke={look.b} strokeOpacity="0.6" strokeWidth="1.6">
          <line x1="6" y1="15" x2="34" y2="15" /><line x1="6" y1="20" x2="34" y2="20" /><line x1="6" y1="25" x2="34" y2="25" />
        </g>
      )}
      {look.ring && <ellipse cx="20" cy="20" rx="18" ry="5" fill="none" stroke={look.a} strokeOpacity="0.8" strokeWidth="1.2" />}
    </svg>
  )
}

export function StationIcon({ type, size = 36 }: { type: string; size?: number }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }
  const shapes: Record<string, React.ReactNode> = {
    OrbitalDark: <><circle cx="20" cy="20" r="11" {...s} /><circle cx="20" cy="20" r="4" fill="currentColor" /><line x1="20" y1="9" x2="20" y2="16" {...s} /><line x1="20" y1="24" x2="20" y2="31" {...s} /></>,
    OrbitalWhite: <><circle cx="20" cy="20" r="11" {...s} /><circle cx="20" cy="20" r="4" {...s} /><line x1="9" y1="20" x2="16" y2="20" {...s} /><line x1="24" y1="20" x2="31" y2="20" {...s} /></>,
    NovaStation: <><path d="M20 6 L23 17 L34 20 L23 23 L20 34 L17 23 L6 20 L17 17 Z" {...s} /><circle cx="20" cy="20" r="3" fill="currentColor" /></>,
    FarmStation: <><rect x="6" y="16" width="28" height="8" {...s} /><rect x="10" y="8" width="6" height="24" {...s} /><rect x="24" y="8" width="6" height="24" {...s} /></>,
    StationHighTech: <><path d="M20 6 L32 13 L32 27 L20 34 L8 27 L8 13 Z" {...s} /><path d="M20 13 L26 17 L26 23 L20 27 L14 23 L14 17 Z" {...s} /></>,
    AsteroidStation: <><path d="M9 18 L14 9 L25 8 L32 15 L31 27 L22 33 L11 29 Z" {...s} /><rect x="17" y="17" width="6" height="6" fill="currentColor" /></>,
  }
  return <svg aria-hidden width={size} height={size} viewBox="0 0 40 40">{shapes[type]}</svg>
}

/** Star type picker: groups with colour swatches, searchable. */
export function StarTypePicker({ open, onOpenChange, value, onSelect }: { open: boolean; onOpenChange: (v: boolean) => void; value: string; onSelect: (t: string) => void }) {
  const t = useT()
  const [q, setQ] = React.useState('')
  const needle = q.trim().toLowerCase()
  const groups = STAR_TYPE_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((k) => !needle || k.toLowerCase().includes(needle) || typeLabel(k).toLowerCase().includes(needle) || g.name.toLowerCase().includes(needle)) }))
    .filter((g) => g.items.length)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('stars.starType')} full nested>
      <div className="sticky top-0 z-10 -mx-4 bg-deep px-4 pb-3"><SearchInput value={q} onChange={setQ} placeholder={t('stars.searchStarTypes')} /></div>
      {groups.length === 0 && <p className="flex items-center gap-2 py-6 text-[14px] text-dim"><Search className="size-4" />{t('stars.noStarTypeMatch', { q })}</p>}
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.name} className="flex flex-col gap-1.5">
            <h3 className="section-label">{g.name}</h3>
            <div className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
              {g.items.map((k) => (
                <button
                  key={k}
                  type="button"
                  data-opt
                  data-nav={`pick:${k}`}
                  aria-pressed={k === value}
                  onClick={() => { onSelect(k); onOpenChange(false) }}
                  className={cn('flex min-h-12 items-center gap-3 px-3 text-left hover:bg-white/[0.03]', k === value && 'bg-cyan/10')}
                >
                  <StarSwatch type={k} size={24} />
                  <span className={cn('flex-1 text-[15px]', k === value ? 'text-cyan' : 'text-white')}>{typeLabel(k)}</span>
                  <span className="font-mono text-[11px] text-dim">{k}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

export function PlanetTypePicker({ open, onOpenChange, value, onSelect }: { open: boolean; onOpenChange: (v: boolean) => void; value: string; onSelect: (t: string) => void }) {
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('stars.planetType')} nested>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {PLANET_TYPES.map((k) => (
          <button
            key={k}
            type="button"
            data-opt
            data-nav={`pick:${k}`}
            aria-pressed={k === value}
            onClick={() => { onSelect(k); onOpenChange(false) }}
            className={cn('flex min-h-24 flex-col items-center justify-center gap-1 rounded-[4px] border bg-panel p-2 text-center hover:border-grid-strong', k === value ? 'border-cyan bg-cyan/10' : 'border-edge')}
          >
            <PlanetThumb type={k} size={48} />
            <span className={cn('text-[13px] leading-tight', k === value ? 'text-cyan' : 'text-white')}>{typeLabel(k)}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

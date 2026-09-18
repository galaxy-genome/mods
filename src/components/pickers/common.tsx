import { Check } from 'lucide-react'
import * as React from 'react'
import { useT } from '@/i18n'
import { useLocation, useSearchParams } from 'react-router-dom'
import { NAV_KEYS, navRows, nextIndex, rowFor, rowPlace } from '@/lib/listNav'
import { STATION_FACTIONS } from '@/lib/reference'
import { cn } from '@/lib/utils'
import portraits from '@/data/portraits.json'

/** Recent picks per picker, kept for the session only. */
const recents = new Map<string, string[]>()
export function useRecent(key: string) {
  const [list, setList] = React.useState(() => recents.get(key) ?? [])
  const push = (v: string) => {
    if (!v) return
    const next = [v, ...(recents.get(key) ?? []).filter((x) => x !== v)].slice(0, 6)
    recents.set(key, next)
    setList(next)
  }
  return [list, push] as const
}

/** Case, spaces, hyphens and apostrophes are ignored. */
const norm = (s: string) => s.toLowerCase().replace(/[\s\-'’]/g, '')
export const matches = (q: string, ...fields: (string | number | null | undefined)[]) => {
  const s = norm(q)
  return !s || fields.some((f) => f != null && norm(String(f)).includes(s))
}

/** Controls that own the arrow keys; list navigation leaves them alone. */
const OWNS_KEYS = 'input, textarea, select, [contenteditable="true"], canvas, [role="slider"], [role="spinbutton"], [role="radio"], [role="radiogroup"], [role="tablist"], [role="menu"], [role="listbox"], [role="application"]'

/**
 * Keyboard list navigation over `[data-opt]` rows in the top sheet, or the page when none is open.
 * ↑/↓, j/k, Home/End move; Enter is the row's own click; Delete/Backspace clicks the row's `[data-delete-action]`
 * (its swipe Delete) and moves to the row that takes its place.
 */
export function useListNav() {
  const write = useWriteListParam()
  const { search, key: historyKey } = useLocation()
  const writeRef = React.useRef(write)
  writeRef.current = write

  // The focused row goes in the address, so reload and Back come back to it.
  React.useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const place = rowPlace(e.target as Element)
      if (place) writeRef.current(place.name, place.key)
    }
    addEventListener('focusin', onFocus)
    return () => removeEventListener('focusin', onFocus)
  }, [])

  // Rows arrive after the address does, so keep looking for a second.
  React.useEffect(() => {
    const idle = () => !document.activeElement || document.activeElement === document.body
    if (!idle()) return
    let tries = 0
    const id = setInterval(() => {
      if (!idle()) return clearInterval(id)
      const row = rowFor(search)
      if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }) }
      if (row || ++tries > 20) clearInterval(id)
    }, 50)
    return () => clearInterval(id)
  }, [search, historyKey])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      const owner = target.closest?.(OWNS_KEYS)
      const rows = navRows()
      const current = rows.indexOf(target)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const action = current < 0 || e.shiftKey ? null : target.closest('[data-delete]')?.querySelector<HTMLElement>('[data-delete-action]')
        if (!action) return
        e.preventDefault()
        const dialogs = document.querySelectorAll('[role="dialog"]').length
        action.click()
        // A delete that asks first keeps focus in its dialog.
        setTimeout(() => {
          if (document.querySelectorAll('[role="dialog"]').length !== dialogs) return
          const after = navRows()
          after[Math.min(current, after.length - 1)]?.focus()
        })
        return
      }
      if (!NAV_KEYS.includes(e.key) || !rows.length) return
      if (owner && !(owner.tagName === 'INPUT' && e.key === 'ArrowDown' && document.querySelector('[role="dialog"]'))) return
      if (current < 0 && ['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      const el = rows[nextIndex(current, rows.length, e.key)]
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}

/**
 * The same keys over a selection that isn't DOM rows (the flow graph, the quest map): ↑/↓, j/k, Home/End move
 * `selected`, Enter opens it. Runs ahead of `useListNav`, with its ignore rules.
 */
export function useSelectionNav(count: number, selected: number | null, select: (i: number) => void, open: (i: number) => void) {
  const ref = React.useRef({ count, selected, select, open })
  ref.current = { count, selected, select, open }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return
      const target = e.target as HTMLElement
      // A horizontal radio group keeps only ←/→, which this ignores anyway.
      if (target.closest?.(OWNS_KEYS) && !target.closest?.('[role="radio"], [role="radiogroup"]')) return
      const { count, selected, select, open } = ref.current
      if (e.key === 'Enter') {
        if (selected === null || target.closest?.('button, a')) return
        e.preventDefault()
        open(selected)
        return
      }
      if (!NAV_KEYS.includes(e.key) || e.key === 'ArrowLeft' || e.key === 'ArrowRight') return
      e.preventDefault()
      // Held keys repeat faster than the address re-renders.
      ref.current.selected = nextIndex(selected ?? -1, count, e.key)
      select(ref.current.selected)
    }
    // Capture runs before the focused control and before `useListNav` on window; a radio group's Home/End would take the keys otherwise.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])
}

/** The 0-based row `?<name>=<1-based n>` names, or null. */
export function listParam(params: URLSearchParams, name: string, count = Infinity) {
  const n = Number(params.get(name))
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : null
}

/** Writes one list's `?<name>=<value>`, replaced rather than pushed; null removes it. */
export function useWriteListParam() {
  const [, setParams] = useSearchParams()
  return (name: string, value: string | null) =>
    setParams((p) => { if (value === null) p.delete(name); else p.set(name, value); return p }, { replace: true })
}

/** A list's selected row kept in the address as `?<name>=<1-based n>`; replaces rather than pushes. */
export function useListParam(name: string, count: number) {
  const [params] = useSearchParams()
  const write = useWriteListParam()
  const selected = listParam(params, name, count)
  const select = (i: number | null) => write(name, i === null ? null : String(i + 1))
  return [selected, select] as const
}

export function OptionRow({ selected, onClick, children, trailing, className, navKey }: {
  selected?: boolean; onClick: () => void; children: React.ReactNode; trailing?: React.ReactNode; className?: string
  /** The row's `<param>:<key>` place in the address. */
  navKey?: string
}) {
  return (
    <div className={cn('flex min-h-12 items-center border-b border-edge last:border-b-0', selected && 'bg-cyan/[0.06]', className)}>
      <button
        type="button"
        data-opt
        data-nav={navKey}
        aria-pressed={selected}
        onClick={onClick}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] active:bg-white/[0.06]"
      >
        <span className="min-w-0 flex-1">{children}</span>
        {selected && <Check className="size-4 shrink-0 text-cyan" />}
      </button>
      {trailing}
    </div>
  )
}

export function RecentRow({ items, render, onPick }: { items: string[]; render?: (v: string) => React.ReactNode; onPick: (v: string) => void }) {
  const t = useT()
  if (!items.length) return null
  return (
    <div className="mt-3">
      <div className="section-label mb-1.5">{t('pickers.recent')}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((v) => (
          <button key={v} type="button" data-opt data-nav={`recent:${v}`} onClick={() => onPick(v)}
            className="h-9 shrink-0 rounded-[2px] border border-edge bg-chip px-3 font-mono text-[13px] text-ink hover:border-grid-strong">
            {render ? render(v) : v}
          </button>
        ))}
      </div>
    </div>
  )
}

const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  return (h ^ (h >>> 13)) >>> 0
}

/** The game's portrait for a name; names without one (unknown, None, Henry) get an initials placeholder. */
export function PortraitTile({ name, size = 64, className }: { name: string; size?: number; className?: string }) {
  const file = (portraits as Record<string, string>)[name]
  if (file) return <img src={`${import.meta.env.BASE_URL}portraits/${file}`} alt={name} width={size} height={size} className={cn('shrink-0 rounded-[2px] bg-field object-cover object-top', className)} style={{ width: size, height: size }} />
  const h = hash(name || '?')
  const hue = h % 360
  const words = (name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
  const initials = name === 'None' ? '' : ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.match(/\d/)?.[0] ?? '')).toUpperCase()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={name} className={cn('shrink-0 rounded-[2px]', className)}>
      <rect width="64" height="64" fill={`hsl(${hue} 45% 13%)`} />
      <circle cx="32" cy="26" r="11" fill={`hsl(${hue} 40% 24%)`} />
      <path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill={`hsl(${hue} 40% 24%)`} />
      {name === 'None'
        ? <path d="M20 20l24 24M44 20L20 44" stroke="var(--color-dim)" strokeWidth="2" />
        : <text x="32" y="58" textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize="12" fill={`hsl(${hue} 80% 75%)`}>{initials}</text>}
    </svg>
  )
}

/** Line silhouette; the hull grows with size class and the name varies the wings. */
export function ShipSilhouette({ size, name = '', className }: { size: 'Small' | 'Medium' | 'Large'; name?: string; className?: string }) {
  const v = hash(name) % 3
  const paths = {
    Small: ['M40 8L50 34L40 30L30 34Z', 'M40 8L46 24L58 32L40 28L22 32L34 24Z', 'M40 10L44 30L54 34L40 32L26 34L36 30Z'][v],
    Medium: ['M40 4L48 16L66 30L48 30L40 36L32 30L14 30L32 16Z', 'M40 4L50 20L68 22L50 32L40 36L30 32L12 22L30 20Z', 'M36 4H44L50 18L70 26V32H10V26L30 18Z'][v],
    Large: ['M40 2L52 10L56 22L74 28L56 34L40 38L24 34L6 28L24 22L28 10Z', 'M30 2H50L58 14L76 20L58 30L50 38H30L22 30L4 20L22 14Z', 'M40 2L60 12V26L76 34H4L20 26V12Z'][v],
  }
  return (
    <svg viewBox="0 0 80 40" className={cn('h-10 w-20', className)} aria-hidden>
      <path d={paths[size]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M40 12V28" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  )
}

const FACTION_COLOURS: Record<string, string> = {
  Russian: '#ff5a5a', USA: '#35a0f5', China: '#ffab3d', Independent: '#bcdbe6', Pirates: '#b06cff',
}
export const factionName = (key: string) => STATION_FACTIONS.find((f) => f.key === key)?.name ?? key

export function FactionDot({ faction, className }: { faction: string; className?: string }) {
  return <span title={factionName(faction)} className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: FACTION_COLOURS[faction] ?? 'var(--color-dim)' }} />
}

export type GoodsCategory = 'ore' | 'metal' | 'food' | 'medical' | 'tech' | 'weapon' | 'fabric' | 'fuel' | 'salvage' | 'contraband' | 'gem' | 'other'
export function goodsCategory(g: string): GoodsCategory {
  if (/Escape|Angler|Automaton|Drone|Zentarks/.test(g)) return 'salvage'
  if (/Narcotics|Slaves/.test(g)) return 'contraband'
  if (/Medicine/.test(g)) return 'medical'
  if (/Grain|Fish|Tea|Meat|Fruit|Water/.test(g)) return 'food'
  if (/Computer|Robotics|Appliances|Survival/.test(g)) return 'tech'
  if (/Weapons/.test(g)) return 'weapon'
  if (/Fabric|Leather|Clothing/.test(g)) return 'fabric'
  if (/Oil|Fuel|Oxygen|Methane|Lithium/.test(g)) return 'fuel'
  if (/Diamond|Alexandrite|Painite|Opal|Musgravite|Bromellite/.test(g)) return 'gem'
  if (/Aluminium|Gold|Titanium|Copper|Iron|Platinum|Thorium|Uranium$|Samarium|Hafnium|Thallium|Tantalum/.test(g)) return 'metal'
  if (/ite$|Coltan/.test(g)) return 'ore'
  return 'other'
}

export function GoodsIcon({ goods, className }: { goods: string; className?: string }) {
  const c = goodsCategory(goods)
  const shape: Record<GoodsCategory, React.ReactNode> = {
    ore: <path d="M4 14L7 6L13 4L17 10L14 16H7Z" />,
    metal: <path d="M3 13H17L15 8H5Z M5 8L7 5H13L15 8" />,
    food: <path d="M10 17C5 17 4 12 4 10C4 6 7 5 10 7C13 5 16 6 16 10C16 12 15 17 10 17Z M10 7V3" />,
    medical: <path d="M8 3H12V8H17V12H12V17H8V12H3V8H8Z" />,
    tech: <path d="M5 5H15V15H5Z M8 8H12V12H8Z M5 10H2 M18 10H15 M10 5V2 M10 18V15" />,
    weapon: <path d="M3 17L13 7L15 3L17 5L13 9L3 17 M9 9L11 11" />,
    fabric: <path d="M3 5C6 3 8 7 10 5C12 3 14 7 17 5V15C14 17 12 13 10 15C8 17 6 13 3 15Z" />,
    fuel: <path d="M10 3C13 8 15 10 15 13A5 5 0 0 1 5 13C5 10 7 8 10 3Z" />,
    salvage: <path d="M10 3L17 7V13L10 17L3 13V7Z M3 7L10 11L17 7 M10 11V17" />,
    contraband: <path d="M10 3L17 16H3Z M10 8V12 M10 14V14.5" />,
    gem: <path d="M5 4H15L18 8L10 17L2 8Z M2 8H18" />,
    other: <path d="M4 4H16V16H4Z" />,
  }
  return (
    <svg viewBox="0 0 20 20" className={cn('size-5 shrink-0 text-cyan', className)} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      {shape[c]}
    </svg>
  )
}

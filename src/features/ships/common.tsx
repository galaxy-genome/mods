import { ChevronRight, Plus } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useShellHeader } from '@/components/layout/shell'
import { shipByKey } from '@/lib/reference'
import type { QuestContent, Step } from '@/lib/types'
import { cn } from '@/lib/utils'
import { t, useT } from '@/i18n'
import { questOf, updateQuest, updateWithUndo, usePart } from '@/store/editor'

/** The current mod, quest and step from the route, plus a mutator scoped to that step. */
export function useStepRoute() {
  const { modId = '', stepId = '' } = useParams()
  const mod = usePart(modId)
  const quest = questOf(mod)
  const index = quest?.steps.findIndex((s) => s.id === stepId) ?? -1
  const step = index >= 0 ? quest!.steps[index] : undefined
  const base = `/mod/${modId}/steps/${stepId}`
  const update = React.useCallback(
    (recipe: (s: Step, q: QuestContent) => void) =>
      updateQuest(modId, (q) => { const s = q.steps.find((x) => x.id === stepId); if (s) recipe(s, q) }),
    [modId, stepId],
  )
  return { modId, stepId, mod, quest, step, index, base, update }
}

export function useStepHeader(title: string, r: ReturnType<typeof useStepRoute>) {
  const subtitle = r.step ? `${t('ships.stepOf', { n: r.index + 1, total: r.quest!.steps.length })}${r.step.name ? ` · ${r.step.name}` : ''}` : undefined
  useShellHeader({ title, subtitle, back: r.base }, [title, subtitle, r.base])
}

/** Runs a change with an exact undo toast. */
export function undoToast(modId: string, message: string, change: () => void) {
  updateWithUndo(modId, message, change)
}

export function StepMissing() {
  const t = useT()
  return <p className="p-6 text-center text-ink">{t('ships.stepMissing')}</p>
}

/** Renders a translated template, putting each `{var}` node in place. */
export function rich(template: string, vars: Record<string, React.ReactNode>): React.ReactNode {
  return template.split(/\{(\w+)\}/).map((part, i) => <React.Fragment key={i}>{i % 2 ? vars[part] : part}</React.Fragment>)
}

/** Line-art ship silhouette; the outline grows with the hull size. */
export function ShipArt({ model, className, color }: { model: string; className?: string; color?: string }) {
  const size = shipByKey(model)?.size ?? 'Small'
  const paths = {
    Small: ['M12 3l4 9-4 2-4-2z', 'M8 12l-3 6 7-2 7 2-3-6'],
    Medium: ['M12 2l3 7v6l-3 2-3-2V9z', 'M9 10l-6 5 1 3 5-2M15 10l6 5-1 3-5-2', 'M10 17l-1 4h6l-1-4'],
    Large: ['M12 1l2.5 5v11L12 20l-2.5-3V6z', 'M9.5 7L3 11v6l6.5-2M14.5 7L21 11v6l-6.5-2', 'M3 11v-3M21 11v-3', 'M10 19l-2 4h8l-2-4'],
  }[size]
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={1.2} strokeLinejoin="round" className={className} aria-hidden>
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

/** A field-styled button that opens a picker. */
export function PickerButton({ icon, children, onClick, placeholder, disabled, warn, invalid, className, label }: {
  icon?: React.ReactNode; children?: React.ReactNode; onClick: () => void; placeholder?: string; disabled?: boolean; warn?: boolean; invalid?: boolean; className?: string; label?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-2.5 rounded-[2px] border bg-field px-3 text-left font-mono text-[15px] transition-colors hover:border-cyan disabled:opacity-40 disabled:hover:border-edge',
        invalid ? 'border-danger' : warn ? 'border-amber' : 'border-edge',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-cyan [&_svg]:size-[18px]">{icon}</span>}
      <span className={cn('min-w-0 flex-1 truncate', children ? 'text-white' : 'text-dim')}>{children || placeholder}</span>
      <ChevronRight className="size-4 shrink-0 text-dim" />
    </button>
  )
}

/** Floating add button above the bottom tabs. */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-20 flex h-12 items-center gap-2 rounded-[4px] border border-cyan bg-deep px-4 font-semibold text-cyan transition-colors hover:bg-cyan/10 active:bg-cyan/20 lg:bottom-6 lg:right-6"
    >
      <Plus className="size-5" />{label}
    </button>
  )
}

/** Number input that allows a transient empty or "-" value while typing. */
export function NumberInput({ value, onChange, id, min, max, ariaLabel, className, warn }: {
  value: number; onChange: (v: number) => void; id?: string; min?: number; max?: number; ariaLabel?: string; className?: string; warn?: boolean
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => { if (Number(text) !== value) setText(String(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      inputMode="numeric"
      value={text}
      data-warn={warn || undefined}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d-]/g, '')
        setText(t)
        const n = Number(t)
        if (t !== '' && t !== '-' && Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
      }}
      onBlur={() => setText(String(value))}
      className={cn('h-11 w-full rounded-[2px] border border-edge bg-field px-3 font-mono text-[15px] text-ink outline-none transition-colors focus:border-cyan data-[warn=true]:border-amber', className)}
    />
  )
}

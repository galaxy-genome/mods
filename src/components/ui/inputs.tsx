import * as SliderPrimitive from '@radix-ui/react-slider'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Minus, Plus, Search, X } from 'lucide-react'
import * as React from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-[2px] border border-edge bg-field px-3 font-mono text-[15px] text-ink placeholder:text-dim outline-none transition-colors focus:border-cyan aria-[invalid=true]:border-danger data-[warn=true]:border-amber disabled:opacity-50'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; warn?: boolean }>(
  ({ className, invalid, warn, ...props }, ref) => (
    <input ref={ref} aria-invalid={invalid || undefined} data-warn={warn || undefined} className={cn(fieldBase, 'h-11', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export function SearchInput({ value, onChange, placeholder, autoFocus, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="pl-9 pr-10" type="text" inputMode="search" enterKeyHint="search" />
      {value && (
        <button aria-label={t('ui.clearSearch')} onClick={() => onChange('')} className="absolute right-0 top-0 grid size-11 place-items-center text-dim hover:text-white">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

/** Multiline, auto-growing, with a counter that turns amber then red. */
export function Textarea({ value, onChange, max, warnAt, placeholder, rows = 3, className, id, blocked, onBlocked }: {
  value: string
  onChange: (v: string) => void
  max?: number
  warnAt?: number
  placeholder?: string
  rows?: number
  className?: string
  id?: string
  /** Characters to refuse as they are typed. */
  blocked?: string
  onBlocked?: (ch: string) => void
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  const len = value.length
  const tone = max && len > max ? 'text-danger' : warnAt && len > warnAt ? 'text-amber' : 'text-dim'
  return (
    <div className="relative">
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          let v = e.target.value
          if (blocked) {
            const hit = [...v].find((c) => blocked.includes(c))
            if (hit) { onBlocked?.(hit); v = [...v].filter((c) => !blocked.includes(c)).join('') }
          }
          onChange(v)
        }}
        data-warn={(max && len > max) || undefined}
        className={cn(fieldBase, 'resize-none py-2.5 leading-relaxed', max && 'pb-6', className)}
      />
      {max !== undefined && <span className={cn('pointer-events-none absolute bottom-1.5 right-2.5 font-mono text-[11px]', tone)}>{len}/{max}</span>}
    </div>
  )
}

export function Switch({ checked, onCheckedChange, id, disabled, label }: {
  checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; label?: string
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full border border-edge bg-edge/60 p-[3px] transition-colors data-[state=checked]:border-cyan data-[state=checked]:bg-cyan/25 disabled:opacity-40 before:absolute before:-inset-2 before:content-['']"
    >
      <SwitchPrimitive.Thumb className="block size-[18px] rounded-full bg-dim transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-cyan" />
    </SwitchPrimitive.Root>
  )
}

/** A row with a label, optional help, and a switch on the right. */
export function SwitchRow({ label, help, checked, onCheckedChange, icon, fieldKey, disabled }: {
  label: React.ReactNode; help?: React.ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; icon?: React.ReactNode; fieldKey?: string; disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div data-field={fieldKey} className="flex min-h-11 items-center gap-3 rounded-[2px]">
      {icon && <span className="text-ink [&_svg]:size-4">{icon}</span>}
      <label htmlFor={id} className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14px] text-white">{label}</span>
        {help && <span className="text-[12px] leading-snug text-ink/75">{help}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', ariaLabel }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; disabled?: boolean }[]
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={ariaLabel}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn('grid w-full rounded-[2px] border border-edge bg-field p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            'flex items-center justify-center rounded-[2px] px-1.5 text-center font-ui font-semibold text-ink transition-colors data-[state=on]:bg-cyan/15 data-[state=on]:text-cyan data-[state=on]:shadow-[inset_0_0_0_1px_var(--color-cyan)] disabled:opacity-40',
            size === 'sm' ? 'h-9 text-[12px]' : 'min-h-10 text-[13px]',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export function Stepper({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, unit, className, id }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; className?: string; id?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className={cn('flex h-11 items-stretch rounded-[2px] border border-edge bg-field', className)}>
      <button aria-label={t('ui.decrease')} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className="grid w-11 place-items-center text-ink disabled:opacity-30 active:bg-white/5">
        <Minus className="size-4" />
      </button>
      <div className="flex flex-1 items-center justify-center gap-1 border-x border-edge">
        <input
          id={id}
          inputMode="numeric"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(e) => { const n = Number(e.target.value.replace(/[^\d-]/g, '')); if (Number.isFinite(n)) onChange(clamp(n)) }}
          className="w-full min-w-0 bg-transparent text-center font-mono text-[15px] text-white outline-none"
        />
        {unit && <span className="pr-2 font-mono text-[12px] text-dim">{unit}</span>}
      </div>
      <button aria-label={t('ui.increase')} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className="grid w-11 place-items-center text-ink disabled:opacity-30 active:bg-white/5">
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, className, ariaLabel, tone = 'cyan' }: {
  value: number[]; onChange: (v: number[]) => void; min?: number; max?: number; step?: number; className?: string; ariaLabel?: string; tone?: 'cyan' | 'amber'
}) {
  return (
    <SliderPrimitive.Root
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={onChange}
      className={cn('relative flex h-11 w-full touch-none select-none items-center', className)}
    >
      <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-edge">
        <SliderPrimitive.Range className={cn('absolute h-full rounded-full', tone === 'amber' ? 'bg-amber' : 'bg-cyan')} />
      </SliderPrimitive.Track>
      {value.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn('block size-6 rounded-full border-2 bg-void outline-none transition-transform focus-visible:ring-2 focus-visible:ring-cyan active:scale-110', tone === 'amber' ? 'border-amber' : 'border-cyan')}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export function Chip({ children, selected, onClick, onRemove, className, tone }: {
  children: React.ReactNode; selected?: boolean; onClick?: () => void; onRemove?: () => void; className?: string; tone?: 'amber' | 'danger'
}) {
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? !!selected : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      className={cn(
        'inline-flex h-9 cursor-default select-none items-center gap-1.5 rounded-[2px] border px-3 font-mono text-[13px] transition-colors',
        onClick && 'cursor-pointer',
        selected ? 'border-cyan bg-cyan/10 text-cyan' : 'border-edge bg-chip text-ink hover:border-grid-strong',
        tone === 'amber' && 'border-amber text-amber',
        tone === 'danger' && 'border-danger text-danger',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button aria-label={t('ui.remove')} onClick={(e) => { e.stopPropagation(); onRemove() }} className="-mr-2 grid size-7 place-items-center text-dim hover:text-white">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}

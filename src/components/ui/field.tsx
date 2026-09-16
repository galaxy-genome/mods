import * as Popover from '@radix-ui/react-popover'
import { AlertTriangle, Info, XCircle } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { useEditor } from '@/store/editor'

/** Label, control, always-visible help line, optional info popover and validation message. */
export function Field({
  label, help, info, error, warning, children, fieldKey, htmlFor, className, advancedKey, action, learnMore,
}: {
  label: React.ReactNode
  help?: React.ReactNode
  info?: React.ReactNode
  error?: React.ReactNode
  warning?: React.ReactNode
  children: React.ReactNode
  /** Target for Problems navigation (data-field). */
  fieldKey?: string
  htmlFor?: string
  className?: string
  /** Raw JSON key, shown in Advanced view. */
  advancedKey?: string
  action?: React.ReactNode
  /** Help article path, shown as "Learn more ›". */
  learnMore?: string
}) {
  return (
    <div
      data-field={fieldKey}
      onFocusCapture={() => setFocusedField({ label, help, info, learnMore })}
      className={cn('flex flex-col gap-1.5 rounded-[2px]', className)}
    >
      <div className="flex min-h-5 items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-white">{label}</label>
        {advancedKey && <AdvancedKey k={advancedKey} />}
        {info && <InfoPopover learnMore={learnMore}>{info}</InfoPopover>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[12px] text-danger"><XCircle className="mt-px size-3.5" />{error}</p>
      ) : warning ? (
        <p className="flex items-start gap-1.5 text-[12px] text-amber"><AlertTriangle className="mt-px size-3.5" />{warning}</p>
      ) : help ? (
        <p className="text-[12px] leading-snug text-ink/75">{help}</p>
      ) : null}
    </div>
  )
}

export function InfoPopover({ children, label, learnMore }: { children: React.ReactNode; label?: string; learnMore?: string }) {
  const t = useT()
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={label ?? t('ui.moreInfo')} className="-m-2 grid size-8 place-items-center rounded-full text-dim hover:text-cyan">
        <Info className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-[80] max-w-[300px] rounded-[4px] border border-edge bg-deep p-3 text-[13px] leading-relaxed text-ink shadow-none data-[state=open]:animate-in"
        >
          {children}
          {learnMore && <LearnMore to={learnMore} className="mt-2 block" />}
          <Popover.Arrow className="fill-edge" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}


export function AdvancedKey({ k }: { k: string }) {
  const advanced = useEditor((s) => s.settings.advanced)
  if (!advanced) return null
  return <code className="font-mono text-[11px] text-dim">{k}</code>
}

export function LearnMore({ to, className }: { to: string; className?: string }) {
  const t = useT()
  return <Link to={to} className={cn('text-[13px] font-semibold text-cyan hover:underline', className)}>{t('ui.learnMore')}</Link>
}

/* ---------- the field that last had focus, read by the desktop inspector ---------- */

export interface FocusedField { label: React.ReactNode; help?: React.ReactNode; info?: React.ReactNode; learnMore?: string }
let focused: FocusedField | null = null
const listeners = new Set<() => void>()

function setFocusedField(f: FocusedField | null) {
  focused = f
  listeners.forEach((l) => l())
}

export function clearFocusedField() {
  setFocusedField(null)
}

export function useFocusedField() {
  return React.useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => focused)
}

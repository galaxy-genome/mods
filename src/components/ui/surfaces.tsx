import { AlertTriangle, ChevronDown, ChevronRight, Lightbulb, Sparkles, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import * as React from 'react'
import { t } from '@/i18n'
import type { Severity } from '@/lib/types'
import { cn } from '@/lib/utils'
import { dismissTip, useEditor } from '@/store/editor'

export function SectionLabel({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-6 items-center justify-between gap-2', className)}>
      <h2 className="section-label">{children}</h2>
      {action}
    </div>
  )
}

export function Card({ className, children, tone, ...props }: React.ComponentProps<'div'> & { tone?: 'cyan' | 'amber' | 'danger' | 'success' }) {
  return (
    <div
      className={cn(
        'rounded-[4px] border bg-panel shadow-[inset_0_1px_0_rgba(53,224,245,0.08)]',
        tone === 'cyan' ? 'border-grid-strong bg-cyan/[0.06]' : tone === 'amber' ? 'border-amber' : tone === 'danger' ? 'border-danger' : tone === 'success' ? 'border-success/60' : 'border-edge',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** A tappable row: icon, title, subtitle, trailing value and chevron. */
export function ListRow({
  icon, title, subtitle, value, onClick, chevron = true, className, trailing, muted, fieldKey, href, nav,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  value?: React.ReactNode
  onClick?: () => void
  chevron?: boolean
  className?: string
  trailing?: React.ReactNode
  muted?: boolean
  fieldKey?: string
  href?: string
  /** A row in a keyboard-navigable list. */
  nav?: boolean
}) {
  const inner = (
    <>
      {icon && <span className={cn('grid size-6 shrink-0 place-items-center [&_svg]:size-5', muted ? 'text-dim' : 'text-cyan')}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className={cn('truncate text-[15px]', muted ? 'text-ink' : 'text-white')}>{title}</span>
        {subtitle && <span className="truncate text-[12px] text-dim">{subtitle}</span>}
      </span>
      {value !== undefined && <span className={cn('shrink-0 font-mono text-[12px]', muted ? 'text-dim' : 'text-ink')}>{value}</span>}
      {trailing}
      {chevron && <ChevronRight className="size-4 shrink-0 text-dim" />}
    </>
  )
  const cls = cn('flex min-h-12 w-full items-center gap-3 px-3 py-2 transition-colors', (onClick || href) && 'hover:bg-white/[0.03] active:bg-white/[0.06]', className)
  if (href) return <a data-field={fieldKey} data-opt={nav || undefined} href={href} className={cls}>{inner}</a>
  if (onClick) return <button data-field={fieldKey} data-opt={nav || undefined} type="button" onClick={onClick} className={cls}>{inner}</button>
  return <div data-field={fieldKey} className={cls}>{inner}</div>
}

/** Rows separated by hairlines inside one card. */
export function RowGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn('divide-y divide-edge overflow-hidden', className)}>{children}</Card>
}

export function Badge({ children, tone = 'dim', className, icon }: { children: React.ReactNode; tone?: 'dim' | 'cyan' | 'amber' | 'danger' | 'success'; className?: string; icon?: React.ReactNode }) {
  const tones = {
    dim: 'border-edge text-ink',
    cyan: 'border-cyan/70 text-cyan',
    amber: 'border-amber text-amber',
    danger: 'border-danger text-danger',
    success: 'border-success/70 text-success',
  }
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-[2px] border px-1.5 font-mono text-[11px] leading-none [&_svg]:size-3', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  if (severity === 'error') return <XCircle className={cn('text-danger', className)} />
  if (severity === 'warning') return <AlertTriangle className={cn('text-amber', className)} />
  return <Sparkles className={cn('text-cyan', className)} />
}

/** A collapsible section; when closed, the summary line describes its contents. */
export function Section({ title, summary, children, defaultOpen = true, id, action }: {
  title: string; summary?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; id?: string; action?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <section id={id} className="border-b border-edge last:border-b-0">
      <div className="flex items-center">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 flex-1 items-center gap-3 px-4 py-2 text-left">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="section-label">{title}</span>
            {!open && summary && <span className="truncate text-[14px] text-ink">{summary}</span>}
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-dim transition-transform', open && 'rotate-180')} />
        </button>
        {action && <div className="pr-2">{action}</div>}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="flex flex-col gap-5 px-4 pb-6 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export function EmptyState({ icon, title, body, action, className }: { icon: React.ReactNode; title?: string; body: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid-texture flex flex-col items-center gap-4 rounded-[4px] border border-dashed border-edge px-6 py-10 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-full border border-edge text-cyan [&_svg]:size-6">{icon}</span>
      {title && <h3 className="text-[17px] font-semibold text-white">{title}</h3>}
      <p className="max-w-[300px] text-[14px] leading-relaxed text-ink">{body}</p>
      {action}
    </div>
  )
}

/** A one-sentence explainer shown the first time a screen opens. */
export function TipCard({ tipKey, children, className }: { tipKey: string; children: React.ReactNode; className?: string }) {
  const hidden = useEditor((s) => !s.settings.tips || s.settings.dismissedTips.includes(tipKey))
  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className={cn('flex items-start gap-3 rounded-[4px] border border-grid-strong bg-cyan/[0.06] py-2.5 pl-3 pr-1', className)}>
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-cyan" />
            <p className="flex-1 text-[13px] leading-relaxed text-ink">{children}</p>
            <button aria-label={t('ui.dismissTip')} onClick={() => dismissTip(tipKey)} className="-my-1 grid size-9 shrink-0 place-items-center text-dim hover:text-white">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Sentence-style summary card for a condition, order, ship etc. */
export function SentenceCard({ icon, children, onClick, tone, trailing, className, fieldKey, nav }: {
  icon: React.ReactNode; children: React.ReactNode; onClick?: () => void; tone?: 'cyan' | 'amber' | 'danger'; trailing?: React.ReactNode; className?: string; fieldKey?: string
  /** A row in a keyboard-navigable list. */
  nav?: boolean
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      data-field={fieldKey}
      data-opt={nav || undefined}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] w-full items-center gap-3 rounded-[4px] border px-3 py-2 text-left transition-colors',
        tone === 'cyan' ? 'border-grid-strong bg-cyan/[0.06]' : tone === 'amber' ? 'border-amber bg-amber/[0.05]' : tone === 'danger' ? 'border-danger/70 bg-danger/[0.05]' : 'border-edge bg-panel',
        onClick && 'hover:border-cyan active:bg-white/[0.04]',
        className,
      )}
    >
      <span className="shrink-0 [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug text-white">{children}</span>
      {trailing}
    </Comp>
  )
}

/** Mono value with cyan emphasis inside sentences: “Ship <Em>Olivia</Em> is destroyed”. */
export const Em = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-cyan">{children}</span>

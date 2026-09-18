import { CheckCircle2, ChevronRight, EyeOff } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { SeverityIcon } from '@/components/ui/surfaces'
import { useProblems } from '@/hooks/use-problems'
import { useT } from '@/i18n'
import type { Problem, Severity } from '@/lib/types'
import { cn } from '@/lib/utils'
import { dismissTip, useEditor, usePart } from '@/store/editor'

const TABS: { key: Severity; label: string; tone: string }[] = [
  { key: 'error', label: 'problems.errors', tone: 'text-danger' },
  { key: 'warning', label: 'problems.warnings', tone: 'text-amber' },
  { key: 'tip', label: 'problems.tips', tone: 'text-cyan' },
]

const tipKey = (modId: string, p: Problem) => `problem:${modId}:${p.id}`

/**
 * Errors, warnings and tips for one mod, used by the Problems sheet and the desktop inspector.
 * `replace` swaps the current history entry when going to a problem, so a sheet held in the URL does not come back.
 */
export function ProblemsList({ modId, active = true, replace, onNavigate }: { modId: string; active?: boolean; replace?: boolean; onNavigate?: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const mod = usePart(modId)
  const dismissed = useEditor((s) => s.settings.dismissedTips)
  const { errors, warnings, tips: allTips } = useProblems(modId)
  const tips = allTips.filter((p) => !dismissed.includes(tipKey(modId, p)))
  const lists = { error: errors, warning: warnings, tip: tips }
  const [tab, setTab] = React.useState<Severity>('error')

  React.useEffect(() => {
    if (active) setTab(errors.length ? 'error' : warnings.length ? 'warning' : tips.length ? 'tip' : 'error')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, modId])

  const go = (path: string) => {
    navigate(path, { replace })
    onNavigate?.()
  }
  const goTo = (p: Problem) => {
    const q = new URLSearchParams({ sev: p.severity })
    if (p.location.field) q.set('field', p.location.field)
    go(`/mod/${modId}/${p.location.path}?${q}`)
  }

  const total = errors.length + warnings.length + tips.length
  const list = lists[tab]

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label={t('problems.severity')} className="sticky top-0 z-10 -mx-4 mb-3 grid grid-cols-3 border-b border-edge bg-deep px-4">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={cn('flex h-11 items-center justify-center gap-2 border-b-2 text-[14px] transition-colors', tab === tb.key ? 'border-cyan text-white' : 'border-transparent text-dim hover:text-ink')}
          >
            {t(tb.label)}
            <span className={cn('font-mono text-[12px]', lists[tb.key].length ? tb.tone : 'text-dim')}>{lists[tb.key].length}</span>
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="grid-texture flex flex-col items-center gap-3 rounded-[4px] border border-dashed border-edge px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full border border-success/60 text-success"><CheckCircle2 className="size-6" /></span>
          <h3 className="text-[17px] font-semibold text-white">{t('problems.none')}</h3>
          <p className="max-w-[300px] text-[14px] leading-relaxed text-ink">
            {mod?.meta.type === 'stars' ? t('problems.noneStars') : t('problems.noneQuest')}
          </p>
          {mod?.meta.type === 'quest' && <Button variant="primary" onClick={() => go(`/mod/${modId}/test`)}>{t('problems.testIt')}</Button>}
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-dim">{t(`problems.no_${tab}`)}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-edge rounded-[4px] border border-edge bg-panel">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-1 pr-1">
              <button type="button" data-opt data-nav={`problem:${p.id}`} onClick={() => goTo(p)} className="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <SeverityIcon severity={p.severity} className="mt-0.5 size-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] leading-snug text-white">{p.message}</span>
                  <span className="truncate font-mono text-[11px] text-dim">{p.location.label}</span>
                </span>
                {!p.fix && <span className="flex shrink-0 items-center self-center text-[13px] text-cyan">{t('problems.goTo')}<ChevronRight className="size-4" /></span>}
              </button>
              {p.fix && <Button variant="secondary" size="sm" className="mb-2 ml-10 basis-full self-start" onClick={() => p.fix!.apply()}>{p.fix.label}</Button>}
              {p.severity === 'tip' && (
                <button type="button" aria-label={t('problems.hideTip')} onClick={() => dismissTip(tipKey(modId, p))} className="grid size-11 shrink-0 place-items-center text-dim hover:text-white">
                  <EyeOff className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {tab === 'tip' && tips.length > 1 && (
        <Button variant="text" className="mt-3 self-start" onClick={() => tips.forEach((p) => dismissTip(tipKey(modId, p)))}>{t('problems.hideAllTips')}</Button>
      )}
    </div>
  )
}

export function ProblemsSheet({ modId, open, onOpenChange }: { modId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('problems.title')}>
      <ProblemsList modId={modId} active={open} replace />
    </Sheet>
  )
}

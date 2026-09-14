import { Check, Languages } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'
import { Page, useShellHeader } from '@/components/layout/shell'
import { SwitchRow, Textarea } from '@/components/ui/inputs'
import { EmptyState, SectionLabel } from '@/components/ui/surfaces'
import { useIsDesktop } from '@/hooks/use-media-query'
import { LANGS } from '@/lib/reference'
import type { Lang, QuestView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateQuest, usePart } from '@/store/editor'
import { textFields } from './translation'
import { useT } from '@/i18n'

export function TranslatePage() {
  const { modId = '', lang = '' } = useParams()
  const t = useT()
  const mod = usePart(modId) as QuestView | undefined
  const desktop = useIsDesktop()
  const [onlyMissing, setOnlyMissing] = React.useState(false)
  const info = LANGS.find((l) => l.key === lang)
  useShellHeader({ title: t('output.trTitle', { name: info?.name ?? lang }), back: `/mod/${modId}/overview`, hideTabs: true }, [modId, lang])

  const original = mod?.versions[mod.primaryLang]
  const target = mod?.versions[lang as Lang]
  if (!mod || !original || !target || lang === mod.primaryLang) {
    return <Page><EmptyState icon={<Languages />} title={t('output.trNoVersion')} body={t('output.trNoVersionBody')} /></Page>
  }

  const fields = textFields(original)
  const done = fields.filter((f) => f.get(target).trim()).length
  const shown = onlyMissing ? fields.filter((f) => !f.get(target).trim()) : fields
  const pct = fields.length ? (done / fields.length) * 100 : 100

  let lastGroup = ''
  return (
    <Page>
      <p className="text-[13px] leading-relaxed text-ink">{t('output.trFollows', { primary: LANGS.find((l) => l.key === mod.primaryLang)?.name ?? mod.primaryLang })}</p>
      <div className="sticky top-14 z-20 -mx-4 flex flex-col gap-2 border-b border-edge bg-void/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-center justify-between font-mono text-[12px]">
          <span className={done === fields.length ? 'text-success' : 'text-ink'}>{t('output.trCount', { done, total: fields.length })}</span>
          {done === fields.length && <Check className="size-4 text-success" />}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-edge" role="progressbar" aria-valuenow={done} aria-valuemax={fields.length} aria-label={t('output.trProgress')}>
          <div className="h-full bg-cyan transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <SwitchRow label={t('output.trOnlyMissing')} checked={onlyMissing} onCheckedChange={setOnlyMissing} />
      </div>

      {shown.length === 0 && <EmptyState icon={<Check />} title={t('output.trAllDone')} body={t('output.trAllDoneBody')} />}

      <div className="flex flex-col gap-4">
        {shown.map((f) => {
          const header = f.group !== lastGroup ? (lastGroup = f.group) : null
          const value = f.get(target)
          return (
            <React.Fragment key={f.key}>
              {header && <SectionLabel className="mt-2">{header}</SectionLabel>}
              <div className={cn('grid gap-2', desktop && 'grid-cols-2')}>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] text-dim">{f.label} · {LANGS.find((l) => l.key === mod.primaryLang)?.label}</span>
                  <p className="rounded-[2px] border border-edge/60 bg-deep px-3 py-2.5 text-[14px] leading-relaxed text-ink/70">{f.get(original)}</p>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={cn('text-[12px]', value.trim() ? 'text-dim' : 'text-amber')}>{value.trim() ? `${f.label} · ${info?.label}` : t('output.trNeeds')}</span>
                  <Textarea rows={1} value={value} onChange={(v) => updateQuest(modId, (q) => f.set(q, v), lang as Lang)} placeholder={f.get(original)} />
                </label>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </Page>
  )
}

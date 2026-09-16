import { Check, Copy, Pencil, XCircle } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/inputs'
import { questOf, usePart } from '@/store/editor'
import { copyText, jumpLabels, pretty, stepJson, toGameJson } from './gameJson'
import { useT } from '@/i18n'

export function JsonPage() {
  const { modId = '' } = useParams()
  const t = useT()
  const q = questOf(usePart(modId))
  const [tab, setTab] = React.useState('all')
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  useShellHeader({ title: t('output.jsonTitle'), subtitle: t('output.jsonSubtitle'), back: `/mod/${modId}/overview` }, [modId])
  if (!q) return null

  const labels = jumpLabels(q.steps)
  const stepIndex = q.steps.findIndex((s) => s.id === tab)
  const text = pretty(stepIndex >= 0 ? stepJson(q.steps[stepIndex], labels) : toGameJson(q))
  let error: string | null = null
  if (editing) {
    try { JSON.parse(draft) } catch (e) { error = (e as Error).message }
  }

  return (
    <Page>
      <div className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" aria-label={t('output.jsonPart')} className="flex gap-1.5">
          {[{ id: 'all', label: t('output.jsonWhole') }, ...q.steps.map((s, i) => ({ id: s.id, label: t('output.stepN', { n: i + 1 }) }))].map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              disabled={editing}
              onClick={() => setTab(x.id)}
              className={`h-9 shrink-0 rounded-[2px] border px-3 font-mono text-[12px] disabled:opacity-40 ${tab === x.id ? 'border-cyan bg-cyan/10 text-cyan' : 'border-edge text-ink'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <Segmented
        ariaLabel={t('output.jsonMode')}
        size="sm"
        value={editing ? 'edit' : 'view'}
        onChange={(v) => { setEditing(v === 'edit'); setDraft(text) }}
        options={[{ value: 'view', label: t('output.jsonReadOnly') }, { value: 'edit', label: <span className="flex items-center gap-1.5"><Pencil className="size-3.5" />{t('output.jsonEdit')}</span> }]}
      />

      {editing ? (
        <>
          <textarea
            aria-label={t('output.jsonTitle')}
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[55dvh] w-full resize-y rounded-[2px] border border-edge bg-field p-3 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-cyan aria-[invalid=true]:border-danger"
            aria-invalid={!!error}
          />
          {error ? (
            <p className="flex items-start gap-1.5 text-[13px] text-danger"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-success"><Check className="size-4" />{t('output.jsonValid')}</p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>{t('output.jsonCancel')}</Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!!error}
              onClick={() => {
                toast(t('output.jsonApplyToast'), { description: t('output.jsonApplyToastHint') })
                setEditing(false)
              }}
            >
              {t('output.jsonApply')}
            </Button>
          </div>
        </>
      ) : (
        <div className="relative">
          <Button variant="secondary" size="sm" className="absolute right-2 top-2" onClick={() => copyText(text)}><Copy className="size-3.5" />{t('output.jsonCopy')}</Button>
          <pre className="max-h-[70dvh] overflow-auto rounded-[2px] border border-edge bg-deep p-3 pr-24 font-mono text-[12px] leading-relaxed text-ink">{text}</pre>
        </div>
      )}
    </Page>
  )
}

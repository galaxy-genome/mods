import { MessageSquareQuote, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Segmented, Textarea } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { SwipeRow } from '@/components/ui/gestures'
import { Badge, EmptyState, SectionLabel, TipCard } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { uid } from '@/lib/factory'
import type { Rumor } from '@/lib/types'
import { questOf, updateQuest, updateWithUndo, usePart } from '@/store/editor'
import { t, useT } from '@/i18n'

const RUMOR_MAX = 320
const scopeLabel = (s: Rumor['scope']) => t(s === 'global' ? 'output.ruEveryBar' : 'output.ruThisBar')

export function RumorsPage() {
  const { modId = '' } = useParams()
  useT()
  const q = questOf(usePart(modId))
  const [editing, setEditing] = React.useState<string | null>(null)
  usePulseField()
  if (!q) return null

  const rumor = q.rumors.find((r) => r.id === editing)
  const inSpace = q.settings.startMode === 'space'

  const add = () => {
    const r: Rumor = { id: uid('rumor'), text: '', scope: 'global' }
    updateQuest(modId, (d) => { d.rumors.push(r) })
    setEditing(r.id)
  }
  const patch = (id: string, p: Partial<Rumor>) => updateQuest(modId, (d) => { Object.assign(d.rumors.find((r) => r.id === id)!, p) })
  const remove = (id: string) => {
    const index = q.rumors.findIndex((r) => r.id === id)
    updateWithUndo(modId, t('output.ruDeleted'), () => updateQuest(modId, (d) => { d.rumors.splice(index, 1) }))
    setEditing(null)
  }

  return (
    <Page className="pb-24">
      <TipCard tipKey="rumors">{t('output.ruTip')}</TipCard>
      {q.rumors.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote />}
          title={t('output.ruEmpty')}
          body={t('output.ruEmptyBody')}
          action={<Button variant="primary" onClick={add}><Plus className="size-4" />{t('output.ruAdd')}</Button>}
        />
      ) : (
        <div data-field="rumors" className="flex flex-col gap-2">
          <SectionLabel>{t('output.ruCount', { count: q.rumors.length })}</SectionLabel>
          {q.rumors.map((r) => (
            <SwipeRow key={r.id} actions={[{ label: t('output.ruDelete'), icon: <Trash2 />, tone: 'danger', onAction: () => remove(r.id) }]}>
              <button
                type="button"
                data-opt
                onClick={() => setEditing(r.id)}
                className="flex w-full flex-col gap-2 rounded-[4px] border border-edge bg-panel px-4 py-3 text-left hover:border-cyan"
              >
                <p className="border-l-2 border-grid-strong pl-3 text-[15px] italic leading-relaxed text-white">
                  {r.text ? `“${r.text}”` : <span className="not-italic text-dim">{t('output.ruEmptyRumor')}</span>}
                </p>
                <div className="flex items-center gap-2">
                  <Badge tone={r.scope === 'global' ? 'cyan' : 'dim'}>{scopeLabel(r.scope)}</Badge>
                  {r.scope === 'local' && inSpace && <Badge tone="amber">{t('output.ruNeverHeard')}</Badge>}
                </div>
              </button>
            </SwipeRow>
          ))}
        </div>
      )}

      {q.rumors.length > 0 && (
        <Button
          variant="solid"
          size="icon"
          aria-label={t('output.ruAdd')}
          onClick={add}
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-20 size-14 rounded-[4px] lg:bottom-6"
        >
          <Plus className="size-6" />
        </Button>
      )}

      <Sheet
        open={!!rumor}
        onOpenChange={(v) => !v && setEditing(null)}
        title={t('output.ruRumor')}
        footer={
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => rumor && remove(rumor.id)}><Trash2 className="size-4" />{t('output.ruDelete')}</Button>
            <Button variant="primary" className="flex-1" onClick={() => setEditing(null)}>{t('output.ruDone')}</Button>
          </div>
        }
      >
        {rumor && (
          <div className="flex flex-col gap-5">
            <Field label={t('output.ruRumor')} help={t('output.ruHelp')} advancedKey="text" htmlFor="rumor-text">
              <Textarea id="rumor-text" value={rumor.text} max={RUMOR_MAX} warnAt={240} onChange={(text) => patch(rumor.id, { text })} placeholder={t('output.ruPlaceholder')} />
            </Field>
            <Field
              label={t('output.ruWhere')}
              advancedKey="type"
              help={t('output.ruWhereHelp')}
              warning={rumor.scope === 'local' && inSpace ? t('output.ruNoStation') : undefined}
            >
              <Segmented
                ariaLabel={t('output.ruWhere')}
                value={rumor.scope}
                onChange={(scope) => patch(rumor.id, { scope })}
                options={[{ value: 'global', label: t('output.ruEveryBar') }, { value: 'local', label: t('output.ruThisBarOnly') }]}
              />
            </Field>
          </div>
        )}
      </Sheet>
    </Page>
  )
}

import { AlertTriangle, BellRing, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Stepper } from '@/components/ui/inputs'
import { Card, EmptyState } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { newLine, newStep } from '@/lib/factory'
import { updateWithUndo } from '@/store/editor'
import { LineBubble } from './DialoguePage'
import { LineEditorSheet } from './LineEditorSheet'
import { EmptyNotFound, stepName, useStepRoute } from './shared'

const NEVER = newStep().reminderEverySec

export function ReminderPage() {
  const { modId, quest, step, index, update, base } = useStepRoute()
  const t = useT()
  const [editing, setEditing] = React.useState<string | null>(null)

  useShellHeader({ title: t('steps.reminder'), subtitle: step ? t('steps.stepSubtitle', { n: index + 1, name: stepName(step, index) }) : undefined, back: step ? `${base}/steps/${step.id}` : `${base}/steps` }, [step?.id, step?.name, index])

  if (!quest || !step) return <EmptyNotFound />

  const add = () => {
    const prev = step.reminder.at(-1) ?? step.dialogue.at(-1)
    const line = newLine(prev ? { speaker: prev.speaker, portrait: prev.portrait } : { speaker: quest.settings.charName, portrait: quest.settings.charImage })
    update((s) => { s.reminder.push(line); if (s.reminderEverySec >= NEVER) s.reminderEverySec = 60 })
    setEditing(line.id)
  }

  return (
    <Page className="pb-28">
      <Card tone="amber" className="flex items-start gap-3 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />
        <p className="text-[13px] leading-relaxed text-ink">{t('steps.reminderIgnored')}</p>
      </Card>

      {step.reminder.length === 0 ? (
        <EmptyState icon={<BellRing />} body={t('steps.reminderEmpty')} action={<Button variant="primary" onClick={add}><Plus className="size-4" />{t('steps.addLine')}</Button>} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {step.reminder.map((line, i) => (
              <LineBubble key={line.id} line={line} steps={quest.steps} contact={quest.settings.charName} onClick={() => setEditing(line.id)} label={t('steps.editReminderN', { n: i + 1 })} />
            ))}
          </div>
          <Button variant="primary" onClick={add}><Plus className="size-4" />{t('steps.addLine')}</Button>
          <Field label={t('steps.every')} help={t('steps.everyHelp')} advancedKey="repeatTextTimeSec">
            <Stepper value={Math.min(step.reminderEverySec, 99999)} min={1} max={99999} step={10} unit="s" onChange={(v) => update((s) => { s.reminderEverySec = v })} />
          </Field>
          <Button
            variant="destructive"
            onClick={() => {
              updateWithUndo(modId, t('steps.reminderRemoved'), () => update((s) => { s.reminder = []; s.reminderEverySec = NEVER }))
            }}
          >
            <Trash2 className="size-4" />{t('steps.removeReminder')}
          </Button>
        </>
      )}

      <LineEditorSheet list="reminder" lineId={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

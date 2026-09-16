import { Plus, SkipForward } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ListRow, RowGroup } from '@/components/ui/surfaces'
import { Sheet } from '@/components/ui/sheet'
import { uid } from '@/lib/factory'
import type { QuestContent, Step } from '@/lib/types'
import { t, useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { questOf, updateQuest, usePart } from '@/store/editor'

export const stepName = (s: Step, i: number) => s.name || t('steps.stepN', { n: i + 1 })

/** The quest and step named by the route. */
export function useStepRoute() {
  const { modId = '', stepId = '' } = useParams()
  const mod = usePart(modId)
  const quest = questOf(mod)
  const index = quest ? quest.steps.findIndex((s) => s.id === stepId) : -1
  const step = index >= 0 ? quest!.steps[index] : undefined
  const update = (recipe: (s: Step, q: QuestContent) => void) =>
    updateQuest(modId, (q) => { const s = q.steps.find((x) => x.id === stepId); if (s) recipe(s, q) })
  return { modId, stepId, mod, quest, step, index, update, base: `/mod/${modId}` }
}

/** A deep copy with fresh ids for the step and everything inside it. Choice targets are kept. */
export function cloneStep(s: Step): Step {
  const c = structuredClone(s)
  c.id = uid('step')
  c.name = s.name ? t('steps.copyName', { name: s.name }) : ''
  c.dialogue.forEach((l) => { l.id = uid('line'); l.choices.forEach((ch) => { ch.id = uid('choice') }) })
  c.reminder.forEach((l) => { l.id = uid('line') })
  c.ships.forEach((sh) => { sh.id = uid('ship') })
  c.orders.forEach((o) => { o.id = uid('order') })
  return c
}

export function EmptyNotFound() {
  const t = useT()
  return <p className="p-6 text-center text-ink">{t('steps.notFound')}</p>
}

/** Every step by number and name, plus "Continue to the next step" and "New step at the end". */
export function StepPicker({ open, onOpenChange, steps, value, onSelect, onNewStep, nested }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  steps: Step[]
  value: string | null
  onSelect: (stepId: string | null) => void
  onNewStep: () => void
  nested?: boolean
}) {
  const t = useT()
  const pick = (id: string | null) => { onSelect(id); onOpenChange(false) }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('steps.goesTo')} nested={nested}>
      <div className="flex flex-col gap-3">
        <RowGroup>
          <ListRow icon={<SkipForward />} title={t('steps.continueNext')} chevron={false} onClick={() => pick(null)}
            className={cn(value === null && 'bg-cyan/10')} />
        </RowGroup>
        <RowGroup>
          {steps.map((s, i) => (
            <ListRow key={s.id} chevron={false} onClick={() => pick(s.id)} className={cn(value === s.id && 'bg-cyan/10')}
              icon={<span className="font-mono text-[13px]">{i + 1}</span>} title={stepName(s, i)} />
          ))}
        </RowGroup>
        <RowGroup>
          <ListRow icon={<Plus />} title={t('steps.newStepAtEnd')} chevron={false} onClick={() => { onNewStep(); onOpenChange(false) }} />
        </RowGroup>
      </div>
    </Sheet>
  )
}

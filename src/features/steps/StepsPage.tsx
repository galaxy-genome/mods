import { ArrowDown, ArrowDownUp, ArrowRight, Check, Copy, CornerDownRight, Diamond, Landmark, ListOrdered, MessageSquare, Plus, Rocket, Swords, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { SortableList, SwipeRow } from '@/components/ui/gestures'
import { Menu } from '@/components/ui/overlays'
import { Badge, Card, EmptyState, SectionLabel, SeverityIcon, TipCard } from '@/components/ui/surfaces'
import { useProblems } from '@/hooks/use-problems'
import { useT } from '@/i18n'
import { describeCondition, parseCondition } from '@/lib/conditions'
import { newMission, newStep } from '@/lib/factory'
import { stepGraph } from '@/lib/rules'
import type { Problem, Step } from '@/lib/types'
import { cn } from '@/lib/utils'
import { questOf, addHistory, updateQuest, updateWithUndo, usePart } from '@/store/editor'
import { cloneStep, stepName } from './shared'

const RANK = { error: 0, warning: 1, tip: 2 } as const

export function StepsPage() {
  const t = useT()
  const { modId = '' } = useParams()
  const quest = questOf(usePart(modId))
  const navigate = useNavigate()
  const { list } = useProblems(modId)
  const [reorder, setReorder] = React.useState(false)
  const base = `/mod/${modId}`

  const graph = React.useMemo(() => stepGraph(quest?.steps ?? []), [quest?.steps])
  if (!quest) return null
  const steps = quest.steps

  const insert = (at: number, open = false) => {
    const s = newStep()
    updateQuest(modId, (q) => { q.steps.splice(at, 0, s) })
    if (open) navigate(`${base}/steps/${s.id}`)
    else toast(t('steps.addedStep', { n: at + 1 }))
  }
  /** A mission step that finishes on accept, then a step that finishes on the reward; the board skips step 1, so a briefing step leads when the quest is empty. */
  const addMission = () => {
    const station = quest.settings.stationName || newMission().homeStation
    const offer = newStep({ name: t('steps.missionStepName'), journal: t('steps.missionJournal', { station }), mission: newMission({ homeStation: station }), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' })
    const turnIn = newStep({ name: t('rules.turnInStepName'), journal: t('steps.turnInJournal', { station }), finishWhen: 'GET_STORY_REWARD' })
    updateQuest(modId, (q) => { q.steps.push(...(q.steps.length ? [] : [newStep({ name: t('steps.briefingStepName') })]), offer, turnIn) })
    toast(t('steps.addedMission'))
  }
  const duplicate = (i: number) => {
    updateQuest(modId, (q) => { q.steps.splice(i + 1, 0, cloneStep(q.steps[i])) })
    toast(t('steps.duplicatedStep', { n: i + 1 }))
  }
  const remove = (i: number) => {
    void addHistory(modId, t('steps.beforeDeleting', { n: i + 1 }), true)
    updateWithUndo(modId, t('steps.deletedStep', { name: stepName(steps[i], i) }), () => updateQuest(modId, (q) => { q.steps.splice(i, 1) }))
  }

  const worst = (s: Step) => list
    .filter((p) => p.location.path === `steps/${s.id}` || p.location.path.startsWith(`steps/${s.id}/`))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])[0] as Problem | undefined

  if (!steps.length) {
    return (
      <Page>
        <TipCard tipKey="steps">{t('steps.tipSteps')}</TipCard>
        <EmptyState icon={<ListOrdered />} body={t('steps.emptySteps')}
          action={<Button variant="solid" onClick={() => insert(0, true)}><Plus className="size-4" />{t('steps.addFirstStep')}</Button>} />
      </Page>
    )
  }

  return (
    <Page className="pb-32">
      <TipCard tipKey="steps">{t('steps.tipSteps')}</TipCard>
      <SectionLabel action={
        <Button size="sm" variant={reorder ? 'primary' : 'ghost'} onClick={() => setReorder(!reorder)} aria-pressed={reorder}>
          {reorder ? <><Check className="size-4" />{t('common.done')}</> : <><ArrowDownUp className="size-4" />{t('steps.reorder')}</>}
        </Button>
      }>{t('steps.steps')}</SectionLabel>

      {reorder ? (
        <>
          <p className="-mt-3 text-[12px] text-dim">{t('steps.reorderHint')}</p>
          <SortableList
            className="flex flex-col gap-2"
            items={steps}
            onReorder={(items) => updateQuest(modId, (q) => { q.steps = items })}
            render={(s, handle, i) => (
              <Card className="flex items-center gap-2 py-1 pl-3">
                <span className="w-6 font-mono text-[13px] text-cyan">{i + 1}</span>
                <span className="flex-1 truncate text-[15px] text-white">{stepName(s, i)}</span>
                {handle}
              </Card>
            )}
          />
        </>
      ) : (
        <div className="flex flex-col">
          {steps.map((s, i) => {
            const falls = graph.edges.some((e) => e.kind === 'next' && e.from === i - 1 && e.to === i)
            const chosen = graph.edges.some((e) => e.kind === 'choice' && e.to === i)
            return (
              <React.Fragment key={s.id}>
                {i > 0 && (
                  <div className="relative flex h-11 items-center pl-5">
                    {falls ? <ArrowDown className="size-4 text-grid-strong" aria-label={t('steps.fallsThrough')} /> : (
                      <span className={cn('flex items-center gap-1.5 text-[12px]', chosen ? 'text-cyan' : 'text-amber')}>
                        {chosen ? <><CornerDownRight className="size-3.5" />{t('steps.reachedByChoice')}</> : t('steps.nothingLeadsHere')}
                      </span>
                    )}
                    <button aria-label={t('steps.insertBeforeN', { n: i + 1 })} onClick={() => insert(i)}
                      className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-dim hover:text-cyan">
                      <span className="grid size-6 place-items-center rounded-full border border-edge bg-void"><Plus className="size-3.5" /></span>
                    </button>
                  </div>
                )}
                <StepCard
                  step={s} index={i} steps={steps} problem={worst(s)}
                  onOpen={() => navigate(`${base}/steps/${s.id}`)}
                  onLongPress={() => { navigator.vibrate?.(10); setReorder(true) }}
                  onDuplicate={() => duplicate(i)} onDelete={() => remove(i)}
                  onInsertBefore={() => insert(i)} onInsertAfter={() => insert(i + 1)}
                />
              </React.Fragment>
            )
          })}
        </div>
      )}

      {!reorder && (
        <Button variant="secondary" className="self-start" onClick={addMission}><Landmark className="size-4" />{t('steps.addMission')}</Button>
      )}
      {!reorder && (
        <Button variant="solid" size="lg" onClick={() => insert(steps.length, true)}
          className="fixed bottom-[84px] right-4 z-20 rounded-[4px] lg:bottom-6">
          <Plus className="size-5" />{t('steps.addStep')}
        </Button>
      )}
    </Page>
  )
}

function StepCard({ step, index, steps, problem, onOpen, onLongPress, onDuplicate, onDelete, onInsertBefore, onInsertAfter }: {
  step: Step; index: number; steps: Step[]; problem?: Problem
  onOpen: () => void; onLongPress: () => void; onDuplicate: () => void; onDelete: () => void; onInsertBefore: () => void; onInsertAfter: () => void
}) {
  const t = useT()
  const timer = React.useRef<number | undefined>(undefined)
  const pressed = React.useRef(false)
  const start = () => { pressed.current = false; timer.current = window.setTimeout(() => { pressed.current = true; onLongPress() }, 550) }
  const cancel = () => clearTimeout(timer.current)

  const choices = step.dialogue.flatMap((l) => l.choices)
  const targets = choices.map((c) => {
    const ti = c.targetStepId ? steps.findIndex((s) => s.id === c.targetStepId) : -1
    return ti >= 0 ? String(ti + 1) : t('steps.next')
  })
  const counts = [
    { n: step.dialogue.length, icon: <MessageSquare />, label: t('steps.lines', { count: step.dialogue.length }) },
    { n: step.ships.length, icon: <Rocket />, label: t('steps.ships', { count: step.ships.length }) },
    { n: step.orders.length, icon: <Swords />, label: t('steps.orders', { count: step.orders.length }) },
  ].filter((c) => c.n)

  return (
    <SwipeRow actions={[
      { label: t('common.duplicate'), icon: <Copy />, tone: 'cyan', onAction: onDuplicate },
      { label: t('common.delete'), icon: <Trash2 />, tone: 'danger', onAction: onDelete },
    ]}>
      <Card
        role="button"
        tabIndex={0}
        aria-label={t('steps.stepCardLabel', { n: index + 1, name: stepName(step, index) })}
        onClick={() => { if (!pressed.current) onOpen() }}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
        onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerMove={(e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) cancel() }}
        onContextMenu={(e) => e.preventDefault()}
        className="flex cursor-pointer select-none flex-col gap-2 py-2 pl-3 pr-1 transition-colors hover:border-grid-strong focus-visible:border-cyan focus-visible:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="w-6 font-mono text-[15px] text-cyan">{index + 1}</span>
          <span className={cn('min-w-0 flex-1 truncate text-[16px] font-semibold', step.name ? 'text-white' : 'text-ink')}>{stepName(step, index)}</span>
          {step.checkpoint && <Badge tone="cyan" icon={<Diamond />}>{t('steps.checkpointShort')}</Badge>}
          {problem && <span title={problem.message} aria-label={problem.message} className="grid size-6 place-items-center"><SeverityIcon severity={problem.severity} className="size-4" /></span>}
          <span className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Menu label={t('steps.stepActions', { n: index + 1 })} items={[
            { label: t('common.duplicate'), icon: <Copy />, onSelect: onDuplicate },
            { label: t('steps.insertBefore'), icon: <Plus />, onSelect: onInsertBefore },
            { label: t('steps.insertAfter'), icon: <Plus />, onSelect: onInsertAfter },
            { label: t('common.delete'), icon: <Trash2 />, tone: 'danger', separatorBefore: true, onSelect: onDelete },
          ]} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 pr-3 text-[13px]">
          {counts.map((c) => (
            <span key={c.label} aria-label={c.label} className="flex items-center gap-1 font-mono text-ink [&_svg]:size-3.5 [&_svg]:text-dim">{c.icon}{c.n}</span>
          ))}
          {step.mission && <span aria-label={t('steps.stationMission')} className="text-ink [&_svg]:size-3.5"><Landmark /></span>}
          <span className={cn('flex min-w-0 items-center gap-1', step.finishWhen ? 'text-ink' : 'text-danger')}>
            <ArrowRight className="size-3.5 shrink-0 text-cyan" />
            <span className={cn('truncate', step.finishWhen && !parseCondition(step.finishWhen).def && 'font-mono')}>{describeCondition(step.finishWhen)}</span>
          </span>
        </div>
        {targets.length > 0 && (
          <div className="flex items-center gap-1.5 pb-1 pl-8 font-mono text-[12px] text-cyan">
            {t('steps.choicesTo', { targets: targets.join(' · ') })}
          </div>
        )}
      </Card>
    </SwipeRow>
  )
}

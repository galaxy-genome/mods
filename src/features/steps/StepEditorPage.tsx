import { AlertTriangle, ArrowRight, BellRing, ChevronLeft, ChevronRight, Diamond, Landmark, MessageSquare, Pencil, Plus, Rocket, Swords, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { AdvancedKey, Field } from '@/components/ui/field'
import { Input, SwitchRow } from '@/components/ui/inputs'
import { Badge, Card, ListRow, RowGroup, SectionLabel, SentenceCard, TipCard } from '@/components/ui/surfaces'
import { useProblems } from '@/hooks/use-problems'
import { usePulseField } from '@/hooks/use-pulse-field'
import { jumpLabels } from '@/features/output/gameJson'
import { useT } from '@/i18n'
import { describeCondition, parseCondition } from '@/lib/conditions'
import { MISSION_TYPES } from '@/lib/reference'
import { ConditionPicker } from './ConditionPicker'
import { updateWithUndo, useEditor } from '@/store/editor'
import { EmptyNotFound, useStepRoute } from './shared'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** A condition in words, or its raw text in mono when the editor doesn't know it. */
function ConditionText({ action }: { action: string }) {
  return parseCondition(action).def ? <>{describeCondition(action)}</> : <span className="break-all font-mono text-[13px]">{action}</span>
}

export function StepEditorPage() {
  const { modId, quest, step, index, update, base } = useStepRoute()
  const t = useT()
  const navigate = useNavigate()
  const advanced = useEditor((s) => s.settings.advanced)
  const { list } = useProblems(modId)
  const [picker, setPicker] = React.useState<null | { kind: 'finish' } | { kind: 'fail'; index: number | null }>(null)
  usePulseField([step?.id])
  // A "Choose a condition" fix links here with ?pick=finish or ?pick=<failure index>.
  const pick = useSearchParams()[0].get('pick')
  React.useEffect(() => { if (pick) setPicker(pick === 'finish' ? { kind: 'finish' } : { kind: 'fail', index: Number(pick) }) }, [pick, step?.id])

  const total = quest?.steps.length ?? 0
  const prev = quest?.steps[index - 1]
  const next = quest?.steps[index + 1]

  useShellHeader({
    back: `${base}/steps`,
    subtitle: step ? t('steps.stepOf', { n: index + 1, total }) : undefined,
    title: step ? (
      <input
        aria-label={t('steps.stepName')}
        value={step.name}
        placeholder={t('steps.stepN', { n: index + 1 })}
        onChange={(e) => update((s) => { s.name = e.target.value })}
        className="w-full min-w-0 rounded-[2px] border border-transparent bg-transparent text-[17px] font-semibold text-white outline-none placeholder:text-white/60 hover:border-edge focus:border-cyan"
      />
    ) : t('steps.step'),
    actions: step && (
      <>
        <button aria-label={t('steps.previousStep')} disabled={!prev} onClick={() => prev && navigate(`${base}/steps/${prev.id}`)} className="grid h-11 w-9 place-items-center text-ink disabled:opacity-30"><ChevronLeft className="size-5" /></button>
        <button aria-label={t('steps.nextStep')} disabled={!next} onClick={() => next && navigate(`${base}/steps/${next.id}`)} className="grid h-11 w-9 place-items-center text-ink disabled:opacity-30"><ChevronRight className="size-5" /></button>
      </>
    ),
  }, [step, index, total, prev?.id, next?.id])

  if (!quest || !step) return <EmptyNotFound />

  const here = `${base}/steps/${step.id}`
  const problems = list.filter((p) => p.location.path === here.slice(base.length + 1))
  const cpWarning = problems.find((p) => p.location.field === 'checkpoint')
  const mission = step.mission && MISSION_TYPES.find((m) => m.key === step.mission!.type)

  return (
    <Page className="pb-28">
      <TipCard tipKey="step-editor">{t('steps.tipStepEditor')}</TipCard>

      <Card className="flex flex-col gap-4 p-4">
        <SectionLabel>{t('steps.journal')}</SectionLabel>
        {/* The game's JSON key for the journal line really is TODO. */}
        <Field label={t('steps.journalEntry')} htmlFor="step-journal" advancedKey="TODO" fieldKey="journal" help={t('steps.journalHelp')}>
          <Input id="step-journal" value={step.journal} placeholder={t('steps.journalPlaceholder')} onChange={(e) => update((s) => { s.journal = e.target.value })} />
        </Field>
        {advanced && (
          <Field label={t('steps.jumpLabel')} advancedKey="questID" help={t('steps.jumpLabelHelp')}>
            <span className="font-mono text-[15px] text-white">{jumpLabels(quest.steps).get(step.id) ?? 0}</span>
          </Field>
        )}
        <div className="flex flex-col gap-1">
          <SwitchRow fieldKey="checkpoint" icon={<Diamond />} label={t('steps.checkpoint')} checked={step.checkpoint} onCheckedChange={(v) => update((s) => { s.checkpoint = v })}
            help={t('steps.checkpointHelp')} />
          {cpWarning && <p className="flex items-start gap-1.5 text-[12px] text-amber"><AlertTriangle className="mt-px size-3.5" />{cpWarning.message}</p>}
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('steps.whenStarts')}</SectionLabel>
        <RowGroup>
          <ListRow icon={<MessageSquare />} title={t('steps.dialogue')} value={step.dialogue.length ? t('steps.lines', { count: step.dialogue.length }) : t('steps.none')} muted={!step.dialogue.length} onClick={() => navigate(`${here}/dialogue`)} />
          <ListRow icon={<Rocket />} title={t('steps.shipsAppear')} value={step.ships.length ? t('steps.ships', { count: step.ships.length }) : t('steps.none')} muted={!step.ships.length} onClick={() => navigate(`${here}/ships`)} />
          <ListRow icon={<Swords />} title={t('steps.shipOrders')} value={step.orders.length ? t('steps.orders', { count: step.orders.length }) : t('steps.none')} muted={!step.orders.length} onClick={() => navigate(`${here}/orders`)} />
          <ListRow icon={<Landmark />} title={t('steps.stationMission')} subtitle={step.mission ? `${mission?.name ?? step.mission.type} · ${step.mission.homeStation}` : undefined}
            value={step.mission ? undefined : t('steps.none')} muted={!step.mission} onClick={() => navigate(`${here}/mission`)} />
        </RowGroup>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel action={<AdvancedKey k="completeAction" />}>{t('steps.finishesWhen')}</SectionLabel>
        <SentenceCard fieldKey="finishWhen" icon={<ArrowRight className={step.finishWhen ? 'text-cyan' : 'text-danger'} />} tone={step.finishWhen ? 'cyan' : 'danger'}
          onClick={() => setPicker({ kind: 'finish' })} trailing={<Pencil className="size-4 text-dim" />}>
          {step.finishWhen
            ? parseCondition(step.finishWhen).def ? t('steps.finishesWhenSentence', { condition: lower(describeCondition(step.finishWhen)) }) : <ConditionText action={step.finishWhen} />
            : <span className="text-danger">{t('steps.chooseFinish')}</span>}
        </SentenceCard>
        {step.finishWhen && <span className="pl-3"><AdvancedKey k={step.finishWhen} /></span>}
        <p className="text-[12px] leading-snug text-ink/75">{t('steps.finishHint')}</p>
      </div>

      <div data-field="failWhen" className="flex flex-col gap-2 rounded-[2px]">
        <SectionLabel action={<AdvancedKey k="failureActions" />}>{t('steps.failsWhen')} <span className="normal-case tracking-normal">{t('steps.optional')}</span></SectionLabel>
        {step.failWhen.map((f, i) => (
          <React.Fragment key={`${f}-${i}`}>
            {i > 0 && <span className="pl-3 font-mono text-[12px] text-dim">{t('steps.and')}</span>}
            <div className="flex items-center gap-1">
              <SentenceCard className="flex-1" icon={<X className="text-danger" />} onClick={() => setPicker({ kind: 'fail', index: i })} trailing={<Pencil className="size-4 text-dim" />}>
                <ConditionText action={f} />
                <span className="block"><AdvancedKey k={f} /></span>
              </SentenceCard>
              <Button size="icon" variant="ghost" aria-label={t('steps.removeFailure')} onClick={() => updateWithUndo(modId, t('steps.failureRemoved'), () => update((s) => { s.failWhen.splice(i, 1) }))}><Trash2 className="size-4" /></Button>
            </div>
          </React.Fragment>
        ))}
        <Button variant="text" className="self-start" onClick={() => setPicker({ kind: 'fail', index: null })}><Plus className="size-4" />{t('steps.addFailure')}</Button>
        <p className="text-[12px] leading-snug text-ink/75">{t('steps.failHint')}</p>
      </div>

      <RowGroup>
        <ListRow icon={<BellRing />} title={t('steps.reminder')} muted={!step.reminder.length} onClick={() => navigate(`${here}/reminder`)}
          subtitle={step.reminder.length ? t('steps.reminderIgnoredSub', { lines: t('steps.lines', { count: step.reminder.length }) }) : t('steps.noneCap')}
          trailing={step.reminder.length ? <Badge tone="amber" icon={<AlertTriangle />}>{t('steps.ignored')}</Badge> : undefined} />
      </RowGroup>

      <ConditionPicker
        open={!!picker}
        onOpenChange={(v) => { if (!v) setPicker(null) }}
        title={picker?.kind === 'fail' ? t('steps.failsWhenTitle') : t('steps.finishesWhenTitle')}
        value={picker?.kind === 'finish' ? step.finishWhen : picker?.kind === 'fail' && picker.index !== null ? step.failWhen[picker.index] : null}
        step={step}
        steps={quest.steps}
        onSelect={(action) => update((s) => {
          if (picker?.kind === 'finish') s.finishWhen = action
          else if (picker?.kind === 'fail') { if (picker.index === null) s.failWhen.push(action); else s.failWhen[picker.index] = action }
        })}
      />
    </Page>
  )
}

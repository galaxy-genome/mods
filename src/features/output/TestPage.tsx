import { PortraitTile } from '@/components/pickers'
import { AlertOctagon, CheckCircle2, Flag, FlaskConical, History, Play, RotateCcw, Rocket, Swords, Target, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, SectionLabel, TipCard } from '@/components/ui/surfaces'
import { describeCondition } from '@/lib/conditions'
import { MISSION_TYPES, humanize, shipByKey } from '@/lib/reference'
import { MAX_CHOICES, rewardEstimate } from '@/lib/rules'
import type { Choice, DialogLine, QuestContent, ShipOrder, Step } from '@/lib/types'
import { cn } from '@/lib/utils'
import { questOf, usePart } from '@/store/editor'
import { t, useT } from '@/i18n'

const LINE_GAP_MS = 1100
const MAX_VISITS = 200

interface Visit { step: number; via?: string; reloaded?: boolean }
type Status = 'running' | 'failed' | 'done'

interface Sim { visits: Visit[]; checkpoint: number; status: Status; failedBy?: string; shown: number }

const start = (): Sim => ({ visits: [{ step: 0 }], checkpoint: 0, status: 'running', shown: 0 })

/** The step a choice leads to: its target step, or the next one in order when it has none. */
function jumpTarget(q: QuestContent, from: number, c: Choice) {
  const i = c.targetStepId ? q.steps.findIndex((s) => s.id === c.targetStepId) : -1
  return i >= 0 ? i : from + 1
}

function orderSentence(o: ShipOrder) {
  const who = o.ship === 'player' ? t('output.teYou') : o.ship || '?'
  const parts: string[] = []
  if (o.attack) parts.push(o.target === 'player' ? t('output.teAttacksYou') : t('output.teAttacks', { target: o.target || '?' }))
  if (o.changeBehaviour) parts.push(t('output.teTurns', { behaviour: humanize(o.behaviour) }))
  if (o.destroy) parts.push(t('output.teDestroyed'))
  return t('output.teOrder', { who, what: parts.join(', ') || t('output.teNothing') })
}

function Bubble({ line, animate, contact }: { line: DialogLine; animate: boolean; contact: string }) {
  const [chars, setChars] = React.useState(animate ? 0 : line.text.length)
  React.useEffect(() => {
    if (chars >= line.text.length) return
    const timer = setTimeout(() => setChars((c) => Math.min(line.text.length, c + Math.max(2, Math.ceil(line.text.length / 40)))), 16)
    return () => clearTimeout(timer)
  }, [chars, line.text.length])
  return (
    <motion.div initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="flex items-start gap-2.5">
      <PortraitTile name={line.portrait} size={36} className="shrink-0" />
      <div className="min-w-0 flex-1 rounded-[4px] border border-edge bg-panel px-3 py-2">
        <div className="font-mono text-[11px] text-cyan">{line.speaker || contact}</div>
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white">
          {line.text.slice(0, chars)}
          {chars < line.text.length && <span className="ml-px inline-block h-3.5 w-1.5 animate-pulse bg-cyan align-middle" />}
        </p>
      </div>
    </motion.div>
  )
}

function StepEvents({ q, visit, current, shown, onChoose }: {
  q: QuestContent; visit: Visit; current: boolean; shown: number; onChoose?: (c: Choice) => void
}) {
  const step: Step = q.steps[visit.step]
  const lines = current ? step.dialogue.slice(0, shown) : step.dialogue
  const allShown = !current || shown >= step.dialogue.length
  const choices = step.dialogue.flatMap((l) => l.choices.slice(0, MAX_CHOICES))
  const hidden = step.dialogue.reduce((a, l) => a + Math.max(0, l.choices.length - MAX_CHOICES), 0)
  return (
    <div className={cn('relative flex flex-col gap-2.5 border-l pl-4', current ? 'border-cyan' : 'border-edge')}>
      <span className={cn('absolute -left-[5px] top-1 size-2.5 rounded-full', current ? 'bg-cyan' : 'bg-edge')} />
      {visit.reloaded && <Badge icon={<History />} tone="amber" className="self-start">{t('output.teReloaded')}</Badge>}
      {visit.via && <p className="font-mono text-[12px] text-dim">{t('output.teChose', { text: visit.via })}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-dim">{t('output.stepN', { n: visit.step + 1 })}</span>
        <span className="text-[15px] font-semibold text-white">{step.name || t('output.untitled')}</span>
        {step.checkpoint && <Badge tone="success" icon={<Flag />}>{t('output.checkpoint')}</Badge>}
      </div>
      {step.journal && <p className="text-[13px] text-ink"><span className="section-label mr-2">{t('output.teJournal')}</span>{step.journal}</p>}
      {step.ships.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {step.ships.map((s) => (
            <Badge key={s.id} icon={<Rocket />} tone="cyan">{s.pilot || t('output.teUnnamed')} · {shipByKey(s.model)?.name ?? s.model} · {humanize(s.behaviour)}</Badge>
          ))}
        </div>
      )}
      {step.orders.map((o) => (
        <p key={o.id} className="flex items-center gap-2 text-[13px] text-ink"><Swords className="size-4 text-amber" />{orderSentence(o)}</p>
      ))}
      {step.mission && (
        <Card className="flex items-start gap-3 p-3">
          <Target className="mt-0.5 size-5 shrink-0 text-cyan" />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="text-white">{t('output.teMission', { type: MISSION_TYPES.find((m) => m.key === step.mission!.type)?.name ?? step.mission.type, station: step.mission.homeStation })}</span>
            <span className="font-mono text-dim">{t('output.teMissionReward', { credits: step.mission.credits.toLocaleString(), rep: step.mission.reputation })}</span>
          </div>
        </Card>
      )}
      <div className="flex flex-col gap-2" aria-live="polite">
        {lines.map((l, i) => <Bubble key={l.id} line={l} animate={current && i === shown - 1} contact={q.settings.charName} />)}
      </div>
      {current && allShown && choices.length > 0 && onChoose && (
        <div className="flex flex-col gap-2 pl-11">
          {choices.map((c) => (
            <Button key={c.id} variant="primary" className="h-auto min-h-11 justify-start whitespace-normal py-2 text-left" onClick={() => onChoose(c)}>
              {c.text || t('output.teEmptyChoice')}
            </Button>
          ))}
          {hidden > 0 && <p className="text-[12px] text-amber">{t('output.teHidden', { count: hidden })}</p>}
        </div>
      )}
    </div>
  )
}

export function TestPage() {
  const { modId = '' } = useParams()
  useT()
  const navigate = useNavigate()
  const q = questOf(usePart(modId))
  const [sim, setSim] = React.useState<Sim>(start)
  const [failing, setFailing] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const current = sim.visits[sim.visits.length - 1]
  const step = q?.steps[current.step]

  useShellHeader({
    actions: <Button variant="ghost" size="icon" aria-label={t('output.teRestart')} title={t('output.teRestart')} onClick={() => { setSim(start()); setFailing(false) }}><RotateCcw className="size-5" /></Button>,
  }, [])

  React.useEffect(() => {
    if (!step || sim.status !== 'running' || sim.shown >= step.dialogue.length) return
    const timer = setTimeout(() => setSim((s) => ({ ...s, shown: s.shown + 1 })), sim.shown === 0 ? 150 : LINE_GAP_MS)
    return () => clearTimeout(timer)
  }, [step, sim.shown, sim.status])

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [sim.visits.length, sim.shown, sim.status])

  if (!q) return null
  if (q.steps.length === 0) {
    return <Page><EmptyState icon={<FlaskConical />} title={t('output.teNothingToTest')} body={t('output.teNothingToTestBody')} action={<Button variant="primary" onClick={() => navigate(`/mod/${modId}/steps`)}>{t('output.teGoSteps')}</Button>} /></Page>
  }
  if (!step) { setSim(start()); return null }

  const goTo = (to: number, via?: string) => setSim((s) => {
    if (to >= q.steps.length) return { ...s, status: 'done', shown: 0 }
    if (s.visits.length >= MAX_VISITS) return { ...s, status: 'failed', failedBy: t('output.teLoop') }
    return { ...s, visits: [...s.visits, { step: to, via }], checkpoint: q.steps[to].checkpoint ? to : s.checkpoint, shown: 0 }
  })
  const choices = step.dialogue.flatMap((l) => l.choices)
  const allShown = sim.shown >= step.dialogue.length
  const reward = rewardEstimate(q)

  return (
    <Page className="pb-8">
      <TipCard tipKey="test">{t('output.teTip')}</TipCard>

      <div className="flex flex-col gap-6">
        {sim.visits.map((v, i) => (
          <StepEvents
            key={i}
            q={q}
            visit={v}
            current={i === sim.visits.length - 1 && sim.status === 'running'}
            shown={sim.shown}
            onChoose={(c) => goTo(jumpTarget(q, v.step, c), c.text)}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {sim.status === 'running' && (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col gap-2">
            {!allShown ? (
              <Button variant="ghost" onClick={() => setSim((s) => ({ ...s, shown: step.dialogue.length }))}>{t('output.teSkip')}</Button>
            ) : choices.length === 0 && (
              <>
                <SectionLabel>{t('output.teWaiting')}</SectionLabel>
                <Card tone="cyan" className="px-3 py-2.5 text-[15px] text-white">{describeCondition(step.finishWhen)}</Card>
                <Button variant="solid" onClick={() => goTo(current.step + 1)} disabled={!step.finishWhen}>
                  <Play className="size-4" />{t('output.tePretend')}
                </Button>
                {!step.finishWhen && <p className="text-[12px] text-danger">{t('output.teStuck')}</p>}
              </>
            )}
            {step.failWhen.length > 0 && (
              failing ? (
                <Card tone="danger" className="flex flex-col gap-1 p-2">
                  <span className="px-1 text-[12px] text-dim">{t(step.failWhen.length > 1 ? 'output.teFailAll' : 'output.teFailPick')}</span>
                  {step.failWhen.map((f) => (
                    <Button key={f} variant="ghost" className="justify-start text-danger" onClick={() => { setFailing(false); setSim((s) => ({ ...s, status: 'failed', failedBy: describeCondition(f) })) }}>
                      <XCircle className="size-4" />{describeCondition(f)}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setFailing(false)}>{t('output.teCancel')}</Button>
                </Card>
              ) : (
                <Button variant="destructive" onClick={() => setFailing(true)}><AlertOctagon className="size-4" />{t('output.tePretendFail')}</Button>
              )
            )}
            {sim.checkpoint > 0 && current.step !== sim.checkpoint && (
              <Button variant="secondary" onClick={() => setSim((s) => ({ ...s, visits: [...s.visits, { step: s.checkpoint, reloaded: true }], shown: 0 }))}>
                <History className="size-4" />{t('output.teReloadCheckpoint', { n: sim.checkpoint + 1 })}
              </Button>
            )}
          </motion.div>
        )}

        {sim.status === 'failed' && (
          <motion.div key="failed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <Card tone="danger" className="flex flex-col items-center gap-3 p-5 text-center">
              <XCircle className="size-8 text-danger" />
              <p className="text-[17px] font-semibold text-white">{t('output.teFailed')}</p>
              <p className="text-[14px] text-ink">{sim.failedBy}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {sim.checkpoint > 0 && (
                  <Button variant="secondary" onClick={() => setSim((s) => ({ ...s, status: 'running', visits: [...s.visits, { step: s.checkpoint, reloaded: true }], shown: 0 }))}>
                    <History className="size-4" />{t('output.teReload')}
                  </Button>
                )}
                <Button variant="primary" onClick={() => setSim(start())}><RotateCcw className="size-4" />{t('output.teRestart')}</Button>
              </div>
            </Card>
          </motion.div>
        )}

        {sim.status === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <Card tone="success" className="flex flex-col items-center gap-3 p-5 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="text-[17px] font-semibold text-white">{t('output.teComplete', { total: reward.total })}</p>
              <div className="flex flex-col gap-1">
                <span className="section-label">{t('output.tePath')}</span>
                <p className="font-mono text-[13px] text-ink">{sim.visits.map((v) => v.step + 1).join(' → ')}</p>
              </div>
              <Button variant="primary" onClick={() => setSim(start())}><RotateCcw className="size-4" />{t('output.teAnother')}</Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={endRef} />
    </Page>
  )
}

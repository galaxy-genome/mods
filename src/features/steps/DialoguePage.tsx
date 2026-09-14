import { PortraitTile } from '@/components/pickers'
import { MessageSquare, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { SortableList, SwipeRow } from '@/components/ui/gestures'
import { Switch } from '@/components/ui/inputs'
import { EmptyState } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { newLine } from '@/lib/factory'
import { WAIT_FOR_PLAYER, type DialogLine, type Step } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateWithUndo } from '@/store/editor'
import { LineEditorSheet } from './LineEditorSheet'
import { EmptyNotFound, stepName, useStepRoute } from './shared'

export function DialoguePage() {
  const { lineId } = useParams()
  const { modId, quest, step, index, update, base } = useStepRoute()
  const navigate = useNavigate()
  const t = useT()
  const [preview, setPreview] = React.useState(false)
  const here = step ? `${base}/steps/${step.id}/dialogue` : base

  useShellHeader({ title: t('steps.dialogue'), subtitle: step ? t('steps.stepSubtitle', { n: index + 1, name: stepName(step, index) }) : undefined, back: step ? `${base}/steps/${step.id}` : `${base}/steps` }, [step?.id, step?.name, index])

  if (!quest || !step) return <EmptyNotFound />

  const add = () => {
    const prev = step.dialogue.at(-1)
    const line = newLine(prev ? { speaker: prev.speaker, portrait: prev.portrait } : { speaker: quest.settings.charName, portrait: quest.settings.charImage })
    update((s) => { s.dialogue.push(line) })
    navigate(`${here}/${line.id}`, { replace: true })
  }

  const remove = (line: DialogLine) => {
    const i = step.dialogue.findIndex((l) => l.id === line.id)
    updateWithUndo(modId, t('steps.lineDeleted'), () => update((s) => { s.dialogue.splice(i, 1) }))
  }

  return (
    <Page className="pb-28">
      <div className="flex min-h-11 items-center gap-3">
        <Play className="size-4 text-ink" />
        <label htmlFor="game-preview" className="flex-1 text-[14px] text-white">{t('steps.previewGame')}</label>
        <Switch id="game-preview" checked={preview} onCheckedChange={setPreview} disabled={!step.dialogue.length} />
      </div>

      {preview && step.dialogue.length > 0 ? (
        <GamePreview lines={step.dialogue} steps={quest.steps} />
      ) : step.dialogue.length === 0 ? (
        <EmptyState icon={<MessageSquare />} body={t('steps.dialogueEmpty')}
          action={<Button variant="primary" onClick={add}><Plus className="size-4" />{t('steps.addLine')}</Button>} />
      ) : (
        <>
          <span className="section-label">{t('steps.lines', { count: step.dialogue.length })}</span>
          <SortableList
            className="flex flex-col gap-3"
            items={step.dialogue}
            onReorder={(items) => update((s) => { s.dialogue = items })}
            render={(line, handle, i) => (
              <SwipeRow actions={[{ label: t('common.delete'), icon: <Trash2 />, tone: 'danger', onAction: () => remove(line) }]}>
                <div className="flex items-start gap-2.5">
                  <LineBubble line={line} steps={quest.steps} showChoices onClick={() => navigate(`${here}/${line.id}`, { replace: true })} label={t('steps.editLineN', { n: i + 1 })} />
                  {handle}
                </div>
              </SwipeRow>
            )}
          />
          <Button variant="primary" onClick={add}><Plus className="size-4" />{t('steps.addLine')}</Button>
          <p className="text-center text-[12px] text-dim">{t('steps.editHint')}</p>
        </>
      )}

      <LineEditorSheet list="dialogue" lineId={lineId ?? null} onClose={() => navigate(here, { replace: true })} />
    </Page>
  )
}

/** One message as the game's dialogue board shows it: portrait tile, speaker, text and choice buttons. */
export function LineBubble({ line, steps, showChoices, onClick, label, text }: {
  line: DialogLine; steps: Step[]; showChoices?: boolean; onClick?: () => void; label?: string; text?: string
}) {
  const t = useT()
  const body = (
    <>
      <PortraitTile name={line.portrait} size={44} className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-2 rounded-[4px] border border-edge bg-[rgba(8,18,34,.92)] px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-white">{line.speaker || t('steps.noSpeaker')}</span>
          <span className="font-mono text-[11px] text-dim">{line.portrait}</span>
          <span className="ml-auto font-mono text-[11px] text-dim">{line.closeAfterSec === WAIT_FOR_PLAYER ? t('steps.waits') : `${line.closeAfterSec}s`}</span>
        </span>
        <span className={cn('whitespace-pre-wrap text-[14px] leading-[1.45]', line.text ? 'text-ink' : 'italic text-dim')}>{text ?? (line.text || t('steps.emptyMessage'))}</span>
        {showChoices && line.choices.length > 0 && (
          <span className="flex flex-col gap-1.5">
            {line.choices.map((c) => {
              const ti = c.targetStepId ? steps.findIndex((s) => s.id === c.targetStepId) : -1
              return (
                <span key={c.id} className="flex min-h-9 items-center justify-between gap-2 rounded-[2px] border border-cyan/70 bg-cyan/10 px-2.5 text-[13px] text-cyan">
                  <span className="truncate">{c.text || t('steps.untitledChoice')}</span>
                  <span className="shrink-0 font-mono text-[11px] text-dim">› {ti >= 0 ? t('steps.stepN', { n: ti + 1 }) : t('steps.next')}</span>
                </span>
              )
            })}
          </span>
        )}
      </span>
    </>
  )
  if (!onClick) return <div className="flex min-w-0 flex-1 items-start gap-2.5">{body}</div>
  return <button type="button" aria-label={label} onClick={onClick} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">{body}</button>
}

/** Plays the lines one at a time with a typing effect, as the game does. */
function GamePreview({ lines, steps }: { lines: DialogLine[]; steps: Step[] }) {
  const t = useT()
  const [at, setAt] = React.useState(0)
  const [chars, setChars] = React.useState(0)
  const line = lines[Math.min(at, lines.length - 1)]
  const done = chars >= line.text.length
  const finished = at >= lines.length - 1 && done

  React.useEffect(() => {
    if (done) return
    const timer = setTimeout(() => setChars((c) => c + 1), 22)
    return () => clearTimeout(timer)
  }, [chars, done])

  const next = () => {
    if (!done) return setChars(line.text.length)
    if (at < lines.length - 1) { setAt(at + 1); setChars(0) }
  }

  return (
    <div className="grid-texture flex flex-col gap-3 rounded-[4px] border border-grid-strong p-3">
      <span className="font-mono text-[11px] text-dim">{t('steps.lineOf', { n: at + 1, total: lines.length })}</span>
      <div role="button" tabIndex={0} aria-label={t('steps.nextLine')} onClick={next} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') next() }} className="cursor-pointer">
        <LineBubble line={line} steps={steps} text={line.text.slice(0, chars)} />
      </div>
      {done && line.choices.length > 0 && (
        <div className="flex flex-col gap-2 pl-[54px]">
          {line.choices.map((c) => {
            const ti = c.targetStepId ? steps.findIndex((s) => s.id === c.targetStepId) : -1
            return (
              <Button key={c.id} variant="primary" size="sm" className="justify-start"
                onClick={() => toast(t('steps.choiceGoesTo', { choice: c.text || t('steps.untitledChoice'), target: ti >= 0 ? t('steps.stepLower', { n: ti + 1 }) : t('steps.theNextStep') }))}>
                {c.text || t('steps.untitledChoice')}
              </Button>
            )
          })}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setAt(0); setChars(0) }}><RotateCcw className="size-4" />{t('steps.restart')}</Button>
        <Button variant="secondary" size="sm" disabled={finished} onClick={next}>{done ? t('steps.nextLine') : t('steps.skipTyping')}</Button>
      </div>
    </div>
  )
}

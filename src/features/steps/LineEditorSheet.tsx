import { ChevronRight, Plus, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { PortraitPicker, PortraitTile } from '@/components/pickers'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Chip, Input, Stepper, Textarea } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Card } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { useT } from '@/i18n'
import { newStep, uid } from '@/lib/factory'
import { MAX_CHOICES, MAX_LINE } from '@/lib/rules'
import { PORTRAITS } from '@/lib/reference'
import { WAIT_FOR_PLAYER, type DialogLine } from '@/lib/types'
import { StepPicker, stepName, useStepRoute } from './shared'

const PRESETS = [3, 5, 10]

export function LineEditorSheet({ list, lineId, onClose }: {
  list: 'dialogue' | 'reminder'
  lineId: string | null
  onClose: () => void
}) {
  const t = useT()
  const { quest, step, update } = useStepRoute()
  const lines = step?.[list] ?? []
  const lineIndex = lines.findIndex((l) => l.id === lineId)
  const line = lines[lineIndex] as DialogLine | undefined
  usePulseField([lineId, !!line])
  const [portraitOpen, setPortraitOpen] = React.useState(false)
  const [goesTo, setGoesTo] = React.useState<string | null>(null)
  const [blockedFor, setBlockedFor] = React.useState<string | null>(null)

  const edit = (recipe: (l: DialogLine) => void) =>
    update((s) => { const l = s[list].find((x) => x.id === lineId); if (l) recipe(l) })

  const suggestions = React.useMemo(() => {
    if (!quest) return []
    const out = new Map<string, string | null>()
    if (quest.settings.charName) out.set(quest.settings.charName, quest.settings.charImage)
    quest.steps.forEach((s) => s.ships.forEach((sh) => { if (sh.pilot && !out.has(sh.pilot)) out.set(sh.pilot, null) }))
    quest.steps.forEach((s) => [...s.dialogue, ...s.reminder].forEach((l) => { if (l.speaker && !out.has(l.speaker)) out.set(l.speaker, l.portrait) }))
    return [...out]
  }, [quest])

  const choiceLine = list === 'dialogue'
  const isLast = lineIndex === lines.length - 1

  return (
    <Sheet
      open={!!line}
      onOpenChange={(v) => { if (!v) onClose() }}
      title={line ? t('steps.lineN', { n: lineIndex + 1 }) : t('steps.line')}
      full
      footer={
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => { update((s) => { s[list] = s[list].filter((l) => l.id !== lineId) }); onClose() }}>
            <Trash2 className="size-4" />{t('common.delete')}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>{t('common.done')}</Button>
        </div>
      }
    >
      {line && step && quest && (
        <div className="flex flex-col gap-5 pt-2">
          <Field label={t('steps.speaker')} help={t('steps.speakerHelp')} htmlFor="line-speaker" advancedKey="Name" fieldKey="speaker">
            <Input id="line-speaker" value={line.speaker} placeholder={t('steps.speakerPlaceholder')} onChange={(e) => edit((l) => { l.speaker = e.target.value })} />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 8).map(([name, portrait]) => (
                  <Chip key={name} selected={line.speaker === name} onClick={() => edit((l) => { l.speaker = name; if (portrait) l.portrait = portrait })}>{name}</Chip>
                ))}
              </div>
            )}
          </Field>

          <Field label={t('steps.portrait')} help={t('steps.portraitHelp')} advancedKey="character"
            warning={PORTRAITS.includes(line.portrait) ? undefined : t('steps.portraitUnknown', { name: line.portrait })}>
            <button type="button" onClick={() => setPortraitOpen(true)} className="flex h-14 items-center gap-3 rounded-[2px] border border-edge bg-field px-2 text-left hover:border-cyan">
              <PortraitTile name={line.portrait} size={40} />
              <span className="flex-1 font-mono text-[14px] text-white">{line.portrait}</span>
              <ChevronRight className="size-4 text-dim" />
            </button>
          </Field>

          <Field label={t('steps.message')} help={t('steps.messageHelp')} htmlFor="line-text" advancedKey="text"
            warning={line.text.length > MAX_LINE ? t('steps.messageLong') : undefined}>
            <Textarea id="line-text" value={line.text} max={MAX_LINE} warnAt={280} rows={4} onChange={(v) => edit((l) => { l.text = v })} />
          </Field>

          <Field label={t('steps.closesAfter')} help={t('steps.closesAfterHelp')} advancedKey="showTimeSec">
            {line.closeAfterSec === WAIT_FOR_PLAYER
              ? <div className="flex h-11 items-center rounded-[2px] border border-edge bg-field px-3 text-[14px] text-ink">{t('steps.waitsForPlayer')}</div>
              : <Stepper value={line.closeAfterSec} min={1} max={9999} unit="s" onChange={(v) => edit((l) => { l.closeAfterSec = v })} />}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((n) => (
                <Chip key={n} selected={line.closeAfterSec === n} onClick={() => edit((l) => { l.closeAfterSec = n })}>{n}s</Chip>
              ))}
              <Chip selected={line.closeAfterSec === WAIT_FOR_PLAYER}
                onClick={() => edit((l) => { l.closeAfterSec = l.closeAfterSec === WAIT_FOR_PLAYER ? 5 : WAIT_FOR_PLAYER })}>{t('steps.waitForPlayer')}</Chip>
            </div>
          </Field>

          {choiceLine && (
            <Field label={t('steps.choicesCount', { n: line.choices.length, max: MAX_CHOICES })} help={t('steps.choicesHelp')} advancedKey="options">
              {line.choices.length > 0 && !isLast && (
                <p className="text-[12px] text-cyan">{t('steps.laterLines')}</p>
              )}
              <div className="flex flex-col gap-2">
                {line.choices.map((c, ci) => {
                  const target = c.targetStepId ? quest.steps.findIndex((s) => s.id === c.targetStepId) : -1
                  return (
                    <Card key={c.id} className="flex flex-col gap-2 p-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-cyan font-mono text-[11px] text-cyan">{ci + 1}</span>
                        <Input
                          aria-label={t('steps.choiceText', { n: ci + 1 })}
                          value={c.text}
                          placeholder={t('steps.buttonText')}
                          onChange={(e) => {
                            const v = e.target.value
                            const clean = v.replace(/[;=]/g, '')
                            setBlockedFor(clean !== v ? c.id : blockedFor === c.id ? null : blockedFor)
                            edit((l) => { l.choices[ci].text = clean })
                          }}
                        />
                        <Button size="icon" variant="ghost" aria-label={t('steps.removeChoice', { n: ci + 1 })} onClick={() => edit((l) => { l.choices.splice(ci, 1) })}>
                          <X className="size-4" />
                        </Button>
                      </div>
                      {blockedFor === c.id && <p className="pl-8 text-[12px] text-amber">{t('steps.choiceBlocked')}</p>}
                      <button type="button" onClick={() => setGoesTo(c.id)} className="flex min-h-11 items-center gap-2 rounded-[2px] pl-8 pr-2 text-left hover:bg-white/5">
                        <span className="text-[13px] text-dim">{t('steps.goesTo')}</span>
                        <span className="flex-1 truncate text-[14px] text-white">
                          {target >= 0 ? <><span className="font-mono text-cyan">{t('steps.stepN', { n: target + 1 })}</span> {stepName(quest.steps[target], target)}</> : t('steps.continueNext')}
                        </span>
                        <ChevronRight className="size-4 text-dim" />
                      </button>
                    </Card>
                  )
                })}
              </div>
              <Button
                variant="secondary"
                disabled={line.choices.length >= MAX_CHOICES}
                onClick={() => edit((l) => {
                  l.choices.push({ id: uid('choice'), text: '', targetStepId: null })
                  if (l.choices.length === 1) l.closeAfterSec = WAIT_FOR_PLAYER
                })}
              >
                <Plus className="size-4" />{t('steps.addChoice')}
              </Button>
              {line.choices.length >= MAX_CHOICES && <p className="text-[12px] text-ink/75">{t('steps.maxChoices')}</p>}
            </Field>
          )}

          <PortraitPicker nested open={portraitOpen} onOpenChange={setPortraitOpen} value={line.portrait} onSelect={(p) => { edit((l) => { l.portrait = p }); setPortraitOpen(false) }} />
          <StepPicker
            nested
            open={!!goesTo}
            onOpenChange={(v) => { if (!v) setGoesTo(null) }}
            steps={quest.steps}
            value={line.choices.find((c) => c.id === goesTo)?.targetStepId ?? null}
            onSelect={(id) => edit((l) => { const c = l.choices.find((x) => x.id === goesTo); if (c) c.targetStepId = id })}
            onNewStep={() => {
              const created = newStep()
              update((s, q) => {
                q.steps.push(created)
                const c = s.dialogue.find((x) => x.id === lineId)?.choices.find((x) => x.id === goesTo)
                if (c) c.targetStepId = created.id
              })
            }}
          />
        </div>
      )}
    </Sheet>
  )
}

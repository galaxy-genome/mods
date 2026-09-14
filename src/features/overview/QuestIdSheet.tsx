import { AlertTriangle, CheckCircle2, Shuffle, XCircle } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/inputs'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { randomQuestId } from '@/lib/factory'
import { GAME_QUESTS, GAME_QUEST_ID_MAX, GAME_QUEST_ID_MIN } from '@/lib/reference'
import type { ModPart, QuestView } from '@/lib/types'
import { t, useT } from '@/i18n'
import { addHistory, updatePart, useEditor } from '@/store/editor'

const idOf = (m: ModPart) => (m.meta.type === 'quest' ? (m as QuestView).versions[(m as QuestView).primaryLang]?.settings.questId : undefined)

function idState(id: number, modId: string, parts: ModPart[]) {
  if (!Number.isInteger(id) || id <= 0) return { tone: 'error' as const, text: t('overview.idWhole') }
  if (id >= GAME_QUEST_ID_MIN && id <= GAME_QUEST_ID_MAX) {
    const g = GAME_QUESTS.find((q) => q.id === id)
    return { tone: 'error' as const, text: <>{t('overview.idGamePre')} <em className="text-white">{g?.name ?? id}</em>. {t('overview.idGamePost')}</> }
  }
  const dupe = parts.find((m) => m.meta.id !== modId && idOf(m) === id)
  if (dupe) return { tone: 'warning' as const, text: <>{t('overview.idDupePre')} <em className="text-white">{dupe.meta.title}</em>. {t('overview.idDupePost')}</> }
  return { tone: 'free' as const, text: t('overview.idFree') }
}

export function IdStatus({ id, modId }: { id: number; modId: string }) {
  useT()
  const parts = useEditor((s) => s.parts)
  const st = idState(id, modId, parts)
  return <IdStatusInline tone={st.tone} text={st.text} />
}

export function QuestIdSheet({ modId, open, onOpenChange }: { modId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  useT()
  const parts = useEditor((s) => s.parts)
  const current = idOf(parts.find((m) => m.meta.id === modId)!) ?? 0
  const [draft, setDraft] = React.useState(String(current))
  const [confirm, setConfirm] = React.useState<{ from: number; to: number; dependents: ModPart[] } | null>(null)
  React.useEffect(() => { if (open) setDraft(String(current)) }, [open, current])

  const n = Number(draft)
  const st = idState(n, modId, parts)
  const taken = () => [...GAME_QUESTS.map((g) => g.id), ...parts.map(idOf).filter((x): x is number => x !== undefined)]

  const apply = () => {
    const from = current
    void addHistory(modId, t('lib.beforeQuestId', { from }), true)
    updatePart(modId, (m) => Object.values((m as QuestView).versions).forEach((v) => { if (v) v.settings.questId = n }))
    onOpenChange(false)
    const dependents = parts.filter((m) => m.meta.id !== modId && m.meta.type === 'quest' && Object.values((m as QuestView).versions).some((v) => v?.settings.requiredQuestIds.includes(from)))
    if (dependents.length) setConfirm({ from, to: n, dependents })
    else toast.success(t('overview.idChanged', { id: n }))
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={t('overview.changeQuestId')}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant={st.tone === 'warning' ? 'warning' : 'primary'} className="flex-1" disabled={st.tone === 'error' || n === current} onClick={apply}>{t('overview.useThisId')}</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <Field label={t('overview.questId')} htmlFor="quest-id-input" help={t('overview.questIdHelp')}>
            <Input id="quest-id-input" inputMode="numeric" autoFocus value={draft} invalid={st.tone === 'error'} warn={st.tone === 'warning'} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} />
            <IdStatusInline tone={st.tone} text={st.text} />
          </Field>
          <Button variant="secondary" onClick={() => setDraft(String(randomQuestId(taken())))}><Shuffle className="size-4" />{t('overview.pickFree')}</Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={t('overview.updateReqsTitle')}
        body={confirm && t('overview.updateReqsBody', { count: confirm.dependents.length, names: confirm.dependents.map((d) => `“${d.meta.title}”`).join(', '), from: confirm.from, to: confirm.to })}
        cancelLabel={t('overview.leaveAsIs')}
        confirmLabel={t('overview.update')}
        onConfirm={() => {
          if (!confirm) return
          confirm.dependents.forEach((d) => updatePart(d.meta.id, (m) => Object.values((m as QuestView).versions).forEach((v) => {
            if (v) v.settings.requiredQuestIds = v.settings.requiredQuestIds.map((x) => (x === confirm.from ? confirm.to : x))
          })))
          toast.success(t('overview.updatedMods', { count: confirm.dependents.length }))
        }}
      />
    </>
  )
}

function IdStatusInline({ tone, text }: { tone: 'error' | 'warning' | 'free'; text: React.ReactNode }) {
  const Icon = tone === 'error' ? XCircle : tone === 'warning' ? AlertTriangle : CheckCircle2
  const cls = tone === 'error' ? 'text-danger' : tone === 'warning' ? 'text-amber' : 'text-success'
  return <p role="status" aria-live="polite" className={`flex items-start gap-1.5 text-[13px] ${cls}`}><Icon className="mt-px size-3.5 shrink-0" /><span>{text}</span></p>
}

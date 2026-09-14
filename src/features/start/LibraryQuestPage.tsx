import { Copy, Flag, Lock } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Card, Em, SectionLabel } from '@/components/ui/surfaces'
import { newQuestView, newStep } from '@/lib/factory'
import { GAME_QUESTS, type GameQuest } from '@/lib/reference'
import { describeCondition } from '@/lib/conditions'
import { addModFromPart } from '@/store/editor'
import { t, useT } from '@/i18n'
import { OfflineChip } from './common'
import { requirementText } from './LibraryPage'

export function copyGameQuest(g: GameQuest) {
  const title = t('startLib.copyTitle', { name: g.name })
  const mod = newQuestView(title, {
    settings: {
      description: g.description, charName: g.charName, charImage: g.charImage, stationName: g.station,
      startMode: g.randomSpace ? 'space' : 'bar',
      requiredQuestIds: g.requires.split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number),
    },
    steps: g.steps.map((s) => newStep({ name: s.name.trim(), journal: s.todo, finishWhen: s.completeAction.replace(/^BUTTON_/, '') || null })),
    rumors: [],
  })
  mod.meta.origin = 'game'
  return mod
}

export function LibraryQuestPage() {
  const t = useT()
  const { questId } = useParams()
  const navigate = useNavigate()
  const g = GAME_QUESTS.find((x) => String(x.id) === questId)
  if (!g) return <Navigate to="/library" replace />
  const req = requirementText(g)

  const copy = () => {
    const mod = copyGameQuest(g)
    mod.meta.origin = 'local'
    const newId = addModFromPart(mod)
    toast(t('startLib.copied', { name: g.name }), { description: t('startLib.copiedBody') })
    navigate(`/mod/${newId}/overview`)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <AppBar back="/library" title={g.name} subtitle={t('startLib.gameQuestSubtitle', { id: g.id })}><OfflineChip /></AppBar>
      <div className="flex items-center gap-2 border-b border-grid bg-grid/15 px-4 py-2.5 text-[13px] text-ink">
        <Lock className="size-4 shrink-0 text-grid-strong" />
        <span className="flex-1">{t('startLib.gameLocked')}</span>
      </div>
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 py-4 pb-28">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[15px] leading-relaxed text-white">“{g.description}”</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-dim">{t('startLib.contact')}</dt><dd className="font-mono text-ink">{g.charName} · {g.charImage}</dd>
            <dt className="text-dim">{t('startLib.offered')}</dt><dd className="font-mono text-ink">{g.randomSpace ? t('startLib.startsInSpace') : g.station}</dd>
            <dt className="text-dim">{t('startLib.requires')}</dt><dd className="font-mono text-ink">{req || t('startLib.nothing')}</dd>
            <dt className="text-dim">{t('startLib.steps')}</dt><dd className="font-mono text-ink">{g.steps.length}</dd>
          </dl>
        </Card>
        <SectionLabel>{t('startLib.steps')}</SectionLabel>
        <ol className="flex flex-col gap-2">
          {g.steps.map((s, i) => (
            <li key={i}>
              <Card className="flex gap-3 p-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-[2px] border border-edge font-mono text-[12px] text-cyan">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] font-semibold text-white">{s.name.trim() || t('startLib.stepN', { n: i + 1 })}</span>
                  {s.todo && <span className="text-[13px] leading-snug text-ink/85">{t('startLib.journal', { text: s.todo })}</span>}
                  <span className="flex items-start gap-1.5 text-[13px] text-ink">
                    <Flag className="mt-0.5 size-3.5 shrink-0 text-dim" />
                    <span>{t('startLib.finishesWhen')} <Em>{describeCondition(s.completeAction || null)}</Em></span>
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </main>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-deep/95 backdrop-blur">
        <div className="mx-auto max-w-[720px] px-4 py-3">
          <Button variant="solid" size="lg" className="w-full" onClick={copy}><Copy className="size-4" />{t('startLib.makeCopy')}</Button>
        </div>
      </div>
    </div>
  )
}

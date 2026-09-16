import { BookOpen, ChevronRight, Copy, DatabaseBackup, Download, Star, Share2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Stepper } from '@/components/ui/inputs'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { Card, RowGroup, SeverityIcon } from '@/components/ui/surfaces'
import { useProblems } from '@/hooks/use-problems'
import type { StarsView } from '@/lib/types'
import { questOf, setFavorite, usePart } from '@/store/editor'
import { copyText, downloadText, pretty, toGameJson, toStarsJson } from './gameJson'
import { useT } from '@/i18n'

function Action({ icon, title, subtitle, onClick, disabled }: { icon: React.ReactNode; title: string; subtitle: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] disabled:opacity-40">
      <span className="text-cyan [&_svg]:size-5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] text-white">{title}</span>
        <span className="text-[12px] text-dim">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 text-dim" />
    </button>
  )
}

export function ExportSheet({ modId, open, onOpenChange }: { modId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const mod = usePart(modId)
  const navigate = useNavigate()
  const { errors, warnings } = useProblems(modId)
  const q = questOf(mod)
  const [n, setN] = React.useState(() => (q ? q.settings.questId % 200 : 0))
  const [pending, setPending] = React.useState<null | 'download' | 'share'>(null)
  if (!mod) return null

  const fileName = q ? `Quest${n}.json` : 'StarsStations.json'
  const json = () => pretty(q ? toGameJson(q) : toStarsJson(mod as StarsView))
  const blocked = errors.length > 0

  const download = () => { downloadText(fileName, json()); toast.success(t('output.exDownloaded', { file: fileName }), { description: t('output.exDownloadedHint'), action: { label: t('start.howToInstall'), onClick: () => navigate('/install') } }) }
  const share = async () => {
    const file = new File([json()], fileName, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: mod.meta.title }) } catch { /* dismissed */ }
    } else {
      toast(t('output.exNoShare'), { description: t('output.exNoShareHint', { file: fileName }) })
    }
  }
  const guarded = (what: 'download' | 'share') => (warnings.length ? setPending(what) : what === 'download' ? download() : share())

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={t(q ? 'output.exTitleQuest' : 'output.exTitleStars')} description={t('output.exDescription', { title: mod.meta.title })}>
        <div className="flex flex-col gap-4">
          {blocked && (
            <Card tone="danger" className="flex flex-col gap-2 p-3">
              <p className="flex items-start gap-2 text-[14px] text-white">
                <SeverityIcon severity="error" className="mt-0.5 size-4 shrink-0" />
                {t('output.exErrors', { count: errors.length, message: errors[0]?.message ?? '' })}
              </p>
              <Button variant="destructive" size="sm" className="self-start" onClick={() => { onOpenChange(false); dispatchEvent(new Event('open-problems')) }}>{t('output.exShowProblems')}</Button>
            </Card>
          )}

          <RowGroup>
            <Action icon={<Star className={mod.meta.favorite ? 'fill-amber text-amber' : ''} />} title={t(mod.meta.favorite ? 'output.exInFavorites' : 'output.exAddFavorite')} subtitle={t(mod.meta.favorite ? 'output.exInFavoritesHint' : 'output.exAddFavoriteHint')} onClick={() => { setFavorite([mod.meta.id], !mod.meta.favorite); toast(t(mod.meta.favorite ? 'output.exRemovedFavorite' : 'output.exAddedFavorite')) }} />
            <Action icon={<Download />} title={t('output.exDownload')} subtitle={blocked ? t('output.exFixFirst') : fileName} disabled={blocked} onClick={() => guarded('download')} />
            <Action icon={<Share2 />} title={t('output.exShare')} subtitle={blocked ? t('output.exFixFirst') : t('output.exShareHint')} disabled={blocked} onClick={() => guarded('share')} />
            <Action icon={<Copy />} title={t('output.exCopy')} subtitle={t('output.exCopyHint')} onClick={() => copyText(json())} />
            <Action
              icon={<DatabaseBackup />}
              title={t('output.exBackup')}
              subtitle={t('output.exBackupHint')}
              onClick={() => { downloadText(`${mod.meta.title.replace(/[^\w-]+/g, '-')}.backup.json`, pretty(mod)); toast.success(t('output.exBackupDone')) }}
            />
          </RowGroup>

          {q && (
            <div className="flex items-center gap-3">
              <label htmlFor="export-n" className="flex flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-white">{t('output.exFileNumber')}</span>
                <span className="text-[12px] text-ink/75">{t('output.exFileNumberHint')}</span>
              </label>
              <Stepper id="export-n" value={n} min={0} max={199} onChange={setN} className="w-36" />
            </div>
          )}

          <Button variant="text" className="self-start" onClick={() => { onOpenChange(false); navigate('/install') }}>
            <BookOpen className="size-4" />{t('output.exInstall')}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title={t('output.exWarnings', { count: warnings.length })}
        body={t('output.exWarningsBody')}
        confirmLabel={t(pending === 'share' ? 'output.exShareAnyway' : 'output.exDownloadAnyway')}
        tone="warning"
        onConfirm={() => (pending === 'share' ? share() : download())}
      >
        <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
          {warnings.map((w) => (
            <li key={w.id} className="flex items-start gap-2 text-[13px] text-ink">
              <SeverityIcon severity="warning" className="mt-0.5 size-3.5 shrink-0" />
              <span><span className="text-dim">{w.location.label}: </span>{w.message}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}

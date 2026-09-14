import { useNavigate } from 'react-router-dom'
import { Copy, FileJson, Folder, Star } from 'lucide-react'
import { toast } from 'sonner'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/surfaces'
import { t, useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { OfflineChip } from './common'

const MOD_FOLDER = 'Android/data/com.skvgames.GalaxyGenome/files/'

async function copyPath() {
  try {
    await navigator.clipboard.writeText(MOD_FOLDER)
    toast(t('startHelp.igCopied'))
  } catch {
    toast(t('startHelp.igCopyBlocked'), { description: MOD_FOLDER })
  }
}

const steps = (): { title: string; body: React.ReactNode; art: React.ReactNode; wide?: boolean }[] => [
  {
    title: t('startHelp.ig1Title'),
    body: t('startHelp.ig1Body'),
    art: (
      <div className="flex flex-col gap-1.5 font-mono text-[12px]">
        {['Android', 'data', 'com.skvgames.GalaxyGenome', 'files'].map((f, i) => (
          <span key={f} className="flex items-center gap-1.5 text-ink" style={{ paddingLeft: i * 14 }}><Folder className="size-3.5 text-grid-strong" />{f}</span>
        ))}
        <span className="flex items-center gap-1.5 text-cyan" style={{ paddingLeft: 56 }}><FileJson className="size-3.5" />Quest12.json</span>
        <div className="mt-2 flex items-center gap-2 rounded-[2px] border border-edge bg-field py-1 pl-2 pr-1">
          <span className="min-w-0 flex-1 truncate text-ink">{MOD_FOLDER}</span>
          <Button size="icon-sm" variant="ghost" aria-label={t('startHelp.igCopyPath')} onClick={copyPath}><Copy className="size-4" /></Button>
        </div>
      </div>
    ),
  },
  {
    title: t('startHelp.ig2Title'),
    body: t('startHelp.ig2Body'),
    art: (
      <div className="flex flex-col gap-1 text-[12px]">
        {(['ig2Continue', 'ig2NewGame', 'ig2Mods', 'ig2Settings'] as const).map((m) => (
          <span key={m} className={cn('rounded-[2px] border px-2 py-1 font-semibold uppercase tracking-[0.12em]', m === 'ig2Mods' ? 'border-cyan text-cyan' : 'border-edge text-dim')}>{t(`startHelp.${m}`)}</span>
        ))}
      </div>
    ),
  },
  {
    title: t('startHelp.ig3Title'),
    body: t('startHelp.ig3Body'),
    wide: true,
    art: (
      <figure className="flex flex-col gap-2">
        <a href={`${import.meta.env.BASE_URL}help/modifications-activated.jpg`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[2px] border border-edge">
          <img src={`${import.meta.env.BASE_URL}help/modifications-activated.jpg`} alt={t('startHelp.ig3Alt')} className="w-full" loading="lazy" width={1400} height={630} />
        </a>
        <figcaption className="text-[12px] leading-snug text-ink/75">{t('startHelp.ig3Caption')}</figcaption>
      </figure>
    ),
  },
  {
    title: t('startHelp.ig4Title'),
    body: t('startHelp.ig4Body'),
    art: <span className="font-mono text-[12px] text-amber">{t('startHelp.ig4Art')}</span>,
  },
]

export function InstallSteps() {
  useT()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {steps().map((s, i) => (
          <li key={s.title}>
            <Card className={cn('grid gap-3 p-4', !s.wide && 'sm:grid-cols-[1fr_220px]')}>
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-[2px] border border-cyan font-mono text-[13px] text-cyan">{i + 1}</span>
                <div className="flex flex-col gap-1">
                  <h2 className="text-[16px] font-semibold text-white">{s.title}</h2>
                  <p className="text-[14px] leading-relaxed text-ink">{s.body}</p>
                </div>
              </div>
              <div className={cn('rounded-[2px] border border-edge bg-void', s.wide ? 'p-1.5' : 'grid-texture p-3')}>{s.art}</div>
            </Card>
          </li>
        ))}
      </ol>
      <Card tone="cyan" className="flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-white"><Star className="size-5 text-amber" />{t('startHelp.igMoreTitle')}</h2>
        <p className="text-[14px] leading-relaxed text-ink">{t('startHelp.igMoreBody')}</p>
        <Button variant="primary" className="self-start" onClick={() => navigate('/')}>{t('startHelp.igGoHome')}</Button>
      </Card>
    </div>
  )
}

export function InstallGuidePage() {
  useT()
  return (
    <div className="min-h-dvh bg-void">
      <AppBar back={() => history.back()} title={t('startHelp.igTitle')} subtitle={t('startHelp.igSubtitle')}><OfflineChip /></AppBar>
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-4 pb-12">
        <InstallSteps />
      </main>
    </div>
  )
}

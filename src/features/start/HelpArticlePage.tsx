import { Check, Circle, ExternalLink, X } from 'lucide-react'
import * as React from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Card, EmptyState, SectionLabel, SeverityIcon } from '@/components/ui/surfaces'
import { modProblems } from '@/lib/rules'
import type { ModPart, Problem } from '@/lib/types'
import { t, useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { loadSamples, questOf, useEditor } from '@/store/editor'
import { useMediaQuery } from '@/hooks/use-media-query'
import { OfflineChip } from './common'
import { HelpMenu } from './HelpPage'
import { ARTICLES, Term, groupLabel } from './help-content'
import { InstallSummary } from './InstallGuidePage'

export function HelpArticlePage() {
  const { slug } = useParams()
  return <HelpArticleView slug={slug ?? ''} />
}

/** One article; from 900px wide the article list sits beside it. */
export function HelpArticleView({ slug }: { slug: string }) {
  useT()
  const wide = useMediaQuery('(min-width: 900px)')
  const article = ARTICLES.find((a) => a.slug === slug)
  React.useEffect(() => { scrollTo(0, 0) }, [slug])
  if (!article) return <Navigate to="/help" replace />
  const index = ARTICLES.indexOf(article)
  const next = ARTICLES[index + 1]
  return (
    <div className="min-h-dvh bg-void">
      <AppBar back={wide ? '/' : '/help'} title={wide ? t('startHelp.help') : article.title} subtitle={wide ? undefined : t('startHelp.helpGroup', { group: groupLabel(article.group) })}><OfflineChip /></AppBar>
      <div className="flex">
      {wide && <HelpMenu active={slug} />}
      <main className="mx-auto flex min-w-0 max-w-[680px] flex-1 flex-col gap-4 px-4 py-5 pb-12">
        <h1 className="text-[22px] font-bold leading-tight text-white">{article.title}</h1>
        {slug === 'installing' ? <InstallSummary /> : slug === 'not-showing' ? <Checklist /> : article.body?.()}
        {next && (
          <Link to={`/help/${next.slug}`} className="mt-4 flex min-h-14 flex-col justify-center rounded-[4px] border border-edge bg-panel px-3 hover:border-cyan">
            <span className="section-label">{t('startHelp.nextArticle')}</span>
            <span className="text-[15px] text-white">{next.title}</span>
          </Link>
        )}
      </main>
      </div>
    </div>
  )
}

type CheckItem = { label: () => React.ReactNode; ids: (p: Problem) => boolean }

const CHECKS: CheckItem[] = [
  { label: () => <Term term="step">{t('startHelp.ckMinSteps')}</Term>, ids: (p) => p.id === 'min-steps' },
  { label: () => t('startHelp.ckIdGame'), ids: (p) => p.id === 'id-game' },
  { label: () => t('startHelp.ckIdDupe'), ids: (p) => p.id === 'id-dupe' },
  { label: () => t('startHelp.ckStation'), ids: (p) => ['no-station', 'station-unknown', 'chance-zero'].includes(p.id) },
  { label: () => t('startHelp.ckFinish'), ids: (p) => p.id.startsWith('finish-') },
  { label: () => t('startHelp.ckReq'), ids: (p) => p.id.startsWith('req-') },
]

function questLine(m: ModPart) {
  const q = questOf(m)
  const first = q?.steps.flatMap((st) => st.dialogue)[0]?.text
  return [q ? `ID ${q.settings.questId}` : '', first].filter(Boolean).join(' · ')
}

function Checklist() {
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)
  const mods = useEditor((s) => s.mods)
  const quests = parts.filter((m) => m.meta.type === 'quest')
  const [modId, setModId] = React.useState<string | undefined>(undefined)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const mine = quests.filter((m) => !m.meta.community)
  const mod = quests.find((m) => m.meta.id === modId) ?? mine[0] ?? quests[0]

  if (!mod) {
    return (
      <EmptyState icon={<Circle />} title={t('startHelp.ckNoneTitle')} body={t('startHelp.ckNoneBody')} action={<Button variant="primary" onClick={loadSamples}>{t('startHelp.ckLoadSamples')}</Button>} />
    )
  }
  const problems = modProblems(mod, parts)
  const q = questOf(mod)!
  const others = problems.filter((p) => p.severity !== 'tip' && !CHECKS.some((c) => c.ids(p)))
  const open = (p: Problem) => navigate(`/mod/${mod.meta.id}/${p.location.path}${p.location.field ? `?field=${p.location.field}&sev=${p.severity}` : ''}`)
  const modOf = (m: ModPart) => mods.find((b) => m.meta.id.startsWith(`${b.meta.id}~`))
  const needle = query.trim().toLowerCase()
  const groups = mods
    .map((b) => ({ mod: b, quests: quests.filter((m) => modOf(m) === b && (!needle || `${b.meta.title} ${m.meta.title} ${questLine(m)}`.toLowerCase().includes(needle))) }))
    .filter((g) => g.quests.length)
    .sort((x, y) => Number(!!x.mod.meta.community) - Number(!!y.mod.meta.community))
  const current = modOf(mod)

  return (
    <>
      <p className="text-[15px] leading-relaxed text-ink">{t('startHelp.ckIntro')}</p>
      <button onClick={() => setPickerOpen(true)} className="flex min-h-14 w-full items-center gap-3 rounded-[4px] border border-cyan/70 bg-cyan/[0.06] px-3 py-2 text-left hover:border-cyan">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="section-label">{t('startHelp.ckChecking')}</span>
          <span className="truncate text-[15px] font-semibold text-white">{current && current.quests.length > 1 ? `${current.meta.title} · ${mod.meta.title}` : mod.meta.title}</span>
          <span className="truncate font-mono text-[12px] text-dim">{questLine(mod)}</span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-cyan">{t('startHelp.ckChange')}</span>
      </button>
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen} title={t('startHelp.ckPick')} full>
        <div className="flex flex-col gap-3 pt-1">
          <SearchInput value={query} onChange={setQuery} placeholder={t('startHelp.ckSearch')} />
          {groups.map(({ mod: owner, quests: list }) => (
            <div key={owner.meta.id} className="flex flex-col gap-1.5">
              <SectionLabel>{owner.meta.title}{list.length > 1 ? ` (${list.length})` : ''}</SectionLabel>
              <ul className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
                {list.slice(0, 200).map((m) => {
                  const errs = modProblems(m, parts).filter((p) => p.severity === 'error').length
                  const sameName = list.filter((x) => x.meta.title === m.meta.title).length > 1
                  const first = questOf(m)?.steps.flatMap((st) => st.dialogue)[0]?.text
                  return (
                    <li key={m.meta.id}>
                      <button onClick={() => { setModId(m.meta.id); setPickerOpen(false) }} aria-current={m.meta.id === mod.meta.id}
                        className={cn('flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03]', m.meta.id === mod.meta.id && 'bg-cyan/10')}>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn('text-[14px] text-white', sameName && first ? 'line-clamp-2' : 'truncate')}>{sameName && first ? first : m.meta.title}</span>
                          <span className="truncate font-mono text-[12px] text-dim">{sameName && first ? `${m.meta.title} · ID ${questOf(m)?.settings.questId}` : questLine(m)}</span>
                        </span>
                        {errs > 0 && <X className="size-4 shrink-0 text-danger" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {groups.length === 0 && <p className="text-[13px] text-dim">{t('startHelp.ckNoMatch')}</p>}
        </div>
      </Sheet>
      <SectionLabel>{t('startHelp.ckInFile')}</SectionLabel>
      <Card className="divide-y divide-edge">
        {CHECKS.map((c, i) => {
          const hits = problems.filter(c.ids)
          const ok = hits.length === 0
          return (
            <div key={i} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', ok ? 'border-success text-success' : 'border-danger text-danger')}>
                  {ok ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span className="flex-1 text-[14px] leading-snug text-white">{c.label()}</span>
              </div>
              {hits.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 pl-8">
                  <span className="flex-1 text-[13px] text-ink/85">{p.message}</span>
                  <Button size="sm" variant="secondary" onClick={() => open(p)}>{t('startHelp.ckGoTo', { place: p.location.label.split(' · ')[0] })}</Button>
                </div>
              ))}
            </div>
          )
        })}
      </Card>
      <SectionLabel>{t('startHelp.ckOnPhone')}</SectionLabel>
      <Card className="divide-y divide-edge">
        {[
          t('startHelp.ckPhoneLang', { lang: q.settings.lang.toUpperCase() }),
          t('startHelp.ckPhoneFolder'),
          t('startHelp.ckPhoneSwitch'),
          t('startHelp.ckPhoneId'),
        ].map((line) => (
          <div key={line} className="flex items-start gap-3 px-3 py-3">
            <Circle className="mt-0.5 size-5 shrink-0 text-dim" />
            <span className="text-[14px] leading-snug text-ink">{line}</span>
          </div>
        ))}
      </Card>
      <Link to="/install" className="flex items-center gap-1.5 text-[14px] text-cyan hover:text-white">{t('startHelp.ckInstallGuide')}<ExternalLink className="size-3.5" /></Link>
      {others.length > 0 && (
        <>
          <SectionLabel>{t('startHelp.ckOthers')}</SectionLabel>
          <Card className="divide-y divide-edge">
            {others.map((p) => (
              <button key={p.id} onClick={() => open(p)} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-white/[0.03]">
                <SeverityIcon severity={p.severity} className="mt-0.5 size-4 shrink-0" />
                <span className="flex-1 text-[14px] leading-snug text-white">{p.message}<span className="block font-mono text-[11px] text-dim">{p.location.label}</span></span>
              </button>
            ))}
          </Card>
        </>
      )}
    </>
  )
}

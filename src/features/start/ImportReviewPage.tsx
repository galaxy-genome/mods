import { Check, CircleDot, FileWarning, FileX, Wrench } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, Section, SeverityIcon } from '@/components/ui/surfaces'
import { randomQuestId } from '@/lib/factory'
import { LANGS } from '@/lib/reference'
import { modDependencies, satisfies } from '@/lib/dependencies'
import { modProblems } from '@/lib/rules'
import type { ModPart, Problem, QuestView, StarsView } from '@/lib/types'
import { addModFromPart, getState, questOf, setImportDraft, addHistory, useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import { OfflineChip, OpenFileSheet } from './common'
import { importText, SAMPLE_FILE, SAMPLE_FILE_NAME } from './importer'

export function ImportReviewPage() {
  const t = useT()
  const incoming = useEditor((s) => s.importDraft)
  const [pickOpen, setPickOpen] = React.useState(false)
  const outcome = React.useMemo(() => (incoming?.text != null ? importText(incoming.text) : null), [incoming?.text])
  const fileName = incoming?.fileName ?? t('startLib.modFile')
  const trySample = () => setImportDraft({ text: SAMPLE_FILE, fileName: SAMPLE_FILE_NAME })

  const frame = (body: React.ReactNode, action?: React.ReactNode) => (
    <div className="flex min-h-dvh flex-col bg-void">
      <AppBar back="/" title={t('startLib.reviewTitle')} subtitle={outcome ? fileName : undefined}><OfflineChip />{action}</AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-4 pb-10">{body}</main>
      <OpenFileSheet open={pickOpen} onOpenChange={setPickOpen} />
    </div>
  )

  if (!outcome) {
    return frame(
      <EmptyState
        icon={<FileWarning />}
        title={t('startLib.nothingToReview')}
        body={t('startLib.nothingToReviewBody')}
        action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={() => setPickOpen(true)}>{t('startLib.openModFile')}</Button><Button variant="secondary" onClick={trySample}>{t('startLib.trySample')}</Button></div>}
      />,
    )
  }

  if (outcome.kind === 'rejected') {
    return frame(
      <EmptyState
        icon={<FileX />}
        title={t('startLib.rejectedTitle')}
        body={<>{t('startLib.rejectedBody')} <Link className="text-cyan underline" to="/help/older-files">{t('startLib.olderFiles')}</Link></>}
        action={<Button variant="primary" onClick={() => setPickOpen(true)}>{t('startLib.tryAnother')}</Button>}
      />,
    )
  }

  if (outcome.kind === 'parse-error') {
    const first = outcome.line - outcome.errorLine
    return frame(
      <>
        <Card tone="danger" className="flex flex-col gap-2 p-4">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-white"><SeverityIcon severity="error" className="size-5" />{t('startLib.cantRead')}</h2>
          <p className="font-mono text-[13px] text-ink">{t('startLib.lineColumn', { line: outcome.line, column: outcome.column })}</p>
          <p className="text-[14px] leading-relaxed text-ink">{outcome.cause}</p>
        </Card>
        <div className="overflow-x-auto rounded-[4px] border border-edge bg-field py-2">
          <pre className="font-mono text-[12px] leading-5">
            {outcome.snippet.map((l, i) => (
              <React.Fragment key={i}>
                <div className={i === outcome.errorLine ? 'bg-danger/15 text-white' : 'text-ink/70'}>
                  <span className="inline-block w-10 select-none pr-3 text-right text-dim">{first + i}</span>{l || ' '}
                </div>
                {i === outcome.errorLine && <div className="text-danger"><span className="inline-block w-10 pr-3" />{' '.repeat(Math.max(0, outcome.column - 1))}^</div>}
              </React.Fragment>
            ))}
          </pre>
        </div>
        <p className="text-[13px] text-dim">{t('startLib.handEdit')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setPickOpen(true)}>{t('startLib.tryAnother')}</Button>
          <Button variant="ghost" onClick={trySample}>{t('startLib.trySample')}</Button>
        </div>
      </>,
    )
  }

  return <Review key={incoming?.text} initial={outcome.mod} fixed={outcome.fixed} look={outcome.look} kept={outcome.kept} fileName={fileName} frame={frame} />
}

function Review({ initial, fixed, look, kept, fileName, frame }: {
  initial: ModPart; fixed: string[]; look: string[]; kept: string[]; fileName: string
  frame: (body: React.ReactNode, action?: React.ReactNode) => React.ReactElement
}) {
  const t = useT()
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)
  const mods = useEditor((s) => s.mods)
  const [mod, setMod] = React.useState(initial)
  const [extraFixed, setExtraFixed] = React.useState<string[]>([])
  const problems = React.useMemo(() => modProblems(mod, [mod, ...parts]).filter((p) => p.severity !== 'tip' && !p.id.startsWith('reminder-')), [mod, parts])
  const q = questOf(mod)
  const lang = mod.meta.type === 'quest' ? LANGS.find((l) => l.key === (mod as QuestView).primaryLang)?.label : null
  const allFixed = [...fixed, ...extraFixed]
  const lookCount = problems.length + look.length
  const errors = problems.filter((p) => p.severity === 'error').length

  const commit = (then?: Problem) => {
    if (getState().parts.some((m) => m.meta.id === mod.meta.id)) return
    const id = addModFromPart(mod)
    setImportDraft(null)
    void addHistory(id, t('startLib.importedEntry', { file: fileName }), true)
    const p = then?.location
    navigate(p ? `/mod/${id}/${p.path}${p.field ? `?field=${p.field}&sev=${then!.severity}` : ''}` : `/mod/${id}/overview`, { replace: true })
  }
  // Places found only in other mods on this device become suggested required mods.
  const deps = React.useMemo(() => {
    const self = { meta: { ...mod.meta, id: '' }, quests: mod.meta.type === 'quest' ? [mod as QuestView] : [], stars: mod.meta.type === 'stars' ? mod as StarsView : null }
    return modDependencies(self, mods).filter((d) => !mod.meta.requires?.some((r) => satisfies(r, d.source)))
  }, [mod, mods])
  const requireAll = () => {
    setMod({ ...mod, meta: { ...mod.meta, requires: [...(mod.meta.requires ?? []), ...deps.map((d) => d.requirement)] } } as ModPart)
    setExtraFixed((f) => [...f, ...deps.map((d) => t('startLib.requiredAdded', { mod: d.requirement.title }))])
  }
  const newId = () => {
    const old = q!.settings.questId
    const taken = parts.flatMap((m) => questOf(m)?.settings.questId ?? [])
    const next = structuredClone(mod) as QuestView
    next.versions[next.primaryLang]!.settings.questId = randomQuestId(taken)
    setMod(next)
    setExtraFixed((f) => [...f, t('startLib.idChanged', { old, id: next.versions[next.primaryLang]!.settings.questId })])
  }

  const summary = q ? t('startLib.summaryQuest', { lang: lang ?? '', steps: t('startLib.steps', { count: q.steps.length }) }) : t('startLib.starsStations')
  return frame(
    <>
      <Card className="flex flex-col gap-1 p-4">
        <p className="font-mono text-[12px] text-dim">{fileName}</p>
        <h2 className="text-[18px] font-semibold text-white">{mod.meta.title}</h2>
        <p className="font-mono text-[12px] text-ink/80">{summary}</p>
        <p className={errors ? 'mt-1 flex items-center gap-1.5 text-[14px] text-danger' : lookCount ? 'mt-1 flex items-center gap-1.5 text-[14px] text-amber' : 'mt-1 flex items-center gap-1.5 text-[14px] text-success'}>
          {errors ? <SeverityIcon severity="error" className="size-4" /> : lookCount ? <SeverityIcon severity="warning" className="size-4" /> : <Check className="size-4" />}
          {lookCount ? t('startLib.toLookAt', { count: lookCount }) : t('startLib.ready')}{allFixed.length ? t('startLib.fixesMade', { count: allFixed.length }) : ''}
        </p>
        <p className="mt-1 text-[12px] text-dim">{t('startLib.nothingBlocks')}</p>
      </Card>

      <Card className="overflow-hidden p-0">
        <Section title={t('startLib.fixedAuto', { count: allFixed.length })} defaultOpen={allFixed.length > 0} summary={allFixed.length ? allFixed[0] : t('startLib.nothingFixed')}>
          {allFixed.length ? <ItemList items={allFixed} icon={<Wrench className="size-4 text-success" />} /> : <p className="text-[14px] text-dim">{t('startLib.nothingFixedDot')}</p>}
        </Section>
        <Section title={t('startLib.needsLook', { count: lookCount })} defaultOpen summary={lookCount ? t('startLib.items', { count: lookCount }) : t('startLib.allClear')}>
          {lookCount === 0 && <p className="text-[14px] text-dim">{t('startLib.allClearDot')}</p>}
          <ul className="flex flex-col gap-3">
            {problems.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <SeverityIcon severity={p.severity} className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1 text-[14px] leading-snug text-white">{p.message}<span className="block font-mono text-[11px] text-dim">{p.location.label}</span></span>
                </div>
                <div className="pl-6">
                  {p.id.startsWith('dep-add-') && deps.length
                    ? <Button size="sm" variant="warning" onClick={requireAll}>{p.fix!.label}</Button>
                    : p.id === 'id-game' || p.id === 'id-dupe'
                    ? <Button size="sm" variant="warning" onClick={newId}>{t('startLib.pickNewId')}</Button>
                    : <Button size="sm" variant="secondary" onClick={() => commit(p)}>{t('startLib.importAndOpen', { place: p.location.label.split(' · ')[0] })}</Button>}
                </div>
              </li>
            ))}
            {look.map((text, i) => (
              <li key={`look-${i}`} className="flex items-start gap-2">
                <SeverityIcon severity="warning" className="mt-0.5 size-4 shrink-0" />
                <span className="flex-1 text-[14px] leading-snug text-white">{text}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t('startLib.keptAsIs', { count: kept.length })} defaultOpen={kept.length > 0} summary={kept.length ? kept[0] : t('startLib.nothingExtra')}>
          {kept.length ? <ItemList items={kept} icon={<CircleDot className="size-4 text-dim" />} /> : <p className="text-[14px] text-dim">{t('startLib.nothingExtraFile')}</p>}
        </Section>
      </Card>

      <div className="safe-bottom sticky bottom-0 -mx-4 border-t border-edge bg-void/95 px-4 pt-3 backdrop-blur">
        <Button variant="solid" size="lg" className="w-full" onClick={() => commit()}>{t('startLib.import')}</Button>
      </div>
    </>,
    <Button variant="text" size="sm" className="mr-2" onClick={() => commit()}><Check className="size-4" />{t('startLib.import')}</Button>,
  )
}

function ItemList({ items, icon }: { items: string[]; icon: React.ReactNode }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((text, i) => <li key={i} className="flex items-start gap-2 text-[14px] leading-snug text-ink"><span className="mt-0.5 shrink-0">{icon}</span>{text}</li>)}
    </ul>
  )
}

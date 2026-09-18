import { Copy, FileArchive, Globe2, ImagePlus, Info, Map as MapIcon, MoreVertical, Orbit, Plus, ScrollText, SearchX, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Input, SearchInput, Textarea } from '@/components/ui/inputs'
import { Menu } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { Badge, Card, EmptyState, SectionLabel, SeverityIcon, TipCard } from '@/components/ui/surfaces'
import { QuestStartInfo } from '@/features/map/QuestStart'
import { toGameJson, toStarsJson } from '@/features/output/gameJson'
import { useT } from '@/i18n'
import { dataUrlBytes, partsOf } from '@/lib/mods'
import { LANGS } from '@/lib/reference'
import { modProblems } from '@/lib/rules'
import { isSingleChain, questChain, startPlace } from '@/lib/questChain'
import { QUEST_TEMPLATES } from '@/lib/templates'
import type { Mod, QuestView, StarsView } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'
import { zip } from '@/lib/zip'
import { addQuestPart, addStarsPart, deleteMod, duplicateMod, removeCommunityEntry, removePart, setFavorite, updateMod, useEditor } from '@/store/editor'
import { FavoriteButton, modContents } from './HomePage'
import { CommunityBanner } from './CommunityBanner'
import { ModInfoSheet, RequiresLine } from './ModInfoSheet'
import { TemplateDiagram } from './common'

/** One mod's own files in every language, plus the catalogue entry a library pull request needs. */
function submissionZip(mod: Mod) {
  const files: { name: string; text?: string; bytes?: Uint8Array<ArrayBuffer> }[] = []
  mod.quests.forEach((q, i) => {
    for (const [lang, content] of Object.entries(q.versions)) if (content) files.push({ name: `${lang}/Quest${i}.json`, text: JSON.stringify(toGameJson(content), null, 2) })
  })
  const stars = partsOf(mod).find((v) => v.meta.type === 'stars') as StarsView | undefined
  if (stars) files.push({ name: 'StarsStations.json', text: JSON.stringify(toStarsJson(stars), null, 2) })
  for (const tx of mod.textures) {
    files.push({ name: `textures/${tx.name}.png`, bytes: dataUrlBytes(tx.png) as Uint8Array<ArrayBuffer> })
    files.push({ name: `textures/${tx.name}.xml`, text: tx.xml })
  }
  const m = mod.meta
  const entry = { id: m.id, title: m.title, author: m.author, summary: m.summary, licence: m.licence, tags: m.tags, version: m.version, updated: new Date(m.updatedAt).toISOString(), ...(m.requires?.length ? { requires: m.requires } : {}) }
  files.push({ name: 'catalogue-entry.json', text: JSON.stringify(entry, null, 2) })
  return zip(files)
}

/** The "Submit a mod" issue form, prefilled from the mod's details. */
function submissionIssueUrl({ meta }: Mod) {
  const params = new URLSearchParams({ template: 'submit-mod.yml', title: `Submit: ${meta.title}`, author: meta.author, summary: meta.summary, tags: meta.tags.join(', ') })
  return `https://github.com/galaxy-genome/mods/issues/new?${params}`
}

/** A mod's files: its quests, stars & stations and textures. Pick one to edit, or add more. */
export function ContentsPage({ mod }: { mod: Mod }) {
  const t = useT()
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [infoOpen, setInfoOpen] = React.useState(false)
  const [templateOpen, setTemplateOpen] = React.useState(false)
  const community = mod.meta.community
  const readOnly = mod.meta.origin === 'game'
  const id = mod.meta.id
  const views = partsOf(mod)
  const questViews = views.filter((v) => v.meta.type === 'quest') as QuestView[]
  const q = query.trim().toLowerCase()
  const chain = questChain(questViews)
  const shownQuests = chain.filter(({ view: v }) => {
    const c = v.versions[v.primaryLang]!
    return !q || v.meta.title.toLowerCase().includes(q) || String(c.settings.questId).includes(q) || c.steps.some((s) => s.dialogue.some((l) => l.text.toLowerCase().includes(q)))
  })
  const starsView = views.find((v) => v.meta.type === 'stars')


  const addQuest = (key: string) => {
    const tpl = QUEST_TEMPLATES.find((x) => x.key === key)!
    const quest = tpl.build(tpl.key === 'blank' ? t('start.newQuest') : tpl.name, 'Thunder Station')
    const vid = addQuestPart(id, quest)
    setTemplateOpen(false)
    navigate(`/mod/${vid}/overview`)
  }

  const downloadSubmission = () => {
    const url = URL.createObjectURL(submissionZip(mod))
    const name = `${(mod.meta.title || 'mod').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mod'}-${mod.meta.version}-submission.zip`
    Object.assign(document.createElement('a'), { href: url, download: name }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSubmitOpen(false)
    toast.success(t('start.downloaded', { file: name }))
    window.open(submissionIssueUrl(mod), '_blank', 'noopener')
  }

  return (
    <div className="min-h-dvh bg-void">
      <AppBar back="/" title={mod.meta.title || t('start.untitledMod')} subtitle={t('start.modSubtitle', { contents: modContents(mod) })}>
        <FavoriteButton label={mod.meta.title} on={mod.meta.favorite} onToggle={() => setFavorite([id], !mod.meta.favorite)} />
        <button aria-label={t('start.aboutThisMod')} onClick={() => setInfoOpen(true)} className="grid size-11 place-items-center text-dim hover:text-cyan"><Info className="size-5" /></button>
        <Menu
          trigger={<button aria-label={t('common.more')} className="grid size-11 place-items-center text-ink hover:text-white"><MoreVertical className="size-5" /></button>}
          items={[
            { label: t('start.duplicateMod'), icon: <Copy />, onSelect: () => { const cid = duplicateMod(id); if (cid) navigate(`/mod/${cid}`) } },
            ...(readOnly ? [] : [{ label: t('start.downloadForSubmission'), icon: <FileArchive />, onSelect: () => setSubmitOpen(true) }]),
            community && !mod.meta.modified
              ? { label: t('start.removeFromHome'), icon: <X />, onSelect: () => { removeCommunityEntry(community.entryId); navigate('/') }, separatorBefore: true }
              : { label: t('start.deleteMod'), icon: <Trash2 />, tone: 'danger' as const, onSelect: () => { navigate('/'); deleteMod(id) }, separatorBefore: true },
          ]}
        />
      </AppBar>

      <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-4 pb-12">
        <CommunityBanner mod={mod} />
        <TipCard tipKey="contents">{t('start.tipContents')}</TipCard>
        <RequiresLine mod={mod} />

        {readOnly ? (
          mod.meta.summary && <p className="text-[14px] leading-relaxed text-ink">{mod.meta.summary}</p>
        ) : (
          <Card className="flex flex-col gap-4 p-4">
            <Field label={t('start.modName')} help={t('start.modNameHelp')}>
              <Input value={mod.meta.title} onChange={(e) => updateMod(id, (b) => { b.meta.title = e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('start.version')}>
                <Input value={mod.meta.version} onChange={(e) => updateMod(id, (b) => { b.meta.version = e.target.value })} />
              </Field>
              <Field label={t('start.author')}>
                <Input value={mod.meta.author} placeholder={t('start.you')} onChange={(e) => updateMod(id, (b) => { b.meta.author = e.target.value })} />
              </Field>
            </div>
            <Field label={t('start.summary')}>
              <Textarea value={mod.meta.summary} rows={2} max={200} placeholder={t('start.summaryPlaceholder')} onChange={(v) => updateMod(id, (b) => { b.meta.summary = v })} />
            </Field>
            <p className="font-mono text-[12px] text-dim">{t('start.lastChanged', { ago: timeAgo(mod.meta.updatedAt) })}</p>
          </Card>
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel action={<span className="flex items-center">
            {questViews.length > 1 && <Button variant="text" size="sm" onClick={() => navigate(`/series/${id}`)}><MapIcon className="size-4" />{t('output.smMap')}</Button>}
            {!readOnly && <Button variant="text" size="sm" onClick={() => setTemplateOpen(true)}><Plus className="size-4" />{t('start.addQuest')}</Button>}
          </span>}>
            {t('start.questsHeading', { n: questViews.length })}
          </SectionLabel>
          {isSingleChain(chain) && <p className="text-[13px] text-ink">{t('start.playedInOrderHeader', { count: chain.length })}</p>}
          {questViews.length > 8 && <SearchInput value={query} onChange={setQuery} placeholder={t('start.searchQuests')} />}
          {questViews.length === 0 ? (
            <p className="rounded-[4px] border border-dashed border-edge p-4 text-[13px] text-ink/80">{t('start.noQuestsInMod')}</p>
          ) : shownQuests.length === 0 ? (
            <EmptyState icon={<SearchX />} body={t('start.noQuestMatches', { query })} />
          ) : (
            <ul className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
              {shownQuests.map(({ view: v, after, n, depth, tree, last }, i) => {
                const c = v.versions[v.primaryLang]!
                const problems = modProblems(v, parts)
                const errors = problems.filter((p) => p.severity === 'error').length
                const warnings = problems.filter((p) => p.severity === 'warning').length
                const firstLine = c.steps.flatMap((s) => s.dialogue)[0]?.text
                return (
                  <li key={v.meta.id} className="relative flex items-center" style={{ paddingLeft: depth * 12 }}>
                    {tree !== undefined && !q && <span aria-hidden className={cn('absolute left-[23px] w-0.5 bg-cyan/50', i === 0 || shownQuests[i - 1].tree !== tree ? 'top-1/2' : 'top-0', last ? 'bottom-1/2' : 'bottom-0')} />}
                    {depth > 0 && tree !== undefined && !q && <span aria-hidden className="absolute left-[24px] top-1/2 h-0.5 bg-cyan/50" style={{ width: depth * 12 }} />}
                    <button data-opt data-nav={`quest:${v.meta.id}`} onClick={() => navigate(`/mod/${v.meta.id}/overview`)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left hover:bg-white/[0.03]">
                      {n ? <span className="relative grid size-6 shrink-0 place-items-center rounded-full border border-cyan bg-panel font-mono text-[12px] font-semibold text-cyan">{n}</span>
                        : c.settings.startMode === 'space' ? <Orbit className="size-5 shrink-0 text-cyan" /> : <ScrollText className="size-5 shrink-0 text-cyan" />}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px] text-white">{v.meta.title}</span>
                          {Object.keys(v.versions).map((l) => <Badge key={l}>{LANGS.find((x) => x.key === l)?.label}</Badge>)}
                        </span>
                        <span className="text-[13px] text-ink">{startPlace(v, mod)}</span>
                        {c.settings.startMode === 'bar' && <QuestStartInfo station={c.settings.stationName} modId={mod.meta.id} className="py-0.5" />}
                        {after && <span className="text-[13px] text-cyan">{after}</span>}
                        {firstLine && <span className="line-clamp-1 text-[13px] text-ink/80">{firstLine}</span>}
                        <span className="flex items-center gap-2 truncate font-mono text-[11px] text-dim/80">
                          <span>{t('start.steps', { count: c.steps.length })} · {t('start.idN', { id: c.settings.questId })}</span>
                        </span>
                      </span>
                      {errors ? <SeverityIcon severity="error" className="size-4 shrink-0" /> : warnings ? <SeverityIcon severity="warning" className="size-4 shrink-0" /> : null}
                    </button>
                    {!readOnly && (
                      <Menu
                        label={t('start.actionsFor', { title: v.meta.title })}
                        items={[{ label: t('start.removeQuest'), icon: <Trash2 />, tone: 'danger', onSelect: () => removePart(id, v.meta.id.split('~').pop()!, v.meta.title) }]}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('start.starsStations')}</SectionLabel>
          {starsView && mod.stars ? (
            <div className="flex items-center rounded-[4px] border border-edge bg-panel">
              <button data-opt data-nav={`stars:${starsView.meta.id}`} onClick={() => navigate(`/mod/${starsView.meta.id}/overview`)} className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left hover:bg-white/[0.03]">
                <Globe2 className="size-5 text-cyan" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] text-white">StarsStations.json</span>
                  <span className="font-mono text-[12px] text-dim">{t('start.starsCounts', { stars: mod.stars.stars.length, planets: mod.stars.planets.length, stations: mod.stars.stations.length })}</span>
                </span>
              </button>
              {!readOnly && <Menu label={t('start.starsActions')} items={[{ label: t('start.removeStars'), icon: <Trash2 />, tone: 'danger', onSelect: () => removePart(id, mod.stars!.id, t('start.starsStations')) }]} />}
            </div>
          ) : readOnly ? (
            <p className="text-[13px] text-dim">{t('start.noneInMod')}</p>
          ) : (
            <Button variant="secondary" className="self-start" onClick={() => navigate(`/mod/${addStarsPart(id)}/overview`)}><Plus className="size-4" />{t('start.addStars')}</Button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel action={!readOnly && !mod.textures.length && (
            <span className="flex h-9 items-center gap-1.5 px-1 text-[13px] font-semibold text-dim"><ImagePlus className="size-4" />{t('start.comingSoon')}</span>
          )}>{t('start.texturesHeading', { n: mod.textures.length })}</SectionLabel>
          {mod.textures.length === 0 ? (
            <p className="text-[13px] text-dim">{t('start.texturesEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mod.textures.map((tx) => (
                <li key={tx.id} className="flex flex-col overflow-hidden rounded-[4px] border border-edge bg-panel">
                  <div className="aspect-square bg-[conic-gradient(#0c1624_25%,#08101c_0_50%,#0c1624_0_75%,#08101c_0)] bg-[length:16px_16px]">
                    <img src={tx.png} alt={t('start.textureSheetAlt', { name: tx.name })} className="size-full object-contain" loading="lazy" />
                  </div>
                  <div className="flex items-center gap-1 pl-2.5">
                    <span className="flex min-w-0 flex-1 flex-col py-1.5">
                      <span className="truncate font-mono text-[12px] text-white">{tx.name}</span>
                      <span className="font-mono text-[11px] text-dim">{t('start.textureSize', { kb: Math.round((tx.png.length * 0.75) / 1024), count: (tx.xml.match(/<SubTexture/g) ?? []).length })}</span>
                    </span>
                    {!readOnly && (
                      <button aria-label={t('start.removeNamed', { name: tx.name })} onClick={() => removePart(id, tx.id, tx.name)} className="grid size-11 place-items-center text-dim hover:text-danger"><Trash2 className="size-4" /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ModInfoSheet open={infoOpen} onOpenChange={setInfoOpen} mod={mod} />
      <Sheet open={templateOpen} onOpenChange={setTemplateOpen} title={t('start.addAQuest')} description={t('start.addAQuestHelp')}>
        <ul className="flex flex-col gap-2 pt-1">
          {QUEST_TEMPLATES.map((tpl) => (
            <li key={tpl.key}>
              <button onClick={() => addQuest(tpl.key)} className={cn('flex w-full flex-col gap-2 rounded-[4px] border border-edge bg-panel p-3 text-left hover:border-cyan')}>
                <span className="text-[15px] font-semibold text-white">{tpl.name}</span>
                <span className="text-[13px] text-ink/80">{tpl.description}</span>
                <TemplateDiagram diagram={tpl.diagram} />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <Sheet
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title={t('start.submitTitle')}
        description={t('start.submitHelp')}
        footer={<Button variant="solid" size="lg" onClick={downloadSubmission}><FileArchive className="size-5" />{t('start.submitButton')}</Button>}
      >
        <div className="flex flex-col gap-4 pt-1 text-[14px] leading-relaxed text-ink">
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('start.submitZipHolds')}</SectionLabel>
            <ul className="flex flex-col gap-1 font-mono text-[12px] text-ink">
              {mod.quests.length > 0 && <li>{'<lang>'}/Quest0.json …</li>}
              {mod.stars && <li>StarsStations.json</li>}
              {mod.textures.length > 0 && <li>textures/txtr_*.png, .xml</li>}
              <li>catalogue-entry.json</li>
            </ul>
          </div>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-grid-strong">
            <li>{t('start.submitStep1')}</li>
            <li>{t('start.submitStep2')}</li>
          </ol>
          <p>{t('start.submitDiscordA')}<ExternalLink href="https://discord.gg/7zKeYt2SwU">Discord</ExternalLink>{t('start.submitDiscordB')}</p>
          {!mod.meta.author && <p className="text-amber">{t('start.submitNoAuthor')}</p>}
          <Button variant="text" size="sm" className="self-start" onClick={() => { setSubmitOpen(false); navigate('/help/community-library') }}>{t('start.submitLearnMore')}</Button>
        </div>
      </Sheet>
    </div>
  )
}


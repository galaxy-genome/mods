import { Map as MapIcon, ArrowUpDown, BookOpen, Check, Info, Layers, Copy, Download, FileUp, FolderOpen, HelpCircle, Library, MoreVertical, Plus, Settings, ShieldCheck, Sparkles, Star, Trash2, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Brand } from '@/components/layout/brand'
import { InstallCard } from '@/components/layout/install'
import { Button } from '@/components/ui/button'
import { DraftBanner, NoStorageBanner, Skeleton, StorageFullBanner } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/inputs'
import { Menu } from '@/components/ui/overlays'
import { SwipeRow } from '@/components/ui/gestures'
import { Badge, Card, EmptyState, SectionLabel, SeverityIcon, TipCard } from '@/components/ui/surfaces'
import { t, useT } from '@/i18n'
import { onlyPartView, partCount, partsOf } from '@/lib/mods'
import { LANGS } from '@/lib/reference'
import { MAX_QUEST_FILES, questFileCount } from '@/lib/mods'
import { modProblems } from '@/lib/rules'
import type { Mod, ModPart } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'
import { addCommunityEntry, deleteMod, deleteMods, dismissTip, duplicateMod, hasUnmodifiedCopy, questOf, removeCommunityEntry, requestPersist, setFavorite, useEditor } from '@/store/editor'
import { DownloadSheet } from './DownloadSheet'
import { ModInfoSheet } from './ModInfoSheet'
import { LanguageSheet, NewModSheets, OfflineChip, OpenFileSheet } from './common'

type Filter = 'all' | 'favorites' | 'mine' | 'community' | 'problems'
type Sort = 'recent' | 'name' | 'status'

function modStatus(mod: Mod, all: ModPart[]) {
  const list = partsOf(mod).flatMap((v) => modProblems(v, all))
  return { errors: list.filter((p) => p.severity === 'error').length, warnings: list.filter((p) => p.severity === 'warning').length }
}

/** Sheets asked for by window events, kept briefly so a Home that mounts right after the event still opens them. */
let pendingSheet: { sheet: 'file' | 'download'; at: number } | null = null
const sheetListeners = new Set<(sheet: 'file' | 'download') => void>()
if (typeof window !== 'undefined') {
  for (const [event, sheet] of [['open-file', 'file'], ['open-download', 'download']] as const) {
    addEventListener(event, () => { pendingSheet = { sheet, at: Date.now() }; sheetListeners.forEach((l) => l(sheet)) })
  }
}

/** The quest file count turns amber as it nears the game's limit. */
const QUEST_FILES_AMBER = 180

export function HomePage() {
  const t = useT()
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)
  const mods = useEditor((s) => s.mods)
  const gameQuests = useEditor((s) => s.gameQuests)
  const settings = useEditor((s) => s.settings)
  const [newOpen, setNewOpen] = React.useState(false)
  const [fileOpen, setFileOpen] = React.useState(false)
  const [downloadOpen, setDownloadOpen] = React.useState(false)
  const [langOpen, setLangOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [sort, setSort] = React.useState<Sort>('recent')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const loading = useEditor((s) => s.loading)
  const storage = useEditor((s) => s.storage)
  const [dragging, setDragging] = React.useState(false)
  const [dropped, setDropped] = React.useState<File | null>(null)
  const selecting = selected.size > 0

  React.useEffect(() => {
    const show = (sheet: 'file' | 'download') => { pendingSheet = null; if (sheet === 'file') setFileOpen(true); else setDownloadOpen(true) }
    if (pendingSheet && Date.now() - pendingSheet.at < 1000) show(pendingSheet.sheet)
    pendingSheet = null
    sheetListeners.add(show)
    return () => { sheetListeners.delete(show) }
  }, [])

  React.useEffect(() => {
    // dragenter/dragleave fire for every child crossed, so a depth count tells when the pointer leaves the window.
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true) }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => /\.(zip|json)$/i.test(f.name))
      if (file) setDropped(file)
      else toast.error(t('start.dropWrongType'))
    }
    addEventListener('dragenter', enter)
    addEventListener('dragover', over)
    addEventListener('dragleave', leave)
    addEventListener('drop', drop)
    return () => { removeEventListener('dragenter', enter); removeEventListener('dragover', over); removeEventListener('dragleave', leave); removeEventListener('drop', drop) }
  }, [t])

  const statuses = React.useMemo(() => new Map(mods.map((b) => [b.meta.id, modStatus(b, parts)])), [mods, parts])
  const favorites = mods.filter((b) => b.meta.favorite).length
  const downloadLang = useEditor((s) => s.settings.downloadLang)
  const questFiles = questFileCount(mods.filter((b) => b.meta.favorite), downloadLang)
  const q = query.trim().toLowerCase()
  const matches = (b: Mod) => !q || b.meta.title.toLowerCase().includes(q) || (b.meta.community?.entryTitle.toLowerCase().includes(q) ?? false) || partsOf(b).some((v) => v.meta.title.toLowerCase().includes(q) || (questOf(v)?.settings.stationName.toLowerCase().includes(q) ?? false))
  const passes = (b: Mod) =>
    filter === 'all' || filter === 'mine' || filter === 'community' ||
    (filter === 'favorites' ? b.meta.favorite : statuses.get(b.meta.id)!.errors + statuses.get(b.meta.id)!.warnings > 0)

  const mine = React.useMemo(() => mods
    .filter((b) => !b.meta.community && filter !== 'community' && passes(b) && matches(b))
    .sort((a, b) => {
      if (sort === 'name') return a.meta.title.localeCompare(b.meta.title)
      if (sort === 'status') {
        const sa = statuses.get(a.meta.id)!, sb = statuses.get(b.meta.id)!
        return sb.errors - sa.errors || sb.warnings - sa.warnings || b.meta.updatedAt - a.meta.updatedAt
      }
      return b.meta.updatedAt - a.meta.updatedAt
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [mods, query, filter, sort, statuses])

  const community = React.useMemo(() => filter === 'mine' ? [] : mods
    .filter((b) => b.meta.community && passes(b) && matches(b))
    .sort(byPopularity)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [mods, query, filter, statuses])

  const ranks = React.useMemo(() => {
    const entries = [...new Set(mods.filter((b) => b.meta.community).sort(byPopularity).map((b) => b.meta.community!.entryId))]
    return new Map(mods.filter((b) => b.meta.community).map((b) => [b.meta.id, entries.indexOf(b.meta.community!.entryId) + 1]))
  }, [mods])
  const open = (b: Mod) => navigate(`/mod/${onlyPartView(b) ?? b.meta.id}`)
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches
  const showBanner = !loading && storage.available && !storage.persisted && !settings.dismissedTips.includes('storage-banner') && mods.some((b) => !b.meta.community)
  const sortLabels: Record<Sort, string> = { recent: t('start.sortRecent'), name: t('start.sortName'), status: t('start.sortStatus') }
  const nothing = !mine.length && !community.length

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b border-edge bg-deep/95 pl-4 pr-1 pt-[env(safe-area-inset-top)] backdrop-blur">
        {selecting ? (
          <>
            <button aria-label={t('start.cancelSelection')} onClick={() => setSelected(new Set())} className="-ml-3 grid size-11 place-items-center text-ink hover:text-white"><X className="size-5" /></button>
            <h1 className="flex-1 text-[17px] font-semibold text-white">{t('start.selected', { count: selected.size })}</h1>
            <Button variant="text" size="sm" onClick={() => setSelected(new Set(mine.map((b) => b.meta.id)))}>{t('start.selectAll')}</Button>
          </>
        ) : (
          <>
            <Brand className="flex-1" />
            <OfflineChip />
            <Button variant="ghost" size="sm" onClick={() => setFileOpen(true)} className="px-2"><FileUp className="size-4" />{t('start.open')}</Button>
            <Menu
              label={t('common.more')}
              trigger={<button aria-label={t('common.more')} className="grid size-11 place-items-center text-ink hover:text-white"><MoreVertical className="size-5" /></button>}
              items={[
                { label: t('start.modLibrary'), icon: <Library />, onSelect: () => navigate('/library') },
                { label: t('output.smFavoritesTitle'), icon: <MapIcon />, onSelect: () => navigate('/series') },
                ...(gameQuests ? [{ label: t('start.gameQuests'), icon: <BookOpen />, onSelect: () => navigate('/library?tab=game') }] : []),
                { label: t('start.language'), icon: <span className="grid size-4 place-items-center font-mono text-[10px]">{LANGS.find((l) => l.key === settings.uiLang)?.label}</span>, onSelect: () => setLangOpen(true), separatorBefore: true },
                { label: t('start.help'), icon: <HelpCircle />, onSelect: () => navigate('/help') },
                { label: t('start.settings'), icon: <Settings />, onSelect: () => navigate('/settings') },
              ]}
            />
          </>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 pb-40 pt-4">
        <NoStorageBanner onDownloadBackup={() => setDownloadOpen(true)} />
        {storage.quotaFull && (
          <StorageFullBanner onDownloadBackup={() => setDownloadOpen(true)} onFreeSpace={() => navigate('/settings#storage')} />
        )}

        <DraftBanner />

        <TipCard tipKey="home-favorites">
          {t('start.tipFavoritesA')}<Star className="inline size-3.5 -translate-y-px text-amber" />{t('start.tipFavoritesB')}<b className="font-semibold text-white">{t('start.download')}</b>{t('start.tipFavoritesC')}
        </TipCard>
        <InstallCard />

        <AnimatePresence initial={false}>
          {showBanner && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Card tone="amber" className="flex flex-col gap-3 p-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber" />
                  <p className="flex-1 text-[13px] leading-relaxed text-ink">{t('start.storageBanner')}{safari && ` ${t('start.storageBannerSafari')}`}</p>
                  <button aria-label={t('start.dismiss')} onClick={() => dismissTip('storage-banner')} className="-mr-1 -mt-2 grid size-9 place-items-center text-dim hover:text-white"><X className="size-4" /></button>
                </div>
                <div className="flex flex-wrap gap-2 pl-8">
                  <Button size="sm" variant="warning" onClick={async () => { if (await requestPersist()) toast(t('start.modsKept'), { description: t('start.modsKeptHelp') }); else toast(t('start.persistRefused'), { description: t('start.persistRefusedHelp') }) }}>{t('start.keepSafe')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDownloadOpen(true)}><Download className="size-4" />{t('start.downloadABackup')}</Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <SearchInput value={query} onChange={setQuery} placeholder={t('start.searchMods')} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('start.filter')}>
          {([['all', t('start.filterAll')], ['favorites', `${t('start.filterFavorites')}${favorites ? ` ${favorites}` : ''}`], ['mine', t('start.filterMine')], ['community', t('start.filterCommunity')], ['problems', t('start.filterProblems')]] as const).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn('h-9 shrink-0 rounded-[2px] border px-3 font-mono text-[13px]', filter === k ? 'border-cyan bg-cyan/10 text-cyan' : 'border-edge bg-chip text-ink hover:border-grid-strong')}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2" role="status" aria-label={t('start.loading')}>
            {[0, 1, 2].map((i) => <Skeleton key={i} shape="card" />)}
          </div>
        ) : nothing && (q || filter !== 'all') ? (
          <EmptyState
            icon={<FolderOpen />}
            title={t('start.noModsMatch')}
            body={filter === 'favorites' && !q ? t('start.noFavoritesYetBody') : q ? t(filter !== 'all' ? 'start.nothingCalledFiltered' : 'start.nothingCalled', { query }) : t('start.noModsFilter')}
            action={<Button variant="secondary" size="sm" onClick={() => { setQuery(''); setFilter('all') }}>{t('start.clearFilters')}</Button>}
          />
        ) : (
          <>
            {filter !== 'community' && (
              <section className="flex flex-col gap-2">
                <SectionLabel action={
                  <div className="flex items-center">
                    {mine.length > 1 && (
                      <Menu
                        label={t('start.sort')}
                        align="end"
                        trigger={<button className="flex h-9 items-center gap-1.5 px-1 font-mono text-[12px] text-ink hover:text-white"><ArrowUpDown className="size-3.5" />{sortLabels[sort]}</button>}
                        items={(Object.keys(sortLabels) as Sort[]).map((k) => ({ label: sortLabels[k], icon: sort === k ? <Check /> : <span className="size-4" />, onSelect: () => setSort(k) }))}
                      />
                    )}
                    <Button variant="text" size="sm" onClick={() => setNewOpen(true)}><Plus className="size-4" />{t('start.new')}</Button>
                  </div>
                }>{t('start.myMods')}</SectionLabel>
                {mine.length === 0 && !q && filter === 'all' ? (
                  <button onClick={() => setNewOpen(true)} className="grid-texture flex min-h-[88px] items-center gap-4 rounded-[4px] border border-dashed border-cyan/60 px-4 py-4 text-left hover:border-cyan">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-cyan text-cyan"><Sparkles className="size-5" /></span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[16px] font-semibold text-cyan">{t('start.writeOwn')}</span>
                      <span className="text-[13px] text-ink/80">{t('start.writeOwnHelp')}</span>
                    </span>
                  </button>
                ) : (
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {mine.map((b) => (
                        <motion.li key={b.meta.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.16 }}>
                          <ModCard
                            mod={b}
                            stat={statuses.get(b.meta.id)!}
                            selecting={selecting}
                            selected={selected.has(b.meta.id)}
                            onOpen={() => (selecting ? toggle(b.meta.id) : open(b))}
                            onLongPress={() => { navigator.vibrate?.(10); toggle(b.meta.id) }}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </section>
            )}

            {filter !== 'mine' && !selecting && (
              <section className="flex flex-col gap-2 pt-2">
                <SectionLabel action={<Button variant="text" size="sm" onClick={() => navigate('/library')}><Library className="size-4" />{t('start.modLibrary')}</Button>}>{t('start.topCommunity')}</SectionLabel>
                {community.length === 0 ? (
                  <Card className="flex items-center gap-3 p-3">
                    <p className="flex-1 text-[13px] text-ink/80">{q || filter !== 'all' ? t('start.noCommunityMatch') : t('start.communityRemoved')}</p>
                    <Button size="sm" variant="secondary" onClick={() => navigate('/library')}>{t('start.browseLibrary')}</Button>
                  </Card>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {community.map((b) => (
                      <li key={b.meta.id}>
                        <ModCard mod={b} rank={ranks.get(b.meta.id)} stat={statuses.get(b.meta.id)!} selecting={false} selected={false} onOpen={() => open(b)} onLongPress={() => {}} />
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="secondary" onClick={() => navigate('/library')} className="mt-1"><Library className="size-4" />{t('start.browseModLibrary')}</Button>
              </section>
            )}
          </>
        )}
      </main>

      <AnimatePresence initial={false}>
        {selecting ? (
          <motion.div key="select" initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-deep">
            <div className="mx-auto grid max-w-[720px] grid-cols-3 gap-2 px-4 py-2">
              <Button variant="ghost" size="sm" className="h-12 flex-col gap-0.5 text-[12px]" onClick={() => { setFavorite([...selected], true); setSelected(new Set()) }}><Star className="size-4 text-amber" />{t('common.favorite')}</Button>
              <Button variant="ghost" size="sm" className="h-12 flex-col gap-0.5 text-[12px]" onClick={() => { setFavorite([...selected], false); setSelected(new Set()) }}><Star className="size-4" />{t('common.unfavorite')}</Button>
              <Button variant="ghost" size="sm" className="h-12 flex-col gap-0.5 text-[12px] text-danger" onClick={() => { deleteMods([...selected]); setSelected(new Set()) }}><Trash2 className="size-4" />{t('common.delete')}</Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="download" initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-deep/95 backdrop-blur">
            <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-2.5">
              <button onClick={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')} className="flex min-h-11 flex-1 items-center gap-2 text-left">
                <Star className={cn('size-5', favorites ? 'fill-amber text-amber' : 'text-dim')} />
                <span className="flex flex-col leading-tight">
                  <span className="text-[15px] font-semibold text-white">
                    {favorites ? t('start.favorites', { count: favorites }) : t('start.noFavoritesYet')}
                    {questFiles > 0 && (
                      <span className={cn('font-mono text-[13px] font-normal', questFiles > MAX_QUEST_FILES ? 'text-danger' : questFiles > QUEST_FILES_AMBER ? 'text-amber' : 'text-ink/70')}>
                        {' · '}{t('start.questFileCount', { count: questFiles, max: MAX_QUEST_FILES })}
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] text-ink/70">{favorites ? t('start.bundledIntoDownload') : t('start.starToInclude')}</span>
                </span>
              </button>
              <Button variant="solid" onClick={() => setDownloadOpen(true)}><Download className="size-4" />{t('start.download')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NewModSheets open={newOpen} onOpenChange={setNewOpen} />
      <OpenFileSheet open={fileOpen} onOpenChange={setFileOpen} dropped={dropped} />
      <DownloadSheet open={downloadOpen} onOpenChange={setDownloadOpen} />
      <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />

      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-void/85 p-6">
            <div className="grid-texture flex w-full max-w-[520px] flex-col items-center gap-3 rounded-[4px] border-2 border-dashed border-cyan px-6 py-12 text-center">
              <FileUp className="size-8 text-cyan" />
              <p className="text-[18px] font-semibold text-white">{t('start.dropTitle')}</p>
              <p className="text-[14px] text-ink">{t('start.dropHelp')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function InfoButton({ mod }: { mod: Mod }) {
  const t = useT()
  const [openInfo, setOpenInfo] = React.useState(false)
  return (
    <>
      <button aria-label={t('start.about', { title: mod.meta.title })} onClick={(e) => { e.stopPropagation(); setOpenInfo(true) }} className="grid size-11 shrink-0 place-items-center text-dim hover:text-cyan">
        <Info className="size-[18px]" />
      </button>
      <ModInfoSheet open={openInfo} onOpenChange={setOpenInfo} mod={mod} />
    </>
  )
}

export function FavoriteButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      aria-label={t(on ? 'start.unfavoriteNamed' : 'start.favoriteNamed', { title: label })}
      aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); navigator.vibrate?.(8); onToggle() }}
      className="grid size-11 shrink-0 place-items-center"
    >
      <motion.span key={String(on)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
        <Star className={cn('size-5 transition-colors', on ? 'fill-amber text-amber' : 'text-dim hover:text-amber')} />
      </motion.span>
    </button>
  )
}

/** "3 quests · Stars & stations · 2 textures" */
export function modContents(b: Mod) {
  return [
    b.quests.length && t('start.quests', { count: b.quests.length }),
    b.stars && t('start.starsStations'),
    b.textures.length && t('start.textures', { count: b.textures.length }),
  ].filter(Boolean).join(' · ') || t('start.empty')
}

/** Most popular entry first; copies of one entry show modified first, most recently changed first. */
const byPopularity = (a: Mod, b: Mod) =>
  b.meta.community!.popularity - a.meta.community!.popularity || a.meta.community!.entryId.localeCompare(b.meta.community!.entryId) ||
  Number(!!b.meta.modified) - Number(!!a.meta.modified) || b.meta.updatedAt - a.meta.updatedAt

function ModCard({ mod, rank, stat, selecting, selected, onOpen, onLongPress }: {
  mod: Mod; rank?: number; stat: { errors: number; warnings: number }; selecting: boolean; selected: boolean
  onOpen: () => void; onLongPress: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const timer = React.useRef<number | undefined>(undefined)
  const pressed = React.useRef(false)
  const community = mod.meta.community
  const own = !community || !!mod.meta.modified
  const start = () => { if (!own) return; pressed.current = false; timer.current = window.setTimeout(() => { pressed.current = true; onLongPress() }, 500) }
  const cancel = () => clearTimeout(timer.current)
  const hasOriginal = useEditor(() => !!community && hasUnmodifiedCopy(community.entryId))
  const langs = [...new Set(mod.quests.flatMap((q) => Object.keys(q.versions)))]
  const id = mod.meta.id

  const card = (
    <div className={cn('flex items-stretch rounded-[4px] border bg-panel transition-colors', selected ? 'border-cyan bg-cyan/[0.08]' : 'border-edge hover:border-grid-strong')}>
      {!selecting && <FavoriteButton label={mod.meta.title} on={mod.meta.favorite} onToggle={() => setFavorite([id], !mod.meta.favorite)} />}
      <button
        onClick={() => { if (pressed.current) { pressed.current = false; return } onOpen() }}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => { if (own) e.preventDefault() }}
        aria-pressed={selecting ? selected : undefined}
        className={cn('flex min-w-0 flex-1 select-none items-start gap-3 py-3 text-left [-webkit-touch-callout:none]', selecting && 'pl-3')}
      >
        {selecting && (
          <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-[2px] border', selected ? 'border-cyan bg-cyan text-void' : 'border-edge')}>
            {selected && <Check className="size-3.5" />}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold text-white">{mod.meta.title || t('start.untitled')}</span>
            {mod.meta.modified && <Badge tone="amber">{t('start.modified')}</Badge>}
            {langs.map((l) => <Badge key={l}>{LANGS.find((x) => x.key === l)?.label}</Badge>)}
          </span>
          {community && mod.meta.summary && <span className="line-clamp-2 text-[13px] leading-snug text-ink/85">{mod.meta.summary}</span>}
          <span className="truncate font-mono text-[12px] text-ink/80">{rank ? `#${rank} · ` : ''}{modContents(mod)}{community ? ` · ${community.author}` : ''}</span>
          <span className="flex items-center justify-between gap-2 text-[12px]">
            {stat.errors ? (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-danger"><SeverityIcon severity="error" className="size-3.5" />{t('start.errors', { count: stat.errors })}</span>
            ) : stat.warnings ? (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-amber"><SeverityIcon severity="warning" className="size-3.5" />{t('start.warnings', { count: stat.warnings })}</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-success"><Check className="size-3.5" />{t('start.ready')}</span>
            )}
            <span className="truncate font-mono text-dim">{community ? <span className="text-cyan"><Users className="mr-1 inline size-3 -translate-y-px" />{t('start.communityMarker')} · </span> : null}v{mod.meta.version} · {timeAgo(mod.meta.updatedAt)}</span>
          </span>
        </span>
      </button>
      {!selecting && <InfoButton mod={mod} />}
      {!selecting && (
        <Menu
          label={t('start.actionsFor', { title: mod.meta.title })}
          items={[
            { label: t('common.open'), icon: <FolderOpen />, onSelect: onOpen },
            ...(partCount(mod) > 1 ? [{ label: t('start.contents'), icon: <Layers />, onSelect: () => navigate(`/mod/${id}`) }] : []),
            { label: mod.meta.favorite ? t('common.unfavorite') : t('common.favorite'), icon: <Star />, onSelect: () => setFavorite([id], !mod.meta.favorite) },
            { label: t('common.duplicate'), icon: <Copy />, onSelect: () => duplicateMod(id) },
            ...(community && mod.meta.modified && !hasOriginal ? [{ label: t('start.addOriginal'), icon: <Plus />, onSelect: () => addCommunityEntry(community.entryId) }] : []),
            own
              ? { label: t('common.delete'), icon: <Trash2 />, onSelect: () => deleteMod(id), tone: 'danger' as const, separatorBefore: true }
              : { label: t('start.removeFromHome'), icon: <X />, onSelect: () => removeCommunityEntry(community!.entryId), separatorBefore: true },
          ]}
        />
      )}
    </div>
  )
  if (!own) return card
  return (
    <SwipeRow
      disabled={selecting}
      actions={[
        { label: t('common.duplicate'), icon: <Copy />, tone: 'cyan', onAction: () => duplicateMod(id) },
        { label: t('common.delete'), icon: <Trash2 />, tone: 'danger', onAction: () => deleteMod(id) },
      ]}
    >
      {card}
    </SwipeRow>
  )
}

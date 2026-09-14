import { ArrowLeft, Layers, Star, Braces, Copy, Download, FileClock, HelpCircle, Languages, ListChecks, Redo2, Trash2, Undo2, WifiOff } from 'lucide-react'
import * as React from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExportSheet } from '@/features/output/ExportSheet'
import { loadGalaxy, loadGeneration } from '@/features/map/galaxy'
import { CommunityBanner } from '@/features/start/CommunityBanner'
import { ContentsPage } from '@/features/start/ContentsPage'
import { LanguageVersionsSheet } from '@/features/output/LanguageVersionsSheet'
import { ProblemsList, ProblemsSheet } from '@/features/problems/ProblemsSheet'
import { useIsDesktop, useMediaQuery } from '@/hooks/use-media-query'
import { useProblems } from '@/hooks/use-problems'
import { useT } from '@/i18n'
import type { ModPart, StarsView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { onlyPartView, partCount, splitViewId } from '@/lib/mods'
import { canRedo, canUndo, deleteMod, duplicateMod, questOf, redo, setFavorite, setSettings, undo, useMod, useEditor, usePart, useSaveState } from '@/store/editor'
import { DraftBanner, NoStorageBanner, StorageFullBanner } from '../ui/feedback'
import { clearFocusedField, LearnMore, useFocusedField } from '../ui/field'
import { Menu } from '../ui/overlays'
import { Sheet } from '../ui/sheet'
import { SeverityIcon } from '../ui/surfaces'
import { Brand } from './brand'
import { QUEST_TABS, STARS_TABS, TabIcon } from './tabs'

/* ---------- header override: nested pages set their own title and back target ---------- */

export interface HeaderConfig {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  back?: string | (() => void)
  actions?: React.ReactNode
  hideTabs?: boolean
}
const HeaderContext = React.createContext<(c: HeaderConfig | null) => void>(() => {})

export function useShellHeader(config: HeaderConfig, deps: unknown[]) {
  const set = React.useContext(HeaderContext)
  React.useEffect(() => {
    set(config)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/* ---------- sheets held in the URL (?sheet=) so the back button closes them ---------- */

export type ShellSheet = 'problems' | 'export' | 'languages'

function useUrlSheet() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const popping = React.useRef(false)
  const queued = React.useRef<ShellSheet | null>(null)
  const current = params.get('sheet') as ShellSheet | null

  const withSheet = (name: ShellSheet | null) => {
    const q = new URLSearchParams(location.search)
    if (name) q.set('sheet', name); else q.delete('sheet')
    const s = q.toString()
    return { pathname: location.pathname, search: s ? `?${s}` : '' }
  }

  const open = (name: ShellSheet) => {
    if (popping.current) { queued.current = name; return }
    if (current === name) return
    // Opening over another sheet swaps it; opening from the page pushes an entry that Back removes.
    navigate(withSheet(name), { replace: !!current, state: { sheetPushed: current ? location.state?.sheetPushed : true } })
  }
  const close = () => {
    if (!current) return
    if (location.state?.sheetPushed) { popping.current = true; navigate(-1) }
    else navigate(withSheet(null), { replace: true })
  }

  React.useEffect(() => {
    if (!popping.current) return
    popping.current = false
    const next = queued.current
    queued.current = null
    if (next) open(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  return { current, open, close }
}

/* ---------- scroll position per path, for this session ---------- */

const scrollByPath = new Map<string, number>()

export function ScrollRestore() {
  const { pathname } = useLocation()
  React.useEffect(() => {
    const y = scrollByPath.get(pathname) ?? 0
    const raf = requestAnimationFrame(() => scrollTo(0, y))
    const onScroll = () => scrollByPath.set(pathname, scrollY)
    addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll) }
  }, [pathname])
  return null
}

/* ---------- shared bars ---------- */

export function AppBar({ back, title, subtitle, children, className }: {
  back?: string | (() => void); title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <header className={cn('sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b border-edge bg-deep/95 px-1 pt-[env(safe-area-inset-top)] backdrop-blur', className)}>
      {back && (
        <button aria-label={t('common.back')} onClick={() => (typeof back === 'string' ? navigate(back) : back())} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white">
          <ArrowLeft className="size-[22px]" />
        </button>
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', !back && 'pl-3')}>
        {subtitle && <span className="truncate font-mono text-[11px] text-dim">{subtitle}</span>}
        <h1 className="truncate text-[17px] font-semibold text-white">{title}</h1>
      </div>
      {children}
    </header>
  )
}

function SaveDot({ modId, onStorageFull }: { modId: string; onStorageFull: () => void }) {
  const t = useT()
  const save = useSaveState(modId)
  if (save === 'error') return (
    <button onClick={onStorageFull} className="flex h-11 items-center gap-1.5 px-2 text-[12px] text-danger">
      <span className="size-2 rounded-full bg-danger" />{t('shell.notSaved')}
    </button>
  )
  const busy = save === 'dirty' || save === 'saving'
  const label = busy ? t('shell.saving') : t('shell.saved')
  return (
    <span role="status" aria-label={label} title={label} data-save={save} className="grid size-8 place-items-center">
      <span className={cn('size-2 rounded-full', busy ? 'animate-pulse bg-amber' : 'bg-success')} />
    </span>
  )
}

export function ProblemsButton({ modId, onClick }: { modId: string; onClick: () => void }) {
  const t = useT()
  const { errors, warnings } = useProblems(modId)
  const n = errors.length || warnings.length
  if (!n) return (
    <button onClick={onClick} aria-label={t('shell.noProblems')} className="grid size-11 place-items-center text-success">
      <ListChecks className="size-5" />
    </button>
  )
  const sev = errors.length ? 'error' : 'warning'
  return (
    <button
      onClick={onClick}
      aria-label={t('shell.problemCounts', { errors: errors.length, warnings: warnings.length })}
      className={cn('mx-1 flex h-8 items-center gap-1.5 rounded-[2px] border px-2 font-mono text-[12px]', sev === 'error' ? 'border-danger text-danger' : 'border-amber text-amber')}
    >
      <SeverityIcon severity={sev} className="size-3.5" />
      {n}
    </button>
  )
}

function tabCount(mod: ModPart, path: string) {
  if (mod.meta.type === 'quest') {
    const q = questOf(mod)
    return path === 'steps' ? q?.steps.length : path === 'rumors' ? q?.rumors.length : undefined
  }
  const stars = mod as StarsView
  return path === 'stars' ? stars.stars.length : path === 'planets' ? stars.planets.length : path === 'stations' ? stars.stations.length : undefined
}

/* ---------- desktop right pane: help for the focused field, or the problems list ---------- */

function Inspector({ modId }: { modId: string }) {
  const t = useT()
  const [tab, setTab] = React.useState<'help' | 'problems'>('help')
  const field = useFocusedField()
  const { errors, warnings } = useProblems(modId)
  const n = errors.length + warnings.length
  return (
    <aside aria-label={t('shell.inspector')} className="sticky top-0 flex h-dvh w-[320px] shrink-0 flex-col border-l border-edge bg-deep">
      <div role="tablist" className="grid min-h-14 grid-cols-2 border-b border-edge px-2">
        {(['help', 'problems'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('section-label flex items-center justify-center gap-2 border-b-2 !text-[12px]', tab === k ? 'border-cyan !text-white' : 'border-transparent hover:!text-ink')}
          >
            {t(`shell.inspector_${k}`)}
            {k === 'problems' && n > 0 && <span className={cn('font-mono', errors.length ? 'text-danger' : 'text-amber')}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === 'problems' ? (
          <ProblemsList modId={modId} active={tab === 'problems'} />
        ) : field ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-white">{field.label}</h2>
            {field.help && <p className="text-[13px] leading-relaxed text-ink">{field.help}</p>}
            {field.info && <div className="text-[13px] leading-relaxed text-ink/85">{field.info}</div>}
            <LearnMore to={field.learnMore ?? '/help'} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-dim">{t('shell.inspectorEmpty')}</p>
            <LearnMore to="/help" />
          </div>
        )}
      </div>
    </aside>
  )
}

/* ---------- the shell around every mod screen ---------- */

export function ModShell() {
  const t = useT()
  const { modId } = useParams()
  const mod = usePart(modId)
  const owner = useMod(modId)
  const navigate = useNavigate()
  const location = useLocation()
  const desktop = useIsDesktop()
  const tablet = useMediaQuery('(min-width: 600px)') && !desktop
  const offline = useEditor((s) => s.settings.offline)
  const advanced = useEditor((s) => s.settings.advanced)
  const loading = useEditor((s) => s.loading)
  const storageFull = useEditor((s) => s.storage.quotaFull)
  const [header, setHeader] = React.useState<HeaderConfig | null>(null)
  const [storageOpen, setStorageOpen] = React.useState(false)
  const sheet = useUrlSheet()
  const openSheet = React.useRef(sheet.open)
  openSheet.current = sheet.open
  useEditor((s) => s.parts) // re-render for undo availability

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!modId || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      e.preventDefault()
      if (e.shiftKey) redo(modId); else undo(modId)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [modId])

  React.useEffect(() => {
    const openProblems = () => openSheet.current('problems')
    const openExport = () => openSheet.current('export')
    addEventListener('open-problems', openProblems)
    addEventListener('open-export', openExport)
    return () => { removeEventListener('open-problems', openProblems); removeEventListener('open-export', openExport) }
  }, [])

  React.useEffect(clearFocusedField, [location.pathname])
  // Stars checks need the galaxy; the service worker keeps it for offline use.
  React.useEffect(() => { if (mod?.meta.type === 'stars') loadGalaxy().then(loadGeneration).catch(() => {}) }, [mod?.meta.type])

  React.useEffect(() => {
    const onDeleted = (e: Event) => { if (modId && splitViewId(modId).modId === (e as CustomEvent<string>).detail) navigate('/') }
    addEventListener('gg-mod-deleted', onDeleted)
    return () => removeEventListener('gg-mod-deleted', onDeleted)
  }, [modId, navigate])

  if (modId && owner && !splitViewId(modId).partId) {
    const only = onlyPartView(owner)
    const atRoot = location.pathname.replace(/\/$/, '') === `/mod/${modId}`
    if (only && atRoot && location.state?.contents !== true) return <Navigate to={`/mod/${only}/overview`} replace />
    if (!atRoot) return <Navigate to={`/mod/${modId}`} replace />
    return <ContentsPage mod={owner} />
  }

  if (loading) return <div className="grid min-h-dvh place-items-center" role="status" aria-label={t('shell.loading')}><span className="size-2 animate-pulse rounded-full bg-cyan" /></div>

  if (!mod || !modId || !owner) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-white">{t('shell.modGone')}</p>
          <button className="text-cyan" onClick={() => navigate('/')}>{t('shell.backToMods')}</button>
        </div>
      </div>
    )
  }

  const isQuest = mod.meta.type === 'quest'
  const readOnly = mod.meta.origin === 'game'
  const multiPart = partCount(owner) > 1
  const contentsPath = `/mod/${owner.meta.id}`
  const tabs = isQuest ? QUEST_TABS : STARS_TABS
  const base = `/mod/${modId}`
  const menu = [
    ...(!desktop ? [{ label: t('shell.redo'), icon: <Redo2 />, onSelect: () => redo(modId), disabled: !canRedo(modId) }] : []),
    { label: multiPart ? t('shell.allFiles', { title: owner.meta.title }) : t('shell.modContents'), icon: <Layers />, onSelect: () => navigate(contentsPath, { state: { contents: true } }) },
    { label: t('shell.export'), icon: <Download />, onSelect: () => sheet.open('export') },
    ...(isQuest ? [{ label: t('shell.languageVersions'), icon: <Languages />, onSelect: () => sheet.open('languages') }] : []),
    { label: t('shell.history'), icon: <FileClock />, onSelect: () => navigate(`${base}/history`) },
    { label: advanced ? t('shell.hideAdvanced') : t('shell.advanced'), icon: <Braces />, onSelect: () => setSettings({ advanced: !advanced }) },
    ...(advanced && isQuest ? [{ label: t('shell.viewJson'), icon: <Braces />, onSelect: () => navigate(`${base}/json`) }] : []),
    { label: t('shell.duplicateMod'), icon: <Copy />, onSelect: () => { const id = duplicateMod(modId); if (id) navigate(`/mod/${id}`) }, separatorBefore: true },
    { label: t('shell.help'), icon: <HelpCircle />, onSelect: () => navigate('/help') },
    { label: t('shell.deleteMod'), icon: <Trash2 />, tone: 'danger' as const, onSelect: () => { navigate('/'); deleteMod(modId) }, separatorBefore: true },
  ]

  const bar = (
    <AppBar back={header?.back ?? (multiPart ? contentsPath : '/')} title={header?.title ?? mod.meta.title} subtitle={header?.subtitle ?? (multiPart ? owner.meta.title : undefined)}>
      {offline && <span className="mr-1 flex h-7 items-center gap-1 rounded-[2px] border border-edge px-2 font-mono text-[11px] text-dim"><WifiOff className="size-3" />{t('shell.offline')}</span>}
      {header?.actions}
      {!desktop && <button aria-label={t('common.undo')} disabled={!canUndo(modId)} onClick={() => undo(modId)} className="grid size-11 place-items-center text-ink disabled:opacity-30"><Undo2 className="size-5" /></button>}
      {desktop && (
        <>
          <button aria-label={t('common.undo')} disabled={!canUndo(modId)} onClick={() => undo(modId)} className="grid size-11 place-items-center text-ink disabled:opacity-30"><Undo2 className="size-5" /></button>
          <button aria-label={t('shell.redo')} disabled={!canRedo(modId)} onClick={() => redo(modId)} className="grid size-11 place-items-center text-ink disabled:opacity-30"><Redo2 className="size-5" /></button>
        </>
      )}
      <button
        aria-label={mod.meta.favorite ? t('common.unfavorite') : t('common.favorite')}
        aria-pressed={mod.meta.favorite}
        onClick={() => setFavorite([modId], !mod.meta.favorite)}
        className="grid size-11 place-items-center"
      >
        <Star className={cn('size-5', mod.meta.favorite ? 'fill-amber text-amber' : 'text-dim hover:text-amber')} />
      </button>
      {!readOnly && <SaveDot modId={modId} onStorageFull={() => setStorageOpen(true)} />}
      <ProblemsButton modId={modId} onClick={() => sheet.open('problems')} />
      <Menu items={menu} />
    </AppBar>
  )

  const hideTabs = header?.hideTabs
  const banner = (
    <StorageFullBanner
      onDownloadBackup={() => { setStorageOpen(false); navigate('/'); setTimeout(() => dispatchEvent(new Event('open-download'))) }}
      onFreeSpace={() => { setStorageOpen(false); navigate('/settings#storage') }}
    />
  )

  return (
    <HeaderContext.Provider value={setHeader}>
      <div className="flex min-h-dvh">
        {desktop && (
          <aside className="sticky top-0 flex h-dvh w-[240px] shrink-0 flex-col gap-6 border-r border-edge bg-deep px-3 py-4">
            <Brand compact />
            <nav className="flex flex-col gap-1">
              {tabs.map((tb) => {
                const count = tabCount(mod, tb.path)
                return (
                  <NavLink key={tb.path} to={`${base}/${tb.path}`} className={({ isActive }) => cn('flex h-11 items-center gap-3 rounded-[2px] px-3 text-[14px]', isActive ? 'bg-cyan/10 text-cyan' : 'text-ink hover:bg-white/5')}>
                    <TabIcon name={tb.icon} className="size-5" />
                    <span className="flex-1">{t(tb.label)}</span>
                    {count !== undefined && <span className="font-mono text-[12px] text-dim">{count}</span>}
                  </NavLink>
                )
              })}
            </nav>
            <Link to="/" className="mt-auto flex h-11 items-center gap-3 px-3 text-[14px] text-dim hover:text-white">
              <ArrowLeft className="size-4" />{t('shell.myMods')}
            </Link>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30">
            {bar}
            {tablet && !hideTabs && (
              <nav aria-label={t('shell.modSections')} className="flex justify-center border-b border-edge bg-deep/95 px-4 py-2 backdrop-blur">
                <div className="flex w-full max-w-[640px] rounded-[2px] border border-edge">
                  {tabs.map((tb) => (
                    <NavLink key={tb.path} to={`${base}/${tb.path}`} className={({ isActive }) => cn('flex h-11 flex-1 items-center justify-center gap-2 border-r border-edge text-[13px] last:border-r-0', isActive ? 'bg-cyan/10 text-cyan' : 'text-ink hover:bg-white/5')}>
                      <TabIcon name={tb.icon} className="size-4" />
                      {t(tb.label)}
                    </NavLink>
                  ))}
                </div>
              </nav>
            )}
          </div>
          <main key={location.pathname.split('/').slice(0, 4).join('/')} className={cn('flex-1', !desktop && !tablet && !hideTabs && 'pb-[calc(68px+env(safe-area-inset-bottom))]')}>
            <div className="mx-auto w-full max-w-[760px]">
              {storageFull && <div className="mx-4 mt-3">{banner}</div>}
              <NoStorageBanner className="mx-4 mt-3" onDownloadBackup={() => { navigate('/'); setTimeout(() => dispatchEvent(new Event('open-download'))) }} />
              <DraftBanner modId={owner.meta.id} className="mx-4 mt-3" />
              {readOnly && (
                <div className="mx-4 mt-3 flex items-center gap-3 rounded-[4px] border border-grid bg-grid/10 py-2 pl-3 pr-2">
                  <p className="flex-1 text-[13px] leading-snug text-ink">
                    {t('shell.gameQuest')}
                  </p>
                  <button onClick={() => { const id = duplicateMod(modId); if (id) navigate(`/mod/${id}/overview`) }} className="h-9 shrink-0 rounded-[2px] border border-cyan px-3 text-[13px] font-semibold text-cyan hover:bg-cyan/10">{t('shell.makeCopy')}</button>
                </div>
              )}
              {owner.meta.community && <div className="mx-4 mt-3"><CommunityBanner mod={owner} /></div>}
              <Outlet />
            </div>
          </main>
        </div>
        {desktop && <Inspector modId={modId} />}
      </div>
      {!desktop && !tablet && !hideTabs && (
        <nav aria-label={t('shell.modSections')} className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-deep/95 backdrop-blur safe-bottom">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((tb) => (
              <NavLink key={tb.path} to={`${base}/${tb.path}`} className={({ isActive }) => cn('flex h-[60px] flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'text-cyan' : 'text-dim')}>
                <TabIcon name={tb.icon} className="size-5" />
                {t(tb.label)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      <ProblemsSheet modId={modId} open={sheet.current === 'problems'} onOpenChange={(v) => (v ? sheet.open('problems') : sheet.close())} />
      <ExportSheet modId={modId} open={sheet.current === 'export'} onOpenChange={(v) => (v ? sheet.open('export') : sheet.close())} />
      {isQuest && <LanguageVersionsSheet modId={modId} open={sheet.current === 'languages'} onOpenChange={(v) => (v ? sheet.open('languages') : sheet.close())} />}
      <Sheet open={storageOpen} onOpenChange={setStorageOpen} title={t('shell.notSaved')}>{banner}</Sheet>
    </HeaderContext.Provider>
  )
}

/** Standard padded page body. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-5 px-4 py-4', className)}>{children}</div>
}

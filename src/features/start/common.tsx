import { Check, ClipboardPaste, FileUp, Globe, Image, Sparkles, Star, WifiOff } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { Card, SectionLabel } from '@/components/ui/surfaces'
import { newStarsView } from '@/lib/factory'
import { LANGS } from '@/lib/reference'
import { QUEST_TEMPLATES, type QuestTemplate } from '@/lib/templates'
import { modFromParts, pairTextures } from '@/lib/mods'
import { applyBackup, readBackup, type Backup } from '@/data/backup'
import { cn } from '@/lib/utils'
import { unzip } from '@/lib/zip'
import { useT } from '@/i18n'
import { addHistory, addMod, addModFromPart, getRepository, reloadFromStorage, setImportDraft, setSettings, useEditor } from '@/store/editor'
import { SAMPLE_FILE, SAMPLE_FILE_NAME, importText } from './importer'

export function OfflineChip() {
  const t = useT()
  const offline = useEditor((s) => s.settings.offline)
  if (!offline) return null
  return <span className="mr-1 flex h-7 items-center gap-1 rounded-[2px] border border-edge px-2 font-mono text-[11px] text-dim"><WifiOff className="size-3" />{t('start.offline')}</span>
}

/** Saves a file through a Blob link, which browsers allow without any permission. */
export function downloadFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function LanguageChip({ className }: { className?: string }) {
  const t = useT()
  const lang = useEditor((s) => s.settings.uiLang)
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        aria-label={t('start.interfaceLanguage')}
        onClick={() => setOpen(true)}
        className={cn('flex h-9 items-center gap-1.5 rounded-[2px] border border-edge px-2 font-mono text-[12px] text-ink hover:border-cyan hover:text-white', className)}
      >
        <Globe className="size-4" />{LANGS.find((l) => l.key === lang)?.label}
      </button>
      <LanguageSheet open={open} onOpenChange={setOpen} />
    </>
  )
}

export function LanguageSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const lang = useEditor((s) => s.settings.uiLang)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('start.interfaceLanguage')} description={t('start.interfaceLanguageHelp')}>
      <div className="flex flex-col gap-1 pt-2">
        {LANGS.map((l) => (
          <button
            key={l.key}
            onClick={() => { setSettings({ uiLang: l.key }); onOpenChange(false) }}
            className={cn('flex min-h-12 items-center gap-3 rounded-[2px] border px-3 text-left', l.key === lang ? 'border-cyan bg-cyan/10' : 'border-transparent hover:bg-white/[0.04]')}
          >
            <span className="w-10 font-mono text-[12px] text-dim">{l.label}</span>
            <span className="flex-1 text-[15px] text-white">{l.name}</span>
            {l.key === lang && <Check className="size-4 text-cyan" />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function TemplateDiagram({ diagram }: { diagram: QuestTemplate['diagram'] }) {
  return (
    <div aria-hidden className="flex items-center gap-1">
      {diagram.map((d, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="h-px w-2.5 bg-grid" />}
          {Array.isArray(d) ? (
            <span className="flex flex-col gap-1">
              {d.map((x) => <span key={x} className="rounded-[2px] border border-grid px-1 font-mono text-[9px] leading-4 text-ink">{x}</span>)}
            </span>
          ) : (
            <span className="rounded-[2px] border border-grid px-1 font-mono text-[9px] leading-4 text-ink">{d}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/** Type sheet, then the template sheet for quests. */
export function NewModSheets({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const [templates, setTemplates] = React.useState(false)
  const newStars = () => {
    const mod = newStarsView(t('start.newStarsTitle'))
    const newId = addModFromPart(mod)
    onOpenChange(false)
    navigate(`/mod/${newId}/overview`)
  }
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={t('start.newMod')} description={t('start.newModHelp')}>
        <div className="flex flex-col gap-3 pt-2">
          <TypeCard icon={<Sparkles />} title={t('start.sideQuest')} body={t('start.sideQuestHelp')} onClick={() => { onOpenChange(false); setTemplates(true) }} primary />
          <TypeCard icon={<Star />} title={t('start.starsStations')} body={t('start.starsStationsHelp')} onClick={newStars} />
          <TypeCard icon={<Image />} title={t('start.texturesType')} body={t('start.texturesTypeHelp')} badge={t('start.comingSoon')} disabled />
        </div>
      </Sheet>
      <Sheet open={templates} onOpenChange={setTemplates} title={t('start.chooseTemplate')} description={t('start.chooseTemplateHelp')} full>
        <div className="flex flex-col gap-2 pt-2">
          {QUEST_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => { setTemplates(false); navigate(`/new?template=${tpl.key}`) }}
              className="flex min-h-[72px] flex-col gap-2 rounded-[4px] border border-edge bg-panel px-3 py-3 text-left hover:border-cyan"
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-white">{tpl.name}</span>
                  <span className="text-[13px] text-ink/80">{tpl.description}</span>
                </span>
              </span>
              <TemplateDiagram diagram={tpl.diagram} />
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

function TypeCard({ icon, title, body, onClick, primary, disabled, badge }: { icon: React.ReactNode; title: string; body: string; onClick?: () => void; primary?: boolean; disabled?: boolean; badge?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn('flex min-h-[72px] items-start gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors', disabled ? 'cursor-not-allowed border-edge bg-panel opacity-60' : primary ? 'border-cyan bg-cyan/[0.08] hover:bg-cyan/15' : 'border-edge bg-panel hover:border-cyan')}>
      <span className="mt-0.5 text-cyan [&_svg]:size-5">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-white">{title}{badge && <span className="rounded-[2px] border border-amber px-1.5 py-px font-mono text-[11px] font-normal text-amber">{badge}</span>}</span>
        <span className="text-[13px] leading-snug text-ink/80">{body}</span>
      </span>
    </button>
  )
}

/** Pick a file or paste JSON; both hand the text to the review screen. */
export function OpenFileSheet({ open, onOpenChange, dropped }: { open: boolean; onOpenChange: (v: boolean) => void; dropped?: File | null }) {
  const t = useT()
  const navigate = useNavigate()
  const [paste, setPaste] = React.useState('')
  const [backup, setBackup] = React.useState<(Backup & { name: string }) | null>(null)
  const [confirmReplace, setConfirmReplace] = React.useState(false)
  const review = (text: string, fileName: string) => {
    onOpenChange(false)
    setPaste('')
    setImportDraft({ text, fileName })
    navigate('/import')
  }
  const openZip = async (file: File) => {
    let entries: Awaited<ReturnType<typeof unzip>>
    try { entries = await unzip(file) } catch { toast.error(t('start.zipUnreadable')); return }
    let restored: Backup | null = null
    try { restored = readBackup(entries) } catch { toast.error(t('start.zipStateDamaged')); return }
    if (restored) { setBackup({ ...restored, name: file.name }); return }
    const views = entries.filter((e) => !e.name.includes('__MACOSX') && /(^|\/)(Quest\d+|StarsStations)\.json$/i.test(e.name))
      .map((e) => importText(e.text)).flatMap((r) => (r.kind === 'ok' ? [r.mod] : []))
    const { textures } = pairTextures(entries)
    if (!views.length && !textures.length) { toast.error(t('start.zipNoModFiles')); return }
    const title = file.name.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ')
    const mod = modFromParts(views, { title, origin: 'import', favorite: true, version: '1.0.0', author: '', summary: '', link: '', tags: [], licence: 'All rights reserved', createdAt: Date.now(), updatedAt: Date.now() }, textures)
    addMod(mod)
    void addHistory(mod.meta.id, t('startLib.importedEntry', { file: file.name }), true)
    onOpenChange(false)
    const parts = [mod.quests.length && t('start.quests', { count: mod.quests.length }), mod.stars && t('start.starsStationsLower'), textures.length && t('start.textures', { count: textures.length })].filter(Boolean).join(', ')
    toast.success(t('start.opened', { title }), { description: parts })
    navigate(`/mod/${mod.meta.id}`)
  }
  const openAny = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.zip')) return openZip(file)
    review(await file.text(), file.name)
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) openAny(file)
  }
  React.useEffect(() => {
    if (dropped) openAny(dropped)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped])
  const restore = async (mode: 'add' | 'replace') => {
    const repo = getRepository()
    if (!backup || !repo) return
    setBackup(null)
    setConfirmReplace(false)
    onOpenChange(false)
    let r: { added: number; skipped: number }
    try { r = await applyBackup(repo, backup, mode) } catch { toast.error(t('start.backupNotSaved')); return }
    await reloadFromStorage()
    const prefs = backup.settings as Record<string, unknown>
    setSettings(Object.fromEntries(Object.entries(prefs).filter(([k]) => ['uiLang', 'tips', 'advanced', 'dismissedTips', 'downloadLang', 'downloadName'].includes(k))))
    toast.success(mode === 'replace' ? t('start.restored', { count: r.added, file: backup.name }) : r.skipped ? t('start.addedSkipped', { count: r.added, skipped: r.skipped }) : t('start.added', { count: r.added }), {
      description: backup.unknown.length ? t('start.backupNewerFields', { fields: backup.unknown.slice(0, 5).join(', ') + (backup.unknown.length > 5 ? '…' : '') }) : undefined,
    })
  }
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={t('start.open')} description={t('start.openHelp')}>
        <div className="flex flex-col gap-4 pt-2">
          <label className="flex min-h-[72px] cursor-pointer items-center gap-3 rounded-[4px] border border-cyan bg-cyan/[0.08] px-3 py-3 hover:bg-cyan/15 focus-within:outline focus-within:outline-2 focus-within:outline-cyan">
            <FileUp className="size-5 text-cyan" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-white">{t('start.chooseFile')}</span>
              <span className="text-[13px] text-ink/80">{t('start.chooseFileHelp')}</span>
            </span>
            <input type="file" accept=".json,.zip,application/json,application/zip" className="sr-only" onChange={onFile} />
          </label>
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('start.orPaste')}</SectionLabel>
            <textarea
              aria-label={t('start.pasteJson')}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={6}
              placeholder='{ "settings": { … }, "questParts": [ … ] }'
              className="w-full rounded-[2px] border border-edge bg-field p-3 font-mono text-[13px] text-ink outline-none placeholder:text-dim focus:border-cyan"
            />
            <Button variant="primary" disabled={!paste.trim()} onClick={() => review(paste, t('start.pastedJson'))}><ClipboardPaste className="size-4" />{t('start.reviewPasted')}</Button>
          </div>
          <Card className="flex items-center gap-3 p-3">
            <p className="flex-1 text-[13px] text-ink/80">{t('start.noFileHandy')}</p>
            <Button size="sm" variant="secondary" onClick={() => review(SAMPLE_FILE, SAMPLE_FILE_NAME)}>{t('start.trySample')}</Button>
          </Card>
        </div>
      </Sheet>
      <ConfirmDialog
        open={!!backup && !confirmReplace}
        onOpenChange={(v) => { if (!v) setBackup(null) }}
        title={t('start.openBackup')}
        body={backup ? t('start.openBackupBody', { file: backup.name, count: backup.mods.length }) : ''}
        confirmLabel={t('start.addToMine')}
        onConfirm={() => void restore('add')}
      >
        <Button variant="destructive" onClick={() => setConfirmReplace(true)}>{t('start.replaceEverything')}</Button>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={(v) => { setConfirmReplace(v); if (!v) setBackup(null) }}
        title={t('start.replaceEverythingQ')}
        body={t('start.replaceEverythingBody')}
        tone="destructive"
        confirmLabel={t('start.replaceEverything')}
        onConfirm={() => void restore('replace')}
      >
        <Button variant="secondary" onClick={() => { setConfirmReplace(false); setBackup(null); onOpenChange(false); dispatchEvent(new Event('open-download')) }}>{t('ui.downloadBackup')}</Button>
      </ConfirmDialog>
    </>
  )
}

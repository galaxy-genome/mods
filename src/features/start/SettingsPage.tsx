import { Database, Download, FileClock, FileText, Globe, HardDrive, Info, OctagonAlert, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { InstallCard } from '@/components/layout/install'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Input, SwitchRow } from '@/components/ui/inputs'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Card, ListRow, RowGroup, SectionLabel } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { LANGS } from '@/lib/reference'
import { formatBytes } from '@/features/output/HistoryPage'
import { clearAllData, deleteHistory, loadSamples, requestPersist, resetAll, setSettings, simulateQuota, useEditor } from '@/store/editor'
import { LanguageSheet, OfflineChip } from './common'

export function SettingsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const mods = useEditor((s) => s.mods)
  const settings = useEditor((s) => s.settings)
  const history = useEditor((s) => s.history)
  const storage = useEditor((s) => s.storage)
  const [usage, setUsage] = React.useState<{ usage?: number; quota?: number } | null>(null)
  const [clearOpen, setClearOpen] = React.useState(false)
  const [langOpen, setLangOpen] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [typed, setTyped] = React.useState('')
  const bySize = React.useMemo(() => [...history].sort((a, b) => b.bytes - a.bytes).slice(0, 10), [history])
  const title = (modId: string) => mods.find((m) => m.meta.id === modId)?.meta.title ?? ''
  const openDownload = () => { navigate('/'); setTimeout(() => dispatchEvent(new Event('open-download'))) }

  React.useEffect(() => { navigator.storage?.estimate?.().then(setUsage).catch(() => {}) }, [mods, history])

  React.useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="min-h-dvh bg-void">
      <AppBar back="/" title={t('start.settings')}><OfflineChip /></AppBar>
      <main className="mx-auto flex max-w-[640px] flex-col gap-3 px-4 py-4 pb-12">
        <InstallCard />
        <SectionLabel>{t('start.editor')}</SectionLabel>
        <RowGroup>
          <ListRow icon={<Globe />} title={t('start.interfaceLanguage')} value={LANGS.find((l) => l.key === settings.uiLang)?.name} onClick={() => setLangOpen(true)} />
          <div className="px-3 py-1"><SwitchRow label={t('start.tips')} help={t('start.tipsHelp')} checked={settings.tips} onCheckedChange={(v) => setSettings({ tips: v, ...(v ? { dismissedTips: [] } : {}) })} /></div>
          <div className="px-3 py-1"><SwitchRow label={t('start.advanced')} help={t('start.advancedHelp')} checked={settings.advanced} onCheckedChange={(v) => setSettings({ advanced: v })} /></div>
        </RowGroup>

        <div id="storage" className="scroll-mt-16" />
        <SectionLabel className="mt-3">{t('start.storage')}</SectionLabel>
        <Card className="flex flex-col gap-3 p-3">
          {!storage.available && <p className="flex items-start gap-2 text-[14px] text-white"><OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" />{t('ui.cantSave')}</p>}
          <div className="flex items-center gap-3">
            <HardDrive className="size-5 text-cyan" />
            <div className="flex flex-1 flex-col">
              <span className="text-[15px] text-white">{t('start.storageUsed', { used: formatBytes(usage?.usage ?? 0), quota: formatBytes(usage?.quota ?? 0) })}</span>
              <span className="font-mono text-[12px] text-dim">{t('start.storageDetail', { mods: mods.length, entries: history.length })}</span>
            </div>
          </div>
          {!!usage?.quota && <div className="h-1.5 overflow-hidden rounded-full bg-field"><div className="h-full bg-cyan" style={{ width: `${Math.max(1, ((usage.usage ?? 0) / usage.quota) * 100)}%` }} /></div>}
          <div className="flex items-center gap-3 border-t border-edge pt-3">
            <Database className={storage.persisted ? 'size-5 text-success' : 'size-5 text-amber'} />
            <span className="flex-1 text-[14px] text-ink">{storage.persisted ? t('start.persistent') : t('start.notPersistent')}</span>
            {!storage.persisted && (
              <Button size="sm" variant="warning" onClick={async () => (await requestPersist()) ? toast(t('start.modsKept')) : toast(t('start.persistRefused'), { description: t('start.persistRefusedHelp') })}>{t('start.keepSafeShort')}</Button>
            )}
          </div>
          <Button variant="secondary" onClick={openDownload}><Download className="size-4" />{t('ui.downloadBackup')}</Button>
        </Card>
        <RowGroup>
          <ListRow icon={<FileClock />} title={t('output.hiTitle')} subtitle={t('start.historyHelp')} onClick={() => navigate('/history')} />
        </RowGroup>
        {bySize.length > 0 && (
          <>
            <SectionLabel className="mt-1">{t('start.historyBySize')}</SectionLabel>
            <RowGroup>
              {bySize.map((h) => (
                <div key={h.id} className="flex min-h-12 items-center gap-3 py-1.5 pl-3 pr-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] text-white">{h.name || t('output.hiAuto')}</span>
                    <span className="truncate font-mono text-[12px] text-dim">{[formatBytes(h.bytes), title(h.modId), new Date(h.createdAt).toLocaleDateString()].filter(Boolean).join(' · ')}</span>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={t('output.hiDelete')} onClick={() => void deleteHistory(h.id)}><Trash2 className="size-4" /></Button>
                </div>
              ))}
            </RowGroup>
          </>
        )}

        <SectionLabel className="mt-3">{t('start.mockupTools')}</SectionLabel>
        <RowGroup>
          {import.meta.env.DEV && <div className="px-3 py-1"><SwitchRow label={t('start.simStorageFull')} help={t('start.simStorageFullHelp')} checked={storage.simulateQuota} onCheckedChange={simulateQuota} /></div>}
          <ListRow icon={<Sparkles />} title={t('start.loadSamples')} subtitle={t('start.loadSamplesHelp')} onClick={() => { loadSamples(); toast(t('start.samplesAdded')) }} />
          <ListRow icon={<RotateCcw className="text-danger" />} title={<span className="text-danger">{t('start.resetFirstRun')}</span>} subtitle={t('start.resetFirstRunHelp')} onClick={() => { setTyped(''); setResetOpen(true) }} />
          <ListRow icon={<Trash2 className="text-danger" />} title={<span className="text-danger">{t('start.clearAllData')}</span>} subtitle={t('start.clearAllDataHelp')} onClick={() => setClearOpen(true)} />
        </RowGroup>

        <SectionLabel className="mt-3">{t('start.aboutSection')}</SectionLabel>
        <RowGroup>
          <ListRow icon={<Info />} title={t('start.appName')} subtitle={t('start.appAbout')} chevron={false} />
          <ListRow icon={<FileText />} title={t('start.helpCentre')} onClick={() => navigate('/help')} />
        </RowGroup>
      </main>
      <LanguageSheet open={langOpen} onOpenChange={setLangOpen} />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('start.clearAllDataQ')}
        body={t('start.clearAllDataBody')}
        tone="destructive"
        confirmLabel={t('start.clearAllData')}
        onConfirm={async () => { await clearAllData(); location.assign(import.meta.env.BASE_URL) }}
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('start.deleteEverythingQ')}
        body={t('start.deleteEverythingBody')}
        tone="destructive"
        confirmLabel={t('start.deleteEverything')}
        confirmDisabled={typed !== 'DELETE'}
        onConfirm={() => { void resetAll(); toast(t('start.everythingDeleted')); navigate('/') }}
      >
        <Input aria-label={t('start.typeDelete')} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoCapitalize="characters" />
      </ConfirmDialog>
    </div>
  )
}

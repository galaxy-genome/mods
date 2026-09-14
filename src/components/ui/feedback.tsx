import { FileDown, HardDriveDownload, OctagonAlert, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { discardDraft, restoreDraft, useEditor } from '@/store/editor'
import { Button } from './button'

/** Loading placeholder in the shape of a card or a list row. */
export function Skeleton({ shape = 'row', className }: { shape?: 'card' | 'row'; className?: string }) {
  const bar = 'rounded-[2px] bg-edge/60 motion-safe:animate-pulse'
  return (
    <div aria-hidden className={cn('rounded-[4px] border border-edge bg-panel', shape === 'card' ? 'flex flex-col gap-3 p-4' : 'flex min-h-14 items-center gap-3 px-3', className)}>
      {shape === 'card' ? (
        <>
          <div className={cn(bar, 'h-4 w-2/5')} />
          <div className={cn(bar, 'h-3 w-4/5')} />
          <div className={cn(bar, 'h-3 w-3/5')} />
        </>
      ) : (
        <>
          <div className={cn(bar, 'size-5 shrink-0')} />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className={cn(bar, 'h-3 w-1/2')} />
            <div className={cn(bar, 'h-2.5 w-1/3')} />
          </div>
        </>
      )}
    </div>
  )
}

export function StorageFullBanner({ onDownloadBackup, onFreeSpace, className }: { onDownloadBackup: () => void; onFreeSpace: () => void; className?: string }) {
  const t = useT()
  return (
    <div role="alert" className={cn('flex flex-col gap-2 rounded-[4px] border border-danger bg-danger/10 p-3', className)}>
      <p className="flex items-start gap-2 text-[14px] leading-snug text-white">
        <OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        {t('ui.storageFull')}
      </p>
      <div className="flex flex-wrap gap-2 pl-6">
        <Button variant="destructive" size="sm" onClick={onDownloadBackup}><HardDriveDownload />{t('ui.downloadBackup')}</Button>
        <Button variant="secondary" size="sm" onClick={onFreeSpace}><Trash2 />{t('ui.freeSpace')}</Button>
      </div>
    </div>
  )
}

/** Shown while IndexedDB can't open: mods live in this tab's memory only. */
export function NoStorageBanner({ onDownloadBackup, className }: { onDownloadBackup: () => void; className?: string }) {
  const t = useT()
  const available = useEditor((s) => s.storage.available)
  if (available) return null
  return (
    <div role="alert" className={cn('flex flex-col gap-2 rounded-[4px] border border-danger bg-danger/10 p-3', className)}>
      <p className="flex items-start gap-2 text-[14px] leading-snug text-white"><OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" />{t('ui.cantSave')}</p>
      <div className="pl-6"><Button variant="destructive" size="sm" onClick={onDownloadBackup}><HardDriveDownload />{t('ui.downloadBackup')}</Button></div>
    </div>
  )
}

/** "Unsaved text recovered" for text typed but not saved before the tab closed. `modId` limits it to one mod. */
export function DraftBanner({ modId, className }: { modId?: string; className?: string }) {
  const t = useT()
  const draft = useEditor((s) => s.recoveredDraft)
  if (!draft || (modId && draft.modId !== modId)) return null
  return (
    <div role="status" className={cn('flex flex-col gap-3 rounded-[4px] border border-amber bg-amber/10 p-3', className)}>
      <p className="flex items-start gap-3 text-[14px] leading-snug text-white"><FileDown className="mt-0.5 size-5 shrink-0 text-amber" /><span>{t('ui.draftRecovered', { title: draft.title })}<span className="mt-1 block truncate font-mono text-[12px] text-ink">“{draft.value}”</span></span></p>
      <div className="flex flex-wrap gap-2 pl-8">
        <Button size="sm" variant="warning" onClick={() => { restoreDraft(); toast.success(t('ui.draftRestored', { title: draft.title })) }}>{t('ui.restore')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { discardDraft(); toast(t('ui.draftDiscarded')) }}>{t('ui.discard')}</Button>
      </div>
    </div>
  )
}

/** Link that leaves the app. Offline it explains itself instead of navigating. */
export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const t = useT()
  const offline = useEditor((s) => s.settings.offline)
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-disabled={offline || undefined}
      onClick={(e) => { if (offline) { e.preventDefault(); toast(t('ui.needsConnection')) } }}
      className={cn('text-cyan hover:underline', offline && 'text-dim', className)}
    >
      {children}<span aria-hidden> ↗</span>
      {offline && <span className="ml-1.5 text-[12px] text-dim">({t('ui.needsConnection')})</span>}
    </a>
  )
}

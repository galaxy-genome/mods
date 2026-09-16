import { Download, Share, SquarePlus, X } from 'lucide-react'
import * as React from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { setSettings, useEditor } from '@/store/editor'
import { Button } from '../ui/button'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
if (typeof window !== 'undefined') {
  // Captured at module load: the event can fire before any component mounts.
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; notify() })
  addEventListener('appinstalled', () => { deferred = null; notify() })
}

export function useInstallPrompt() {
  const canInstall = React.useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => !!deferred)
  const standalone = useMediaQuery('(display-mode: standalone)') || (navigator as { standalone?: boolean }).standalone === true
  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    notify()
    return outcome === 'accepted'
  }
  return { canInstall, install, installed: standalone }
}

const isIosSafari = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)

/** "Install as an app" on Chromium; a Share → Add to Home Screen hint on iOS Safari. Hidden once installed or dismissed. */
export function InstallCard({ className }: { className?: string }) {
  const t = useT()
  const { canInstall, install, installed } = useInstallPrompt()
  const dismissed = useEditor((s) => s.settings.installPromptDismissedAt != null)
  const setDismissed = (v: boolean) => setSettings({ installPromptDismissedAt: v ? Date.now() : null })
  const ios = isIosSafari()
  if (installed || dismissed || (!canInstall && !ios)) return null
  return (
    <div className={cn('flex items-start gap-3 rounded-[4px] border border-grid-strong bg-cyan/[0.06] py-3 pl-3 pr-1', className)}>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[14px] font-semibold text-white">{t('shell.installTitle')}</p>
        {canInstall ? (
          <>
            <p className="text-[13px] leading-snug text-ink">{t('shell.installBody')}</p>
            <Button variant="primary" size="sm" className="self-start" onClick={install}><Download />{t('shell.install')}</Button>
          </>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] leading-snug text-ink">
            {t('shell.iosTap')}
            <span className="inline-grid size-7 place-items-center rounded-[2px] border border-edge text-cyan"><Share className="size-4" aria-label={t('shell.iosShare')} /></span>
            {t('shell.iosThen')}
            <span className="inline-flex h-7 items-center gap-1 rounded-[2px] border border-edge px-2 text-cyan"><SquarePlus className="size-4" />{t('shell.iosAdd')}</span>
          </p>
        )}
      </div>
      <button aria-label={t('common.close')} onClick={() => setDismissed(true)} className="grid size-9 shrink-0 place-items-center text-dim hover:text-white">
        <X className="size-4" />
      </button>
    </div>
  )
}

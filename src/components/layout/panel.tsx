import { ArrowLeft, X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'

/** Paths that draw over the page that opened them rather than replacing it. */
export const isPanelPath = (pathname: string) => pathname === '/help' || pathname.startsWith('/help/') || pathname.startsWith('/map/')

/** Events stop at the layer, so an open sheet underneath neither closes on a tap here nor takes focus or keys from it. */
const STOPPED = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend', 'focusin', 'focusout', 'keydown', 'keyup', 'wheel']

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

const PanelOpen = React.createContext(false)

/** True for the page underneath while a panel is open; its URL is the panel's, not the page's. */
export const usePanelOpen = () => React.useContext(PanelOpen)
export const PanelOpenProvider = PanelOpen

const InPanel = React.createContext<{ scrollTop: () => void } | null>(null)

/** Inside a panel: the page hides its own app bar and scrolls the panel rather than the window. */
export const useInPanel = () => React.useContext(InPanel)

/**
 * A slide-out panel over the page that opened it, which stays mounted with its scroll and state.
 * Escape and the scrim close it; focus is trapped while it is open and returns to the opener.
 */
export function Panel({ label, title, onBack, onClose, children }: {
  label: string
  /** With a title the panel draws its own header, with back where `onBack` is given. */
  title?: React.ReactNode
  onBack?: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const t = useT()
  const panel = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const [host] = React.useState(() => {
    const el = document.createElement('div')
    el.style.pointerEvents = 'auto'
    return el
  })
  const close = React.useRef(onClose)
  close.current = onClose

  React.useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    document.body.append(host)
    // Everything else is inert while the panel is open, so an open sheet's own focus trap cannot pull focus back.
    const covered = [...document.body.children].filter((el): el is HTMLElement => el !== host && el instanceof HTMLElement && !el.inert)
    covered.forEach((el) => { el.inert = true })
    const stop = (e: Event) => e.stopPropagation()
    STOPPED.forEach((type) => host.addEventListener(type, stop))
    const keys = (e: KeyboardEvent) => {
      // Captured on the window, so a sheet underneath does not also close on the same Escape.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab' || !panel.current?.contains(document.activeElement)) return
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const edge = e.shiftKey ? items[0] : items[items.length - 1]
      if (document.activeElement !== edge) return
      e.preventDefault()
      ;(e.shiftKey ? items[items.length - 1] : items[0]).focus()
    }
    addEventListener('keydown', keys, true)
    return () => {
      STOPPED.forEach((type) => host.removeEventListener(type, stop))
      removeEventListener('keydown', keys, true)
      host.remove()
      covered.forEach((el) => { el.inert = false })
      opener?.focus?.()
    }
  }, [host])

  React.useEffect(() => {
    const el = panel.current
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()
  }, [])

  const scroll = React.useMemo(() => ({ scrollTop: () => body.current?.scrollTo(0, 0) }), [])

  return createPortal(
    <>
      <div aria-hidden className="fixed inset-0 z-[69] bg-void/70" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="panel-in fixed inset-y-0 right-0 z-[70] flex w-full flex-col bg-void outline-none sm:w-[min(880px,92vw)] sm:border-l sm:border-edge">
        {title !== undefined && (
          <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-edge bg-deep px-1 pt-[env(safe-area-inset-top)]">
            {onBack && (
              <button type="button" aria-label={t('common.back')} onClick={onBack} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white">
                <ArrowLeft className="size-[22px]" />
              </button>
            )}
            <h2 className="min-w-0 flex-1 truncate px-2 text-[17px] font-semibold text-white">{title}</h2>
            <button type="button" aria-label={t('common.close')} onClick={onClose} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white">
              <X className="size-5" />
            </button>
          </header>
        )}
        <InPanel value={scroll}>
          <div ref={body} className={title === undefined ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'}>
            {children}
          </div>
        </InPanel>
      </div>
    </>,
    host,
  )
}

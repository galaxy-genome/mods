import { X } from 'lucide-react'
import * as React from 'react'
import { t } from '@/i18n'
import { Drawer } from 'vaul'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet on phones (drag handle, swipe down to close, snaps to half and full),
 * a right-side panel from 600px up.
 */
export function Sheet({
  open, onOpenChange, title, description, children, footer, full, className, headerAction, nested,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  /** Opens at full height on phones. */
  full?: boolean
  className?: string
  headerAction?: React.ReactNode
  /** A sheet opened from inside another sheet. */
  nested?: boolean
}) {
  const wide = useMediaQuery('(min-width: 600px)')
  const Root = nested ? Drawer.NestedRoot : Drawer.Root
  return (
    <Root open={open} onOpenChange={onOpenChange} direction={wide ? 'right' : 'bottom'} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-void/70 backdrop-blur-[1px]" />
        <Drawer.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed z-50 flex flex-col border-edge bg-deep outline-none',
            wide
              ? 'inset-y-0 right-0 w-[440px] max-w-full border-l'
              : cn('inset-x-0 bottom-0 max-h-[calc(100dvh-24px)] rounded-t-[6px] border-t border-grid-strong', full ? 'h-[calc(100dvh-24px)]' : 'max-h-[88dvh]'),
            className,
          )}
        >
          {!wide && <div aria-hidden className="mx-auto mb-1 mt-2 h-1 w-9 shrink-0 rounded-full bg-edge" />}
          <div className={cn('flex shrink-0 items-start gap-2 pl-4 pr-1', wide ? 'pb-2 pt-3' : 'pb-1')}>
            <div className="flex min-h-11 flex-1 flex-col justify-center py-1">
              <Drawer.Title className="font-ui text-[17px] font-semibold text-white">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-[13px] leading-snug text-ink/75">{description}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{typeof title === 'string' ? title : t('ui.sheet')}</Drawer.Description>
              )}
            </div>
            {headerAction}
            <Drawer.Close aria-label={t('common.close')} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white">
              <X className="size-5" />
            </Drawer.Close>
          </div>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          {footer && <div className="safe-bottom shrink-0 border-t border-edge bg-deep px-4 py-3">{footer}</div>}
          {!footer && <div className="safe-bottom shrink-0" />}
        </Drawer.Content>
      </Drawer.Portal>
    </Root>
  )
}

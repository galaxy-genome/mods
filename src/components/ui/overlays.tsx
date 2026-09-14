import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'
import * as React from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button } from './button'

/** Centred confirm dialog for the few actions that cannot be undone. */
export function ConfirmDialog({
  open, onOpenChange, title, body, confirmLabel = t('ui.confirm'), cancelLabel = t('common.cancel'), tone = 'primary', onConfirm, children, confirmDisabled,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'destructive' | 'warning'
  onConfirm: () => void
  children?: React.ReactNode
  confirmDisabled?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-void/75" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[4px] border border-edge bg-deep p-5">
          <Dialog.Title className="text-[17px] font-semibold text-white">{title}</Dialog.Title>
          {body ? <Dialog.Description className="text-[14px] leading-relaxed text-ink">{body}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          {children}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
            <Button variant={tone} disabled={confirmDisabled} onClick={() => { onConfirm(); onOpenChange(false) }}>{confirmLabel}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  tone?: 'danger'
  disabled?: boolean
  separatorBefore?: boolean
}

export function Menu({ items, trigger, label = t('ui.moreActions'), align = 'end' }: { items: MenuItem[]; trigger?: React.ReactNode; label?: string; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button aria-label={label} className="grid size-11 shrink-0 place-items-center text-ink hover:text-white" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="size-5" />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={4} collisionPadding={8} className="z-[70] min-w-[220px] rounded-[4px] border border-edge bg-deep p-1">
          {items.map((item) => (
            <React.Fragment key={item.label}>
              {item.separatorBefore && <DropdownMenu.Separator className="my-1 h-px bg-edge" />}
              <DropdownMenu.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex h-11 cursor-pointer select-none items-center gap-3 rounded-[2px] px-3 text-[14px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/[0.06] [&_svg]:size-4',
                  item.tone === 'danger' ? 'text-danger' : 'text-white [&_svg]:text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </DropdownMenu.Item>
            </React.Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

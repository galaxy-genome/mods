import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Braces, Download, FilePlus2, FolderOpen, HelpCircle, ListChecks, Package, Settings } from 'lucide-react'
import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useT } from '@/i18n'
import { splitViewId } from '@/lib/mods'
import { questOf, setSettings, useEditor, usePart } from '@/store/editor'
import { useListNav } from '@/components/pickers/common'
import { QUEST_TABS, STARS_TABS, TabIcon } from './tabs'

const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')

const dialogBox = 'fixed left-1/2 top-[12vh] z-[90] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[4px] border border-edge bg-deep'

/** Ctrl/Cmd+K command palette and the `?` shortcut list, available on every screen. */
export function CommandLayer() {
  const t = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = React.useState(false)
  const [keysOpen, setKeysOpen] = React.useState(false)
  const modId = pathname.match(/^\/mod\/([^/]+)/)?.[1]
  const mod = usePart(modId && splitViewId(modId).partId ? modId : undefined)
  const mods = useEditor((s) => s.mods)
  const advanced = useEditor((s) => s.settings.advanced)
  useListNav()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v) }
      else if (e.key === '?' && !e.metaKey && !e.ctrlKey && !typing(e)) { e.preventDefault(); setKeysOpen(true) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const run = (fn: () => void) => { setOpen(false); fn() }
  const home = (event: string) => run(() => { navigate('/'); setTimeout(() => dispatchEvent(new Event(event))) })
  const item = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-[2px] px-3 text-[14px] text-white data-[selected=true]:bg-white/[0.06] [&_svg]:size-4 [&_svg]:text-ink'
  const group = '[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3'
  const quest = mod?.meta.type === 'quest' ? questOf(mod) : undefined

  return (
    <>
      <Command.Dialog open={open} onOpenChange={setOpen} label={t('shell.palette')} overlayClassName="fixed inset-0 z-[90] bg-void/75" contentClassName={dialogBox}>
        <Command.Input placeholder={t('shell.paletteSearch')} className="h-12 w-full border-b border-edge bg-transparent px-4 text-[15px] text-white outline-none placeholder:text-dim" />
        <Command.List className="max-h-[60vh] overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-[14px] text-dim">{t('shell.paletteEmpty')}</Command.Empty>
          {mod && modId && (
            <Command.Group heading={mod.meta.title} className={group}>
              {(mod.meta.type === 'quest' ? QUEST_TABS : STARS_TABS).map((tb) => (
                <Command.Item key={tb.path} value={`tab ${t(tb.label)}`} onSelect={() => run(() => navigate(`/mod/${modId}/${tb.path}`))} className={item}>
                  <TabIcon name={tb.icon} />{t(tb.label)}
                </Command.Item>
              ))}
              {quest?.steps.map((s, i) => (
                <Command.Item key={s.id} value={`step ${i + 1} ${s.name} ${s.id}`} onSelect={() => run(() => navigate(`/mod/${modId}/steps/${s.id}`))} className={item}>
                  <span className="w-4 text-center font-mono text-[12px] text-dim">{i + 1}</span>{s.name || t('shell.untitledStep')}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading={t('shell.paletteActions')} className={group}>
            <Command.Item onSelect={() => run(() => navigate('/new'))} className={item}><FilePlus2 />{t('shell.newMod')}</Command.Item>
            <Command.Item onSelect={() => home('open-file')} className={item}><FolderOpen />{t('common.open')}</Command.Item>
            <Command.Item onSelect={() => home('open-download')} className={item}><Download />{t('shell.download')}</Command.Item>
            {mod && <Command.Item onSelect={() => run(() => dispatchEvent(new Event('open-export')))} className={item}><Package />{t('shell.export')}</Command.Item>}
            {mod && <Command.Item onSelect={() => run(() => dispatchEvent(new Event('open-problems')))} className={item}><ListChecks />{t('problems.title')}</Command.Item>}
            <Command.Item onSelect={() => run(() => setSettings({ advanced: !advanced }))} className={item}><Braces />{advanced ? t('shell.hideAdvanced') : t('shell.advanced')}</Command.Item>
            <Command.Item onSelect={() => run(() => navigate('/help'))} className={item}><HelpCircle />{t('shell.help')}</Command.Item>
            <Command.Item onSelect={() => run(() => navigate('/settings'))} className={item}><Settings />{t('shell.settings')}</Command.Item>
          </Command.Group>
          <Command.Group heading={t('shell.paletteMods')} className={group}>
            {mods.map((b) => (
              <Command.Item key={b.meta.id} value={`mod ${b.meta.title} ${b.meta.id}`} onSelect={() => run(() => navigate(`/mod/${b.meta.id}`))} className={item}>
                <Package />{b.meta.title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>

      <Dialog.Root open={keysOpen} onOpenChange={setKeysOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-void/75" />
          <Dialog.Content className={`${dialogBox} p-5`}>
            <Dialog.Title className="mb-3 text-[17px] font-semibold text-white">{t('shell.shortcuts')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('shell.shortcuts')}</Dialog.Description>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-[14px]">
              {([['Ctrl/⌘ K', 'shell.keyPalette'], ['Ctrl/⌘ Z', 'shell.keyUndo'], ['Ctrl/⌘ Shift Z', 'shell.keyRedo'], ['↑ ↓  j k', 'shell.keyListMove'], ['Home End', 'shell.keyListEnds'], ['Enter', 'shell.keyListOpen'], ['Delete', 'shell.keyListDelete'], ['?', 'shell.keyShortcuts'], ['Esc', 'shell.keyEsc']] as const).map(([k, label]) => (
                <React.Fragment key={k}>
                  <dt><kbd className="rounded-[2px] border border-edge bg-field px-2 py-0.5 font-mono text-[12px] text-cyan">{k}</kbd></dt>
                  <dd className="text-ink">{t(label)}</dd>
                </React.Fragment>
              ))}
            </dl>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

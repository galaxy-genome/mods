import { FileClock, Pencil, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppBar, Page, useShellHeader } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/inputs'
import { ConfirmDialog, Menu } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { Badge, EmptyState, RowGroup, SectionLabel } from '@/components/ui/surfaces'
import { DELETED_KEEP_MS } from '@/data/repository'
import { splitViewId } from '@/lib/mods'
import type { HistoryEntry } from '@/lib/types'
import { addHistory, deleteHistory, renameHistory, restoreDeletedMod, restoreHistory, useEditor } from '@/store/editor'
import { useT } from '@/i18n'

const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** History of one mod, in the mod's shell. */
export function HistoryPage() {
  const { modId: routeId = '' } = useParams()
  const t = useT()
  useShellHeader({ title: t('output.hiTitle'), back: `/mod/${routeId}/overview` }, [routeId])
  return <Page><HistoryList modId={splitViewId(routeId).modId} /></Page>
}

/** History of every mod, deleted mods included, opened from Settings. */
export function AllHistoryPage() {
  const t = useT()
  return (
    <div className="min-h-dvh bg-void">
      <AppBar back="/settings" title={t('output.hiTitle')} />
      <main className="mx-auto flex max-w-[640px] flex-col gap-3 px-4 py-4 pb-12"><HistoryList modId={null} /></main>
    </div>
  )
}

function HistoryList({ modId }: { modId: string | null }) {
  const t = useT()
  const navigate = useNavigate()
  const allHistory = useEditor((s) => s.history)
  const mods = useEditor((s) => s.mods)
  const deletedMods = useEditor((s) => s.deleted)
  const entries = allHistory.filter((h) => (modId ? h.modId === modId : mods.some((m) => m.meta.id === h.modId)))
  const deleted = modId ? [] : deletedMods
  const [naming, setNaming] = React.useState<'new' | HistoryEntry | null>(null)
  const [name, setName] = React.useState('')
  const [restoring, setRestoring] = React.useState<HistoryEntry | null>(null)

  const label = (h: HistoryEntry) => h.name || t('output.hiAuto')
  const save = () => {
    if (naming === 'new' && modId) {
      void addHistory(modId, name.trim() || t('output.hiDefaultName', { n: entries.filter((s) => !s.auto).length + 1 }))
      toast.success(t('output.hiSaved'))
    } else if (naming && naming !== 'new') void renameHistory(naming.id, name.trim() || label(naming))
    setNaming(null)
    setName('')
  }
  const groups = new Map<string, HistoryEntry[]>()
  for (const h of entries) groups.set(day(h.createdAt), [...(groups.get(day(h.createdAt)) ?? []), h])

  return (
    <>
      <p className="text-[13px] leading-relaxed text-ink">{t('output.hiIntro')}</p>
      {modId && <Button variant="primary" onClick={() => setNaming('new')}><Plus className="size-4" />{t('output.hiSave')}</Button>}
      {deleted.length > 0 && (
        <>
          <SectionLabel>{t('output.hiDeletedSection')}</SectionLabel>
          <RowGroup>
            {deleted.map((d) => (
              <div key={d.id} className="flex min-h-14 items-center gap-3 py-2 pl-3 pr-2">
                <Trash2 className="size-5 shrink-0 text-dim" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] text-white">{t('output.hiDeletedRow', { title: d.title })}</span>
                  <span className="font-mono text-[12px] text-dim">{t('output.hiDaysLeft', { count: Math.max(0, Math.ceil((d.deletedAt + DELETED_KEEP_MS - Date.now()) / 86_400_000)) })}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => { void restoreDeletedMod(d.id); toast.success(t('lib.restored', { name: d.title })) }}><Undo2 className="size-4" />{t('output.hiRestore')}</Button>
              </div>
            ))}
          </RowGroup>
        </>
      )}
      {entries.length === 0 ? (
        !deleted.length && <EmptyState icon={<FileClock />} title={t('output.hiEmpty')} body={t('output.hiEmptyBody')} />
      ) : [...groups].map(([date, list]) => (
        <React.Fragment key={date}>
          <SectionLabel>{date}</SectionLabel>
          <RowGroup>
            {list.map((h) => (
              <div key={h.id} className="flex min-h-14 items-center gap-3 py-2 pl-3">
                <FileClock className="size-5 shrink-0 text-cyan" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] text-white">{label(h)}</span>
                  <span className="truncate font-mono text-[12px] text-dim">{[time(h.createdAt), formatBytes(h.bytes), !modId && mods.find((m) => m.meta.id === h.modId)?.meta.title].filter(Boolean).join(' · ')}</span>
                </div>
                {!h.auto && <Badge tone="cyan">{t('output.hiNamed')}</Badge>}
                <Menu
                  label={t('output.hiActions', { name: label(h) })}
                  items={[
                    { label: t('output.hiRestore'), icon: <RotateCcw />, onSelect: () => setRestoring(h) },
                    { label: t('output.hiRename'), icon: <Pencil />, onSelect: () => { setName(h.name); setNaming(h) } },
                    { label: t('output.hiDelete'), icon: <Trash2 />, tone: 'danger', onSelect: () => { void deleteHistory(h.id); toast(t('output.hiDeleted', { name: label(h) })) } },
                  ]}
                />
              </div>
            ))}
          </RowGroup>
        </React.Fragment>
      ))}
      <Sheet
        open={!!naming}
        onOpenChange={(v) => { if (!v) setNaming(null) }}
        title={naming === 'new' ? t('output.hiSave') : t('output.hiRename')}
        footer={<Button variant="primary" className="w-full" onClick={save}>{t('output.hiSaveButton')}</Button>}
      >
        <Field label={t('output.hiName')} help={t('output.hiNameHelp')} htmlFor="history-name">
          <Input id="history-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder={t('output.hiNamePlaceholder')} />
        </Field>
      </Sheet>
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(v) => !v && setRestoring(null)}
        title={t('output.hiRestoreTitle', { name: restoring ? label(restoring) : '' })}
        body={t('output.hiRestoreBody')}
        confirmLabel={t('output.hiRestore')}
        onConfirm={() => { if (restoring) { void restoreHistory(restoring.id); if (!modId) navigate(`/mod/${restoring.modId}`) } }}
      />
    </>
  )
}

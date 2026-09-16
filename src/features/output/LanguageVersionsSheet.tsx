import { Languages, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/overlays'
import { Sheet } from '@/components/ui/sheet'
import { Badge, RowGroup, SectionLabel } from '@/components/ui/surfaces'
import { LANGS } from '@/lib/reference'
import type { Lang, QuestView } from '@/lib/types'
import { updatePart, usePart } from '@/store/editor'
import { blankCopy, progress } from './translation'
import { useT } from '@/i18n'

export function LanguageVersionsSheet({ modId, open, onOpenChange }: { modId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const mod = usePart(modId) as QuestView | undefined
  const navigate = useNavigate()
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<Lang | null>(null)
  if (!mod || mod.meta.type !== 'quest') return null

  const original = mod.versions[mod.primaryLang]!
  const present = LANGS.filter((l) => mod.versions[l.key])
  const missing = LANGS.filter((l) => !mod.versions[l.key])
  const name = (k: Lang) => LANGS.find((l) => l.key === k)?.name ?? k

  const add = (lang: Lang) => {
    updatePart(modId, (m) => { (m as QuestView).versions[lang] = blankCopy(original, lang) })
    setAdding(false)
    toast.success(t('output.langAdded', { name: name(lang) }), { description: t('output.langAddedHint') })
    onOpenChange(false)
    navigate(`/mod/${modId}/translate/${lang}`)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={t('output.langTitle')} description={t('output.langDescription')}>
        <div className="flex flex-col gap-4">
          <SectionLabel>{t('output.langVersions')}</SectionLabel>
          <RowGroup>
            {present.map((l) => {
              const isOriginal = l.key === mod.primaryLang
              const p = isOriginal ? null : progress(original, mod.versions[l.key]!)
              return (
                <div key={l.key} className="flex min-h-14 items-center gap-3 py-2 pl-3 pr-1">
                  <span className="grid h-7 min-w-9 place-items-center rounded-[2px] border border-edge px-1 font-mono text-[12px] text-cyan">{l.label}</span>
                  <button
                    type="button"
                    disabled={isOriginal}
                    onClick={() => { onOpenChange(false); navigate(`/mod/${modId}/translate/${l.key}`) }}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                  >
                    <span className="text-[15px] text-white">{l.name}</span>
                    {p ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
                          <span className="block h-full bg-cyan" style={{ width: `${p.total ? (p.done / p.total) * 100 : 100}%` }} />
                        </span>
                        <span className="font-mono text-[11px] text-dim">{p.done}/{p.total}</span>
                      </span>
                    ) : null}
                  </button>
                  {isOriginal ? (
                    <Badge tone="cyan" className="mr-2">{t('output.langOriginal')}</Badge>
                  ) : (
                    <>
                      <Button variant="text" size="sm" onClick={() => { onOpenChange(false); navigate(`/mod/${modId}/translate/${l.key}`) }}>{t('output.langTranslate')}</Button>
                      <Button variant="ghost" size="icon" aria-label={t('output.langRemove', { name: l.name })} onClick={() => setRemoving(l.key)}><Trash2 className="size-4" /></Button>
                    </>
                  )}
                </div>
              )
            })}
          </RowGroup>

          {missing.length > 0 && (
            adding ? (
              <>
                <SectionLabel>{t('output.langAdd')}</SectionLabel>
                <RowGroup>
                  {missing.map((l) => (
                    <button key={l.key} type="button" onClick={() => add(l.key)} className="flex min-h-12 w-full items-center gap-3 px-3 text-left hover:bg-white/[0.03]">
                      <span className="grid h-7 min-w-9 place-items-center rounded-[2px] border border-edge px-1 font-mono text-[12px] text-ink">{l.label}</span>
                      <span className="flex-1 text-[15px] text-white">{l.name}</span>
                      <Plus className="size-4 text-cyan" />
                    </button>
                  ))}
                </RowGroup>
              </>
            ) : (
              <Button variant="primary" onClick={() => setAdding(true)}><Languages className="size-4" />{t('output.langAdd')}</Button>
            )
          )}
        </div>
      </Sheet>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t('output.langRemoveTitle', { name: removing ? name(removing) : '' })}
        body={t('output.langRemoveBody')}
        confirmLabel={t('output.langRemoveConfirm')}
        tone="destructive"
        onConfirm={() => {
          if (!removing) return
          updatePart(modId, (m) => { delete (m as QuestView).versions[removing] })
          toast(t('output.langRemoved', { name: name(removing) }))
        }}
      />
    </>
  )
}

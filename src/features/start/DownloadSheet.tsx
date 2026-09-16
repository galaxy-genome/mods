import { Archive, Check, ChevronDown, Database, Download, FolderArchive, Star } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Card, SectionLabel, SeverityIcon } from '@/components/ui/surfaces'
import { buildDownload, planDownload } from '@/lib/download'
import { useT } from '@/i18n'
import { LANGS } from '@/lib/reference'
import { downloadFileName } from '@/data/backup'
import type { Lang } from '@/lib/types'
import { cn } from '@/lib/utils'
import { getState, setFavorite, setSettings, useEditor, getRepository } from '@/store/editor'

export const LANG_FLAGS: Record<Lang, string> = { en: '🇬🇧', ru: '🇷🇺', es: '🇪🇸', pt: '🇧🇷', cn: '🇨🇳' }

/**
 * The one download: favorites bundled into a mod folder for the game, plus the whole editor state.
 */
export function DownloadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)
  const mods = useEditor((s) => s.mods)
  const lang = useEditor((s) => s.settings.downloadLang)
  const name = useEditor((s) => s.settings.downloadName)
  const favorites = React.useMemo(() => mods.filter((b) => b.meta.favorite), [mods])
  const [fixesOpen, setFixesOpen] = React.useState(false)
  const [langOpen, setLangOpen] = React.useState(false)
  const plan = React.useMemo(() => planDownload(favorites, lang, parts, mods), [favorites, lang, parts, mods])
  const blocked = plan.issues.some((i) => i.severity === 'error')
  const langCount = (l: Lang) => favorites.reduce((n, b) => n + b.quests.filter((q) => q.versions[l]).length, 0)
  const fileName = downloadFileName(name)
  const langName = LANGS.find((l) => l.key === lang)?.name

  const download = async () => {
    const blob = await buildDownload(plan, getRepository(), getState().settings)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    onOpenChange(false)
    toast.success(t('start.downloaded', { file: fileName }), { description: t('start.downloadedHelp'), action: { label: t('start.howToInstall'), onClick: () => navigate('/install') }, classNames: { toast: '!flex-wrap', content: '!basis-full', actionButton: '!ml-auto' } })
  }

  const questFiles = plan.quests.length
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('start.download')}
      description={t('start.downloadHelp')}
      footer={
        <div className="flex flex-col gap-2">
          {blocked && <p className="text-[12px] text-danger">{t('start.fixErrorToDownload')}</p>}
          <Button variant="solid" size="lg" disabled={blocked} onClick={download}><Download className="size-5" />{t('start.downloadZip')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="download-name" className="text-[13px] font-semibold text-white">{t('start.fileName')}</label>
          <Input id="download-name" value={name} onChange={(e) => setSettings({ downloadName: e.target.value })} placeholder="my-mods" />
          <p className="truncate font-mono text-[12px] text-dim">{fileName}</p>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t('start.whatsInZip')}</SectionLabel>
          <Card className="flex flex-col divide-y divide-edge">
            <div className="flex items-start gap-3 p-3">
              <FolderArchive className="mt-0.5 size-5 shrink-0 text-cyan" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-white">mod/ <span className="font-normal text-ink">{t('start.forYourPhone')}</span></span>
                  <button
                    onClick={() => setLangOpen(!langOpen)}
                    aria-expanded={langOpen}
                    aria-label={t('start.gameLanguageChange', { lang: langName ?? '' })}
                    title={t('start.gameLanguageIs', { lang: langName ?? '' })}
                    className="-my-2 -mr-2 flex h-11 items-center gap-1 px-2 text-[18px] leading-none opacity-80 hover:opacity-100"
                  >
                    {LANG_FLAGS[lang]}<ChevronDown className={cn('size-3.5 text-dim transition-transform', langOpen && 'rotate-180')} />
                  </button>
                </span>
                {langOpen && (
                  <div role="radiogroup" aria-label={t('start.gameLanguage')} className="flex flex-wrap gap-1.5 py-1">
                    {LANGS.map((l) => (
                      <button
                        key={l.key}
                        role="radio"
                        aria-checked={lang === l.key}
                        onClick={() => { setSettings({ downloadLang: l.key }); setLangOpen(false) }}
                        className={cn('flex h-9 items-center gap-1.5 rounded-[2px] border px-2 text-[13px]', lang === l.key ? 'border-cyan bg-cyan/10 text-cyan' : 'border-edge text-ink hover:border-grid-strong')}
                      >
                        <span className="text-[15px]">{LANG_FLAGS[l.key]}</span>{l.name}<span className="font-mono text-[11px] text-dim">{langCount(l.key)}</span>
                      </button>
                    ))}
                    <p className="w-full pt-1 text-[12px] text-ink/70">{t('start.gameLanguageHelp')}</p>
                  </div>
                )}
                {favorites.length === 0 ? (
                  <span className="text-[13px] text-ink/80">{t('start.noFavTapA')}<Star className="inline size-3.5 text-amber" />{t('start.noFavTapB')}</span>
                ) : (
                  <span className="text-[13px] text-ink/80">
                    {questFiles ? t('start.questFilesIn', { count: questFiles, lang: langName ?? '' }) : t('start.noQuestsIn', { lang: langName ?? '' })}
                    {plan.stars.length ? ` · StarsStations.json${plan.stars.length > 1 ? ` ${t('start.mergedFrom', { count: plan.stars.length })}` : ''}` : ''}
                    {plan.textures.length ? ` · ${t('start.textures', { count: new Set(plan.textures.map((x) => x.texture.name)).size })}` : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 p-3">
              <Database className="mt-0.5 size-5 shrink-0 text-cyan" />
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold text-white">state/ <span className="font-normal text-ink">{t('start.everythingHere')}</span></span>
                <span className="text-[13px] text-ink/80">{t('start.stateHelp', { count: mods.length })}</span>
              </div>
            </div>
          </Card>
        </div>

        {plan.issues.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('start.needsALook')}</SectionLabel>
            <ul className="flex flex-col gap-2">
              {plan.issues.map((i, n) => (
                <li key={n} className={cn('flex items-start gap-2.5 rounded-[4px] border p-3 text-[13px] leading-snug text-white', i.severity === 'error' ? 'border-danger/70' : 'border-amber/60')}>
                  <SeverityIcon severity={i.severity} className="mt-px size-4 shrink-0" />
                  <span className="flex-1">{i.message}</span>
                  {i.favorite && (() => {
                    const id = i.favorite
                    const title = mods.find((m) => m.meta.id === id)?.meta.title ?? ''
                    const favorite = () => {
                      setFavorite([id], true)
                      toast(t('lib.favoritedRequired', { mod: title }), { action: { label: t('common.undo'), onClick: () => setFavorite([id], false) } })
                    }
                    return <button onClick={favorite} className="shrink-0 text-left text-cyan hover:text-white">{t('lib.alsoFavorite', { mod: title })}</button>
                  })()}
                  {i.modId && (
                    <button onClick={() => { onOpenChange(false); navigate(`/mod/${i.modId}`) }} className="shrink-0 text-cyan hover:text-white">{t('common.open')}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.fixes.length > 0 && (
          <div className="flex flex-col gap-2">
            <button aria-expanded={fixesOpen} onClick={() => setFixesOpen(!fixesOpen)} className="flex min-h-11 items-center justify-between">
              <span className="section-label">{t('start.fixedAutomatically', { n: plan.fixes.length })}</span>
              <ChevronDown className={cn('size-4 text-dim transition-transform', fixesOpen && 'rotate-180')} />
            </button>
            {fixesOpen && (
              <ul className="flex flex-col gap-2">
                {plan.fixes.map((f, n) => (
                  <li key={n} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink"><Check className="mt-px size-4 shrink-0 text-success" />{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {favorites.length > 0 && plan.issues.length === 0 && (
          <p className="flex items-center gap-2 text-[13px] text-success"><Archive className="size-4" />{t('start.readyNothing')}</p>
        )}
      </div>
    </Sheet>
  )
}

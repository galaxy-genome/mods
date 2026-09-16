import { ChevronRight, Globe2, Landmark, Package, Sparkle, Wand2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/inputs'
import { Card, SectionLabel } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { useT } from '@/i18n'
import { updateMod, useMod } from '@/store/editor'
import { InfoNote, useStarsView } from './common'

export function StarsOverviewPage() {
  const t = useT()
  const { modId, mod } = useStarsView()
  const owner = useMod(modId)
  usePulseField()
  if (!mod || !owner) return null
    const counts = [
    { path: 'stars', label: t('stars.starsCount'), n: mod.stars.length, icon: <Sparkle /> },
    { path: 'planets', label: t('stars.planetsCount'), n: mod.planets.length, icon: <Globe2 /> },
    { path: 'stations', label: t('stars.stationsCount'), n: mod.stations.length, icon: <Landmark /> },
  ]
  const title = owner.meta.title
  const readOnly = owner.meta.origin === 'game'
  return (
    <Page>
      <Field label={t('stars.modName')} htmlFor="mod-title" fieldKey="title" warning={!title.trim() ? t('stars.modNameRequired') : undefined}>
        <Input id="mod-title" value={title} warn={!title.trim()} onChange={(e) => { const v = e.target.value; updateMod(owner.meta.id, (b) => { b.meta.title = v }) }} />
      </Field>

      <section className="flex flex-col gap-2">
        <SectionLabel>{t('stars.inThisMod')}</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {counts.map((c) => (
            <Link key={c.path} to={`/mod/${modId}/${c.path}`} className="block">
              <Card className="flex flex-col gap-1 p-3 transition-colors hover:border-grid-strong">
                <span className="flex items-center justify-between text-cyan [&_svg]:size-4">{c.icon}<ChevronRight className="text-dim" /></span>
                <span className="font-mono text-[24px] text-white">{c.n}</span>
                <span className="text-[12px] text-ink">{c.label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {!readOnly && <Button variant="solid" size="lg" asChild><Link to={`/mod/${modId}/build`}><Wand2 className="size-5" />{t('quickbuild.open')}</Link></Button>}

      <InfoNote>{t('stars.oneFileInfo')}</InfoNote>

      <Link to={`/mod/${owner.meta.id}`} state={{ contents: true }} className="flex min-h-11 items-center gap-2 text-[15px] text-cyan hover:underline">
        <Package className="size-4" />{t('stars.modContents')}<ChevronRight className="size-4" />
      </Link>
    </Page>
  )
}

import { Sparkle } from 'lucide-react'
import * as React from 'react'
import { useOpenMap } from '@/features/map/MapRoute'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Segmented } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Badge, EmptyState, SectionLabel } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { uid } from '@/lib/factory'
import { SECURITY_LEVELS } from '@/lib/reference'
import type { Star } from '@/lib/types'
import { updateStars } from '@/store/editor'
import { t, useT } from '@/i18n'
import { useFieldProblems } from '@/hooks/use-problems'
import { Fab, InfoLine, ItemCard, NumberInput, PickerButton, StarSwatch, StarTypePicker, isGameSystem, removeItem, typeLabel, useStarsView } from './common'

const securityLabel = (s: Star['security']) => t(`stars.sec${s}`)

export function StarsListPage() {
  const t = useT()
  const { modId, itemId, mod, go } = useStarsView()
  usePulseField([itemId])
  if (!mod) return null
  const add = () => {
    const id = uid('star')
    updateStars(modId, (m) => { m.stars.push({ id, name: '', x: 0, y: 0, z: 0, security: 'Anarchy', type: 'M-RedDwarf' }) })
    go(`stars/${id}`)
  }
  const star = mod.stars.find((s) => s.id === itemId)
  return (
    <Page>
      {mod.stars.length === 0 ? (
        <EmptyState icon={<Sparkle />} body={t('stars.starsEmpty')} action={<Button onClick={add}>{t('stars.addAStar')}</Button>} />
      ) : (
        <>
          <SectionLabel>{t('stars.starCount', { count: mod.stars.length })}</SectionLabel>
          <div className="flex flex-col gap-2">
            {mod.stars.map((s) => {
              const planets = mod.planets.filter((p) => p.system === s.name).length
              return (
                <ItemCard
                  key={s.id}
                  navKey={`star:${s.name || s.id}`}
                  onOpen={() => go(`stars/${s.id}`)}
                  onDelete={() => removeItem(modId, 'stars', s.id, s.name)}
                  leading={<StarSwatch type={s.type} />}
                  title={s.name || <span className="text-dim">{t('stars.untitledStar')}</span>}
                  subtitle={`${typeLabel(s.type)} · ${securityLabel(s.security)} · ${s.x}, ${s.y}, ${s.z} · ${t('stars.planetCount', { count: planets })}`}
                  tone={s.name === 'Sagittarius A*' ? 'danger' : undefined}
                  trailing={isGameSystem(s.name) ? <Badge tone="amber">{t('stars.changesGame')}</Badge> : undefined}
                />
              )
            })}
          </div>
          <Fab label={t('stars.addStar')} onClick={add} />
        </>
      )}
      <Sheet
        open={!!star}
        onOpenChange={(o) => !o && go('stars')}
        title={star ? star.name || t('stars.newStar') : ''}
        description={star ? t('stars.starOf', { n: mod.stars.indexOf(star) + 1, total: mod.stars.length }) : undefined}
        footer={<Button className="w-full" onClick={() => go('stars')}>{t('stars.done')}</Button>}
      >
        {star && <StarEditor modId={modId} star={star} />}
      </Sheet>
    </Page>
  )
}

function StarEditor({ modId, star }: { modId: string; star: Star }) {
  const t = useT()
  const [typeOpen, setTypeOpen] = React.useState(false)
  const openMap = useOpenMap()
  // Renaming carries this mod's planets and stations along with the star.
  const set = (patch: Partial<Star>) => updateStars(modId, (m) => {
    const s = m.stars.find((i) => i.id === star.id)!
    if (patch.name !== undefined && s.name) {
      m.planets.forEach((p) => { if (p.system === s.name) p.system = patch.name! })
      m.stations.forEach((st) => { if (st.system === s.name) st.system = patch.name! })
    }
    Object.assign(s, patch)
  })
  const fp = useFieldProblems(modId, `stars/${star.id}`)
  const sgr = star.name.trim() === 'Sagittarius A*'
  const existing = !sgr && isGameSystem(star.name)
  return (
    <div className="flex flex-col gap-5 pt-2">
      <Field label={t('stars.name')} htmlFor="star-name" fieldKey="name" advancedKey="Name"
        error={sgr ? t('stars.sgrLocked') : undefined} warning={!star.name.trim() ? t('stars.starNameRequired') : undefined}
        help={existing ? undefined : t('stars.starNameHelp')}
      >
        <Input id="star-name" value={star.name} invalid={sgr} warn={!star.name.trim()} onChange={(e) => set({ name: e.target.value })} placeholder="Kestrel's Rest" />
        {existing && <InfoLine>{t('stars.gameSystemInfo', { name: star.name })}</InfoLine>}
      </Field>
      <Field label={t('stars.position')} fieldKey="position" advancedKey="X, Y, Z" help={t('stars.positionHelp')}>
        <PickerButton onClick={() => openMap({ mode: 'point', x: star.x, y: star.y, modId, starId: star.id, title: star.name || t('stars.starPosition') }, ({ x, y }) => set({ x, y }))} placeholder={t('stars.pickOnMap')}>X {star.x} · Y {star.y}</PickerButton>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-dim">X<NumberInput aria-label="X" value={star.x} onChange={(x) => set({ x })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-dim">Y<NumberInput aria-label="Y" value={star.y} onChange={(y) => set({ y })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-dim">Z<NumberInput aria-label="Z" value={star.z} onChange={(z) => set({ z })} /></label>
        </div>
      </Field>
      <Field label={t('stars.security')} fieldKey="security" advancedKey="security">
        <div className="-mx-4 overflow-x-auto px-4">
          <Segmented
            ariaLabel={t('stars.security')}
            className="min-w-[560px]"
            value={star.security}
            onChange={(security) => set({ security })}
            options={SECURITY_LEVELS.map((v) => ({ value: v, label: securityLabel(v) }))}
          />
        </div>
      </Field>
      <Field label={t('stars.type')} fieldKey="type" advancedKey="type" warning={fp('type').warning}>
        <PickerButton onClick={() => setTypeOpen(true)} placeholder={t('stars.chooseStarType')} leading={<StarSwatch type={star.type} size={22} />}>{typeLabel(star.type)}</PickerButton>
      </Field>
      <StarTypePicker open={typeOpen} onOpenChange={setTypeOpen} value={star.type} onSelect={(type) => set({ type })} />
    </div>
  )
}

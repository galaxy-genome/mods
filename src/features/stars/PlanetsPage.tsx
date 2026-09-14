import { Globe2 } from 'lucide-react'
import * as React from 'react'
import { GoodsPicker, PlacePicker } from '@/components/pickers'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Chip, Input, Stepper } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState, SectionLabel } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { uid } from '@/lib/factory'
import { humanize } from '@/lib/reference'
import type { Planet, StarsView } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { updateStars } from '@/store/editor'
import { useFieldProblems, useProblems } from '@/hooks/use-problems'
import { useT } from '@/i18n'
import { Fab, InfoLine, InfoNote, ItemCard, NumberInput, PickerButton, PlanetThumb, PlanetTypePicker, removeItem, typeLabel, useStarsView } from './common'

export function PlanetsPage() {
  const t = useT()
  const { modId, itemId, mod, go } = useStarsView()
  usePulseField([itemId])
  const errorPaths = new Set(useProblems(modId).errors.map((x) => x.location.path))
  if (!mod) return null
  const add = () => {
    const id = uid('planet')
    updateStars(modId, (m) => {
      const system = m.stars[0]?.name ?? ''
      const top = Math.max(0, ...m.planets.filter((p) => p.system === system).map((p) => p.orbit))
      m.planets.push({ id, name: '', system, type: 'RockPlanet', orbit: Math.floor(top / 100) * 100 + 100, moons: 0, size: 1, rings: 0, material: null })
    })
    go(`planets/${id}`)
  }
  const planet = mod.planets.find((p) => p.id === itemId)
  const systems = [...new Set(mod.planets.map((p) => p.system))]
  return (
    <Page>
      {mod.planets.length === 0 ? (
        <EmptyState icon={<Globe2 />} body={t('stars.planetsEmpty')} action={<Button onClick={add}>{t('stars.addAPlanet')}</Button>} />
      ) : (
        <>
          {systems.map((sys) => (
            <section key={sys} className="flex flex-col gap-2">
              <SectionLabel>{sys || t('stars.noSystem')}</SectionLabel>
              {mod.planets.filter((p) => p.system === sys).sort((a, b) => a.orbit - b.orbit).map((p) => (
                <ItemCard
                  key={p.id}
                  onOpen={() => go(`planets/${p.id}`)}
                  onDelete={() => removeItem(modId, 'planets', p.id, p.name)}
                  leading={<PlanetThumb type={p.type} />}
                  title={p.name || <span className="text-dim">{t('stars.untitledPlanet')}</span>}
                  subtitle={t('stars.planetSubtitle', { type: typeLabel(p.type), orbit: formatNumber(Math.floor(p.orbit / 100) * 100) }) + (p.moons ? t('stars.moonsSuffix', { count: p.moons }) : '')}
                  tone={errorPaths.has(`planets/${p.id}`) ? 'danger' : undefined}
                />
              ))}
            </section>
          ))}
          <Fab label={t('stars.addPlanet')} onClick={add} />
        </>
      )}
      <Sheet
        open={!!planet}
        onOpenChange={(o) => !o && go('planets')}
        title={planet ? planet.name || t('stars.newPlanet') : ''}
        description={planet ? t('stars.planetOf', { n: mod.planets.indexOf(planet) + 1, total: mod.planets.length }) : undefined}
        footer={<Button className="w-full" onClick={() => go('planets')}>{t('stars.done')}</Button>}
      >
        {planet && <PlanetEditor mod={mod} modId={modId} planet={planet} />}
      </Sheet>
    </Page>
  )
}

function PlanetEditor({ mod, modId, planet }: { mod: StarsView; modId: string; planet: Planet }) {
  const t = useT()
  const fp = useFieldProblems(modId, `planets/${planet.id}`)
  const [sysOpen, setSysOpen] = React.useState(false)
  const [typeOpen, setTypeOpen] = React.useState(false)
  const [goodsOpen, setGoodsOpen] = React.useState(false)
  const set = (patch: Partial<Planet>) => updateStars(modId, (m) => { Object.assign(m.planets.find((p) => p.id === planet.id)!, patch) })
  const rounded = Math.floor(planet.orbit / 100) * 100
  return (
    <div className="flex flex-col gap-5 pt-2">
      <Field label={t('stars.name')} htmlFor="planet-name" fieldKey="name" advancedKey="Name" warning={fp('name').warning}>
        <Input id="planet-name" value={planet.name} warn={fp('name').warn} onChange={(e) => set({ name: e.target.value })} placeholder="Kepler b" />
      </Field>
      <Field label={t('stars.system')} fieldKey="system" advancedKey="system" error={fp('system').error}>
        {mod.stars.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {mod.stars.filter((s) => s.name).map((s) => (
              <Chip key={s.id} selected={planet.system === s.name} onClick={() => set({ system: s.name })}>{s.name}</Chip>
            ))}
          </div>
        )}
        <PickerButton onClick={() => setSysOpen(true)} invalid={fp('system').invalid} placeholder={t('stars.chooseSystemPlaceholder')}>{planet.system}</PickerButton>
      </Field>
      <Field label={t('stars.type')} fieldKey="type" advancedKey="type" error={fp('type').error}>
        <PickerButton onClick={() => setTypeOpen(true)} invalid={fp('type').invalid} placeholder={t('stars.choosePlanetType')} leading={<PlanetThumb type={planet.type} size={26} />}>{typeLabel(planet.type)}</PickerButton>
      </Field>
      <Field label={t('stars.orbit')} htmlFor="planet-orbit" fieldKey="orbit" advancedKey="dist"
        error={fp('orbit').error}
        help={t('stars.orbitHelp')}
      >
        <NumberInput id="planet-orbit" value={planet.orbit} invalid={fp('orbit').invalid} onChange={(n) => set({ orbit: Math.max(0, n) })} />
        {rounded !== planet.orbit && <InfoLine>{t('stars.roundedDown', { n: formatNumber(rounded) })}</InfoLine>}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('stars.moons')} htmlFor="planet-moons" fieldKey="moons" advancedKey="sput">
          <Stepper id="planet-moons" value={planet.moons} onChange={(moons) => set({ moons })} max={20} />
        </Field>
        <Field label={t('stars.size')} htmlFor="planet-size" fieldKey="size" advancedKey="size">
          <Stepper id="planet-size" value={planet.size} onChange={(size) => set({ size })} min={1} max={10} />
        </Field>
        <Field label={t('stars.rings')} htmlFor="planet-rings" fieldKey="rings" advancedKey="rings">
          <Stepper id="planet-rings" value={planet.rings} onChange={(rings) => set({ rings })} max={10} />
        </Field>
      </div>
      <Field label={t('stars.material')} fieldKey="material" advancedKey="mater1" help={t('stars.materialHelp')}
        action={planet.material ? <button type="button" className="text-[13px] text-cyan" onClick={() => set({ material: null })}>{t('stars.clear')}</button> : undefined}
      >
        <PickerButton onClick={() => setGoodsOpen(true)} placeholder={t('stars.none')}>{planet.material ? humanize(planet.material) : ''}</PickerButton>
      </Field>
      <InfoNote>{t('stars.planetsDiscovered')}</InfoNote>
      <PlacePicker nested open={sysOpen} onOpenChange={setSysOpen} kind="system" value={planet.system} title={t('stars.system')} onSelect={(system) => set({ system })} />
      <PlanetTypePicker open={typeOpen} onOpenChange={setTypeOpen} value={planet.type} onSelect={(type) => set({ type })} />
      <GoodsPicker nested open={goodsOpen} onOpenChange={setGoodsOpen} value={planet.material ?? ''} title={t('stars.material')} onSelect={(material) => set({ material })} />
    </div>
  )
}

import { Check, Landmark } from 'lucide-react'
import * as React from 'react'
import { PlacePicker } from '@/components/pickers'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState, SectionLabel } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { uid } from '@/lib/factory'
import { STATION_FACTIONS, STATION_TYPES } from '@/lib/reference'
import type { ModStation, StarsView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateStars } from '@/store/editor'
import { useT } from '@/i18n'
import { useFieldProblems, useProblems } from '@/hooks/use-problems'
import { Fab, InfoNote, ItemCard, PickerButton, StationIcon, bodiesOf, removeItem, stationOnPlanet, useStarsView } from './common'

const typeName = (k: string) => STATION_TYPES.find((t) => t.key === k)?.name ?? k
const factionName = (k: string) => STATION_FACTIONS.find((f) => f.key === k)?.name ?? k

export function StationsPage() {
  const t = useT()
  const { modId, itemId, mod, go } = useStarsView()
  usePulseField([itemId])
  const problems = useProblems(modId)
  if (!mod) return null
  const add = () => {
    const id = uid('station')
    updateStars(modId, (m) => {
      const system = m.stars[0]?.name ?? ''
      const planet = bodiesOf(m, system).find((b) => b.kind === 'planet')
      m.stations.push({ id, name: '', system, bodyIndex: planet?.index ?? 1, type: 'OrbitalDark', faction: 'Independent' })
    })
    go(`stations/${id}`)
  }
  const station = mod.stations.find((s) => s.id === itemId)
  const errorPaths = new Set(problems.errors.map((p) => p.location.path))
  return (
    <Page>
      {mod.stations.length === 0 ? (
        <EmptyState icon={<Landmark />} body={t('stars.stationsEmpty')} action={<Button onClick={add}>{t('stars.addAStation')}</Button>} />
      ) : (
        <>
          <SectionLabel>{t('stars.stationCount', { count: mod.stations.length })}</SectionLabel>
          <div className="flex flex-col gap-2">
            {mod.stations.map((st) => {
              const body = stationOnPlanet(mod, st)
              return (
                <ItemCard
                  key={st.id}
                  onOpen={() => go(`stations/${st.id}`)}
                  onDelete={() => removeItem(modId, 'stations', st.id, st.name)}
                  leading={<span className="text-cyan"><StationIcon type={st.type} /></span>}
                  title={st.name || <span className="text-dim">{t('stars.untitledStation')}</span>}
                  subtitle={`${st.system || t('stars.noSystem')} · ${body ? body.name : t('stars.bodyN', { n: st.bodyIndex })} · ${typeName(st.type)} · ${factionName(st.faction)}`}
                  tone={errorPaths.has(`stations/${st.id}`) ? 'danger' : undefined}
                />
              )
            })}
          </div>
          <Fab label={t('stars.addStation')} onClick={add} />
        </>
      )}
      <Sheet
        open={!!station}
        onOpenChange={(o) => !o && go('stations')}
        title={station ? station.name || t('stars.newStation') : ''}
        description={station ? t('stars.stationOf', { n: mod.stations.indexOf(station) + 1, total: mod.stations.length }) : undefined}
        footer={<Button className="w-full" onClick={() => go('stations')}>{t('stars.done')}</Button>}
      >
        {station && <StationEditor mod={mod} modId={modId} station={station} />}
      </Sheet>
    </Page>
  )
}

function StationEditor({ mod, modId, station }: { mod: StarsView; modId: string; station: ModStation }) {
  const t = useT()
  const [sysOpen, setSysOpen] = React.useState(false)
  const [orbitsOpen, setOrbitsOpen] = React.useState(false)
  const set = (patch: Partial<ModStation>) => updateStars(modId, (m) => { Object.assign(m.stations.find((s) => s.id === station.id)!, patch) })
  const bodies = bodiesOf(mod, station.system)
  const body = bodies[station.bodyIndex - 1]
  const fp = useFieldProblems(modId, `stations/${station.id}`)
  return (
    <div className="flex flex-col gap-5 pt-2">
      <Field label={t('stars.name')} htmlFor="station-name" fieldKey="name" advancedKey="Name" error={fp('name').error} warning={fp('name').warning}>
        <Input id="station-name" value={station.name} invalid={fp('name').invalid} warn={fp('name').warn} onChange={(e) => set({ name: e.target.value })} placeholder="Harvest Ring" />
      </Field>
      <Field label={t('stars.system')} fieldKey="system" advancedKey="StarSystem" error={fp('system').error}>
        <PickerButton onClick={() => setSysOpen(true)} invalid={fp('system').invalid} placeholder={t('stars.chooseSystemPlaceholder')}>{station.system}</PickerButton>
      </Field>
      <Field label={t('stars.orbits')} fieldKey="bodyIndex" advancedKey="PlanetID" error={fp('bodyIndex').error} help={t('stars.orbitsHelp')}>
        <PickerButton onClick={() => setOrbitsOpen(true)} invalid={fp('bodyIndex').invalid} placeholder={station.system ? t('stars.choosePlanet') : t('stars.chooseSystemFirst')}>
          {body ? `${body.index} · ${body.name} (${t(body.kind === 'star' ? 'stars.kindStar' : body.kind === 'planet' ? 'stars.kindPlanet' : 'stars.kindOther')})` : ''}
        </PickerButton>
      </Field>
      <Field label={t('stars.type')} fieldKey="type" advancedKey="type">
        <div role="radiogroup" aria-label={t('stars.stationType')} className="grid grid-cols-3 gap-2">
          {STATION_TYPES.map((st) => {
            const on = station.type === st.key
            return (
              <button key={st.key} type="button" role="radio" aria-checked={on} onClick={() => set({ type: st.key })}
                className={cn('flex min-h-20 flex-col items-center justify-center gap-1 rounded-[4px] border bg-panel p-2 text-[12px] transition-colors hover:border-grid-strong', on ? 'border-cyan bg-cyan/10 text-cyan' : 'border-edge text-ink')}
              >
                <StationIcon type={st.key} size={32} />
                {st.name}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label={t('stars.faction')} fieldKey="faction" advancedKey="Faction">
        <div role="radiogroup" aria-label={t('stars.faction')} className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
          {STATION_FACTIONS.map((f) => {
            const on = station.faction === f.key
            return (
              <button key={f.key} type="button" role="radio" aria-checked={on} onClick={() => set({ faction: f.key })}
                className={cn('flex min-h-12 items-center gap-3 px-3 text-left text-[15px] hover:bg-white/[0.03]', on ? 'bg-cyan/10 text-cyan' : 'text-white')}
              >
                <span className="flex-1">{f.name}</span>
                {on && <Check className="size-4" />}
              </button>
            )
          })}
        </div>
      </Field>
      <InfoNote>{t('stars.stationSkipped')}</InfoNote>
      <PlacePicker nested open={sysOpen} onOpenChange={setSysOpen} kind="system" value={station.system} title={t('stars.system')}
        onSelect={(system) => set({ system, bodyIndex: bodiesOf(mod, system).find((b) => b.kind === 'planet')?.index ?? 1 })}
      />
      <Sheet nested open={orbitsOpen} onOpenChange={setOrbitsOpen} title={t('stars.orbits')} description={station.system}>
        {bodies.length === 0 ? (
          <p className="py-6 text-[14px] text-dim">{t('stars.noBodies')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-edge overflow-hidden rounded-[4px] border border-edge bg-panel">
            {bodies.map((b) => {
              const on = b.index === station.bodyIndex
              const disabled = b.kind !== 'planet'
              return (
                <button key={b.index} type="button" data-opt disabled={disabled} aria-pressed={on} onClick={() => { set({ bodyIndex: b.index }); setOrbitsOpen(false) }}
                  className={cn('flex min-h-12 items-center gap-3 px-3 text-left', disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/[0.03]', on && 'bg-cyan/10')}
                >
                  <span className="w-6 font-mono text-[13px] text-dim">{b.index}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('truncate text-[15px]', on ? 'text-cyan' : 'text-white')}>{b.name}</span>
                    <span className="text-[12px] text-dim">{b.kind === 'star' ? t('stars.bodyStar') : b.kind === 'planet' ? t('stars.bodyPlanet') : t('stars.bodyOther')}</span>
                  </span>
                  {on && <Check className="size-4 text-cyan" />}
                </button>
              )
            })}
          </div>
        )}
      </Sheet>
    </div>
  )
}

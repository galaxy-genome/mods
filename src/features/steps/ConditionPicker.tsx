import {
  ArrowLeft, ChevronRight, Compass, Crosshair, Globe, Home, Landmark, Pickaxe, Rocket, Smartphone, Timer, Zap,
} from 'lucide-react'
import * as React from 'react'
import { PlaceContextView, useStationLabel } from '@/features/map/PlaceContext'
import { GoodsPicker, PlacePicker } from '@/components/pickers'
import { useOpenMap } from '@/features/map/MapRoute'
import { useRecent } from '@/components/pickers/common'
import { Button } from '@/components/ui/button'
import { AdvancedKey, Field } from '@/components/ui/field'
import { Chip, Input, SearchInput, Segmented, Stepper } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { ListRow, RowGroup, SectionLabel, SentenceCard } from '@/components/ui/surfaces'
import { CATEGORY_INFO, CONDITIONS, MATERIALS, NEVER, buildCondition, categoryLabel, describeCondition, parseCondition, type ConditionCategory, type ConditionDef } from '@/lib/conditions'
import { t, useT } from '@/i18n'
import { BEHAVIOURS, GOODS, PLANET_TYPES, STAR_TYPE_GROUPS, SYSTEMS, humanize, shipByKey } from '@/lib/reference'
import type { Step } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface ConditionPickerProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** "Finishes when…" or "Fails when…" */
  title: string
  value: string | null
  onSelect: (action: string) => void
  /** The step being edited and the quest's steps, for suggestions and pilot lists. */
  step: Step
  steps: Step[]
  nested?: boolean
}

const ICONS: Record<string, React.ReactNode> = {
  compass: <Compass />, landmark: <Landmark />, globe: <Globe />, rocket: <Rocket />, crosshair: <Crosshair />,
  pickaxe: <Pickaxe />, timer: <Timer />, home: <Home />, smartphone: <Smartphone />, zap: <Zap />,
}

type Level =
  | { kind: 'root' }
  | { kind: 'category'; category: ConditionCategory }
  | { kind: 'param'; def: ConditionDef; from: Level }

export function ConditionPicker({ open, onOpenChange, title, value, onSelect, step, steps, nested }: ConditionPickerProps) {
  const t = useT()
  const [level, setLevel] = React.useState<Level>({ kind: 'root' })
  const [query, setQuery] = React.useState('')
  const [param, setParam] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setLevel({ kind: 'root' })
    setQuery('')
  }, [open, value])

  const stepIndex = steps.findIndex((s) => s.id === step.id)
  const pilots = React.useMemo(
    () => [...new Set(steps.slice(0, stepIndex + 1).flatMap((s) => s.ships.map((sh) => sh.pilot)).filter(Boolean))],
    [steps, stepIndex],
  )

  const suggestions = React.useMemo(() => {
    const out: { label: string; action: string }[] = []
    if (step.dialogue.length) out.push({ label: t('steps.suggestDialogue'), action: 'ACTION_DIALOG_COMPLETE' })
    const hostile = step.ships.filter((sh) => BEHAVIOURS.find((b) => b.key === sh.behaviour)?.hostile || shipByKey(sh.model)?.alwaysHostile)
    if (hostile.length) {
      out.push({ label: t('steps.suggestNoEnemy'), action: 'NO_ENEMY' })
      hostile.forEach((sh) => { if (sh.pilot) out.push({ label: t('steps.suggestDestroyed', { pilot: sh.pilot }), action: `ACTION_SHIP_DESTROYED_${sh.pilot}` }) })
    }
    if (step.mission) out.push({ label: t('steps.suggestReward'), action: 'GET_STORY_REWARD' })
    return out
  }, [step, t])

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return CONDITIONS.filter((c) => `${c.label} ${c.keywords ?? ''} ${c.action}`.toLowerCase().includes(q))
  }, [query])

  const choose = (def: ConditionDef) => {
    if (def.param === 'none') { onSelect(def.action); onOpenChange(false); return }
    const current = value ? parseCondition(value) : null
    setParam(current?.def?.action === def.action ? current.param : def.param === 'seismic' ? '100' : def.param === 'seconds' ? '10' : def.param === 'distance' ? '1000' : '')
    setLevel({ kind: 'param', def, from: level })
  }

  const back = level.kind === 'param' ? level.from : { kind: 'root' as const }
  const heading = level.kind === 'category' ? categoryLabel(level.category) : level.kind === 'param' ? level.def.label : title

  const row = (def: ConditionDef) => (
    <ListRow nav={`pick:${def.action}`} key={def.action} title={def.label} subtitle={<AdvancedKey k={def.action.endsWith('_') ? `${def.action}…` : def.action} />} onClick={() => choose(def)}
      className={cn(value && parseCondition(value).def?.action === def.action && 'bg-cyan/10')} />
  )

  let body: React.ReactNode
  let footer: React.ReactNode
  if (level.kind === 'root') {
    body = (
      <div className="flex flex-col gap-4 pt-1">
        <SearchInput value={query} onChange={setQuery} placeholder={t('steps.searchConditions')} />
        {query ? (
          results.length ? <RowGroup>{results.map(row)}</RowGroup> : <p className="py-6 text-center text-[14px] text-ink">{t('steps.nothingMatches', { query })}</p>
        ) : (
          <>
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>{t('steps.suggested')}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Chip key={s.action} selected={value === s.action} onClick={() => { onSelect(s.action); onOpenChange(false) }}>{s.label}</Chip>
                  ))}
                </div>
              </div>
            )}
            <RowGroup>
              {CATEGORY_INFO.map((c) => (
                <ListRow nav={`pick:${c.name}`} key={c.name} icon={ICONS[c.icon]} title={c.label} subtitle={c.hint}
                  value={CONDITIONS.filter((x) => x.category === c.name).length}
                  onClick={() => setLevel({ kind: 'category', category: c.name })} />
              ))}
              <ListRow nav={`pick:${NEVER}`} icon={<span aria-hidden>💥</span>} title={t('conditions.neverLabel')} subtitle={<AdvancedKey k={NEVER} />}
                className={cn(value === NEVER && 'bg-cyan/10')} onClick={() => { onSelect(NEVER); onOpenChange(false) }} />
            </RowGroup>
          </>
        )}
      </div>
    )
  } else if (level.kind === 'category') {
    body = <RowGroup className="mt-1">{CONDITIONS.filter((c) => c.category === level.category).map(row)}</RowGroup>
  } else {
    const built = buildCondition(level.def, param)
    body = (
      <div className="flex flex-col gap-5 pt-1">
        <ParamControl def={level.def} value={param} onChange={setParam} pilots={pilots} />
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('steps.preview')}</SectionLabel>
          <SentenceCard icon={<ChevronRight className="text-cyan" />} tone="cyan">
            {title.replace('…', '')} {param ? lowerFirst(describeCondition(built)) : '…'}
          </SentenceCard>
        </div>
      </div>
    )
    footer = <Button variant="solid" className="w-full" disabled={!param.trim()} onClick={() => { onSelect(built); onOpenChange(false) }}>{t('steps.useThis')}</Button>
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      nested={nested}
      full
      title={heading}
      footer={footer}
      headerAction={level.kind !== 'root' && (
        <button aria-label={t('common.back')} onClick={() => setLevel(back)} className="order-first -ml-3 grid size-11 shrink-0 place-items-center text-ink hover:text-white">
          <ArrowLeft className="size-5" />
        </button>
      )}
    >
      {body}
    </Sheet>
  )
}

/** Named nebulae from the game's NebulaDB.json; the galaxy also has unnamed generated ones (A<n>B<m>). */
const NEBULAE = ['Pleiades', 'Hind', 'Witch Head', 'Eskimo', 'LBN 623', 'Helix', 'CrA', 'Pencil', 'California', 'Horsehead', 'Orion', 'Flame', 'Barnards Loop', 'IC 6404', 'Messier 78', 'Eagle']

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const NEAR_SOL = [...SYSTEMS]
  .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  .slice(0, 6)
  .map((s) => s.name)

function RecentSystems({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [recent] = useRecent('place-system')
  return recent.length > 0 && <QuickPicks label={t('steps.recent')} items={recent} value={value} onPick={onPick} />
}

function QuickPicks({ label, items, value, onPick }: { label: string; items: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-2">{items.map((n) => <Chip key={n} selected={value === n} onClick={() => onPick(n)}>{n}</Chip>)}</div>
    </div>
  )
}

function ParamControl({ def, value, onChange, pilots }: { def: ConditionDef; value: string; onChange: (v: string) => void; pilots: string[] }) {
  const stationLabel = useStationLabel()
  const [picker, setPicker] = React.useState<null | 'system' | 'station' | 'planet' | 'goods'>(null)
  const [system, setSystem] = React.useState('')
  const [placeKind, setPlaceKind] = React.useState<'station' | 'planet'>('station')
  const openMap = useOpenMap()

  const pickButton = (label: string, current: string, kind: NonNullable<typeof picker>) => (
    <button type="button" onClick={() => setPicker(kind)} className="flex h-12 items-center gap-3 rounded-[2px] border border-edge bg-field px-3 text-left hover:border-cyan">
      <span className={cn('flex-1 truncate text-[15px]', current ? 'font-mono text-white' : 'text-dim')}>{current || label}</span>
      <ChevronRight className="size-4 text-dim" />
    </button>
  )
  const typed = (id: string, placeholder: string, v = value, set = onChange) => (
    <Input id={id} value={v} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
  )
  const pilotChips = (current: string, set: (v: string) => void) => pilots.length > 0 && (
    <div className="flex flex-wrap gap-2">{pilots.map((p) => <Chip key={p} selected={current === p} onClick={() => set(p)}>{p}</Chip>)}</div>
  )

  switch (def.param) {
    case 'system':
      return (
        <Field label={t('steps.system')} help={t('steps.systemHelp')}>
          {pickButton(t('steps.chooseSystem'), value, 'system')}
          <PlaceContextView kind="system" name={value} />
          <Button variant="secondary" size="sm" className="self-start" onClick={() => openMap({ mode: 'pick', system: value, generated: true }, ({ name }) => onChange(name))}>{t('map.pickOnMap')}</Button>
          {/* Remounts when the system picker closes, so a pick made there shows at once. */}
          <RecentSystems key={String(picker)} value={value} onPick={onChange} />
          <QuickPicks label={t('steps.nearSol')} items={NEAR_SOL} value={value} onPick={onChange} />
          <PlacePicker nested kind="system" generated open={picker === 'system'} onOpenChange={(v) => setPicker(v ? 'system' : null)} value={value} onSelect={(n) => { onChange(n); setPicker(null) }} />
        </Field>
      )
    case 'station': {
      const docking = def.action === 'ACTION_CLICK_STATION_'
      return (
        <Field label={t('steps.station')} help={t('steps.stationHelp')}>
          {docking && <Chip selected={value === 'OWN'} onClick={() => onChange('OWN')} className="self-start">{t('steps.ownStation')}</Chip>}
          {pickButton(t('steps.chooseStation'), value === 'OWN' ? t('steps.ownStation') : value && stationLabel(value), 'station')}
          {value !== 'OWN' && <PlaceContextView kind="station" name={value} />}
          <PlacePicker nested kind="station" allowOwnStation={docking} open={picker === 'station'} onOpenChange={(v) => setPicker(v ? 'station' : null)} value={value} onSelect={(n) => { onChange(n); setPicker(null) }} />
        </Field>
      )
    }
    case 'planet':
      return (
        <>
          <Field label={t('steps.inSystem')} help={t('steps.inSystemHelp')}>
            {pickButton(t('steps.chooseSystem'), system, 'system')}
            <PlaceContextView kind="system" name={system} />
            <PlacePicker nested kind="system" open={picker === 'system'} onOpenChange={(v) => setPicker(v ? 'system' : null)} value={system} onSelect={(n) => { setSystem(n); setPicker(null) }} />
          </Field>
          <Field label={t('steps.planet')} help={t('steps.planetHelp')}>
            {pickButton(t('steps.choosePlanet'), value, 'planet')}
            <PlacePicker nested kind="planet" system={system || undefined} open={picker === 'planet'} onOpenChange={(v) => setPicker(v ? 'planet' : null)} value={value} onSelect={(n) => { onChange(n); setPicker(null) }} />
          </Field>
        </>
      )
    case 'pilot':
      return (
        <Field label={t('steps.pilot')} help={pilots.length ? t('steps.pilotHelp') : t('steps.pilotHelpNone')}>
          {pilotChips(value, onChange)}
          {typed('param-pilot', 'Olivia')}
        </Field>
      )
    case 'shipStop': {
      const [pilot = '', place = ''] = value.split('_at_')
      const set = (p: string, pl: string) => onChange(p || pl ? `${p}_at_${pl}` : '')
      return (
        <>
          <Field label={t('steps.pilot')} help={t('steps.pilotStops')}>
            {pilotChips(pilot, (p) => set(p, place))}
            {typed('param-stop-pilot', 'Olivia', pilot, (p) => set(p, place))}
          </Field>
          <Field label={t('steps.place')} help={t('steps.placeHelp')}>
            <Chip selected={place === 'player'} onClick={() => set(pilot, 'player')} className="self-start">{t('steps.thePlayer')}</Chip>
            {pickButton(t('steps.chooseStation'), place !== 'player' && placeKind === 'station' ? stationLabel(place) : '', 'station')}
            {place !== 'player' && placeKind === 'station' && <PlaceContextView kind="station" name={place} />}
            {pickButton(t('steps.choosePlanet'), place !== 'player' && placeKind === 'planet' ? place : '', 'planet')}
            <PlacePicker nested kind="station" open={picker === 'station'} onOpenChange={(v) => setPicker(v ? 'station' : null)} value={place} onSelect={(n) => { set(pilot, n); setPlaceKind('station'); setPicker(null) }} />
            <PlacePicker nested kind="planet" open={picker === 'planet'} onOpenChange={(v) => setPicker(v ? 'planet' : null)} value={place} onSelect={(n) => { set(pilot, n); setPlaceKind('planet'); setPicker(null) }} />
          </Field>
        </>
      )
    }
    case 'planetType':
      return (
        <div className="flex flex-col gap-3">
          {[{ name: t('steps.planets'), items: PLANET_TYPES }, ...STAR_TYPE_GROUPS].map((g) => (
            <div key={g.name} className="flex flex-col gap-2">
              <SectionLabel>{g.name}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {g.items.map((t) => <Chip key={t} selected={value === t} onClick={() => onChange(t)}>{humanize(t)}</Chip>)}
              </div>
            </div>
          ))}
        </div>
      )
    case 'seconds':
    case 'distance':
      return (
        <Field label={def.param === 'seconds' ? t('steps.seconds') : t('steps.distance')} help={def.param === 'seconds' ? t('steps.secondsHelp') : t('steps.distanceHelp')}>
          {/* The game reports distance in steps of 200. */}
          <Stepper value={Number(value) || 0} min={def.param === 'seconds' ? 1 : 200} step={def.param === 'seconds' ? 5 : 200} unit={def.param === 'seconds' ? 's' : 'ls'} onChange={(v) => onChange(String(v))} />
        </Field>
      )
    case 'seismic':
      return (
        <Field label={t('steps.chargeLevel')}>
          <Segmented ariaLabel={t('steps.chargeLevel')} value={value || '100'} onChange={onChange} options={['0', '33', '66', '100'].map((v) => ({ value: v, label: `${v}%` }))} />
        </Field>
      )
    case 'nebula':
      return (
        <Field label={t('steps.nebula')}>
          <div className="flex flex-wrap gap-2">{NEBULAE.map((n) => <Chip key={n} selected={value === n} onClick={() => onChange(n)}>{n}</Chip>)}</div>
        </Field>
      )
    case 'material':
    case 'cargo':
      return (
        <Field label={def.param === 'cargo' ? t('steps.cargo') : def.action === 'ACTION_MATERIAL_BELT_' ? t('steps.ore') : t('steps.material')}>
          {def.param === 'cargo' && (
            <>
              {pickButton(t('steps.chooseCargo'), GOODS.includes(value) ? humanize(value) : '', 'goods')}
              <GoodsPicker nested open={picker === 'goods'} onOpenChange={(v) => setPicker(v ? 'goods' : null)} value={value} onSelect={(g) => { onChange(g); setPicker(null) }} />
            </>
          )}
          <div className="flex flex-wrap gap-2">{MATERIALS.map((m) => <Chip key={m} selected={value === m} onClick={() => onChange(m)}>{humanize(m)}</Chip>)}</div>
        </Field>
      )
  }
}

import {
  Bug, ChevronDown, Coins, Crosshair, Info, LifeBuoy, Mail, Megaphone, Package, Pickaxe, Search, Skull, Store, Swords, Trash2, Truck, Users,
} from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '@/components/layout/shell'
import { PlaceContextView, useStationLabel } from '@/features/map/PlaceContext'
import { GoodsPicker, PlacePicker, ShipPicker } from '@/components/pickers'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Segmented, Slider, Stepper, SwitchRow } from '@/components/ui/inputs'
import { Card, EmptyState, Em, Section } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { newMission } from '@/lib/factory'
import { MISSION_TYPES, REPUTATION_LEVELS, humanize, shipByInternal } from '@/lib/reference'
import { MISSION_CREDIT_CAP, MISSION_REP_CAP } from '@/lib/rules'
import type { StationMission } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { useFieldProblems } from '@/hooks/use-problems'
import { NumberInput, PickerButton, ShipArt, StepMissing, rich, undoToast, useStepHeader, useStepRoute } from './common'

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PirateHunt: <Crosshair />, FindGoods: <Search />, TransferGoods: <Truck />, Mining: <Pickaxe />, Courier: <Mail />, Tourist: <Users />,
  MoneyHelp: <Coins />, BugHunt: <Bug />, RescueMission: <LifeBuoy />, CaravanHunt: <Swords />, ContractMurder: <Skull />, Intimidate: <Megaphone />,
}

/** Mission board titles from the game's own text (lang_en.json *Description). Game data, not UI strings. */
const GAME_TITLES: Record<string, string> = {
  PirateHunt: 'Take down pirate', FindGoods: 'Station needs', TransferGoods: 'Deliver', Mining: 'Mining rush', Courier: 'Courier job', Tourist: 'Transport',
}

const fmt = (n: number) => n.toLocaleString('en-US')

type PickerKind = 'home' | 'system' | 'station' | 'ship' | 'goods' | null

export function MissionPage() {
  const t = useT()
  const stationLabel = useStationLabel()
  const r = useStepRoute()
  const [picker, setPicker] = React.useState<PickerKind>(null)
  const [typesOpen, setTypesOpen] = React.useState(false)
  useStepHeader(t('ships.missionTitle'), r)
  usePulseField([!!r.step?.mission])
  // Problems links into a collapsed section open it before the pulse looks for the field.
  const [params] = useSearchParams()
  const field = params.get('field')
  const [opened, setOpened] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (field) setOpened(field)
    // A "Choose a system" fix links here with ?pick=1 to open that field's picker.
    const kind = ({ homeStation: 'home', targetSystem: 'system', targetStation: 'station' } as Record<string, PickerKind>)[field ?? '']
    if (params.get('pick') && kind) setPicker(kind)
  }, [field]) // eslint-disable-line react-hooks/exhaustive-deps
  const fp = useFieldProblems(r.modId, `steps/${r.stepId}/mission`)
  if (!r.step) return <StepMissing />
  const m = r.step.mission
  const set = (recipe: (m: StationMission) => void) => r.update((s) => { if (s.mission) recipe(s.mission) })

  if (!m) {
    return (
      <Page>
        <EmptyState
          icon={<Store />}
          title={t('ships.missionEmptyTitle')}
          body={t('ships.missionEmptyBody')}
          action={<Button onClick={() => { r.update((s) => { s.mission = newMission() }); setTypesOpen(true) }}>{t('ships.missionAdd')}</Button>}
        />
      </Page>
    )
  }

  const type = MISSION_TYPES.find((x) => x.key === m.type)
  const typeName = type ? t(`ships.type_${type.key}`) : m.type
  const ship = shipByInternal(m.targetShipType)
  const creditsOver = m.credits > MISSION_CREDIT_CAP
  const repOver = m.reputation > MISSION_REP_CAP
  const remove = () => { undoToast(r.modId, t('ships.missionRemoved'), () => r.update((s) => { s.mission = null })) }

  return (
    <Page className="gap-4">
      <Card tone="cyan" className="flex items-center gap-3 p-3">
        <span className="grid size-10 shrink-0 place-items-center text-cyan [&_svg]:size-6">{TYPE_ICONS[m.type] ?? <Store />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-white">{rich(t('ships.missionAt'), { type: <Em>{typeName}</Em>, station: m.homeStation || t('ships.noStation') })}</p>
          <p className="font-mono text-[12px] text-ink">{m.targetSystem || t('ships.noTargetSystem')} · <span className={creditsOver ? 'text-amber' : 'text-cyan'}>{t('ships.credits', { amount: fmt(m.credits) })}</span></p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Section key={`mission-${m.type}`} title={t('ships.sectionMission')} summary={type && typeName} defaultOpen>
          <Field label={t('ships.type')} advancedKey="Type" fieldKey="type" error={fp('type').error} warning={fp('type').warning}>
            <button type="button" aria-expanded={typesOpen} onClick={() => setTypesOpen(!typesOpen)}
              className="flex min-h-12 items-center gap-3 rounded-[2px] border border-edge bg-field px-3 text-left hover:border-cyan">
              <span className="text-cyan [&_svg]:size-5">{TYPE_ICONS[m.type]}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] text-white">{typeName}</span>
                <span className="truncate text-[12px] text-dim">{type && t(`ships.typeDesc_${type.key}`)}</span>
              </span>
              <ChevronDown className={cn('size-4 text-dim transition-transform', typesOpen && 'rotate-180')} />
            </button>
            {typesOpen && (
              <div role="radiogroup" aria-label={t('ships.missionType')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MISSION_TYPES.map((mt) => (
                  <button key={mt.key} type="button" role="radio" aria-checked={mt.key === m.type}
                    onClick={() => { set((x) => { x.type = mt.key }); setTypesOpen(false) }}
                    className={cn('flex min-h-[88px] flex-col gap-1 rounded-[4px] border p-2.5 text-left transition-colors',
                      mt.key === m.type ? 'border-cyan bg-cyan/10' : 'border-edge bg-panel hover:border-grid-strong')}>
                    <span className={cn('[&_svg]:size-5', mt.key === m.type ? 'text-cyan' : 'text-ink')}>{TYPE_ICONS[mt.key]}</span>
                    <span className="text-[14px] font-semibold text-white">{t(`ships.type_${mt.key}`)}</span>
                    <span className="text-[12px] leading-snug text-dim">{t(`ships.typeDesc_${mt.key}`)}</span>
                    {GAME_TITLES[mt.key] && <span className="text-[11px] leading-snug text-dim/80">{t('ships.inGameAs', { title: GAME_TITLES[mt.key] })}</span>}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label={t('ships.offeredAt')} advancedKey="HomeStation" fieldKey="homeStation" help={t('ships.offeredAtHelp')}
            error={fp('homeStation').error}>
            <PickerButton icon={<Store />} placeholder={t('ships.chooseStation')} invalid={fp('homeStation').invalid} onClick={() => setPicker('home')}>{m.homeStation && stationLabel(m.homeStation)}</PickerButton>
            <PlaceContextView kind="station" name={m.homeStation} />
          </Field>
          <SwitchRow fieldKey="story" label={t('ships.story')} help={t('ships.storyHelp')} checked={m.story} onCheckedChange={(v) => set((x) => { x.story = v })} />
          <Field label={t('ships.repNeeded')} advancedKey="Level">
            <Segmented ariaLabel={t('ships.repNeeded')} size="sm" value={m.level} onChange={(v) => set((x) => { x.level = v })}
              options={REPUTATION_LEVELS.map((l) => ({ value: l, label: l }))} />
          </Field>
        </Section>

        <Section key={`target-${m.type}`} title={t('ships.sectionTarget')} summary={[m.targetSystem, m.targetStation].filter(Boolean).join(' · ') || t('ships.none')} defaultOpen={type?.focus === 'target'}>
          <Field label={t('ships.system')} advancedKey="TargetSystem" fieldKey="targetSystem" error={fp('targetSystem').error}>
            <PickerButton invalid={fp('targetSystem').invalid} placeholder={t('ships.chooseSystem')} onClick={() => setPicker('system')}>{m.targetSystem}</PickerButton>
            <PlaceContextView kind="system" name={m.targetSystem} />
          </Field>
          <Field label={t('ships.station')} advancedKey="TargetStation"
            help={t('ships.targetStationHelp')}>
            <PickerButton icon={<Store />} placeholder={t('ships.chooseStation')} onClick={() => setPicker('station')}>{m.targetStation && stationLabel(m.targetStation)}</PickerButton>
            <PlaceContextView kind="station" name={m.targetStation} />
            {m.targetStation && m.targetStation === m.homeStation && (
              <p className="flex items-start gap-1.5 text-[12px] text-cyan"><Info className="mt-px size-3.5 shrink-0" />{t('ships.sameStation')}</p>
            )}
          </Field>
        </Section>

        <Section key={`ship-${m.type}-${opened === 'targetShipType'}`} title={t('ships.sectionShip')} summary={[ship?.name ?? m.targetShipType, m.targetShipName].filter(Boolean).join(' · ')} defaultOpen={type?.focus === 'ship' || opened === 'targetShipType'}>
          <Field label={t('ships.ship')} advancedKey="TargetShipType" fieldKey="targetShipType" warning={m.targetShipType && !ship ? t('ships.unknownShip') : undefined}>
            <PickerButton icon={<ShipArt model={ship?.key ?? 'ion'} />} placeholder={t('ships.chooseShip')} warn={!!m.targetShipType && !ship} onClick={() => setPicker('ship')}>
              {ship?.name ?? m.targetShipType}
            </PickerButton>
          </Field>
          <Field label={t('ships.pilot')} advancedKey="TargetShipName" htmlFor="mission-pilot" help={rich(t('ships.pilotHelp'), { condition: <i>{t('ships.shipDestroyed')}</i> })}>
            <Input id="mission-pilot" value={m.targetShipName} onChange={(e) => set((x) => { x.targetShipName = e.target.value })} />
          </Field>
          <Field label={t('ships.hull')} advancedKey="TargetShipHull" action={<span className="font-mono text-[13px] text-cyan">{Math.round(m.targetShipHull * 100)}%</span>}>
            <Slider ariaLabel={t('ships.hull')} min={0} max={100} value={[Math.round(m.targetShipHull * 100)]} onChange={([v]) => set((x) => { x.targetShipHull = v / 100 })} />
          </Field>
        </Section>

        <Section key={`cargo-${m.type}-${opened === 'goods'}`} title={t('ships.sectionCargo')} summary={m.goods ? t('ships.cargoSummary', { count: m.goodsCount, goods: humanize(m.goods) }) : t('ships.none')} defaultOpen={type?.focus === 'goods' || opened === 'goods'}>
          <Field label={t('ships.goods')} advancedKey="TargetGoods" fieldKey="goods">
            <PickerButton icon={<Package />} placeholder={t('ships.chooseGoods')} onClick={() => setPicker('goods')}>{m.goods && humanize(m.goods)}</PickerButton>
          </Field>
          <Field label={t('ships.amount')} advancedKey="TargetGoodsCount">
            <Stepper value={m.goodsCount} min={0} unit="t" onChange={(v) => set((x) => { x.goodsCount = v })} />
          </Field>
        </Section>

        <Section key={`pay-${m.type}`} title={t('ships.sectionPay')} summary={t('ships.paySummary', { credits: fmt(m.credits), rep: m.reputation })} defaultOpen>
          <Field label={t('ships.creditsLabel')} advancedKey="Reward" fieldKey="credits" htmlFor="mission-credits" help={t('ships.creditsHelp')}
            warning={creditsOver ? t('ships.creditsOver', { cap: fmt(MISSION_CREDIT_CAP) }) : undefined}>
            <div className="flex items-center gap-3">
              <Slider ariaLabel={t('ships.creditsLabel')} className="flex-1" min={0} max={MISSION_CREDIT_CAP} step={1000} tone={creditsOver ? 'amber' : 'cyan'}
                value={[Math.min(MISSION_CREDIT_CAP, m.credits)]} onChange={([v]) => set((x) => { x.credits = v })} />
              <NumberInput id="mission-credits" className="w-32 text-right" min={0} warn={creditsOver} value={m.credits} onChange={(v) => set((x) => { x.credits = v })} />
            </div>
          </Field>
          <Field label={t('ships.reputation')} advancedKey="Reputation" fieldKey="reputation" help={t('ships.repHelp')}
            warning={repOver ? t('ships.repOver', { cap: MISSION_REP_CAP }) : undefined}>
            <Stepper value={m.reputation} min={0} max={99} onChange={(v) => set((x) => { x.reputation = v })} className={repOver ? 'border-amber' : undefined} />
          </Field>
        </Section>
      </Card>

      <Button variant="destructive" onClick={remove} className="self-start"><Trash2 className="size-4" />{t('ships.missionRemove')}</Button>

      <PlacePicker kind="station" title={t('ships.offeredAt')} open={picker === 'home'} onOpenChange={(o) => !o && setPicker(null)} value={m.homeStation}
        onSelect={(v) => { set((x) => { x.homeStation = v }); setPicker(null) }} />
      <PlacePicker kind="system" title={t('ships.targetSystem')} open={picker === 'system'} onOpenChange={(o) => !o && setPicker(null)} value={m.targetSystem}
        onSelect={(v) => { set((x) => { x.targetSystem = v }); setPicker(null) }} />
      <PlacePicker kind="station" title={t('ships.targetStation')} system={m.targetSystem || undefined} open={picker === 'station'} onOpenChange={(o) => !o && setPicker(null)}
        value={m.targetStation} onSelect={(v) => { set((x) => { x.targetStation = v }); setPicker(null) }} />
      <ShipPicker mode="internal" open={picker === 'ship'} onOpenChange={(o) => !o && setPicker(null)} value={m.targetShipType}
        onSelect={(v) => { set((x) => { x.targetShipType = v }); setPicker(null) }} />
      <GoodsPicker open={picker === 'goods'} onOpenChange={(o) => !o && setPicker(null)} value={m.goods}
        onSelect={(v) => { set((x) => { x.goods = v }); setPicker(null) }} />
    </Page>
  )
}

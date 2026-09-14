import { Copy, MapPin, Rocket, ShieldAlert, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/layout/shell'
import { BehaviourPicker, ShipPicker } from '@/components/pickers'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { SortableList, SwipeRow } from '@/components/ui/gestures'
import { Input, Segmented, Slider, SwitchRow } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Badge, EmptyState, SectionLabel } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { uid, newShip } from '@/lib/factory'
import { BEHAVIOURS, SHIP_LEVELS, shipByKey } from '@/lib/reference'
import type { ShipSpawn } from '@/lib/types'
import { cn } from '@/lib/utils'
import { t, useT } from '@/i18n'
import { useFieldProblems } from '@/hooks/use-problems'
import { Fab, NumberInput, PickerButton, ShipArt, StepMissing, undoToast, useStepHeader, useStepRoute } from './common'

const TINTS = [
  { name: 'Red', hex: '#ff5a5a' },
  { name: 'Amber', hex: '#ffab3d' },
  { name: 'Green', hex: '#4ade80' },
  { name: 'Cyan', hex: '#35e0f5' },
  { name: 'Blue', hex: '#4f8cff' },
  { name: 'Violet', hex: '#a78bfa' },
]

/** Half-width of the position radar, in light seconds. */
const RADAR_LS = 1000

const isHostile = (s: ShipSpawn) => !!shipByKey(s.model)?.alwaysHostile || !!BEHAVIOURS.find((b) => b.key === s.behaviour)?.hostile
const where = (s: ShipSpawn) => (s.placement === 'nearPlayer' ? t('ships.nearPlayerAt', { distance: s.distance }) : t('ships.atPos', { x: s.x, y: s.y }))

export function ShipsPage() {
  const t = useT()
  const r = useStepRoute()
  const navigate = useNavigate()
  const { shipId } = useParams()
  useStepHeader(t('ships.shipsTitle'), r)
  usePulseField([shipId])
  if (!r.step) return <StepMissing />
  const ships = r.step.ships
  const editing = ships.find((s) => s.id === shipId)

  const add = () => {
    const id = uid('ship')
    r.update((s) => { s.ships.push(newShip({ id, pilot: t('ships.pilotN', { n: s.ships.length + 1 }) })) })
    navigate(`${r.base}/ships/${id}`)
  }
  const duplicate = (ship: ShipSpawn) => {
    undoToast(r.modId, t('ships.duplicated', { name: ship.pilot || t('ships.shipWord') }), () => r.update((s) => {
      const i = s.ships.findIndex((x) => x.id === ship.id)
      s.ships.splice(i + 1, 0, { ...structuredClone(ship), id: uid('ship'), pilot: `${ship.pilot} 2` })
    }))
  }
  const remove = (ship: ShipSpawn) => {
    if (shipId === ship.id) navigate(`${r.base}/ships`, { replace: true })
    undoToast(r.modId, t('ships.deleted', { name: ship.pilot || t('ships.shipWord') }), () => r.update((s) => { s.ships = s.ships.filter((x) => x.id !== ship.id) }))
  }

  return (
    <Page className="pb-24">
      {ships.length === 0 ? (
        <EmptyState
          icon={<Rocket />}
          title={t('ships.shipsEmptyTitle')}
          body={t('ships.shipsEmptyBody')}
          action={<Button onClick={add}>{t('ships.addShip')}</Button>}
        />
      ) : (
        <>
          <SectionLabel>{t('ships.shipsCount', { count: ships.length })}</SectionLabel>
          <SortableList
            items={ships}
            className="flex flex-col gap-2"
            onReorder={(items) => r.update((s) => { s.ships = items })}
            render={(ship, handle) => (
              <SwipeRow
                actions={[
                  { label: t('ships.duplicate'), icon: <Copy />, tone: 'cyan', onAction: () => duplicate(ship) },
                  { label: t('ships.delete'), icon: <Trash2 />, tone: 'danger', onAction: () => remove(ship) },
                ]}
              >
                <ShipCard ship={ship} handle={handle} duplicate={ships.filter((x) => x.pilot === ship.pilot).length > 1} onOpen={() => navigate(`${r.base}/ships/${ship.id}`)} />
              </SwipeRow>
            )}
          />
        </>
      )}
      {ships.length > 0 && <Fab label={t('ships.addShip')} onClick={add} />}
      <ShipEditor
        ship={editing}
        onChange={(recipe) => r.update((s) => { const sh = s.ships.find((x) => x.id === editing?.id); if (sh) recipe(sh) })}
        onClose={() => navigate(`${r.base}/ships`, { replace: true })}
        onDelete={() => editing && remove(editing)}
      />
    </Page>
  )
}

function ShipCard({ ship, handle, onOpen, duplicate }: { ship: ShipSpawn; handle: React.ReactNode; onOpen: () => void; duplicate: boolean }) {
  const t = useT()
  const model = shipByKey(ship.model)
  const hostile = isHostile(ship)
  return (
    <div className="flex items-stretch rounded-[4px] border border-edge bg-panel">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-left hover:bg-white/[0.03]">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-[2px] border border-edge bg-field', hostile ? 'text-danger' : 'text-ink')}>
          <ShipArt model={ship.model} className="size-9" color={ship.tint ?? undefined} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-[15px] font-semibold', ship.pilot ? 'text-white' : 'text-danger')}>{ship.pilot || t('ships.noPilot')}</span>
            {hostile && <Badge tone="danger" icon={<ShieldAlert />}>{t('ships.hostile')}</Badge>}
            {duplicate && <Badge tone="amber">{t('ships.sameName')}</Badge>}
          </span>
          <span className="truncate font-mono text-[12px] text-ink">
            {ship.autoLvl ? t('ships.matchesPlayer') : `${model?.name ?? ship.model} · ${ship.level}`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">{ship.behaviour}</Badge>
            <span className="flex items-center gap-1 font-mono text-[12px] text-dim"><MapPin className="size-3.5" />{where(ship)}</span>
          </span>
        </span>
      </button>
      <span className="flex items-center">{handle}</span>
    </div>
  )
}

function ShipEditor({ ship, onChange, onClose, onDelete }: {
  ship: ShipSpawn | undefined; onChange: (recipe: (s: ShipSpawn) => void) => void; onClose: () => void; onDelete: () => void
}) {
  const t = useT()
  const [picker, setPicker] = React.useState<'ship' | 'behaviour' | null>(null)
  // Keep the last ship rendered while the sheet animates closed.
  const last = React.useRef(ship)
  if (ship) last.current = ship
  const s = ship ?? last.current
  const r = useStepRoute()
  const fp = useFieldProblems(r.modId, `steps/${r.stepId}/ships/${s?.id}`)
  if (!s) return <Sheet open={false} onOpenChange={() => {}} title={t('ships.shipSheet')}><div /></Sheet>
  const model = shipByKey(s.model)

  return (
    <Sheet
      open={!!ship}
      onOpenChange={(o) => !o && onClose()}
      title={s.pilot || t('ships.shipSheet')}
      full
      footer={
        <div className="flex gap-2">
          <Button variant="destructive" onClick={onDelete}><Trash2 className="size-4" />{t('ships.delete')}</Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>{t('ships.done')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <Field label={t('ships.pilotName')} advancedKey="Name" fieldKey="pilot" htmlFor="ship-pilot"
          help={t('ships.pilotNameHelp')}
          error={fp('pilot').error}
          warning={fp('pilot').warning}
        >
          <Input id="ship-pilot" value={s.pilot} invalid={fp('pilot').invalid} warn={fp('pilot').warn} onChange={(e) => onChange((x) => { x.pilot = e.target.value })} />
        </Field>

        <SwitchRow
          label={t('ships.autoMatch')}
          help={t('ships.autoMatchHelp')}
          checked={s.autoLvl}
          onCheckedChange={(v) => onChange((x) => { x.autoLvl = v })}
          fieldKey="autoLvl"
        />

        <div className={cn('flex flex-col gap-5 transition-opacity', s.autoLvl && 'pointer-events-none opacity-40')} aria-disabled={s.autoLvl}>
          <Field label={t('ships.ship')} advancedKey="shipModel" fieldKey="model" help={t('ships.whichShipAppears')} warning={fp('model').warning}>
            <button
              type="button"
              disabled={s.autoLvl}
              onClick={() => setPicker('ship')}
              className="flex items-center gap-3 rounded-[4px] border border-grid-strong bg-cyan/[0.06] p-3 text-left hover:border-cyan"
            >
              <span className={cn('grid size-16 shrink-0 place-items-center rounded-[2px] border border-edge bg-field', model?.alwaysHostile ? 'text-danger' : 'text-cyan')}>
                <ShipArt model={s.model} className="size-12" color={s.tint ?? undefined} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[16px] font-semibold text-white">{model?.name ?? s.model}</span>
                <span className="font-mono text-[12px] text-dim">{model ? t('ships.hullSize', { size: model.size }) : t('ships.notKnownShip')}</span>
                {model?.alwaysHostile && <Badge tone="danger" icon={<ShieldAlert />}>{t('ships.alwaysHostile')}</Badge>}
              </span>
              <span className="text-[13px] text-cyan">{t('ships.change')}</span>
            </button>
          </Field>

          <Field label={t('ships.equipment')} advancedKey="shipLevel" help={t('ships.equipmentHelp')}>
            <div className="-mx-0.5 overflow-x-auto">
              <Segmented
                ariaLabel={t('ships.equipment')}
                size="sm"
                className="min-w-[480px]"
                value={s.level}
                onChange={(v) => onChange((x) => { x.level = v })}
                options={SHIP_LEVELS.map((l) => ({ value: l, label: l, disabled: s.autoLvl }))}
              />
            </div>
          </Field>
        </div>

        <Field label={t('ships.behaviour')} advancedKey="shipBehavior" fieldKey="behaviour" help={model?.alwaysHostile ? t('ships.alwaysHostileHelp') : t('ships.behaviourHelp', { description: BEHAVIOURS.find((b) => b.key === s.behaviour)?.description ?? '' })}>
          <PickerButton icon={<ShieldAlert />} onClick={() => setPicker('behaviour')}>{s.behaviour}</PickerButton>
        </Field>

        <WhereField ship={s} onChange={onChange} />

        <Field label={t('ships.tint')} advancedKey="color" help={t('ships.tintHelp')}>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t('ships.tint')}>
            <Swatch label={t('ships.noTint')} selected={!s.tint} onClick={() => onChange((x) => { x.tint = null })} />
            {TINTS.map((c) => (
              <Swatch key={c.hex} label={t(`ships.tint_${c.name}`)} hex={c.hex} selected={s.tint?.toLowerCase() === c.hex} onClick={() => onChange((x) => { x.tint = c.hex })} />
            ))}
            <label className={cn('relative grid size-11 cursor-pointer place-items-center rounded-[2px] border', s.tint && !TINTS.some((c) => c.hex === s.tint?.toLowerCase()) ? 'border-cyan' : 'border-edge')}>
              <span className="size-7 rounded-[2px] bg-[conic-gradient(#ff5a5a,#ffab3d,#4ade80,#35e0f5,#4f8cff,#a78bfa,#ff5a5a)]" />
              <input type="color" aria-label={t('ships.customTint')} value={s.tint ?? '#ffffff'} onChange={(e) => onChange((x) => { x.tint = e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            {s.tint && <span className="font-mono text-[12px] text-dim">{s.tint}</span>}
          </div>
        </Field>
      </div>

      <ShipPicker nested open={picker === 'ship'} onOpenChange={(o) => !o && setPicker(null)} mode="model" value={s.model}
        onSelect={(v) => { onChange((x) => { x.model = v }); setPicker(null) }} />
      <BehaviourPicker nested open={picker === 'behaviour'} onOpenChange={(o) => !o && setPicker(null)} value={s.behaviour}
        onSelect={(v) => { onChange((x) => { x.behaviour = v }); setPicker(null) }} />
    </Sheet>
  )
}

function Swatch({ label, hex, selected, onClick }: { label: string; hex?: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} onClick={onClick}
      className={cn('grid size-11 place-items-center rounded-[2px] border', selected ? 'border-cyan' : 'border-edge')}>
      {hex ? <span className="size-7 rounded-[2px]" style={{ background: hex }} /> : <span className="relative size-7 rounded-[2px] border border-dim after:absolute after:left-1/2 after:top-[-3px] after:h-[34px] after:w-px after:rotate-45 after:bg-dim" />}
    </button>
  )
}

function WhereField({ ship: s, onChange }: { ship: ShipSpawn; onChange: (recipe: (s: ShipSpawn) => void) => void }) {
  const t = useT()
  const near = s.placement === 'nearPlayer'
  return (
    <Field label={t('ships.where')} advancedKey={near ? 'distanceFromPlayer' : 'spawnX, spawnY'} fieldKey="where"
      help={near ? t('ships.whereNearHelp') : t('ships.wherePosHelp')}>
      <Segmented
        ariaLabel={t('ships.where')}
        value={s.placement}
        onChange={(v) => onChange((x) => {
          x.placement = v
          if (v === 'nearPlayer') { x.x = 0; x.y = 0 }
        })}
        options={[{ value: 'nearPlayer', label: t('ships.nearThePlayer') }, { value: 'position', label: t('ships.atAPosition') }]}
      />
      {near ? (
        <div className="flex items-center gap-3">
          <Slider ariaLabel={t('ships.distanceFromPlayer')} className="flex-1" min={0} max={2000} step={10} value={[Math.min(2000, s.distance)]} onChange={([v]) => onChange((x) => { x.distance = v })} />
          <NumberInput ariaLabel={t('ships.distance')} className="w-24 text-center" min={0} value={s.distance} onChange={(v) => onChange((x) => { x.distance = v })} />
        </div>
      ) : (
        <>
          <Radar x={s.x} y={s.y} onChange={(x, y) => onChange((d) => { d.x = x; d.y = y })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-dim">{t('ships.xLs')}
              <NumberInput value={s.x} onChange={(v) => onChange((d) => { d.x = v })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-dim">{t('ships.yLs')}
              <NumberInput value={s.y} onChange={(v) => onChange((d) => { d.y = v })} />
            </label>
          </div>
          {s.x === 0 && s.y === 0 && <p className="text-[12px] text-amber">{t('ships.zeroNote')}</p>}
        </>
      )}
    </Field>
  )
}

/** Square radar with the system centre in the middle; +Y is up. Drag or tap to place the pin. */
function Radar({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const t = useT()
  const ref = React.useRef<HTMLDivElement>(null)
  const place = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const fx = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height))
    onChange(Math.round(((fx - 0.5) * 2 * RADAR_LS) / 10) * 10, Math.round(((0.5 - fy) * 2 * RADAR_LS) / 10) * 10)
  }
  const clamp = (v: number) => Math.min(1, Math.max(-1, v / RADAR_LS))
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 100 : 10
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (d) { e.preventDefault(); onChange(x + d[0], y + d[1]) }
  }
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('ships.radarLabel')}
      aria-valuetext={t('ships.radarValue', { x, y })}
      onKeyDown={onKey}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); place(e) }}
      onPointerMove={(e) => { if (e.buttons) place(e) }}
      className="grid-texture relative mx-auto aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-[4px] border border-edge bg-void outline-none focus-visible:border-cyan"
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <span key={f} aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-grid" style={{ width: `${f * 100}%`, height: `${f * 100}%` }} />
      ))}
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-grid" />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-grid" />
      <span aria-hidden className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber" />
      <span aria-hidden className="absolute bottom-1 right-2 font-mono text-[10px] text-dim">{t('ships.radarRange', { range: RADAR_LS })}</span>
      <MapPin
        aria-hidden
        className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-full text-cyan"
        style={{ left: `${(clamp(x) + 1) * 50}%`, top: `${(1 - clamp(y)) * 50}%` }}
      />
    </div>
  )
}

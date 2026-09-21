/** Your ship: the fitted modules, a module's detail card, and the purchase modal.
 *
 * The rows are the ship's slots in save order (`system/modules/Modules.as:48-190`), so the row a
 * module sits in is the slot the save writes it to. Every install passes the game's own tests in
 * `lib/save/rules.ts`.
 */
import * as React from 'react'
import { AmfObject, type Save } from '../../../lib/save/codec'
import { extUtf } from '../../../lib/save/safety'
import {
  SLOT_NAME, buildSlots, byKey, bySaveName, canPlace, fitsHangar, fitsSize, fittedModules, install,
  maxAll, maxCategory, maxZentarks, moduleVector, putInStorage, shipData, shipKey, singletonFree,
  type Fill, type ModuleRec, type ShipRec, type Slot,
} from '../../../lib/save/rules'
import { ModulePanel, type ModuleCard } from '../panels'
import {
  boostsOf, saveSpecs, shedOrder, specCells, type ModuleStats, type ShipSpecs, type Upgrade,
} from '../../../lib/save/specs'
import { Engineer } from '../engineer'
import {
  engineerLabel, makePriorities, makeUpgrades, moduleBits, priorityFor, type ModuleUpgrade,
} from '../../../lib/save/engineer'
import { Wand } from '../wand'
import { repairHull, setSlotBest, slotAtBest } from '../../../lib/save/best'
import type { ScreenProps } from './types'
import './ship.css'

interface Data {
  modules: ModuleStats[]
  ships: ShipSpecs[]
  moduleCards: Record<string, ModuleCard>
  upgrades: (Upgrade & ModuleUpgrade)[]
  priorities: Record<string, number>
}

function useSaveData() {
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: Data) => { makeUpgrades(d.upgrades); makePriorities(d.priorities); setData(d) })
      .catch(() => setData(null))
  }, [])
  return data
}

const sprite = (icon: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(icon)}.svg`
const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = 'hidden' }

/** The strip the game prints above the sections (`ui/screens/ModulesShopScreen.as:198`): the
 * hull, the shields, the jump range on a full tank, the mass loaded against the mass it can
 * carry, and the speed. Every figure is `ShipInfo`'s own arithmetic, in `lib/save/specs.ts`, so
 * an engineer level shows up here as it does in the game. */
function Specs({ sv, ship, fitted, upgrades }: {
  sv: Save; ship: ShipSpecs; fitted: (ModuleStats | null)[]; upgrades: Upgrade[]
}) {
  const specs = saveSpecs(sv, ship, fitted, upgrades)
  const cells = specCells(specs)
  const over = specs.power > specs.powerMax
  const shed = over ? shedOrder(fitted, boostsOf(sv, fitted, upgrades), priorityFor) : []
  return (
    <>
      <div className="shspecs">
        <div className="ovrow">{cells.map(([l]) => <div key={l} className="ovgold shspeclabel">{l.toUpperCase()}</div>)}</div>
        <div className="ovrow">{cells.map(([l, v]) => <div key={l} className="ovval">{v.toUpperCase()}</div>)}</div>
      </div>
      {/* The game prints no power budget and enforces it silently: on load it switches modules
          off by priority until the draw fits (`system/modules/Modules.as:327-346`), and a shields
          module switched off reads as broken (`system/modules/Module.as:225-232`). */}
      <div className={`shpower${over ? ' shover' : ''}`}>
        POWER {Math.round(specs.power * 100) / 100} / {Math.round(specs.powerMax * 100) / 100} MW
        {over && ` · the game switches off ${shed.map((m) => m.name).join(', ')} until this fits`}
      </div>
    </>
  )
}

/** One slot's row, as the game draws it: the icon, the module's own class, its name, and the
 * slot's restriction followed by the engineer state in square brackets, `Main [25 Jump Range]`.
 * The bracket is the engineer's control, in place on the row. */
function Row({ slot, mod, label, wand, onOpen, onEngineer }: {
  slot: Slot; mod: ModuleRec | null; label: string; wand: React.ReactNode
  onOpen: () => void; onEngineer: () => void
}) {
  return (
    <div className="shrowbox">
      <button type="button" className={`shrow${mod ? '' : ' shempty'}`} onClick={onOpen}>
        <img src={sprite(mod?.icon || mod?.line || '')} alt="" onError={hide} />
        {/* The game prints the module's own class, and the slot's maximum where it is empty. */}
        <div className="shclass">{mod ? mod.mClass : slot.sizeMax}</div>
        <div>
          <div className="shname">{mod ? mod.name : 'Empty'}</div>
          <div className="shslot">
            {SLOT_NAME[slot.restriction]}
            {/* The bracket is the engineer's own control; a module with no modification shows
                the restriction alone, as the game does. */}
            {label && (
              <span
                className="shupgrade"
                role="button"
                tabIndex={0}
                aria-label={`Engineer, ${mod?.name ?? ''}`}
                onClick={(e) => { e.stopPropagation(); onEngineer() }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onEngineer() } }}
              >
                {label}
              </span>
            )}
          </div>
        </div>
      </button>
      {wand}
    </div>
  )
}

/** The fitted-module list: the specs strip, then one section per slot class. */
function Fitted({ sv, ship, slots, fitted, mods, keys, upgrades, onOpen, onMax, onBest, onEngineer }: {
  sv: Save; ship: ShipSpecs; slots: Slot[]; fitted: (ModuleStats | null)[]
  mods: ModuleRec[]; keys: Map<string, ModuleRec>; upgrades: Upgrade[]
  onOpen: (slot: Slot) => void; onMax: (name: string) => void; onBest: (slot: Slot) => void
  onEngineer: (slot: Slot) => void
}) {
  const sections: [string, Slot[]][] = (['Main', 'Weapon', 'External', 'Military', 'Optional'] as const)
    .map((t) => [SLOT_NAME[t], slots.filter((s) => s.restriction === t)])
    .filter(([, list]) => list.length > 0) as [string, Slot[]][]
  return (
    <>
      <Specs sv={sv} ship={ship} fitted={fitted} upgrades={upgrades} />
      <div className="shmax">
        {['Max all', 'Max storage', 'Max shield enhancements', 'Max hull enhancements', 'Zentarks'].map((name) => (
          <button key={name} type="button" className="ggbutton shmaxbtn" onClick={() => onMax(name)}>{name}</button>
        ))}
      </div>
      {sections.map(([name, list]) => (
        <section key={name}>
          <div className="ovbar shbar">{name}</div>
          <div className="shgrid">
            {list.map((slot) => (
              <Row
                key={slot.index} slot={slot} mod={fitted[slot.index]}
                label={labelOf(sv, slot)}
                onEngineer={() => onEngineer(slot)}
                wand={(
                  <Wand
                    atBest={slotAtBest(sv, slot, ship, fitted, mods, keys)}
                    what={`${SLOT_NAME[slot.restriction]} slot ${slot.index}`}
                    onSet={() => onBest(slot)}
                  />
                )}
                onOpen={() => onOpen(slot)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** The engineer state a row prints, read from the module the save holds. */
function labelOf(sv: Save, slot: Slot): string {
  const m = moduleVector(sv).items[slot.index]
  if (!(m instanceof AmfObject)) return ''
  const bits = moduleBits(m)
  return engineerLabel(extUtf(m, 0), bits.level, bits.upgradeType)
}

/** Why the game would refuse this module, in its own words (`lang_en.json`). */
function refusal(mod: ModuleRec, slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>) {
  if (!fitsSize(mod, slot)) return "Module can't fit this slot"
  if (!fitsHangar(mod, ship, keys)) return 'Your ship does not support the installation of this module.'
  if (!singletonFree(mod, fitted, slot)) return 'Only one module of this type allowed'
  return "Module can't fit this slot"
}

/** Every module line a slot accepts, for an empty slot's picker. */
function lines(mods: ModuleRec[], slot: Slot, ship: ShipRec, fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>) {
  const out = new Map<string, ModuleRec>()
  for (const m of mods) if (canPlace(m, slot, ship, fitted, keys) && !out.has(m.line)) out.set(m.line, m)
  return [...out.values()]
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [open, setOpen] = React.useState<Slot | null>(null)
  const [pick, setPick] = React.useState<ModuleRec | null>(null)
  const [modal, setModal] = React.useState<ModuleRec | null>(null)
  const [tuning, setTuning] = React.useState<Slot | null>(null)
  const [note, setNote] = React.useState('')

  const parts = React.useMemo(() => {
    if (!data) return null
    const keys = byKey(data.modules)
    const ship = data.ships.find((s) => s.key === shipKey(sv))
    if (!ship) return null
    return { keys, names: bySaveName(data.modules), ship, slots: buildSlots(ship, keys) }
  }, [data, sv])

  if (!data || !parts) return null
  const { keys, names, ship, slots } = parts
  const fitted = fittedModules(sv, names) as (ModuleStats | null)[]

  const apply = (fills: Fill[]) => {
    fills.forEach((f) => install(sv, f.slot, f.mod))
    setNote(`${fills.length} module${fills.length === 1 ? '' : 's'} installed`)
    redraw()
  }

  const onMax = (name: string) => {
    // Max all also takes the damage off the hull: its integrity is the ship's own hull value.
    if (name === 'Max all') {
      repairHull(sv, ship, fitted)
      return apply(maxAll(slots, ship, fitted, data.modules, keys))
    }
    if (name === 'Zentarks') return apply(maxZentarks(slots, ship, fitted, data.modules, keys))
    const category = name === 'Max storage' ? 'CargoRack' : name === 'Max shield enhancements' ? 'Shields' : 'HullReinforcement'
    return apply(maxCategory(category, slots, ship, fitted, data.modules, keys))
  }

  /** Installs `mod` in the open slot; `keep` puts the module it displaces into storage, and
   * anything else discards it. Neither moves the balance. */
  const fitModule = (mod: ModuleRec, keep: boolean) => {
    if (!open) return
    const old = install(sv, open, mod)
    if (old && keep) putInStorage(sv, old, extUtf(shipData(sv), 1))
    setModal(null)
    setPick(null)
    setOpen(null)
    redraw()
  }

  if (open) {
    const current = fitted[open.index]
    const item = moduleVector(sv).items[open.index]
    const fittedObject = item instanceof AmfObject ? item : null
    const chosen = pick ?? current
    const card = chosen && data.moduleCards[chosen.line]
    const options = lines(data.modules, open, ship, fitted, keys)
    return (
      <div className="shdetail">
        <div className="shdetailhead">
          <button type="button" className="ggbutton" onClick={() => (pick ? setPick(null) : setOpen(null))}>Back</button>
          <div className="ovgold shslotline">
            {SLOT_NAME[open.restriction]} slot {open.index} · class {open.sizeMax} maximum
            <Wand
              atBest={slotAtBest(sv, open, ship, fitted, data.modules, keys)}
              what={`${SLOT_NAME[open.restriction]} slot ${open.index}`}
              onSet={() => { setSlotBest(sv, open, ship, fitted, data.modules, keys); setPick(null); redraw() }}
            />
          </div>
          {chosen && chosen !== current && (canPlace(chosen, open, ship, fitted, keys)
            ? <button type="button" className="ggbutton" onClick={() => (current ? setModal(chosen) : fitModule(chosen, true))}>Purchase</button>
            // `lang_en.json`: `ModuleSizeTooBig`, `ModuleSingletonExist`, `ModuleNotSupported`.
            : <div className="shrefuse">{refusal(chosen, open, ship, fitted, keys)}</div>)}
        </div>
        {card && chosen
          ? (
            <ModulePanel
              card={{ ...card, icon: card.icon && `${card.icon}.svg` }}
              grade={chosen.className}
              onGrade={(g) => setPick(data.modules.find((m) => m.line === chosen.line && m.className === g) ?? null)}
              engineer={fittedObject && chosen === current
                ? <Engineer module={fittedObject} subtype={chosen.subtype} onChange={redraw} />
                : null}
            />
          )
          : (
            <div className="shpick">
              {options.map((m) => (
                <button key={m.line} type="button" className="shrow" onClick={() => setPick(m)}>
                  <img src={sprite(m.icon || m.line)} alt="" onError={hide} />
                  <div className="shclass">{m.mClass}</div>
                  <div><div className="shname">{m.name}</div><div className="shslot">{SLOT_NAME[m.slotType]}</div></div>
                </button>
              ))}
            </div>
          )}
        {modal && (
          <div className="shmodal">
            <div className="shmodalbox">
              <div className="ovhead">New module purchase</div>
              <p>Do you want to keep the module now fitted, or discard it?</p>
              <div className="shmodalbtns">
                <button type="button" className="ggbutton" onClick={() => fitModule(modal, true)}>Put in storage</button>
                <button type="button" className="ggbutton" onClick={() => fitModule(modal, false)}>Discard</button>
                <button type="button" className="ggbutton" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const item = tuning ? moduleVector(sv).items[tuning.index] : null
  const tuningModule = item instanceof AmfObject ? item : null

  return (
    <div className="shbody">
      {note && <div className="shnote">{note}</div>}
      <Fitted
        sv={sv} ship={ship} slots={slots} fitted={fitted} mods={data.modules} keys={keys}
        upgrades={data.upgrades}
        onOpen={(s) => { setPick(null); setOpen(s) }} onMax={onMax}
        onBest={(slot) => { setSlotBest(sv, slot, ship, fitted, data.modules, keys); redraw() }}
        onEngineer={setTuning}
      />
      {tuning && tuningModule && (
        // The panel's own control, over the list, so a level is set without leaving the rows.
        <div className="shmodal" onClick={() => setTuning(null)} role="presentation">
          <div className="shmodalbox shtune" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="ovhead">{fitted[tuning.index]?.name ?? ''}</div>
            <Engineer module={tuningModule} subtype={extUtf(tuningModule, 0)} onChange={redraw} />
            <div className="shmodalbtns">
              <button type="button" className="ggbutton" onClick={() => setTuning(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
import type { ScreenProps } from './types'
import './ship.css'

interface Data { modules: ModuleRec[]; ships: ShipRec[]; moduleCards: Record<string, ModuleCard> }

function useSaveData() {
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: Data) => setData(d))
      .catch(() => setData(null))
  }, [])
  return data
}

const sprite = (icon: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(icon)}.svg`
const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = 'hidden' }

/** A parameter of a module, as a number ("2.5 T" is 2.5). */
const param = (mod: ModuleRec | null, name: string) => {
  const row = mod?.params.find((p) => p[0] === name)
  return row ? parseFloat(row[1].replace(/,/g, '')) || 0 : 0
}

/** The strip the game prints above the sections (`lang_en.json`: `ShipHullLabel`, `MaxJumpRange`,
 * `TotalMass`, `ShipSpeedLabel`).
 *
 * Hull is the hull module's integrity, which is what the save carries (`Modules.as:118`), and
 * total mass is the fitted mass against the thrusters' optimal mass. Shields and speed are the
 * hull's own specs, and jump range needs the drive constants `save-data.json` does not carry.
 */
function Specs({ sv, ship, fitted }: { sv: Save; ship: ShipRec; fitted: (ModuleRec | null)[] }) {
  const hull = Math.round(hullIntegrity(sv))
  const mass = fitted.reduce((n, m) => n + param(m, 'Mass'), 0)
  const optimal = param(fitted.find((m) => m?.category === 'Thrusters') ?? null, 'Ship mass optimal')
  const spec = (name: string) => ship.overview.specs.find((s) => s[0] === name)?.[1] ?? ''
  const cells: [string, string][] = [
    ['Hull', String(hull || spec('Hull'))],
    ['Shields', `${spec('Shields')} MW`],
    ['Jump range', '—'],
    ['Total mass', `${Math.round(mass * 10) / 10}${optimal ? `/${optimal}` : ''} T`],
    ['Speed', String(spec('Speed'))],
  ]
  return (
    <div className="shspecs">
      <div className="ovrow">{cells.map(([l]) => <div key={l} className="ovgold shspeclabel">{l.toUpperCase()}</div>)}</div>
      <div className="ovrow">{cells.map(([l, v]) => <div key={l} className="ovval">{v.toUpperCase()}</div>)}</div>
    </div>
  )
}

/** The hull module's integrity, which is the ship's hull value (`Modules.as:118`). */
const hullIntegrity = (sv: Save) => {
  const m = moduleVector(sv).items[0]
  if (!(m instanceof AmfObject)) return 0
  const b = m.raw[2][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}

function Row({ slot, mod, onOpen }: { slot: Slot; mod: ModuleRec | null; onOpen: () => void }) {
  return (
    <button type="button" className={`shrow${mod ? '' : ' shempty'}`} onClick={onOpen}>
      <img src={sprite(mod?.icon || mod?.line || '')} alt="" onError={hide} />
      <div className="shclass">{slot.sizeMax}</div>
      <div>
        <div className="shname">{mod ? mod.name : 'Empty'}</div>
        <div className="shslot">{SLOT_NAME[slot.restriction]}</div>
      </div>
    </button>
  )
}

/** The fitted-module list: the specs strip, then one section per slot class. */
function Fitted({ sv, ship, slots, fitted, onOpen, onMax }: {
  sv: Save; ship: ShipRec; slots: Slot[]; fitted: (ModuleRec | null)[]
  onOpen: (slot: Slot) => void; onMax: (name: string) => void
}) {
  const sections: [string, Slot[]][] = (['Main', 'Weapon', 'External', 'Military', 'Optional'] as const)
    .map((t) => [SLOT_NAME[t], slots.filter((s) => s.restriction === t)])
    .filter(([, list]) => list.length > 0) as [string, Slot[]][]
  return (
    <>
      <Specs sv={sv} ship={ship} fitted={fitted} />
      <div className="shmax">
        {['Max all', 'Max storage', 'Max shield enhancements', 'Max hull enhancements', 'Zentarks'].map((name) => (
          <button key={name} type="button" className="ggbutton shmaxbtn" onClick={() => onMax(name)}>{name}</button>
        ))}
      </div>
      {sections.map(([name, list]) => (
        <section key={name}>
          <div className="ovbar shbar">{name}</div>
          <div className="shgrid">
            {list.map((slot) => <Row key={slot.index} slot={slot} mod={fitted[slot.index]} onOpen={() => onOpen(slot)} />)}
          </div>
        </section>
      ))}
    </>
  )
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
  const fitted = fittedModules(sv, names)

  const apply = (fills: Fill[]) => {
    fills.forEach((f) => install(sv, f.slot, f.mod))
    setNote(`${fills.length} module${fills.length === 1 ? '' : 's'} installed`)
    redraw()
  }

  const onMax = (name: string) => {
    if (name === 'Max all') return apply(maxAll(slots, ship, fitted, data.modules, keys))
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
    const chosen = pick ?? current
    const card = chosen && data.moduleCards[chosen.line]
    const options = lines(data.modules, open, ship, fitted, keys)
    return (
      <div className="shdetail">
        <div className="shdetailhead">
          <button type="button" className="ggbutton" onClick={() => (pick ? setPick(null) : setOpen(null))}>Back</button>
          <div className="ovgold shslotline">
            {SLOT_NAME[open.restriction]} slot {open.index} · class {open.sizeMax} maximum
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

  return (
    <div className="shbody">
      {note && <div className="shnote">{note}</div>}
      <Fitted sv={sv} ship={ship} slots={slots} fitted={fitted} onOpen={(s) => { setPick(null); setOpen(s) }} onMax={onMax} />
    </div>
  )
}

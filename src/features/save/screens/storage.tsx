/** Module storage: the stored modules, a module's detail card, and the moves between storage and
 * the ship's slots.
 *
 * The list is the save's `ModulesStorage` vectors in their own order, so a row is the entry the
 * game reads. Every install passes the game's own tests in `lib/save/rules.ts`.
 */
import * as React from 'react'
import { AmfObject } from '../../../lib/save/codec'
import { SLOT_NAME, buildSlots, byKey, bySaveName, fitsHangar, fitsSize, fittedModules, moduleVector, shipKey, singletonFree, type ModuleRec, type ShipRec, type Slot } from '../../../lib/save/rules'
import { installFromStorage, slotsFor, storedList, takeIntoStorage, type Stored } from '../../../lib/save/storage'
import { ModulePanel, type ModuleCard } from '../panels'
import { Engineer } from '../engineer'
import type { ScreenProps } from './types'
import './storage.css'

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

/** A list row: the module's icon, its class and its name over the slot type it asks for. */
function Row({ mod, note, onOpen }: { mod: ModuleRec | null; note: string; onOpen: () => void }) {
  return (
    <button type="button" className={`strow${mod ? '' : ' stunknown'}`} onClick={onOpen}>
      <img src={sprite(mod?.icon || mod?.line || '')} alt="" onError={hide} />
      <div className="stclass">{mod?.mClass ?? ''}</div>
      <div>
        <div className="stname">{mod ? mod.name : 'Unknown module'}</div>
        <div className="stsub">{note}</div>
      </div>
    </button>
  )
}

/** Why the game would refuse this module in every slot, in its own words (`lang_en.json`:
 * `ModuleSizeTooBig`, `ModuleNotSupported`, `ModuleSingletonExist`). */
function refusal(mod: ModuleRec, slots: Slot[], ship: ShipRec, fitted: (ModuleRec | null)[], keys: Map<string, ModuleRec>) {
  const typed = slots.filter((s) => fitsSize(mod, s))
  if (!fitsHangar(mod, ship, keys)) return 'Your ship does not support the installation of this module.'
  if (!typed.length) return "Module can't fit this slot"
  if (!typed.some((s) => singletonFree(mod, fitted, s))) return 'Only one module of this type allowed'
  return "Module can't fit this slot"
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [open, setOpen] = React.useState<Stored | null>(null)
  const [fit, setFit] = React.useState<Slot | null>(null)
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
  const stored = storedList(sv, names)

  const back = () => { setOpen(null); setFit(null) }

  const install = (entry: Stored, slot: Slot) => {
    if (!installFromStorage(sv, entry, slot, ship, fitted, keys)) return
    setNote(`${entry.mod?.name ?? ''} installed`)
    back()
    redraw()
  }

  const store = (slot: Slot) => {
    if (!takeIntoStorage(sv, slot)) return
    setNote(`${fitted[slot.index]?.name ?? ''} put in storage`)
    back()
    redraw()
  }

  /** A stored module: its card, and the slots that take it. */
  if (open) {
    const card = open.mod && data.moduleCards[open.mod.line]
    const targets = open.mod ? slotsFor(open.mod, slots, ship, fitted, keys) : []
    return (
      <div className="stdetail">
        <div className="stdetailhead">
          <button type="button" className="ggbutton" onClick={back}>Back</button>
          <div className="ovgold stline">
            {open.mod ? open.mod.name : 'Unknown module'}
            {open.station ? ` · ${open.station}` : ''}
          </div>
          <div />
        </div>
        {open.mod && (targets.length
          ? (
            <div className="stslots">
              {targets.map((slot) => (
                <button key={slot.index} type="button" className="ggbutton stslot" onClick={() => install(open, slot)}>
                  Use · {SLOT_NAME[slot.restriction]} slot {slot.index}
                  {fitted[slot.index] ? ` · replaces ${fitted[slot.index]?.name}` : ''}
                </button>
              ))}
            </div>
          )
          : <div className="strefuse">{refusal(open.mod, slots, ship, fitted, keys)}</div>)}
        {card && open.mod && (
          <ModulePanel
            card={{ ...card, icon: card.icon && `${card.icon}.svg` }}
            grade={open.mod.className}
            engineer={<Engineer module={open.module} subtype={open.mod.subtype} onChange={redraw} />}
          />
        )}
      </div>
    )
  }

  /** A fitted module: its card, and the way back into storage. */
  if (fit) {
    const mod = fitted[fit.index]
    const card = mod && data.moduleCards[mod.line]
    const item = moduleVector(sv).items[fit.index]
    const fitObject = item instanceof AmfObject ? item : null
    return (
      <div className="stdetail">
        <div className="stdetailhead">
          <button type="button" className="ggbutton" onClick={back}>Back</button>
          <div className="ovgold stline">
            {mod ? mod.name : ''} · {SLOT_NAME[fit.restriction]} slot {fit.index}
          </div>
          <button type="button" className="ggbutton" onClick={() => store(fit)}>Put in storage</button>
        </div>
        {card && mod && fitObject && (
          <ModulePanel
            card={{ ...card, icon: card.icon && `${card.icon}.svg` }}
            grade={mod.className}
            engineer={<Engineer module={fitObject} subtype={mod.subtype} onChange={redraw} />}
          />
        )}
      </div>
    )
  }

  const onShip = slots.filter((s) => fitted[s.index])
  return (
    <div className="stbody">
      {note && <div className="stnote">{note}</div>}
      <div className="ovbar stbar">Storage</div>
      {stored.length
        ? (
          <div className="stgrid">
            {stored.map((entry) => (
              <Row
                key={entry.index}
                mod={entry.mod}
                note={entry.mod ? SLOT_NAME[entry.mod.slotType] : entry.station}
                onOpen={() => setOpen(entry)}
              />
            ))}
          </div>
        )
        : <div className="stnote">No modules</div>}
      <div className="ovbar stbar">Your ship</div>
      <div className="stgrid">
        {onShip.map((slot) => (
          <Row
            key={slot.index}
            mod={fitted[slot.index]}
            note={`${SLOT_NAME[slot.restriction]} slot ${slot.index}`}
            onOpen={() => setFit(slot)}
          />
        ))}
      </div>
    </div>
  )
}

/** Craft materials and the engineer.
 *
 * The materials list is the game's own screen: the 32 counts of `ExtraData.materials` in
 * declaration order, each out of 50. The engineer view is the game's module rows, and it grants a
 * level as if every required supply were in hand, so a count changes only on the materials list.
 */
import * as React from 'react'
import { bySaveName, type ModuleRec } from '../../../lib/save/rules'
import {
  ENGINEER_CAP, MATERIAL_MAX, MAX_LEVEL, UPGRADES, materialCounts, setLevel, setMaterial,
  setUpgradeType, upgradeables, type Upgradeable,
} from '../../../lib/save/engineer'
import type { ScreenProps } from './types'
import './materials.css'

interface Material { id: number; key: string; type: string; name: string }
interface Data { modules: ModuleRec[]; materials: Material[] }

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

/** `CraftMaterialType` (`system/CraftMaterials/CraftMaterialType.as`), as the list groups them. */
const GROUP: Record<string, string> = { Data: 'Data', Element: 'Elements', Material: 'Materials' }

/** One material: its name, the count out of 50, and the bar the game draws for it. */
function MaterialRow({ mat, count, onSet }: { mat: Material; count: number; onSet: (n: number) => void }) {
  return (
    <div className="mtrow">
      <div className="mtname">{mat.name}</div>
      <div className="mtstack">
        <div className="mtcount">{count} / {MATERIAL_MAX}</div>
        <input
          className="mtbar" type="range" min={0} max={MATERIAL_MAX} value={count}
          aria-label={mat.name} onChange={(e) => onSet(Number(e.currentTarget.value))}
        />
      </div>
    </div>
  )
}

function Materials({ counts, onSet, materials }: { counts: number[]; materials: Material[]; onSet: (id: number, n: number) => void }) {
  const groups = ['Data', 'Element', 'Material']
  return (
    <>
      {groups.map((type) => (
        <section key={type}>
          <div className="ovbar mtbarhead">{GROUP[type]}</div>
          {materials.filter((m) => m.type === type).map((m) => (
            <MaterialRow key={m.id} mat={m} count={counts[m.id]} onSet={(n) => onSet(m.id, n)} />
          ))}
        </section>
      ))}
    </>
  )
}

const upgradeName = (u: Upgradeable) =>
  UPGRADES[u.subtype]?.find((o) => o.type === u.upgradeType)?.name ?? 'No modification'

/** A module the engineer can reach, as the module rows elsewhere draw it. */
function ModuleRow({ u, onOpen }: { u: Upgradeable; onOpen: () => void }) {
  return (
    <button type="button" className="mtmod" onClick={onOpen}>
      <img src={sprite(u.mod?.icon || u.mod?.line || '')} alt="" onError={hide} />
      <div className="mtlevel">{u.level}</div>
      <div>
        <div className="mtmodname">{u.mod ? u.mod.name : u.subtype}</div>
        <div className="mtmodsub">{u.where === 'storage' ? 'Storage · ' : ''}{upgradeName(u)}</div>
      </div>
    </button>
  )
}

/** The upgrade detail: the modifications this module type takes, and its level.
 *
 * A different modification resets the level to 1 (`EngineerScreen.as:214-216`); level 25 is the
 * ceiling (`EngineerScreen.as:117`), and the engineer who takes the type furthest is named with
 * the level their qualification allows (`EngineerScreen.as:116`). */
function Upgrade({ u, onBack, onType, onLevel }: {
  u: Upgradeable; onBack: () => void; onType: (t: number) => void; onLevel: (n: number) => void
}) {
  const cap = ENGINEER_CAP[u.subtype]
  return (
    <div className="mtdetail">
      <div className="mtdetailhead">
        <button type="button" className="ggbutton" onClick={onBack}>Back</button>
        <div className="ovgold mtline">{u.mod ? u.mod.name : u.subtype}</div>
        <div className="mtlevelbig">LEVEL {u.level}</div>
      </div>
      <div className="ovrow mtopts">
        {UPGRADES[u.subtype].map((o) => (
          <button
            key={o.type} type="button"
            className={`ggbutton mtopt${o.type === u.upgradeType ? ' mton' : ''}`}
            onClick={() => onType(o.type)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="mtlevels">
        <input
          className="mtbar" type="range" min={0} max={MAX_LEVEL} value={u.level}
          aria-label="Level" onChange={(e) => onLevel(Number(e.currentTarget.value))}
        />
        <button type="button" className="ggbutton mtopt" onClick={() => onLevel(MAX_LEVEL)}>Max level</button>
      </div>
      {cap && (
        <div className="mtnote">
          {cap.engineer} takes this module to level {cap.cap}.
          {u.level > cap.cap ? " No engineer's qualification allows the level set here." : ''}
        </div>
      )}
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [tab, setTab] = React.useState<'materials' | 'engineer'>('materials')
  const [open, setOpen] = React.useState<{ where: string; index: number } | null>(null)
  const [tick, setTick] = React.useState(0)

  if (!data) return null
  const names = bySaveName(data.modules)
  const counts = materialCounts(sv)
  const mods = upgradeables(sv, names)
  const current = open ? mods.find((m) => m.where === open.where && m.index === open.index) ?? null : null

  const changed = () => { setTick(tick + 1); redraw() }

  const grant = (id: number, n: number) => { if (setMaterial(sv, id, n)) changed() }
  const level = (u: Upgradeable, n: number) => { if (setLevel(u.module, n)) changed() }
  const type = (u: Upgradeable, t: number) => { if (setUpgradeType(u.module, t)) changed() }

  if (current) {
    return (
      <div className="mtbody">
        <Upgrade
          u={current} onBack={() => setOpen(null)}
          onType={(t) => type(current, t)} onLevel={(n) => level(current, n)}
        />
      </div>
    )
  }

  return (
    <div className="mtbody">
      <div className="ovrow mttabs">
        {(['materials', 'engineer'] as const).map((t) => (
          <button key={t} type="button" className={`ggbutton mttab${tab === t ? ' mton' : ''}`} onClick={() => setTab(t)}>
            {t === 'materials' ? 'Materials' : 'Engineer'}
          </button>
        ))}
      </div>
      {tab === 'materials'
        ? <Materials counts={counts} materials={data.materials} onSet={grant} />
        : (
          <>
            <div className="ovbar mtbarhead">Modifications</div>
            {mods.length
              ? (
                <div className="mtmodgrid">
                  {mods.map((u) => (
                    <ModuleRow key={`${u.where}-${u.index}`} u={u} onOpen={() => setOpen({ where: u.where, index: u.index })} />
                  ))}
                </div>
              )
              : <div className="mtnote">No module on this ship or in storage takes a modification.</div>}
          </>
        )}
    </div>
  )
}

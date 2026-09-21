/** Craft materials: the 32 counts of `ExtraData.materials` in declaration order, each out of 50
 * (`system/Save/ExtraData.as:18`, `globalSettings.as:51 materialCountMax`).
 */
import * as React from 'react'
import { MATERIAL_MAX, materialCounts, setMaterial } from '../../../lib/save/engineer'
import type { ScreenProps } from './types'
import './materials.css'

interface Material { id: number; key: string; type: string; name: string }
interface Data { materials: Material[] }

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


export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [, tick] = React.useReducer((k: number) => k + 1, 0)

  if (!data) return null
  const counts = materialCounts(sv)

  const grant = (id: number, n: number) => { if (setMaterial(sv, id, n)) { tick(); redraw() } }

  return (
    <div className="mtbody">
      <Materials counts={counts} materials={data.materials} onSet={grant} />
    </div>
  )
}

/** Craft materials, the game's own screen (`materials.png`, `materials-2.png`): the Cargo and
 * Materials tabs, each row a name, a count and a fill bar.
 *
 * Materials are the 32 counts of `ExtraData.materials` in declaration order
 * (`system/CraftMaterials/CraftMaterial.as:16-128`), each out of 50
 * (`system/globalSettings.as:51 materialCountMax`). Cargo is the goods the hold carries
 * (`system/Save/CargoData.as:15-21`).
 */
import * as React from 'react'
import { MATERIAL_MAX, materialCounts, setMaterial } from '../../../lib/save/engineer'
import { heldGoods, setGood } from '../../../lib/save/trade'
import { materialAtBest } from '../../../lib/save/best'
import { Wand } from '../wand'
import type { ScreenProps } from './types'
import './materials.css'

interface Material { id: number; key: string; type: string; name: string }
interface Good { key: string; name: string }
interface Data { materials: Material[]; goods: Good[] }

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

/** One row: the name, the count over its fill bar, the steps the Trade screen uses, and the
 * wand where the row has a settled best. */
function Row({ name, count, max, onSet, wand }: {
  name: string; count: number; max?: number; onSet: (n: number) => void; wand?: React.ReactNode
}) {
  return (
    <div className="mtrow">
      <div className="mtname">{name}</div>
      <button type="button" className="mtstep" onClick={() => onSet(count - 1)} aria-label={`Less ${name}`}>-</button>
      <div className="mtstack">
        <div className="mtcount">{count}{max ? ` / ${max}` : ''}</div>
        {max && <div className="mtfill"><i style={{ width: `${Math.min(100, (count / max) * 100)}%` }} /></div>}
      </div>
      <button type="button" className="mtstep" onClick={() => onSet(count + 1)} aria-label={`More ${name}`}>+</button>
      <div className="mtwand">{wand}</div>
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [tab, setTab] = React.useState<'cargo' | 'materials'>('materials')
  const [, tick] = React.useReducer((k: number) => k + 1, 0)

  if (!data) return null
  const changed = () => { tick(); redraw() }
  const counts = materialCounts(sv)
  const held = heldGoods(sv)

  const grant = (id: number, n: number) => { if (setMaterial(sv, id, n)) changed() }
  const stock = (key: string, n: number) => { setGood(sv, key, Math.max(0, n)); changed() }

  return (
    <div className="mtbody">
      <div className="ovrow mttabs">
        {(['cargo', 'materials'] as const).map((t) => (
          <button key={t} type="button" className={`ggbutton mttab${tab === t ? ' mton' : ''}`} onClick={() => setTab(t)}>
            {t === 'cargo' ? 'Cargo' : 'Materials'}
          </button>
        ))}
      </div>
      {tab === 'materials'
        ? data.materials.map((m) => (
          <Row
            key={m.id} name={m.name} count={counts[m.id]} max={MATERIAL_MAX}
            onSet={(n) => grant(m.id, n)}
            wand={(
              <Wand
                atBest={materialAtBest(counts[m.id])} what={m.name}
                onSet={() => grant(m.id, MATERIAL_MAX)}
              />
            )}
          />
        ))
        : data.goods.filter((g) => held.has(g.key)).map((g) => (
          <Row key={g.key} name={g.name} count={held.get(g.key) ?? 0} onSet={(n) => stock(g.key, n)} />
        ))}
      {tab === 'cargo' && held.size === 0 && <div className="mtnote">The hold is empty.</div>}
    </div>
  )
}

/** The player's own station, object 10 `OwnStationData` (`system/Save/OwnStationData.as:240-282`).
 *
 * Read-only. The station's effects are the game's own getters, which turn each service level into
 * the figure the station screen prints.
 */
import { AmfDouble, AmfObject, AmfVector, STATION, type AmfValue } from '../../../lib/save/codec'
import { extUtf, shipType } from '../../../lib/save/safety'
import type { ScreenProps } from './types'
import '../overview.css'

const SYSTEM = 0, NAME = 1, SEC_X = 2, SEC_Y = 3, TYPE = 4, PLANET = 5, DISTANCE = 6,
  GUARDS = 8, GUARDS_EXP = 9, GUARDS_DAMAGE = 10, CARGO_TYPE = 11, CARGO_COUNT = 12,
  CARGO_FOR_SELL = 13, MATERIALS = 15, LEVELS = 16, REPAIR = 28, TRADE_EXP = 35

const view = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}
const f64 = (o: AmfObject, i: number) => view(o, i).getFloat64(0)
const u32 = (o: AmfObject, i: number) => view(o, i).getUint32(0)
const vec = (o: AmfObject, i: number) => (o.raw[i][1] as AmfVector).items
/** A `Vector.<Number>` entry keeps its AMF3 double marker, so it arrives wrapped. */
const dbl = (v: AmfValue | undefined) => (v instanceof AmfDouble ? v.v : Number(v ?? 0))

const n = (v: number) => v.toLocaleString('en-US')
const up = (s: string | number) => String(s).toUpperCase()

/** `OwnStationChangeType.as:89` offers these six, in this order (`lang_en.json` `StationType0-5`). */
const STATION_TYPES = ['Trading station', 'Farm station', 'Industrial station', 'Military station',
  'HiTech station', 'Asteroid station']

/** `SS_moduleShop` (`OwnStationData.as:477-498`). */
const moduleShop = (lvl: number) => (lvl >= 1 && lvl <= 6 ? '*'.repeat(lvl) : '-')
const pick = (lvl: number, table: number[], zero: number) => (lvl >= 1 && lvl <= table.length ? table[lvl - 1] : zero)

/** Service name, its level field, its maximum and what the level buys.
 * Names are `lang_en.json` `OwnStationUpgr*Hdr` and `OwnStationCargoHeader`; maxima are
 * `ui/elements/OwnStationSubSystemPanel.as:44-58`; effects are the `SS_*` getters on
 * `system/Save/OwnStationData.as:402-535`. */
const SERVICES: { name: string; at: number; max: number; effect: (lvl: number) => string }[] = [
  { name: 'Modules Store', at: 0, max: 6, effect: (l) => `Modules availability: ${moduleShop(l)}` },
  {
    name: 'Trade Port', at: 1, max: 6,
    effect: (l) => `Max route distance: ${pick(l, [10, 12, 14, 16, 18, 20], 0)}`
      + `  Profit Bonus: ${pick(l, [0, 2, 4, 5, 6, 7], 0)}%`,
  },
  { name: 'Storage', at: 2, max: 6, effect: (l) => `Capacity: ${n(pick(l, [400, 800, 1600, 3200, 6400, 12800], 200))}` },
  { name: 'Warp drive', at: 3, max: 6, effect: (l) => `Max Distance: ${pick(l, [15, 19, 23, 27, 31, 35], 11)}` },
  { name: 'Guards Control Center', at: 4, max: 3, effect: (l) => `Max guard ships: ${pick(l, [1, 2, 3], 0)}` },
  { name: 'Bar', at: 5, max: 1, effect: (l) => (l ? 'Built' : 'Not built') },
  { name: 'Repair dock', at: 6, max: 1, effect: (l) => (l ? 'Built' : 'Not built') },
  { name: 'Spaceships shop', at: 7, max: 1, effect: (l) => (l ? 'Built' : 'Not built') },
]

/** The five repair costs, in the order `writeExternal` puts them (`OwnStationData.as:270-274`). */
const REPAIRS = ['Bouxite', 'Coltan', 'Uraninite', 'Bromellite', 'Lepidolite']

function Table({ heads, rows }: { heads: string[]; rows: (string | number)[][] }) {
  return (
    <div className="ovtab">
      <div className="ovrow">{heads.map((h) => <div key={h} className="ovwhite">{up(h)}</div>)}</div>
      {rows.map((r, i) => (
        <div key={i} className="ovrow ovsmall">{r.map((c, j) => <div key={j}>{up(c)}</div>)}</div>
      ))}
    </div>
  )
}

export default function Screen({ sv }: ScreenProps) {
  const st = sv.objs[STATION] as AmfObject
  const name = extUtf(st, NAME)
  if (!name) return <div className="ovdesc">You do not own a space station.</div>

  const repairs = REPAIRS.map((r, i) => [r, n(u32(st, REPAIR + i))] as [string, string])
  const damaged = repairs.some(([, v]) => v !== '0')
  const guards = vec(st, GUARDS)
  const cargoType = vec(st, CARGO_TYPE)
  const materials = vec(st, MATERIALS).reduce((sum: number, v) => sum + Number(v), 0)
  const stored = vec(st, CARGO_COUNT).reduce((sum: number, v) => sum + Number(v), 0)

  return (
    <div className="ovcols">
      <div>
        <div className="ovbar">{up(name)}</div>
        <Table
          heads={['Property', 'Value']}
          rows={[
            ['System', extUtf(st, SYSTEM) || 'None'],
            ['Sector', `${f64(st, SEC_X).toFixed(1)}, ${f64(st, SEC_Y).toFixed(1)}`],
            ['Station type', STATION_TYPES[f64(st, TYPE)] ?? String(f64(st, TYPE))],
            ['Planet', n(u32(st, PLANET))],
            ['Distance from star', `${n(u32(st, DISTANCE))} Ls`],
            ['Trading points', n(Math.floor(f64(st, TRADE_EXP)))],
            ['Storage', `${n(stored)} in ${cargoType.length} goods`],
            ['Craft materials', n(materials)],
          ]}
        />
        {damaged && (
          <>
            <div className="ovbar">REPAIR</div>
            <div className="ovdesc">This station is damaged and needs to be repaired.</div>
            <Table heads={['Resource', 'Needed']} rows={repairs} />
          </>
        )}
        <div className="ovbar">GUARDS</div>
        {guards.length === 0
          ? <div className="ovdesc">No guard ships.</div>
          : (
            <Table
              heads={['Ship', 'Experience', 'Damage']}
              rows={guards.map((g, i) => [
                shipType(g as AmfObject),
                n(Math.floor(dbl(vec(st, GUARDS_EXP)[i]))),
                n(Math.floor(dbl(vec(st, GUARDS_DAMAGE)[i]))),
              ])}
            />
          )}
      </div>
      <div>
        <div className="ovbar">SERVICES</div>
        <Table
          heads={['Service', 'Level', 'Effect']}
          rows={SERVICES.map((s) => {
            const lvl = u32(st, LEVELS + s.at)
            return [s.name, `${lvl} / ${s.max}`, s.effect(lvl)]
          })}
        />
        <div className="ovbar">STORAGE</div>
        {cargoType.length === 0
          ? <div className="ovdesc">The storage is empty.</div>
          : (
            <Table
              heads={['Resource', 'Cargo', 'For sale']}
              rows={cargoType.map((g, i) => [
                String(g),
                n(Number(vec(st, CARGO_COUNT)[i] ?? 0) || 0),
                n(Number(vec(st, CARGO_FOR_SELL)[i] ?? 0) || 0),
              ])}
            />
          )}
      </div>
    </div>
  )
}

/** The home page's nine cards, read straight out of the decoded save.
 *
 * Card order and keys are the plan's table (`docs/save-editor-plan.md`, "The home page");
 * `editor/public/data/save-data.json` carries the name and sprite for each key.
 */
import {
  AmfObject, AmfVector, CARGO, EXTRA, HANGAR, PLAYER, PROGRESS, QUESTS, SCAN, SHIP, STATION, STORAGE,
  getCredits, type AmfValue, type Save,
} from './codec'

const obj = (sv: Save, i: number) => sv.objs[i] as AmfObject
const bytes = (o: AmfObject, i: number) => o.raw[i][1] as Uint8Array
const view = (o: AmfObject, i: number) => { const b = bytes(o, i); return new DataView(b.buffer, b.byteOffset, b.byteLength) }

const f64 = (o: AmfObject, i: number) => view(o, i).getFloat64(0)
const i32 = (o: AmfObject, i: number) => view(o, i).getInt32(0)
const i8 = (o: AmfObject, i: number) => view(o, i).getInt8(0)
/** A `writeUTF` field: a big-endian `uint16` length then that many UTF-8 bytes. */
const utf = (o: AmfObject, i: number) => new TextDecoder().decode(bytes(o, i).subarray(2))
const vec = (o: AmfObject, i: number) => o.raw[i][1] as AmfVector
const len = (o: AmfObject, i: number) => vec(o, i).items.length
const sum = (items: AmfValue[]) => items.reduce((n: number, v) => n + Number(v), 0)

/** `questsActiveID` is three fixed slots; an empty one holds `uint.MAX_VALUE`
 * (`system/Save/QuestsSave.as:23-26`). */
const activeQuests = (o: AmfObject, i: number) =>
  vec(o, i).items.filter((v) => Number(v) !== 0xffffffff).length

/** `ShipData` is `Type`, `Station`, `Modules`, `color` (`system/Save/ShipData.as:12-18`). */
const shipModules = (s: AmfValue) => len(s as AmfObject, 2)

/** `ExtraData` writes 32 material counts, then `karma` (`system/Save/ExtraData.as:191-217`). */
const MATERIALS = 32, KARMA = 32, LAST_SYSTEM = 46

export interface HomeCard {
  key: string
  stats: [label: string, value: string][]
}

const n = (v: number) => v.toLocaleString('en-US')

/** Every card's figures, computed from the save each time the home page renders. */
export function cardFigures(sv: Save): HomeCard[] {
  const player = obj(sv, PLAYER), scan = obj(sv, SCAN), cargo = obj(sv, CARGO)
  const storage = obj(sv, STORAGE), progress = obj(sv, PROGRESS), extra = obj(sv, EXTRA)
  const ship = obj(sv, SHIP), quests = obj(sv, QUESTS), station = obj(sv, STATION)
  const hangar = (sv.objs[HANGAR] as AmfVector).items

  const materials: number[] = []
  for (let i = 0; i < MATERIALS; i++) materials.push(i8(extra, i))
  const stationName = utf(station, 1)

  return [
    { key: 'ship', stats: [['Ship', utf(ship, 0)], ['Modules', n(shipModules(ship))]] },
    { key: 'hangar', stats: [['Ships', n(hangar.length)], ['Modules', n(sum(hangar.map(shipModules)))]] },
    { key: 'storage', stats: [['Modules', n(len(storage, 0))], ['Station', n(new Set(vec(storage, 1).items.map(String)).size)]] },
    { key: 'cargo', stats: [['Credits', n(getCredits(sv))], ['Cargo', n(sum(vec(cargo, 2).items))], ['Goods', n(len(cargo, 1))]] },
    { key: 'materials', stats: [['Materials', n(sum(materials))], ['Kinds', n(materials.filter(Boolean).length)]] },
    {
      key: 'galaxy',
      stats: [
        ['Position', `${f64(player, 0).toFixed(1)}, ${f64(player, 1).toFixed(1)}`],
        ['Explored systems', n(len(scan, 0) + len(scan, 1))],
        ['System', utf(extra, LAST_SYSTEM)],
      ],
    },
    { key: 'quests', stats: [['Quests', n(len(quests, 1))], ['Active', n(activeQuests(quests, 2))], ['Main job', n(i32(progress, 5))]] },
    { key: 'station', stats: [['Station', stationName || 'None'], ['System', utf(station, 0) || 'None'], ['Ships', n(len(station, 8))]] },
    {
      key: 'record',
      stats: [['Reputation', n(len(progress, 0))], ['Fines', n(len(progress, 3))], ['Karma Level', n(i8(extra, KARMA))]],
    },
  ]
}

/** The player's record: object 5 `ProgressData` (`system/Save/ProgressData.as:322-332`) and
 * object 6 `karma` and `arenaLVL` (`system/Save/ExtraData.as:201-204`).
 *
 * Every figure here is one the save holds, so every figure here can be typed.
 */
import { AmfObject, AmfVector, EXTRA, PROGRESS, type Save } from './codec'

/** `ProgressData.writeExternal` order (`system/Save/ProgressData.as:322-332`). */
export const REPUTATION = 0, BOUNTY = 2, FINES = 3, PLAY_TIME = 4, STORY_QUEST = 5,
  TRADE = 6, BATTLE = 7, DISCOVERY = 8
/** `ExtraData` writes 32 material counts, then karma, drunk, fleetMode, arenaLVL
 * (`system/Save/ExtraData.as:194-204`). */
export const KARMA = 32, ARENA = 35

/** The three rank ladders' top band, above which the game calls the player Elite. The test is a
 * strict greater-than (`ui/screens/MissionsShipScreen.as:601`), so a wand writes one past it;
 * `GetRank` itself reads the title from `>=` (`system/Ranks/TraderRanks.as:52-66`). */
export const ELITE = { trade: 600000000, combat: 79990000, exploration: 79990000 }

/** `arenaLVL` indexes `ArenaLevel.Levels`, 83 of them (`ui/screens/ShipInfoScreen.as:230`). */
export const ARENA_LEVELS = 83
/** `ExtraData.AddKarma` clamps to -100..100 (`system/Save/ExtraData.as:79-85`). */
export const KARMA_MIN = -100, KARMA_MAX = 100
/** `ProgressData.AddStationReputation` clamps to 0..100 (`ProgressData.as:292-298`). */
export const REPUTATION_MAX = 100

const progress = (sv: Save) => sv.objs[PROGRESS] as AmfObject
const extra = (sv: Save) => sv.objs[EXTRA] as AmfObject

const view = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}
const bytes = (write: (v: DataView) => void, size: number) => {
  const v = new DataView(new ArrayBuffer(size))
  write(v)
  return new Uint8Array(v.buffer)
}

export const f64 = (o: AmfObject, i: number) => view(o, i).getFloat64(0)
export const i32 = (o: AmfObject, i: number) => view(o, i).getInt32(0)

/** One rank ladder or the karma ladder, as `save-data.json` carries it: value and the game's name,
 * worst to best. */
export type Ladder = [value: number, name: string][]

/** `TraderRanks.GetRank` and its two twins (`system/Ranks/TraderRanks.as:52-66`): the last band
 * the value reaches. */
export const getRank = (ladder: Ladder, v: number) =>
  ladder.reduce((best, [from, name], i) => (i && v >= from ? name : best), ladder[0]?.[1] ?? '')

/** `MoralityRanks.GetRank` (`system/Ranks/MoralityRanks.as:41-55`) passes a band rather than
 * reaching it. */
export const moralityRank = (ladder: Ladder, v: number) =>
  ladder.reduce((best, [from, name], i) => (i && v > from ? name : best), ladder[0]?.[1] ?? '')

// ------------------------------------------------------- reading

export const karma = (sv: Save) => view(extra(sv), KARMA).getInt8(0)
export const arena = (sv: Save) => view(extra(sv), ARENA).getUint8(0)
export const progressOf = (sv: Save, field: number) => f64(progress(sv), field)
export const playTime = (sv: Save) => i32(progress(sv), PLAY_TIME)
export const mainJob = (sv: Save) => i32(progress(sv), STORY_QUEST)

export const stationRows = (sv: Save) =>
  (progress(sv).raw[REPUTATION][1] as AmfVector).items.filter((r): r is AmfObject => r instanceof AmfObject)
export const reputationOf = (row: AmfObject) => f64(row, 1)

// ------------------------------------------------------- writing

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** One of the three rank point totals, which the game never lets fall below zero. */
export const setProgress = (sv: Save, field: number, v: number) => {
  progress(sv).raw[field] = ['D', bytes((d) => d.setFloat64(0, Math.max(0, v)), 8)]
}
export const setPlayTime = (sv: Save, seconds: number) => {
  progress(sv).raw[PLAY_TIME] = ['I', bytes((d) => d.setInt32(0, clamp(Math.round(seconds), 0, 0x7fffffff)), 4)]
}
/** The story quest's step; the game reads a negative as not started (`ProgressData.as:31`). */
export const setMainJob = (sv: Save, step: number) => {
  progress(sv).raw[STORY_QUEST] = ['I', bytes((d) => d.setInt32(0, clamp(Math.round(step), -1, 0x7fffffff)), 4)]
}
export const setKarma = (sv: Save, v: number) => {
  extra(sv).raw[KARMA] = ['b', bytes((d) => d.setInt8(0, clamp(Math.round(v), KARMA_MIN, KARMA_MAX)), 1)]
}
export const setArena = (sv: Save, v: number) => {
  extra(sv).raw[ARENA] = ['b', bytes((d) => d.setUint8(0, clamp(Math.round(v), 0, ARENA_LEVELS - 1)), 1)]
}
export const setReputation = (row: AmfObject, v: number) => {
  row.raw[1] = ['D', bytes((d) => d.setFloat64(0, clamp(v, 0, REPUTATION_MAX)), 8)]
}

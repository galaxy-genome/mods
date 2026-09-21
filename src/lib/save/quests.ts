/** Object 9 `QuestsSave`: the quest rows and the completed flag the quest screen writes.
 *
 * `QuestsSave` is `balance`, `Quests`, `questsActiveID` (`system/Save/QuestsSave.as:114-119`);
 * each `QuestSaveData` is `ID`, `isCompleted`, `step`, `reserved`
 * (`system/Save/QuestSaveData.as:27-33`, `EXT.QuestSaveData = 'uBIu'`).
 */
import { AmfObject, AmfVector, QUESTS, type ExtField, type Save } from './codec'

const ID = 0, COMPLETED = 1, STEP = 2

/** The step a completed quest carries (`Main.as:610-611`). `SaveQuestStep` treats a step at or past
 * the quest's length as completed (`system/Save/QuestsSave.as:95-105`). */
export const COMPLETED_STEP = 10000
/** `QuestSaveData.step` before a quest starts (`system/Save/QuestSaveData.as:14`). */
export const UNSTARTED_STEP = -1
/** An empty `questsActiveID` slot (`system/Save/QuestsSave.as:23-26`). */
export const NO_QUEST = 0xffffffff

const quests = (sv: Save) => (sv.objs[QUESTS] as AmfObject).raw[1][1] as AmfVector

const view = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}

const field = (code: string, write: (v: DataView) => void): ExtField => {
  const b = new DataView(new ArrayBuffer(code === 'B' ? 1 : 4))
  write(b)
  return [code, new Uint8Array(b.buffer)]
}

const uint = (n: number) => field('u', (v) => v.setUint32(0, n))
const int = (n: number) => field('I', (v) => v.setInt32(0, n))
const bool = (b: boolean) => field('B', (v) => v.setUint8(0, b ? 1 : 0))

export interface QuestRow { id: number; completed: boolean; step: number }

/** Every quest the save carries a row for, in save order. */
export function questRows(sv: Save): QuestRow[] {
  return quests(sv).items.map((item) => {
    const o = item as AmfObject
    return {
      id: view(o, ID).getUint32(0),
      completed: !!view(o, COMPLETED).getUint8(0),
      step: view(o, STEP).getInt32(0),
    }
  })
}

/** The quests the player has accepted, empty slots dropped. */
export function activeQuestIds(sv: Save): number[] {
  const v = (sv.objs[QUESTS] as AmfObject).raw[2][1] as AmfVector
  return v.items.map(Number).filter((id) => id !== NO_QUEST)
}

/**
 * Marks one quest completed or not started, adding a row when the save has none, which is what
 * `SaveQuestStep` does for a quest it has never seen (`system/Save/QuestsSave.as:88-92`).
 */
export function setQuestCompleted(sv: Save, id: number, completed: boolean) {
  const items = quests(sv).items
  let row = items.find((item) => view(item as AmfObject, ID).getUint32(0) === id) as AmfObject | undefined
  if (!row) {
    if (!completed) return
    row = new AmfObject('QuestSaveData', false, true)
    row.raw = [uint(id), bool(false), int(UNSTARTED_STEP), uint(0)]
    items.push(row)
  }
  row.raw[COMPLETED] = bool(completed)
  row.raw[STEP] = int(completed ? COMPLETED_STEP : UNSTARTED_STEP)
}

/** The one gate between an edited save and a downloaded file.
 *
 * The game's loader silently discards a save it dislikes and disables Play, so every screen hands
 * its edits to `prepareDownload` and downloads only what comes back.
 */
import { CARGO, HANGAR, decode, encode, getCredits, setCredits, type AmfObject, type AmfVector, type Save } from './codec'

/** `CargoData.balance` is a `uint` (`system/Save/CargoData.as:13`) and the loader resets a negative
 * balance to the default (`system/Save/Save.as:321-323`). */
export const BALANCE_MAX = 0xffffffff

/** A refusal that names the field it refused, so a screen can point at it. */
export class SaveUnsafe extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'SaveUnsafe'
    this.field = field
  }
}

/** One `writeUTF` field of an externalizable object, by its index in `EXT[cls]`. */
export function extUtf(o: AmfObject, i: number): string {
  const b = o.raw[i][1] as Uint8Array
  return new TextDecoder().decode(b.subarray(2))
}

/** Ship type and station of one `ShipData` (`system/Save/ShipData.as:12-18`, `EXT.ShipData = 'UUOu'`). */
export const shipType = (o: AmfObject) => extUtf(o, 0)
export const shipStation = (o: AmfObject) => extUtf(o, 1)

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])

export interface Edits {
  /** `CargoData.balance`, object 3. */
  balance?: number
}

/**
 * Applies `edits`, encodes, then re-reads the bytes and refuses anything the loader would reject.
 * Returns the bytes to download; throws `SaveUnsafe` naming the field.
 */
export function prepareDownload(sv: Save, edits: Edits = {}): Uint8Array {
  if (edits.balance !== undefined) {
    const n = edits.balance
    if (!Number.isInteger(n) || n < 0 || n > BALANCE_MAX) throw new SaveUnsafe('balance', `balance ${n} is outside 0 to ${BALANCE_MAX}`)
    setCredits(sv, n)
  }
  const bytes = encode(sv)

  let back: Save
  try {
    back = decode(bytes)
  } catch (e) {
    throw new SaveUnsafe('objects', `the save does not read back: ${(e as Error).message}`)
  }
  if (back.objs.length !== 11) throw new SaveUnsafe('objects', `expected eleven objects, read ${back.objs.length}`)
  // A byte-identical re-encode is only possible when all eleven objects read cleanly to the end of the buffer.
  if (!same(encode(back), bytes)) throw new SaveUnsafe('objects', 'the eleven objects do not read cleanly to the end of the buffer')

  if (back.owner !== sv.owner) throw new SaveUnsafe('owner', 'the owner id changed')

  const balance = getCredits(back)
  if (!Number.isInteger(balance) || balance < 0 || balance > BALANCE_MAX) throw new SaveUnsafe('balance', `balance ${balance} is outside 0 to ${BALANCE_MAX}`)
  if ((back.objs[CARGO] as AmfObject).cls !== 'CargoData') throw new SaveUnsafe('balance', 'object 3 is not CargoData')

  // The loader prunes a hangar entry with no station (`system/Save/Save.as:387-394`).
  const hangar = back.objs[HANGAR] as AmfVector
  hangar.items.forEach((item, i) => {
    if (!shipStation(item as AmfObject)) throw new SaveUnsafe('Station', `hangar ship ${i + 1} has no station`)
  })

  // Without the closing byte the SharedObject fails to load and the game disables Play (`save-format.md`).
  if (back.fmt === 'lso' && bytes[bytes.length - 1] !== 0) throw new SaveUnsafe('BYTES', 'the SharedObject container does not end in its closing byte')

  return bytes
}

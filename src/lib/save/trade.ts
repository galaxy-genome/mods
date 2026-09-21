/** The market's goods vectors and its reference prices.
 *
 * `CargoData` keeps goods as parallel name and count vectors (`system/Save/CargoData.as:15-21`).
 * Station stock is generated from the station and a seed and never reaches the save
 * (`system/Goods/MarketGenerator.as:43`), so the editor grants goods directly and the prices
 * here are the generator's own formula shown for reference only.
 */
import { CARGO, type AmfObject, type AmfVector, type Save } from './codec'

/** `MarketGenerator.baseCost` (`system/Goods/MarketGenerator.as:11`). */
export const BASE_COST = 1000

/** A station's selling coefficients by position in its list (`MarketGenerator.as:21,:64`). */
export const SELL_KOEF = [0.76, 0.84, 0.92]

/** The coefficient and demand a good carries at the position `i` of its market section
 * (`MarketGenerator.as:64-78`): the first row is the deepest discount and the strongest demand. */
export const koefAt = (i: number) => SELL_KOEF[Math.min(i, 2)]
export const demandAt = (i: number) => (i === 0 ? 3 : i === 1 ? 2 : 1)

/** `price = basicCost * baseCost * koef` (`MarketGenerator.as:64`). */
export const priceOf = (basicCost: number, i: number) => Math.round(basicCost * BASE_COST * koefAt(i))

/** The margin the station's coefficient leaves, as the Trade screen prints it. */
export const profitOf = (i: number) => Math.round((1 - koefAt(i)) * 100)

const cargo = (sv: Save) => sv.objs[CARGO] as AmfObject
const names = (sv: Save) => cargo(sv).raw[1][1] as AmfVector
const counts = (sv: Save) => cargo(sv).raw[2][1] as AmfVector

/** Every good held, by its `GoodsType._typeName`. */
export function heldGoods(sv: Save): Map<string, number> {
  const held = new Map<string, number>()
  names(sv).items.forEach((t, i) => held.set(String(t), Number(counts(sv).items[i])))
  return held
}

export const cargoTotal = (sv: Save) => counts(sv).items.reduce((n: number, c) => n + Number(c), 0)

/** Sets one good's count, adding or dropping its pair of entries as needed. */
export function setGood(sv: Save, type: string, count: number) {
  const n = names(sv), c = counts(sv)
  const at = n.items.findIndex((t) => String(t) === type)
  if (count <= 0) {
    if (at >= 0) { n.items.splice(at, 1); c.items.splice(at, 1) }
    return
  }
  if (at < 0) { n.items.push(type); c.items.push(count); return }
  c.items[at] = count
}

/** Adds or removes `qty` of one good. The price is what the market prints and nothing is paid
 * for it, so the balance stays where the credits screen left it. */
export function trade(sv: Save, type: string, qty: number, side: 'buy' | 'sell') {
  if (qty <= 0) return
  const held = heldGoods(sv).get(type) ?? 0
  const n = side === 'sell' ? Math.min(qty, held) : qty
  if (n <= 0) return
  setGood(sv, type, side === 'buy' ? held + n : held - n)
}

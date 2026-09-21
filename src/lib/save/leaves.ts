/** A decoded save as one flat map of leaf paths, for the tests that assert an edit wrote exactly
 * the fields it claims. A path is the route the encoder walks: object index, then field index and
 * its `EXT` type code, then vector positions.
 */
import { AmfObject, AmfVector, type AmfValue, type Save } from './codec'

const hex = (b: Uint8Array) => [...b].map((n) => n.toString(16).padStart(2, '0')).join('')

export function leaves(sv: Save): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (v: AmfValue, path: string) => {
    if (v instanceof AmfObject) v.raw.forEach(([tag, x], i) => walk(x as AmfValue, `${path}/${i}:${tag}`))
    else if (v instanceof AmfVector) v.items.forEach((x, i) => walk(x, `${path}/${i}`))
    else if (v instanceof Uint8Array) out.set(path, hex(v))
    else out.set(path, String(v))
  }
  sv.objs.forEach((o, i) => walk(o, String(i)))
  return out
}

/** The leaf paths an edit added, removed or rewrote. */
export function changed(before: Map<string, string>, after: Map<string, string>): string[] {
  const out = new Set<string>()
  for (const [k, v] of before) if (after.get(k) !== v) out.add(k)
  for (const [k, v] of after) if (before.get(k) !== v) out.add(k)
  return [...out].sort()
}

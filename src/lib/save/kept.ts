/** The loaded save, kept across a refresh.
 *
 * What is stored is the encoded save itself, so what comes back is byte for byte what a download
 * would have written, plus the filename and the screen in view. It rides the editor's own
 * throw-safe `localStorage` wrapper (`src/store/editor.ts:87-93`); a save is a few kilobytes, far
 * inside the quota the mods editor shares.
 */
import { local } from '../../store/editor'
import { decode, encode, type Save } from './codec'

const KEY = 'gg.save'

export interface Kept { name: string; bytes: string; open: string; edited: boolean }

/** Base64, in chunks, because a save is longer than an argument list wants to be. */
function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export function keep(sv: Save, name: string, open: string, edited: boolean) {
  local.set(KEY, { name, bytes: toBase64(encode(sv)), open, edited } satisfies Kept)
}

export const drop = () => local.set(KEY, null)

/** The save kept last, decoded, or null where there is none and where what was kept no longer
 * reads: a stored save that cannot be decoded is dropped rather than blocking the editor. */
export function kept(): { sv: Save; name: string; open: string; edited: boolean } | null {
  const held = local.get<Kept>(KEY)
  if (!held?.bytes) return null
  try {
    return { sv: decode(fromBase64(held.bytes)), name: held.name, open: held.open ?? '', edited: !!held.edited }
  } catch {
    drop()
    return null
  }
}

/** How much room the kept save takes, for the reader and for the tests. */
export const keptBytes = () => (local.get<Kept>(KEY)?.bytes.length ?? 0)

/** `navigator.storage.persist()` (`src/store/editor.ts:344-348`): asks the browser to keep what
 * is stored. It answers false where it will not promise. */
export const askPersist = () => globalThis.navigator?.storage?.persist?.().catch(() => false) ?? Promise.resolve(false)

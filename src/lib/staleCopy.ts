import type { Mod } from './types'

/** The library entry an unmodified copy is out of date with: same entry, other version. Modified copies and copies of removed entries never are. */
export function staleEntry<E extends { id: string; version: string }>(mod: Mod, entries: E[]): E | undefined {
  const c = mod.meta.community
  if (!c || mod.meta.modified) return
  const entry = entries.find((e) => e.id === c.entryId)
  return entry && entry.version !== mod.meta.version ? entry : undefined
}

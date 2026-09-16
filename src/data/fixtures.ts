// Test fixtures shared by the data layer tests.
import { newQuestView, newStep } from '../lib/factory.ts'
import { modFromParts } from '../lib/mods.ts'
import type { HistoryEntry, Mod, TexturePart } from '../lib/types.ts'
import { CURRENT_SCHEMA } from './migrations.ts'

let n = 0
export const dbName = () => `test-${Math.random().toString(36).slice(2)}-${++n}`

export function texture(name: string, byte: number): TexturePart {
  return { id: name, name, png: `data:image/png;base64,${btoa(String.fromCharCode(137, 80, 78, 71, byte))}`, xml: `<atlas n="${byte}"/>` }
}

export function mod(id: string, title = id, textures: TexturePart[] = []): Mod {
  const view = newQuestView(title, { settings: {}, steps: [newStep({ name: 'Go' })], rumors: [] })
  return modFromParts([view], { id, title, favorite: true }, textures)
}

export function entry(m: Mod, patch: Partial<HistoryEntry> = {}): HistoryEntry {
  const stored = { ...m, textures: [] }
  return { id: crypto.randomUUID(), modId: m.meta.id, name: '', auto: true, createdAt: 0, bytes: JSON.stringify(stored).length, mod: stored, revision: 1, schema: CURRENT_SCHEMA, ...patch }
}

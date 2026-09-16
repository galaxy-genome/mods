/**
 * Record shape is versioned per record: every `mods` and `history` record carries `schema`. MIGRATIONS[n - 1] turns a
 * schema n record's `mod` JSON into schema n + 1, given the other stored mods. Migrations are pure, so records from an
 * opened zip upgrade the same way.
 */
import { type PlaceSource, modDependencies } from '../lib/dependencies.ts'

type Json = Record<string, unknown>
export type Migration = (mod: Json, all: Json[]) => Json

/** 1 → 2: `meta.requires` lists the mods whose places the mod's quests use. */
export const addRequires: Migration = (mod, all) => {
  const meta = mod.meta as Json | undefined
  if (!meta || !Array.isArray(mod.quests) || meta.requires) return mod
  const deps = modDependencies(mod as unknown as PlaceSource, all.filter((m) => m.meta) as unknown as PlaceSource[])
  return deps.length ? { ...mod, meta: { ...meta, requires: deps.map((d) => d.requirement) } } : mod
}

export const MIGRATIONS: Migration[] = [addRequires]

export const CURRENT_SCHEMA = MIGRATIONS.length + 1

/** Runs the pending migrations on a record's mod. A record newer than the app comes back untouched. */
export function migrate<R extends { mod: unknown; schema?: number }>(record: R, migrations = MIGRATIONS, all: unknown[] = []): R & { schema: number } {
  const from = record.schema ?? 1
  let mod = record.mod as Json
  for (let n = from; n <= migrations.length; n++) mod = migrations[n - 1](mod, all as Json[])
  return { ...record, mod, schema: Math.max(from, migrations.length + 1) } as R & { schema: number }
}

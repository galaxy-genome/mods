import { dataUrlBytes, toBase64 } from '../lib/mods.ts'
import type { HistoryEntry, Mod, StoredMod, TexturePart } from '../lib/types.ts'
import { del, get, getAll, openDb, put, request, tx, type StoreName } from './db.ts'
import { getGalaxy } from '../features/map/galaxy.ts'
import { type ModDeps, modDeps } from '../lib/modDeps.ts'
import { CURRENT_SCHEMA, migrate } from './migrations.ts'

export interface ModRecord {
  mod: StoredMod
  revision: number
  updatedAt: number
  deletedAt: number | null
  schema: number
  /** Derived from the mod when saved; readers recompute it with `modDeps`. */
  deps?: ModDeps
}

export interface TextureRecord {
  png: Blob
  xml: string
}

export interface DeletedMod {
  id: string
  title: string
  deletedAt: number
}

export const HISTORY_AUTO_KEEP = 20
export const DELETED_KEEP_MS = 30 * 24 * 3600_000

const hashes = new WeakMap<TexturePart, string>()

/** SHA-256 of the PNG bytes followed by the XML, as hex. Texture parts are never edited in place, so the hash is cached per object. */
export async function textureHash(t: TexturePart) {
  const hit = hashes.get(t)
  if (hit) return hit
  const png = dataUrlBytes(t.png)
  const xml = new TextEncoder().encode(t.xml)
  const bytes = new Uint8Array(png.length + xml.length)
  bytes.set(png)
  bytes.set(xml, png.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
  hashes.set(t, hex)
  return hex
}

export async function toStored(mod: Mod): Promise<StoredMod> {
  return { ...mod, textures: await Promise.all(mod.textures.map(async (t) => ({ id: t.id, name: t.name, hash: await textureHash(t) }))) }
}

export const isQuotaError = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')

/** Every read and write of the editor's database. Methods reject on failure; the store turns failures into save states. */
export class Repository {
  /** Makes every write fail as a full disk would, for manual checks. */
  simulateQuota = false
  readonly db: IDBDatabase

  constructor(db: IDBDatabase) {
    this.db = db
  }

  static async open(name?: string, factory?: IDBFactory) {
    return new Repository(await openDb(name, factory))
  }

  close() {
    this.db.close()
  }

  tx<T>(stores: StoreName[], mode: IDBTransactionMode, body: (t: IDBTransaction) => Promise<T> | T) {
    if (mode === 'readwrite' && this.simulateQuota) return Promise.reject(new DOMException('Simulated full storage', 'QuotaExceededError'))
    return tx(this.db, stores, mode, body)
  }

  /** Non-deleted mods with their textures, deleted mods as summaries, and every history entry. Old records are migrated and written back. */
  async loadAll() {
    const { records, history, byHash } = await this.tx(['mods', 'history', 'textures'], 'readonly', async (t) => {
      const values = await getAll<TextureRecord>(t, 'textures')
      const keys = await request(t.objectStore('textures').getAllKeys())
      return {
        records: await getAll<ModRecord>(t, 'mods'),
        history: await getAll<HistoryEntry>(t, 'history'),
        byHash: new Map(keys.map((k, i) => [k as string, values[i]])),
      }
    })
    const stale = [...records, ...history].filter((r) => (r.schema ?? 1) < CURRENT_SCHEMA)
    const upgraded = records.map((r) => migrate(r, undefined, records.map((o) => o.mod))) as ModRecord[]
    const entries = history.map((h) => migrate(h, undefined, records.map((o) => o.mod))) as HistoryEntry[]
    if (stale.length) {
      await this.tx(['mods', 'history', 'meta'], 'readwrite', async (t) => {
        for (const r of upgraded) if (records.find((o) => o.mod.meta.id === r.mod.meta.id)!.schema < CURRENT_SCHEMA) await put(t, 'mods', r)
        for (const h of entries) if (history.find((o) => o.id === h.id)!.schema < CURRENT_SCHEMA) await put(t, 'history', h)
      }).catch(() => {})
    }
    const highest = Math.max(CURRENT_SCHEMA, ...upgraded.map((r) => r.schema), ...entries.map((h) => h.schema))
    if (highest > ((await this.getMeta<number>('schemaVersion')) ?? 0)) await this.setMeta('schemaVersion', highest).catch(() => {})
    const cache = new Map<string, Promise<TexturePart | null>>()
    const mods = await Promise.all(upgraded.filter((r) => r.deletedAt == null).map(async (record) => ({ record, mod: await hydrate(record.mod, byHash, cache) })))
    const deleted: DeletedMod[] = upgraded.filter((r) => r.deletedAt != null).map((r) => ({ id: r.mod.meta.id, title: r.mod.meta.title, deletedAt: r.deletedAt! }))
    return { mods, deleted, history: entries }
  }

  /** History entries and deleted-mod summaries, without loading textures. */
  async loadIndex() {
    return this.tx(['mods', 'history'], 'readonly', async (t) => ({
      deleted: (await getAll<ModRecord>(t, 'mods')).filter((r) => r.deletedAt != null).map((r): DeletedMod => ({ id: r.mod.meta.id, title: r.mod.meta.title, deletedAt: r.deletedAt! })),
      history: (await getAll<HistoryEntry>(t, 'history')).map((h) => migrate(h)) as HistoryEntry[],
    }))
  }

  /** One mod record with textures, deleted or not; null when there is none. */
  async loadMod(id: string) {
    const found = await this.tx(['mods', 'textures'], 'readonly', async (t) => {
      const record = await get<ModRecord>(t, 'mods', id)
      if (!record) return null
      const byHash = new Map<string, TextureRecord>()
      for (const ref of record.mod.textures) {
        const tex = await get<TextureRecord>(t, 'textures', ref.hash)
        if (tex) byHash.set(ref.hash, tex)
      }
      return { record, byHash }
    })
    if (!found) return null
    const record = migrate(found.record) as ModRecord
    return { record, mod: await hydrate(record.mod, found.byHash) }
  }

  /** Writes a mod with the next revision, stores textures it brings, and drops textures nothing references. */
  async saveMod(mod: Mod, now = Date.now(), schema = CURRENT_SCHEMA): Promise<ModRecord> {
    const stored = await toStored(mod)
    return this.tx(['mods', 'textures', 'history'], 'readwrite', async (t) => {
      const previous = await get<ModRecord>(t, 'mods', mod.meta.id)
      await putTextures(t, mod, stored)
      const record: ModRecord = { mod: stored, revision: (previous?.revision ?? 0) + 1, updatedAt: now, deletedAt: null, schema: Math.max(schema, previous?.schema ?? 0), deps: modDeps(mod, { galaxy: getGalaxy() }) }
      await put(t, 'mods', record)
      if (dropsTextures(previous, stored)) await collectTextures(t)
      return record
    })
  }

  /** Writes many mods at once, as seeding and Open do. */
  async saveMods(mods: Mod[], now = Date.now()) {
    const stored = await Promise.all(mods.map(toStored))
    return this.tx(['mods', 'textures', 'history'], 'readwrite', async (t) => {
      const records: ModRecord[] = []
      for (let i = 0; i < mods.length; i++) {
        const previous = await get<ModRecord>(t, 'mods', mods[i].meta.id)
        await putTextures(t, mods[i], stored[i])
        const record: ModRecord = { mod: stored[i], revision: (previous?.revision ?? 0) + 1, updatedAt: now, deletedAt: null, schema: CURRENT_SCHEMA, deps: modDeps(mods[i], { galaxy: getGalaxy() }) }
        await put(t, 'mods', record)
        records.push(record)
      }
      await collectTextures(t)
      return records
    })
  }

  /** Marks a mod deleted; it stays restorable until purged. */
  async deleteMod(id: string, now = Date.now()) {
    return this.tx(['mods'], 'readwrite', async (t) => {
      const record = await get<ModRecord>(t, 'mods', id)
      if (!record) return null
      const next = { ...record, deletedAt: now, revision: record.revision + 1 }
      await put(t, 'mods', next)
      return next
    })
  }

  async restoreMod(id: string) {
    const record = await this.tx(['mods'], 'readwrite', async (t) => {
      const r = await get<ModRecord>(t, 'mods', id)
      if (!r) return null
      const next = { ...r, deletedAt: null, revision: r.revision + 1 }
      await put(t, 'mods', next)
      return next
    })
    return record && this.loadMod(id)
  }

  /** Removes a mod and its history for good. */
  async removeMod(id: string) {
    return this.tx(['mods', 'history', 'textures'], 'readwrite', async (t) => {
      await del(t, 'mods', id)
      for (const h of await getAll<HistoryEntry>(t, 'history', id, 'modId')) await del(t, 'history', h.id)
      await collectTextures(t)
    })
  }

  /** Removes mods deleted more than 30 days before `now`, with their history. Returns their ids. */
  async purge(now = Date.now()) {
    return this.tx(['mods', 'history', 'textures'], 'readwrite', async (t) => {
      const expired = (await getAll<ModRecord>(t, 'mods')).filter((r) => r.deletedAt != null && now - r.deletedAt > DELETED_KEEP_MS)
      for (const r of expired) {
        await del(t, 'mods', r.mod.meta.id)
        for (const h of await getAll<HistoryEntry>(t, 'history', r.mod.meta.id, 'modId')) await del(t, 'history', h.id)
      }
      if (expired.length) await collectTextures(t)
      return expired.map((r) => r.mod.meta.id)
    })
  }

  /** Adds an entry, keeps the newest 20 automatic entries of its mod, and returns the ids it pruned. */
  async addHistory(entry: HistoryEntry) {
    return this.tx(['history', 'mods', 'textures'], 'readwrite', async (t) => {
      await put(t, 'history', entry)
      const autos = (await getAll<HistoryEntry>(t, 'history', entry.modId, 'modId')).filter((h) => h.auto).sort((a, b) => b.createdAt - a.createdAt)
      const pruned = autos.slice(HISTORY_AUTO_KEEP).map((h) => h.id)
      for (const id of pruned) await del(t, 'history', id)
      if (pruned.length) await collectTextures(t)
      return pruned
    })
  }

  async putHistory(entry: HistoryEntry) {
    return this.tx(['history'], 'readwrite', (t) => put(t, 'history', entry))
  }

  async deleteHistory(id: string) {
    return this.tx(['history', 'mods', 'textures'], 'readwrite', async (t) => {
      await del(t, 'history', id)
      await collectTextures(t)
    })
  }

  async getMeta<T>(key: string) {
    return this.tx(['meta'], 'readonly', (t) => get<T>(t, 'meta', key))
  }

  async setMeta(key: string, value: unknown) {
    return this.tx(['meta'], 'readwrite', (t) => (value === undefined ? del(t, 'meta', key) : put(t, 'meta', value, key)))
  }

  /** Empties the given stores. */
  async clear(stores: StoreName[] = ['mods', 'history', 'textures']) {
    return this.tx(stores, 'readwrite', (t) => Promise.all(stores.map((s) => request(t.objectStore(s).clear()))))
  }
}

async function putTextures(t: IDBTransaction, mod: Mod, stored: StoredMod) {
  for (let i = 0; i < mod.textures.length; i++) {
    const { hash } = stored.textures[i]
    if (await get(t, 'textures', hash)) continue
    await put(t, 'textures', { png: new Blob([dataUrlBytes(mod.textures[i].png) as Uint8Array<ArrayBuffer>], { type: 'image/png' }), xml: mod.textures[i].xml } satisfies TextureRecord, hash)
  }
}

/** Whether a save removes a texture reference, the only way a save can orphan one. */
const dropsTextures = (previous: ModRecord | undefined, next: StoredMod) =>
  !!previous?.mod.textures.some((x) => !next.textures.some((y) => y.hash === x.hash))

/**
 * Deletes textures no mods or history record references, in the caller's transaction.
 * ponytail: reads every record on each save; an index on texture hashes if mod counts reach the thousands.
 */
async function collectTextures(t: IDBTransaction) {
  const used = new Set<string>()
  for (const r of await getAll<ModRecord>(t, 'mods')) r.mod.textures.forEach((x) => used.add(x.hash))
  for (const h of await getAll<HistoryEntry>(t, 'history')) h.mod.textures.forEach((x) => used.add(x.hash))
  for (const key of await request(t.objectStore('textures').getAllKeys())) if (!used.has(key as string)) await del(t, 'textures', key)
}

async function hydrate(stored: StoredMod, byHash: Map<string, TextureRecord>, cache = new Map<string, Promise<TexturePart | null>>()): Promise<Mod> {
  const textures = await Promise.all(stored.textures.map(async (ref) => {
    const tex = byHash.get(ref.hash)
    if (!tex) return null
    let data = cache.get(ref.hash)
    if (!data) {
      data = blobBytes(tex.png).then((bytes) => ({ id: ref.id, name: ref.name, png: `data:image/png;base64,${toBase64(bytes)}`, xml: tex.xml }))
      cache.set(ref.hash, data)
    }
    const part = await data
    if (!part) return null
    const out: TexturePart = { ...part, id: ref.id, name: ref.name }
    hashes.set(out, ref.hash)
    return out
  }))
  return { ...stored, textures: textures.filter((x): x is TexturePart => !!x) }
}

const blobBytes = async (png: Blob | Uint8Array) => (png instanceof Blob ? new Uint8Array(await png.arrayBuffer()) : png)

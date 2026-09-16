import { newLine, newMeta, newMission, newOrder, newSettings, newShip, newStep, uid } from '../lib/factory.ts'
import type { HistoryEntry } from '../lib/types.ts'
import { del, get, getAll, put, request } from './db.ts'
import { CURRENT_SCHEMA, migrate } from './migrations.ts'
import type { ModRecord, Repository, TextureRecord } from './repository.ts'

/** The `state/` folder of a download: every store's records, so Open can put them back. */
export const STATE_FORMAT = 'ggeditor-state'

type Json = Record<string, unknown>
export interface ZipFile { name: string; text?: string; bytes?: Uint8Array<ArrayBuffer> }

export interface Backup {
  meta: Json
  mods: ModRecord[]
  history: HistoryEntry[]
  settings: Json
  textures: Map<string, { png: Uint8Array; xml: string }>
  /** Fields from a newer editor that were kept in `_extra`, as paths. */
  unknown: string[]
}

/** YYYYMMDD-ggmods-<name>.zip with the name reduced to safe characters. */
export function downloadFileName(name: string, date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mods'
  return `${ymd}-ggmods-${safe}.zip`
}

export async function stateFiles(repo: Repository, info: { game: string; settings: Json; date?: Date }): Promise<ZipFile[]> {
  const { mods, history, textures } = await repo.tx(['mods', 'history', 'textures'], 'readonly', async (t) => {
    const values = await getAll<TextureRecord>(t, 'textures')
    const keys = await request(t.objectStore('textures').getAllKeys())
    return { mods: await getAll<ModRecord>(t, 'mods'), history: await getAll<HistoryEntry>(t, 'history'), textures: keys.map((k, i) => [k as string, values[i]] as const) }
  })
  const json = (v: unknown) => JSON.stringify(v, null, 1)
  const files: ZipFile[] = [
    { name: 'state/meta.json', text: json({ format: STATE_FORMAT, schema: CURRENT_SCHEMA, game: info.game, date: (info.date ?? new Date()).toISOString() }) },
    { name: 'state/mods.json', text: json(mods) },
    { name: 'state/history.json', text: json(history) },
    { name: 'state/settings.json', text: json(info.settings) },
  ]
  for (const [hash, tex] of textures) {
    files.push({ name: `state/textures/${hash}.png`, bytes: new Uint8Array(await tex.png.arrayBuffer()) })
    files.push({ name: `state/textures/${hash}.xml`, text: tex.xml })
  }
  return files
}

/** Reads `state/` from unzipped entries; null when the zip has none. Throws on damaged JSON. */
export function readBackup(entries: { name: string; text: string; bytes?: Uint8Array }[]): Backup | null {
  const file = (name: string) => entries.find((e) => e.name === `state/${name}` || e.name.endsWith(`/state/${name}`))
  const metaFile = file('meta.json')
  if (!metaFile) return null
  const meta = JSON.parse(metaFile.text) as Json
  if (meta.format !== STATE_FORMAT) return null
  const list = (name: string) => { const f = file(name); const v = f ? JSON.parse(f.text) : []; return Array.isArray(v) ? v : [] }
  const unknown: string[] = []
  const stored = list('mods.json').filter(isObj).map((r) => r.mod)
  const upgrade = <R extends { mod: unknown; schema?: number }>(r: R) => {
    const schema = r.schema ?? (meta.schema as number) ?? 1
    const migrated = migrate({ ...r, schema }, undefined, stored)
    const { mod, unknown: found } = normalizeMod(migrated.mod as Json, schema > CURRENT_SCHEMA)
    unknown.push(...found)
    return { ...migrated, mod, schema: Math.min(migrated.schema, Math.max(CURRENT_SCHEMA, schema)) }
  }
  const mods = list('mods.json').filter(isObj).map((r) => Object.assign({ revision: 0, updatedAt: 0, deletedAt: null }, upgrade(r as unknown as ModRecord))) as ModRecord[]
  const history = list('history.json').filter(isObj).map((h) => {
    const up = upgrade(h as unknown as HistoryEntry)
    return Object.assign({ name: '', auto: true, createdAt: 0, revision: 0 }, up, { id: typeof h.id === 'string' ? h.id : uid(), modId: typeof h.modId === 'string' ? h.modId : (up.mod as { meta: { id: string } }).meta.id, bytes: typeof h.bytes === 'number' ? h.bytes : JSON.stringify(up.mod).length })
  }) as HistoryEntry[]
  const settingsFile = file('settings.json')
  const textures = new Map<string, { png: Uint8Array; xml: string }>()
  for (const e of entries) {
    const m = /(?:^|\/)state\/textures\/([^/]+)\.png$/.exec(e.name)
    const xml = m && file(`textures/${m[1]}.xml`)
    if (m && xml && e.bytes) textures.set(m[1], { png: e.bytes, xml: xml.text })
  }
  return { meta, mods, history, settings: settingsFile ? JSON.parse(settingsFile.text) : {}, textures, unknown: [...new Set(unknown)] }
}

/**
 * Writes a backup into the database. `add` keeps what is here and adds mods whose ids are new, with their history;
 * `replace` empties mods, history and textures first. Meta settings are restored in both cases.
 */
export async function applyBackup(repo: Repository, backup: Backup, mode: 'add' | 'replace') {
  return repo.tx(['mods', 'history', 'textures', 'meta'], 'readwrite', async (t) => {
    if (mode === 'replace') for (const s of ['mods', 'history', 'textures'] as const) await request(t.objectStore(s).clear())
    let added = 0
    let skipped = 0
    const fresh = new Set<string>()
    for (const r of backup.mods) {
      if (mode === 'add' && (await get(t, 'mods', r.mod.meta.id))) { skipped++; continue }
      await put(t, 'mods', r)
      fresh.add(r.mod.meta.id)
      added++
    }
    for (const h of backup.history) if (fresh.has(h.modId)) await put(t, 'history', h)
    for (const [hash, tex] of backup.textures) {
      if (!(await get(t, 'textures', hash))) await put(t, 'textures', { png: new Blob([tex.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }), xml: tex.xml } satisfies TextureRecord, hash)
    }
    const used = new Set<string>()
    for (const r of await getAll<ModRecord>(t, 'mods')) r.mod.textures.forEach((x) => used.add(x.hash))
    for (const h of await getAll<HistoryEntry>(t, 'history')) h.mod.textures.forEach((x) => used.add(x.hash))
    for (const key of await request(t.objectStore('textures').getAllKeys())) if (!used.has(key as string)) await del(t, 'textures', key)
    const settings = Object.fromEntries(Object.entries(backup.settings).filter(([k]) => k === 'downloadLang' || k === 'downloadName'))
    if (Object.keys(settings).length) await put(t, 'meta', { ...((await get<Json>(t, 'meta', 'settings')) ?? {}), ...settings }, 'settings')
    return { added, skipped }
  })
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** An object's modelled keys with their defaults, and how to walk its children. */
interface Shape { defaults: () => Json; children?: Record<string, string> }

const SHAPES: Record<string, Shape> = {
  mod: { defaults: () => ({ meta: {}, quests: [], stars: null, textures: [] }), children: { meta: 'meta', quests: '[quest', stars: 'starsPart', textures: '[texture' } },
  meta: { defaults: () => { const { type: _type, ...m } = newMeta('quest', ''); return m as Json } },
  quest: { defaults: () => ({ id: uid(), primaryLang: 'en', versions: {} }), children: { versions: '{content' } },
  content: { defaults: () => ({ settings: {}, steps: [], rumors: [] }), children: { settings: 'settings', steps: '[step', rumors: '[rumor' } },
  settings: { defaults: () => newSettings() as unknown as Json },
  step: { defaults: () => newStep() as unknown as Json, children: { dialogue: '[line', reminder: '[line', ships: '[ship', orders: '[order', mission: 'mission' } },
  line: { defaults: () => newLine() as unknown as Json, children: { choices: '[choice' } },
  choice: { defaults: () => ({ id: uid(), text: '', targetStepId: null }) },
  ship: { defaults: () => newShip() as unknown as Json },
  order: { defaults: () => newOrder() as unknown as Json },
  mission: { defaults: () => newMission() as unknown as Json },
  rumor: { defaults: () => ({ id: uid(), text: '', scope: 'local' }) },
  starsPart: { defaults: () => ({ id: 'stars', stars: [], planets: [], stations: [] }), children: { stars: '[star', planets: '[planet', stations: '[station' } },
  star: { defaults: () => ({ id: uid(), name: '', x: 0, y: 0, z: 0, security: 'Low', type: '' }) },
  planet: { defaults: () => ({ id: uid(), name: '', system: '', type: '', orbit: 100, moons: 0, size: 1, rings: 0, material: null }) },
  station: { defaults: () => ({ id: uid(), name: '', system: '', bodyIndex: 1, type: 'OrbitalDark', faction: 'Independent' }) },
  texture: { defaults: () => ({ id: uid(), name: '', hash: '' }) },
}

/**
 * Fills missing fields with defaults (new ids included). With `keepUnknown`, keys the editor does not model move into
 * the object's `_extra`, and their paths are returned.
 */
export function normalizeMod(mod: Json, keepUnknown: boolean) {
  const unknown: string[] = []
  const walk = (value: unknown, shape: string, path: string): unknown => {
    if (shape.startsWith('[')) return Array.isArray(value) ? value.map((v, i) => walk(v, shape.slice(1), `${path}[${i}]`)) : []
    if (shape.startsWith('{')) return isObj(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, shape.slice(1), `${path}.${k}`)])) : {}
    if (!isObj(value)) return shape === 'starsPart' || shape === 'mission' ? null : walk({}, shape, path)
    const { defaults, children = {} } = SHAPES[shape]
    const base = defaults()
    const out: Json = { ...base, ...value }
    if (keepUnknown && shape !== 'meta') {
      for (const k of Object.keys(value)) {
        if (k in base || k === '_extra' || k === '_layout' || k === '_kept') continue
        out._extra = { ...(out._extra as Json), [k]: value[k] }
        delete out[k]
        unknown.push(`${path}.${k}`)
      }
    }
    for (const [k, child] of Object.entries(children)) if (k in out) out[k] = walk(out[k], child, `${path}.${k}`)
    return out
  }
  return { mod: walk(mod, 'mod', 'mod') as ModRecord['mod'], unknown }
}

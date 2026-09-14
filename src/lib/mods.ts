import { uid } from './factory'
import { syncVersion } from './versions'
import type { Mod, ModMeta, Lang, ModPart, QuestView, StarsView, TexturePart } from './types'

export const PART_SEPARATOR = '~'

/** The game loads Quest0.json to Quest199.json. */
export const MAX_QUEST_FILES = 200

/** Quest files Download writes for these favorites in one game language. */
export const questFileCount = (favorites: Mod[], lang: Lang) => favorites.reduce((n, m) => n + m.quests.filter((q) => q.versions[lang]).length, 0)

export const viewId = (modId: string, partId: string) => `${modId}${PART_SEPARATOR}${partId}`

export function splitViewId(id: string): { modId: string; partId: string | null } {
  const i = id.lastIndexOf(PART_SEPARATOR)
  return i < 0 ? { modId: id, partId: null } : { modId: id.slice(0, i), partId: id.slice(i + 1) }
}

const cache = new WeakMap<Mod, ModPart[]>()

/** The quest and stars parts of a mod as editor views, one per part. Views share the mod's objects. */
export function partViews(b: Mod): ModPart[] {
  const views: ModPart[] = []
  for (const q of b.quests) {
    const name = q.versions[q.primaryLang]?.settings.questName
    views.push({ meta: { ...b.meta, id: viewId(b.meta.id, q.id), type: 'quest', title: name || b.meta.title }, primaryLang: q.primaryLang, versions: q.versions } as QuestView)
  }
  if (b.stars) {
    views.push({ meta: { ...b.meta, id: viewId(b.meta.id, b.stars.id), type: 'stars', title: b.meta.title }, stars: b.stars.stars, planets: b.stars.planets, stations: b.stars.stations, _extra: b.stars._extra, _layout: b.stars._layout, _kept: b.stars._kept } as StarsView)
  }
  return views
}

/** partViews, cached per mod object. */
export function partsOf(b: Mod): ModPart[] {
  const hit = cache.get(b)
  if (hit) return hit
  const views = partViews(b)
  cache.set(b, views)
  return views
}

export const partCount = (b: Mod) => b.quests.length + (b.stars ? 1 : 0) + b.textures.length

/** The one editable part of a single-part mod, as a view id; null when there is more than one part or none. */
export function onlyPartView(b: Mod): string | null {
  if (partCount(b) !== 1) return null
  if (b.quests[0]) return viewId(b.meta.id, b.quests[0].id)
  if (b.stars) return viewId(b.meta.id, b.stars.id)
  return null
}

const modMeta = (m: ModPart['meta'], id: string): ModMeta => {
  const { type: _type, ...rest } = m
  return { ...rest, id }
}

/**
 * Turns loose views (from templates, imports or a zip of mod files) into one mod. Quests sharing a quest ID become
 * language versions of one quest, as QuestN.json files in different languages are.
 */
export function modFromParts(views: ModPart[], meta?: Partial<ModMeta>, textures: TexturePart[] = []): Mod {
  const first = views[0]
  const id = meta?.id ?? uid('mod')
  const b: Mod = {
    meta: { ...(first ? modMeta(first.meta, id) : ({} as ModMeta)), favorite: false, ...meta, id } as ModMeta,
    quests: [],
    stars: null,
    textures,
  }
  for (const v of views) {
    if (v.meta.type === 'stars') {
      const s = v as StarsView
      if (!b.stars) b.stars = { id: 'stars', stars: s.stars, planets: s.planets, stations: s.stations, _extra: s._extra, _layout: s._layout, _kept: s._kept }
      else {
        b.stars.stars.push(...s.stars)
        b.stars.planets.push(...s.planets)
        b.stars.stations.push(...s.stations)
      }
      continue
    }
    const q = v as QuestView
    const content = q.versions[q.primaryLang]!
    const existing = b.quests.find((x) => Object.values(x.versions)[0]?.settings.questId === content.settings.questId)
    if (existing && !existing.versions[q.primaryLang]) {
      // Separately imported language files have their own object ids; take the primary's ids now, while the lists
      // still line up by position, so later edits match versions by id.
      existing.versions[q.primaryLang as Lang] = syncVersion(existing.versions[existing.primaryLang]!, content)
      continue
    }
    b.quests.push({ id: uid(), primaryLang: q.primaryLang, versions: { ...q.versions } })
  }
  if (!meta?.title && first) b.meta.title = first.meta.title
  return b
}

/** Atlas names the game reads from textures/, e.g. txtr_ships1. */
export const TEXTURE_NAME = /^txtr_[a-z0-9]+$/i

/** Pairs PNG and XML files into texture parts by base name; unpaired files are returned separately. */
export function pairTextures(files: { name: string; bytes: Uint8Array }[]) {
  const base = (n: string) => n.split('/').pop()!.replace(/\.(png|xml)$/i, '')
  const groups = new Map<string, { png?: Uint8Array; xml?: Uint8Array }>()
  for (const f of files) {
    if (f.name.includes('__MACOSX') || !/\.(png|xml)$/i.test(f.name) || !TEXTURE_NAME.test(base(f.name))) continue
    const g = groups.get(base(f.name)) ?? {}
    if (/\.png$/i.test(f.name)) g.png = f.bytes
    else g.xml = f.bytes
    groups.set(base(f.name), g)
  }
  const textures: TexturePart[] = []
  const unpaired: string[] = []
  for (const [name, g] of groups) {
    if (g.png && g.xml) textures.push({ id: name, name, png: `data:image/png;base64,${toBase64(g.png)}`, xml: new TextDecoder().decode(g.xml) })
    else unpaired.push(name)
  }
  return { textures, unpaired }
}

export function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function dataUrlBytes(url: string) {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

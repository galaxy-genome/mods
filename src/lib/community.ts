import { importText } from '@/features/start/importer'
import { modFromParts, toBase64 } from './mods'
import type { Mod, CommunityRef, ModPart, Requirement, TexturePart } from './types'

/** Where a bundled mod comes from. Library entries and default mods both carry it; CREDITS.md is generated from it. */
export interface Provenance {
  id: string
  title: string
  author: string
  licence: string
  /** A URL, or short text when there is none. */
  source: string
  /** YYYY-MM-DD. */
  posted?: string
  /** `default` preloads on a new visitor's home, `library` lists on the Library page. */
  role: 'default' | 'library' | 'both'
}

export interface CommunityEntry extends Provenance {
  summary: string
  tags: string[]
  popularity: number
  version: string
  /** Last change to the entry, ms since epoch. */
  updated: number
  files: { name: string; lang: string; text: string }[]
  /** Texture atlas names served as <textureBase><name>.png and .xml. */
  textures?: string[]
  textureBase?: string
  /** Mods whose places this entry uses; players need them installed too. */
  requires?: Requirement[]
}

/** The shared library: src/data/library/*.json, plus src/data/library-pending/*.json (unapproved, gitignored) in dev or when VITE_INCLUDE_PENDING=1. */
const approved = import.meta.glob<CommunityEntry>('/data/library/*.json', { eager: true, import: 'default' })
const pending = import.meta.env.DEV || import.meta.env.VITE_INCLUDE_PENDING === '1'
  ? import.meta.glob<CommunityEntry>('/data/library-pending/*.json', { eager: true, import: 'default' })
  : {}
export const COMMUNITY: CommunityEntry[] = [...Object.values(approved), ...Object.values(pending)].toSorted((a, b) => b.popularity - a.popularity)

export const communityEntry = (id: string) => COMMUNITY.find((e) => e.id === id)

/** One library entry as one mod. Its files sharing a quest ID become language versions of one quest. */
export function entryMod(entry: CommunityEntry, textures: TexturePart[] = []): Mod {
  const community: CommunityRef = { entryId: entry.id, entryTitle: entry.title, author: entry.author, licence: entry.licence, popularity: entry.popularity }
  const views: ModPart[] = []
  for (const file of entry.files) {
    const result = importText(file.text)
    if (result.kind === 'ok') views.push(result.mod)
  }
  return modFromParts(views, {
    id: `${entry.id}@${entry.version}`,
    title: entry.title,
    author: entry.author,
    summary: entry.summary,
    version: entry.version,
    tags: entry.tags,
    origin: 'community',
    community,
    createdAt: entry.updated,
    updatedAt: entry.updated,
    favorite: false,
    link: '',
    licence: 'All rights reserved',
    ...(entry.requires?.length ? { requires: entry.requires } : {}),
  }, textures)
}

export async function loadEntryTextures(entry: CommunityEntry): Promise<TexturePart[]> {
  if (!entry.textures?.length) return []
  const base = `${import.meta.env.BASE_URL}${entry.textureBase ?? ''}`
  return Promise.all(entry.textures.map(async (name) => {
    const [png, xml] = await Promise.all([
      fetch(`${base}${name}.png`).then((r) => r.arrayBuffer()),
      fetch(`${base}${name}.xml`).then((r) => r.text()),
    ])
    return { id: name, name, png: `data:image/png;base64,${toBase64(new Uint8Array(png))}`, xml }
  }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Shareable links

/** Route roots inside a mod, which tell a part token in a `/community/` link apart from an in-mod path. */
const MOD_ROUTES = new Set(['overview', 'steps', 'flow', 'rumors', 'test', 'translate', 'json', 'history', 'stars', 'planets', 'stations', 'build', 'map'])

const defaultPart = (mod: Mod) => mod.quests[0]?.id ?? mod.stars?.id

/** The part a token names: a quest id, a 1-based quest number, or `stars`. */
function partFromToken(mod: Mod, token: string) {
  if (token === 'stars' && mod.stars) return mod.stars.id
  if (mod.quests.some((q) => q.id === token)) return token
  const n = Number(token)
  return Number.isInteger(n) && n >= 1 ? mod.quests[n - 1]?.id : undefined
}

/** A step id, or a 1-based step number, as the step id. */
function stepFromToken(mod: Mod, partId: string | undefined, token: string) {
  const quest = mod.quests.find((q) => q.id === partId)
  const steps = quest?.versions[quest.primaryLang]?.steps ?? []
  if (steps.some((s) => s.id === token)) return token
  const n = Number(token)
  return (Number.isInteger(n) && n >= 1 && steps[n - 1]?.id) || token
}

/** Splits the tail of a `/community/<entry>/...` or `/built-in/<n>/...` link into the part it opens and the path inside that part. */
export function parseCommunityPath(mod: Mod, rest: string) {
  const segments = rest.split('/').filter(Boolean)
  const named = segments.length > 1 && MOD_ROUTES.has(segments[1]) ? partFromToken(mod, segments[0]) : undefined
  const partId = named ?? defaultPart(mod)
  const path = named ? segments.slice(1) : segments
  if (path[0] === 'steps' && path[1]) path[1] = stepFromToken(mod, partId, path[1])
  return { partId, path: path.join('/') }
}

/** The shareable form of an in-mod path, or null when the mod isn't an untouched library mod. */
export function communityPath(mod: Mod, partId: string | null, path: string): string | null {
  // A game quest's step ids are made fresh on each load, so its links name steps by number.
  if (mod.meta.origin === 'game' && mod.meta.id.startsWith('game-')) {
    const [root, step, ...tail] = path.split('/')
    const quest = mod.quests.find((q) => q.id === partId)
    const n = root === 'steps' && step ? (quest?.versions[quest.primaryLang]?.steps.findIndex((x) => x.id === step) ?? -1) : -1
    return `/built-in/${Number(mod.meta.id.slice(5)) - 100000}${path ? `/${n >= 0 ? ['steps', n + 1, ...tail].join('/') : path}` : ''}`
  }
  const entry = mod.meta.community?.entryId
  if (!entry || mod.meta.modified) return null
  if (!partId || !path) return `/community/${entry}`
  const n = mod.quests.findIndex((q) => q.id === partId)
  const token = partId === mod.stars?.id ? 'stars' : n >= 0 ? String(n + 1) : null
  if (!token) return null
  const plain = parseCommunityPath(mod, path)
  // The token is only left out when the path alone reads back as the same screen.
  const short = partId === defaultPart(mod) && plain.partId === partId && plain.path === path
  return `/community/${entry}/${short ? '' : `${token}/`}${path}`
}

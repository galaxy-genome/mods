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

/** The shared library: community/*.json, plus community-pending/*.json (unapproved, gitignored) in dev or when VITE_INCLUDE_PENDING=1. */
const approved = import.meta.glob<CommunityEntry>('/community/*.json', { eager: true, import: 'default' })
const pending = import.meta.env.DEV || import.meta.env.VITE_INCLUDE_PENDING === '1'
  ? import.meta.glob<CommunityEntry>('/community-pending/*.json', { eager: true, import: 'default' })
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

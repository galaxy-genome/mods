import { t } from '@/i18n'
import { toGameJson, toStarsJson } from '@/features/output/gameJson'
import { stateFiles } from '@/data/backup'
import type { Repository } from '@/data/repository'
import { MAX_QUEST_FILES, dataUrlBytes, partsOf } from './mods'
import { randomQuestId } from './factory'
import { gameQuest, GAME_QUEST_ID_MAX, GAME_QUEST_ID_MIN, LANGS } from './reference'
import { getGalaxy } from '@/features/map/galaxy'
import { satisfies } from './dependencies'
import { modDeps } from './modDeps'
import { isPlanetBody, loadedPlanets, modProblems } from './rules'
import { placeStars } from '@/features/map/placement'
import type { Mod, Lang, ModPart, ModStation, Planet, Star, QuestContent, QuestView, StarsView, TexturePart } from './types'
import { zip } from './zip'

export const GAME_VERSION = '1.6.12'


export interface DownloadIssue {
  severity: 'error' | 'warning'
  message: string
  /** A part id to open, or a mod id. */
  modId?: string
  /** A mod the fix favorites. */
  favorite?: string
}

export interface DownloadPlan {
  lang: Lang
  quests: { mod: Mod; part: QuestView; content: QuestContent; slot: number; questId: number; renumberedFrom?: number }[]
  stars: { mod: Mod; part: StarsView }[]
  textures: { mod: Mod; texture: TexturePart }[]
  fixes: string[]
  issues: DownloadIssue[]
}

/** Works out what the favorite mods become in one game language: file slots, ID renumbering, merges and warnings. */
export function planDownload(favorites: Mod[], lang: Lang, all: ModPart[], mods: Mod[] = favorites, galaxy = getGalaxy()): DownloadPlan {
  const plan: DownloadPlan = { lang, quests: [], stars: [], textures: [], fixes: [], issues: [] }
  // The game needs every required mod's files beside the mod that uses them.
  for (const mod of favorites) {
    for (const r of mod.meta.requires ?? []) {
      if (favorites.some((f) => f !== mod && satisfies(r, f))) continue
      const found = mods.find((m) => m !== mod && satisfies(r, m))
      plan.issues.push(found
        ? { severity: 'warning', message: t('lib.issueRequiredNotFavorite', { mod: mod.meta.title, required: found.meta.title }), favorite: found.meta.id }
        : { severity: 'warning', message: t('lib.issueRequiredMissing', { mod: mod.meta.title, required: r.title }), modId: mod.meta.id })
    }
  }
  const langName = LANGS.find((l) => l.key === lang)?.name ?? lang
  const taken = new Set<number>()

  for (const mod of favorites) {
    let skipped = 0
    let withErrors = 0
    for (const view of partsOf(mod)) {
      if (view.meta.type === 'stars') { plan.stars.push({ mod, part: view as StarsView }); continue }
      const part = view as QuestView
      const content = part.versions[lang]
      if (!content) { skipped++; continue }
      let questId = content.settings.questId
      let renumberedFrom: number | undefined
      const clashesWithGame = questId >= GAME_QUEST_ID_MIN && questId <= GAME_QUEST_ID_MAX
      if (clashesWithGame || taken.has(questId)) {
        renumberedFrom = questId
        questId = randomQuestId([...taken])
        plan.fixes.push(t(clashesWithGame ? 'lib.fixRenumberGame' : 'lib.fixRenumberFavorite', { quest: part.meta.title, mod: mod.meta.title, from: renumberedFrom, to: questId }))
      }
      taken.add(questId)
      if (modProblems(part, all).some((p) => p.severity === 'error')) withErrors++
      plan.quests.push({ mod, part, content: structuredClone(content), slot: plan.quests.length, questId, renumberedFrom })
    }
    for (const texture of mod.textures) plan.textures.push({ mod, texture })
    const quests = mod.quests.length
    const title = mod.meta.title
    if (withErrors) plan.issues.push({ severity: 'warning', message: quests === 1 ? t('lib.issueModErrors', { mod: title }) : t('lib.issueQuestErrors', { count: withErrors, mod: title }), modId: mod.meta.id })
    if (skipped) plan.issues.push({ severity: 'warning', message: skipped === quests ? t('lib.issueModNoLang', { mod: title, lang: langName }) : t('lib.issueQuestNoLang', { count: skipped, mod: title, lang: langName }), modId: mod.meta.id })
  }

  if (plan.quests.length > MAX_QUEST_FILES) {
    const largest = favorites.map((m) => ({ m, n: m.quests.filter((q) => q.versions[lang]).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3)
    plan.issues.push({ severity: 'error', message: t('lib.issueTooManyFiles', { max: MAX_QUEST_FILES, count: plan.quests.length, last: MAX_QUEST_FILES - 1, over: plan.quests.length - MAX_QUEST_FILES, largest: largest.map((x) => `${x.m.meta.title} (${x.n})`).join(', ') }) })
  }

  // A requirement follows a renumbered quest from the same mod, unless another favorite still holds that ID.
  for (const q of plan.quests) {
    q.content.settings.questId = q.questId
    q.content.settings.requiredQuestIds = q.content.settings.requiredQuestIds.map((id) => {
      if (plan.quests.some((o) => o.questId === id)) return id
      const moved = plan.quests.find((o) => o !== q && o.renumberedFrom === id && o.mod === q.mod)
      return moved ? moved.questId : id
    })
    for (const id of q.content.settings.requiredQuestIds) {
      if (id === 0 || (id >= GAME_QUEST_ID_MIN && id <= GAME_QUEST_ID_MAX) || !!gameQuest(id) || plan.quests.some((o) => o.questId === id)) continue
      plan.issues.push({ severity: 'warning', message: t('lib.issueRequirement', { quest: q.part.meta.title, id }), modId: q.part.meta.id })
    }
  }

  const pilots = new Map<string, Mod>()
  const pilotClash = new Set<string>()
  for (const q of plan.quests) {
    for (const pilot of new Set(q.content.steps.flatMap((s) => s.ships.map((sh) => sh.pilot)).filter(Boolean))) {
      const other = pilots.get(pilot)
      if (other && other !== q.mod && !pilotClash.has(pilot)) {
        pilotClash.add(pilot)
        plan.issues.push({ severity: 'warning', message: t('lib.issuePilotClash', { a: other.meta.title, b: q.mod.meta.title, pilot }) })
      } else if (!other) pilots.set(pilot, q.mod)
    }
  }

  const owner = new Map<object, Mod>()
  const merged = { stars: [] as Star[], planets: [] as Planet[], stations: [] as ModStation[] }
  for (const { mod, part } of plan.stars) {
    for (const k of ['stars', 'planets', 'stations'] as const) for (const x of part[k]) { owner.set(x, mod); (merged[k] as object[]).push(x) }
  }
  const title = (x: object) => owner.get(x)!.meta.title
  if (plan.stars.length > 1) {
    const stars = new Map<string, Star>()
    const stations = new Map<string, ModStation>()
    const orbits = new Map<string, Mod>()
    for (const s of merged.stars) {
      const other = stars.get(s.name)
      if (other && owner.get(other) !== owner.get(s)) {
        const fields = (['x', 'y', 'z', 'security', 'type'] as const).filter((f) => other[f] !== s[f])
        const vars = { star: s.name, a: title(other), b: title(s) }
        // The game's existing-name check sees only its own stars, so a new star listed twice becomes two systems.
        if (galaxy && !galaxy.byName.has(s.name)) plan.issues.push({ severity: 'error', message: t('lib.issueStarTwice', vars), modId: owner.get(s)!.meta.id })
        else plan.issues.push(fields.length
          ? { severity: 'warning', message: t('lib.issueStarValues', { ...vars, fields: fields.map((f) => f.length === 1 ? f.toUpperCase() : f).join(', ') }), modId: owner.get(s)!.meta.id }
          : { severity: 'warning', message: t('lib.issueStarClash', vars), modId: owner.get(s)!.meta.id })
      }
      stars.set(s.name, s)
    }
    for (const st of merged.stations) {
      const other = stations.get(st.name)
      if (other && owner.get(other) !== owner.get(st)) plan.issues.push({ severity: 'error', message: t('lib.issueStationClash', { station: st.name, a: title(other), b: title(st) }), modId: owner.get(st)!.meta.id })
      if (!other) stations.set(st.name, st)
    }
    for (const p of merged.planets) {
      const key = `${p.system}:${Math.floor(p.orbit / 100) * 100}`
      const other = orbits.get(key)
      if (other && other !== owner.get(p)) plan.issues.push({ severity: 'warning', message: t('lib.issueOrbitClash', { planet: p.name, system: p.system }), modId: owner.get(p)!.meta.id })
      if (!other) orbits.set(key, owner.get(p)!)
    }

    // A station's PlanetID counts the system's bodies in load order, so another mod's earlier planets move it.
    const loaded = loadedPlanets(merged)
    for (const { mod, part } of plan.stars) {
      const own = loadedPlanets(part)
      for (const st of part.stations) {
        const body = own.filter((p) => p.system === st.system)[st.bodyIndex - 1]
        const inSystem = loaded.filter((p) => p.system === st.system)
        const now = inSystem[st.bodyIndex - 1]
        const other = inSystem.find((p) => owner.get(p) !== mod)
        if (body && now !== body && other) plan.issues.push({ severity: 'error', message: t('lib.issuePlanetShift', { station: st.name, a: title(other), b: mod.meta.title, n: st.bodyIndex, system: st.system, body: now ? now.name || now.type : '-' }), modId: mod.meta.id })
      }
    }
    // In game a star-type body becomes a companion star, and later planets of the system orbit it.
    const companions = new Map<string, Planet>()
    for (const p of loaded) {
      const c = companions.get(p.system)
      if (!isPlanetBody(p.type)) { if (!c) companions.set(p.system, p) } else if (c && owner.get(c) !== owner.get(p)) plan.issues.push({ severity: 'warning', message: t('lib.issueCompanionReparent', { planet: p.name, companion: c.name || c.type, system: p.system, a: title(c), b: title(p) }), modId: owner.get(p)!.meta.id })
    }
    plan.fixes.push(t('lib.fixMergedStars', { count: plan.stars.length }))
  }

  // Generation runs with every favorite's stars at once, as the game does with the merged file.
  const generated = new Map<string, { key: string; mod: Mod }>()
  if (galaxy && merged.stars.length) {
    placeStars(galaxy, merged.stars).forEach((p, i) => {
      const star = merged.stars[i]
      const mod = owner.get(star)!
      if (p.hiddenBy && p.hiddenBy !== star.name) {
        const other = merged.stars.find((s) => s.name === p.hiddenBy)
        if (other && owner.get(other) !== mod) plan.issues.push({ severity: 'error', message: t('lib.issueStarOverlap', { star: star.name, other: other.name, a: title(other), b: mod.meta.title }), modId: mod.meta.id })
      }
      for (const s of p.deletedGenerated) generated.set(s, { key: 'lib.issueGeneratedDeleted', mod })
      for (const s of p.renumberedGenerated) if (!generated.has(s)) generated.set(s, { key: 'lib.issueGeneratedChanged', mod })
    })
  }
  for (const a of favorites) {
    for (const system of modDeps(a, { galaxy }).uses.generated) {
      const hit = generated.get(system)
      if (hit) plan.issues.push({ severity: 'error', message: t(hit.key, { a: a.meta.title, b: hit.mod.meta.title, system }), modId: a.meta.id })
    }
  }

  const textureOwner = new Map<string, Mod>()
  for (const { mod, texture } of plan.textures) {
    const other = textureOwner.get(texture.name)
    if (other && other !== mod) plan.issues.push({ severity: 'warning', message: t('lib.issueTextureClash', { a: other.meta.title, b: mod.meta.title, texture: texture.name }), modId: mod.meta.id })
    textureOwner.set(texture.name, mod)
  }

  return plan
}

/** The one download: favorites as game files under mod/, every stored record under state/. */
export async function buildDownload(plan: DownloadPlan, repo: Repository | null, settings: Record<string, unknown>) {
  const files: { name: string; text?: string; bytes?: Uint8Array<ArrayBuffer> }[] = []
  for (const q of plan.quests) files.push({ name: `mod/Quest${q.slot}.json`, text: JSON.stringify(toGameJson(q.content), null, 2) })
  if (plan.stars.length) {
    const merged = { Stars: [] as unknown[], Planets: [] as unknown[], Stations: [] as unknown[] }
    for (const { part } of plan.stars) {
      const j = toStarsJson(part) as { Stars?: unknown[]; Planets?: unknown[]; Stations?: unknown[] }
      merged.Stars.push(...(j.Stars ?? []))
      merged.Planets.push(...(j.Planets ?? []))
      merged.Stations.push(...(j.Stations ?? []))
    }
    files.push({ name: 'mod/StarsStations.json', text: JSON.stringify(merged, null, 2) })
  }
  const lastByName = new Map(plan.textures.map((t) => [t.texture.name, t.texture]))
  for (const t of lastByName.values()) {
    files.push({ name: `mod/textures/${t.name}.png`, bytes: dataUrlBytes(t.png) as Uint8Array<ArrayBuffer> })
    files.push({ name: `mod/textures/${t.name}.xml`, text: t.xml })
  }
  if (repo) files.push(...(await stateFiles(repo, { game: GAME_VERSION, settings })))
  return zip(files)
}

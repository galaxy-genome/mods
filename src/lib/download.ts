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
import { modProblems } from './rules'
import type { Mod, Lang, ModPart, QuestContent, QuestView, StarsView, TexturePart } from './types'
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

  if (plan.stars.length > 1) {
    const stars = new Map<string, Mod>()
    const orbits = new Map<string, Mod>()
    for (const { mod, part } of plan.stars) {
      part.stars.forEach((s) => {
        const other = stars.get(s.name)
        if (other && other !== mod) plan.issues.push({ severity: 'warning', message: t('lib.issueStarClash', { star: s.name, a: other.meta.title, b: mod.meta.title }), modId: mod.meta.id })
        stars.set(s.name, mod)
      })
      part.planets.forEach((p) => {
        const key = `${p.system}:${Math.floor(p.orbit / 100) * 100}`
        const other = orbits.get(key)
        if (other && other !== mod) plan.issues.push({ severity: 'warning', message: t('lib.issueOrbitClash', { planet: p.name, system: p.system }), modId: mod.meta.id })
        if (!other) orbits.set(key, mod)
      })
    }
    plan.fixes.push(t('lib.fixMergedStars', { count: plan.stars.length }))
  }

  // A quest's generated system that a favorite's stars (its own included) remove or change is not the system it was written for.
  const deps = new Map(favorites.map((m) => [m, modDeps(m, { galaxy })]))
  for (const a of favorites) {
    for (const system of deps.get(a)!.uses.generated) {
      for (const b of favorites) {
        const { changes } = deps.get(b)!
        const key = changes.deletedGenerated.includes(system) ? 'lib.issueGeneratedDeleted' : changes.renumberedGenerated.includes(system) ? 'lib.issueGeneratedChanged' : null
        if (key) plan.issues.push({ severity: 'error', message: t(key, { a: a.meta.title, b: b.meta.title, system }), modId: a.meta.id })
      }
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

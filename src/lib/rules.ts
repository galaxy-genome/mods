import { t } from '@/i18n'
import { updateQuest } from '@/store/editor'
import { describeCondition, parseCondition } from './conditions'
import { type PlaceSource, gameSystemTest, modDependencies, satisfies } from './dependencies'
import { newStep } from './factory'
import { splitViewId } from './mods'
import { mapChecks } from '@/features/map/checks'
import { type Galaxy, getGalaxy } from '@/features/map/galaxy'
import { makeResolver } from '@/features/map/places'
import { BEHAVIOURS, BODIES, GAME_QUESTS, GOODS, MISSION_TYPES, PLANET_TYPES, STAR_TYPE_GROUPS, GAME_QUEST_ID_MAX, GAME_QUEST_ID_MIN, PORTRAITS, STATIONS, SYSTEMS, shipByInternal, shipByKey } from './reference'
import type { ModPart, Planet, Problem, QuestContent, QuestView, Requirement, StarsView, Step } from './types'

export const MAX_CHOICES = 3
export const MAX_LINE = 320
export const MISSION_CREDIT_CAP = 100_000
export const MISSION_REP_CAP = 3

/** The quest's reward as the game computes it for mods. */
export function rewardEstimate(q: QuestContent) {
  const lines: { amount: number; reason: string }[] = []
  const attackers = new Set<string>()
  q.steps.forEach((s) => s.orders.forEach((o) => { if (o.attack && o.target === 'player') attackers.add(o.ship) }))
  q.steps.forEach((s) => { if (s.mission?.type === 'PirateHunt' && s.mission.targetShipName) attackers.add(s.mission.targetShipName) })
  const cost = (model: string) => ({ Small: 1, Medium: 3, Large: 8 })[shipByKey(model)?.size ?? 'Small']
  let attackCost = 0
  let otherCost = 0
  q.steps.forEach((s) => s.ships.forEach((sh) => { if (attackers.has(sh.pilot)) attackCost += cost(sh.model); else otherCost += cost(sh.model) }))
  if (attackers.size) {
    if (attackCost > otherCost) lines.push({ amount: 150, reason: t('rules.rewardAttackersOutweigh') })
    else lines.push({ amount: 50, reason: t('rules.rewardAttack') })
  }
  q.steps.forEach((s, i) => {
    if (s.finishWhen?.startsWith('ACTION_WARP_END')) lines.push({ amount: 20, reason: t('rules.rewardArrival', { n: i + 1 }) })
  })
  const total = Math.min(250, lines.reduce((a, l) => a + l.amount, 0))
  return { total, lines, capped: lines.reduce((a, l) => a + l.amount, 0) > 250 }
}

const stationExists = (name: string, stars?: StarsView[]) =>
  STATIONS.some((s) => s.name === name) || !!stars?.some((m) => m.stations.some((s) => s.name === name))
const systemExists = (name: string, stars?: StarsView[]) =>
  SYSTEMS.some((s) => s.name === name) || STATIONS.some((s) => s.system === name) || !!stars?.some((m) => m.stars.some((s) => s.name === name))

function levenshtein(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

/** The closest name to a mistyped one: same letters in another case, or at most 3 edits away. */
function closest(name: string, names: string[]) {
  const lower = name.toLowerCase()
  const same = names.find((n) => n.toLowerCase() === lower)
  if (same) return same
  let best: string | undefined
  let bestDistance = 4
  for (const n of names) {
    if (Math.abs(n.length - name.length) >= bestDistance) continue
    const d = levenshtein(lower, n.toLowerCase())
    if (d < bestDistance) { best = n; bestDistance = d }
  }
  return best
}

const unknownStation = (name: string, stars: StarsView[]) => {
  const guess = closest(name, [...STATIONS.map((s) => s.name), ...stars.flatMap((m) => m.stations.map((s) => s.name))])
  return guess ? t('rules.stationUnknownGuess', { name, guess }) : t('rules.stationUnknown', { name })
}

/** Systems a quest names: its station's, its missions' and those in its conditions. */
function questSystems(q: QuestContent, stars: StarsView[]) {
  const out = new Set<string>()
  const stationSystem = (name: string) => STATIONS.find((s) => s.name === name)?.system ?? stars.flatMap((m) => m.stations).find((s) => s.name === name)?.system
  const add = (name: string | undefined) => { if (name && systemExists(name, stars)) out.add(name) }
  add(stationSystem(q.settings.stationName))
  for (const step of q.steps) {
    if (step.mission) { add(step.mission.targetSystem); add(stationSystem(step.mission.homeStation)); add(stationSystem(step.mission.targetStation)) }
    for (const raw of [step.finishWhen, ...step.failWhen]) {
      if (!raw) continue
      const { def, param } = parseCondition(raw)
      if (def?.param === 'system') add(param)
      if (def?.param === 'station') add(stationSystem(param))
    }
  }
  return out
}

/**
 * Why the game cannot use a system name, or null when it can. Arrivals match route point names: map-drawn catalogue
 * stars, mod stars and generated systems. `DBs.GetSystem` (mission targets) finds catalogue and mod stars only. A
 * generated name is checked against its cell once the generation maps load, and needs only to decode before. Nothing
 * is flagged before the galaxy loads.
 */
function systemChecker(galaxy: Galaxy | null, stars: StarsView[]) {
  if (!galaxy) return () => null
  const resolve = makeResolver(galaxy, stars)
  return (name: string, getSystem: boolean) => {
    const at = resolve.system(name)
    if (at?.source === 'generated') return getSystem ? t('rules.systemGenerated', { name }) : null
    if (at?.source === 'catalogue' && !galaxy.byName.get(name)![5]) return t('rules.systemHidden', { name })
    if (at) return null
    const guess = closest(name, [...galaxy.byName.keys(), ...stars.flatMap((m) => m.stars.map((st) => st.name))])
    return guess ? t('rules.systemUnknownGuess', { name, guess }) : t('rules.systemUnknown', { name })
  }
}

const sourceCache = new WeakMap<ModPart[], PlaceSource[]>()
/** Parts grouped back into mods; a mod's title and version come from its stars part, which quest parts rename. */
function sourcesOf(all: ModPart[]): PlaceSource[] {
  const hit = sourceCache.get(all)
  if (hit) return hit
  const by = new Map<string, PlaceSource>()
  for (const p of all) {
    const id = splitViewId(p.meta.id).modId
    const src = by.get(id) ?? { meta: { ...p.meta, id }, quests: [], stars: null }
    if (p.meta.type === 'stars') { src.stars = p as StarsView; src.meta = { ...p.meta, id } } else src.quests.push(p as QuestView)
    by.set(id, src)
  }
  const out = [...by.values()]
  sourceCache.set(all, out)
  return out
}

/** Opens the page holding a place or quest field with its picker open. */
const choosePlace = (id: string, path: string, field: string, kind: 'system' | 'station' | 'quest'): Problem['fix'] => ({
  label: t(kind === 'system' ? 'rules.chooseSystem' : kind === 'station' ? 'rules.chooseStation' : 'rules.chooseQuest'),
  apply: () => { history.pushState(null, '', `/mod/${id}/${path}?field=${field}&pick=1`); dispatchEvent(new PopStateEvent('popstate')) },
})

const requirementLabel = (r: Requirement) => (r.version ? `${r.title} v${r.version}` : r.title)

/** Required mods: places used from mods not required, required mods missing from this device or no longer used. */
function dependencyProblems(mod: QuestView, all: ModPart[], galaxy: Galaxy | null, add: (severity: Problem['severity'], id: string, message: string, path: string, label: string, field?: string, fix?: Problem['fix']) => void) {
  const sources = sourcesOf(all)
  const modId = splitViewId(mod.meta.id).modId
  const self = sources.find((s) => s.meta.id === modId)
  if (!self) return
  const isGame = gameSystemTest(galaxy?.byName)
  const requires = mod.meta.requires ?? []
  const label = t('rules.labelRequires')
  const setRequires = (change: (list: Requirement[]) => Requirement[]) => updateQuest(mod.meta.id, (_, v) => { v.meta.requires = change(v.meta.requires ?? []) })
  for (const d of modDependencies({ ...self, quests: [mod] }, sources, isGame)) {
    if (requires.some((r) => satisfies(r, d.source))) continue
    const u = d.uses[0]
    add('warning', `dep-add-${d.source.meta.id}`, t('rules.depNotRequired', { name: u.kind === 'quest' ? t('rules.questN', { id: u.name }) : u.name, mod: d.requirement.title }), u.path, label, u.field, {
      label: t('rules.depAdd', { mod: d.requirement.title }),
      apply: () => setRequires((list) => [...list, d.requirement]),
    })
  }
  // Mod-wide checks sit on the mod's first quest only.
  if (all.find((p) => p.meta.type === 'quest' && splitViewId(p.meta.id).modId === modId)?.meta.id !== mod.meta.id) return
  const used = modDependencies(self, sources, isGame)
  for (const r of requires) {
    const present = sources.filter((s) => s.meta.id !== modId && satisfies(r, s))
    if (!present.length) {
      add('warning', `dep-missing-${r.modId}`, t('rules.depMissing', { mod: requirementLabel(r) }), 'overview', label, undefined, r.entryId ? {
        label: t('rules.depAddFromLibrary'),
        apply: () => { void import('@/store/editor').then((s) => s.addCommunityEntry(r.entryId!)) },
      } : undefined)
    } else if (!used.some((d) => present.includes(d.source))) {
      add('tip', `dep-unused-${r.modId}`, t('rules.depUnused', { mod: requirementLabel(r) }), 'overview', label, undefined, {
        label: t('rules.depRemove'),
        apply: () => setRequires((list) => list.filter((x) => x.modId !== r.modId)),
      })
    }
  }
}

export function questProblems(mod: QuestView, all: ModPart[], galaxy = getGalaxy()): Problem[] {
  const q = mod.versions[mod.primaryLang]!
  const s = q.settings
  const stars = all.filter((m): m is StarsView => m.meta.type === 'stars')
  const systemProblem = systemChecker(galaxy, stars)
  const out: Problem[] = []
  const add = (severity: Problem['severity'], id: string, message: string, path: string, label: string, field?: string, fix?: Problem['fix']) =>
    out.push({ id, severity, message, location: { path, label, field }, fix })

  if (!s.questName.trim()) add('warning', 'quest-name', t('overview.questNameRequired'), 'overview', t('overview.questName'), 'questName')
  if (!s.description.trim()) add('warning', 'description', t('overview.descriptionRequired'), 'overview', t('overview.description'), 'description')
  if (s.startMode === 'bar' && !s.charName.trim()) add('warning', 'char-name', t('overview.nameRequired'), 'overview', t('overview.name'), 'charName')
  if (!/^\d+\.\d+\.\d+$/.test(mod.meta.version)) add('warning', 'version', t('overview.versionInvalid'), 'overview', t('overview.version'), 'version')
  if (q.steps.length < 2) add('error', 'min-steps', t('rules.minSteps'), 'steps', t('rules.labelSteps'))
  if (s.questId >= GAME_QUEST_ID_MIN && s.questId <= GAME_QUEST_ID_MAX) {
    const g = GAME_QUESTS.find((x) => x.id === s.questId)
    add('error', 'id-game', g ? t('rules.idGameNamed', { name: g.name }) : t('rules.idGame'), 'overview', t('rules.labelQuestId'), 'questId')
  }
  const dupe = all.find((m) => m.meta.id !== mod.meta.id && m.meta.type === 'quest' && (m as QuestView).versions[(m as QuestView).primaryLang]?.settings.questId === s.questId)
  if (dupe) add('warning', 'id-dupe', t('rules.idDupe', { name: dupe.meta.title }), 'overview', t('rules.labelQuestId'), 'questId')
  if (s.startMode === 'bar') {
    if (!s.stationName) add('error', 'no-station', t('rules.noStation'), 'overview', t('rules.labelStation'), 'stationName')
    else if (!stationExists(s.stationName, stars)) add('warning', 'station-unknown', unknownStation(s.stationName, stars), 'overview', t('rules.labelStation'), 'stationName', choosePlace(mod.meta.id, 'overview', 'stationName', 'station'))
  }
  if (s.startMode === 'space' && s.chance <= 0) add('error', 'chance-zero', t('rules.chanceZero'), 'overview', t('rules.labelChance'), 'chance')
  if (!PORTRAITS.includes(s.charImage)) add('warning', 'portrait', t('rules.portraitUnknown', { name: s.charImage }), 'overview', t('rules.labelPortrait'), 'charImage')
  if (s.startMode === 'space' && (s.requiredQuestIds.length || s.minKarma !== null || s.maxKarma !== null || s.factionMinRep > 0 || s.ownStationRequired)) {
    // Universe.CheckRandomSpaceQuest checks only language, active slots and completion.
    add('warning', 'space-req', t('rules.spaceRequirements'), 'overview', t('rules.labelRequirements'), 'requiredQuestIds', {
      label: t('rules.startInBar'),
      apply: () => updateQuest(mod.meta.id, (d) => { d.settings.startMode = 'bar' }),
    })
  }
  // BarScreen checks OwnStationRequired only for quests offered at a named station.
  if (s.startMode === 'nearPoint' && s.ownStationRequired) add('warning', 'near-own', t('rules.nearOwnStation'), 'overview', t('rules.labelRequirements'), 'ownStationRequired')
  s.requiredQuestIds.forEach((id) => {
    if (id === 0) return
    const known = (id >= GAME_QUEST_ID_MIN && id <= GAME_QUEST_ID_MAX) || GAME_QUESTS.some((g) => g.id === id) || all.some((m) => m.meta.type === 'quest' && (m as QuestView).versions[(m as QuestView).primaryLang]?.settings.questId === id)
    if (!known) add('warning', `req-${id}`, t('rules.requirementUnknown', { id }), 'overview', t('rules.labelRequirements'), 'requiredQuestIds', choosePlace(mod.meta.id, 'overview', 'requiredQuestIds', 'quest'))
  })

  const systems = questSystems(q, stars)
  const planetNames = new Set([...[...systems].flatMap((sys) => (BODIES[sys] ?? []).map((b) => b.name)), ...stars.flatMap((m) => m.planets.map((p) => p.name))])

  const { edges, reachable } = stepGraph(q.steps)
  q.steps.forEach((step, i) => {
    const n = i + 1
    const path = `steps/${step.id}`
    const label = t('rules.labelStep', { n, name: step.name || t('rules.untitled') })

    /** Checks one "Finishes when" or "Fails when" condition; `key` makes the problem ids unique per condition. */
    const checkCondition = (raw: string, field: 'finishWhen' | 'failWhen', key: string, remove: (st: Step) => void) => {
      const { def, param } = parseCondition(raw)
      const warn = (kind: string, message: string, fix?: Problem['fix']) => add('warning', `${kind}-${key}`, message, path, label, field, fix)
      if (raw.startsWith('BUTTON_')) {
        // The loader prefixes completeAction with BUTTON_, so a doubled prefix never matches and the step never finishes.
        add(field === 'finishWhen' ? 'error' : 'warning', `button-${key}`, t('rules.buttonPrefix'), path, label, field, {
          label: t('rules.buttonPrefixFix'),
          apply: () => updateQuest(mod.meta.id, (d) => { const st = d.steps.find((x) => x.id === step.id); if (st) remove(st) }),
        })
      }
      if (!def) {
        if (!raw.replace(/^BUTTON_/, '').startsWith('SHIP_STOP_')) warn('raw', t('rules.conditionUnknown', { name: raw }), {
          label: t('rules.chooseCondition'),
          apply: () => { history.pushState(null, '', `/mod/${mod.meta.id}/${path}?field=${field}&pick=${field === 'finishWhen' ? 'finish' : key.split('-fail')[1]}`); dispatchEvent(new PopStateEvent('popstate')) },
        })
        return
      }
      const sys = def.param === 'system' && systemProblem(param, false)
      if (sys) warn('sys', sys)
      if (def.param === 'station' && param !== 'OWN' && !stationExists(param, stars)) warn('stn', unknownStation(param, stars))
      if (def.param === 'planet' && systems.size && !planetNames.has(param)) warn('planet', t('rules.planetUnknown', { name: param }))
      if (def.param === 'pilot') {
        const spawned = q.steps.slice(0, i + 1).some((st) => st.ships.some((sh) => sh.pilot === param)) || q.steps.some((st) => st.mission?.targetShipName === param)
        if (!spawned) warn('pilot', t('rules.shipMissing', { name: param }))
      }
    }

    if (!step.finishWhen) add('error', `finish-${step.id}`, t('rules.neverFinishes', { n }), path, label, 'finishWhen')
    // completeAction is one action; `;` is not split, so the joined string never matches.
    else if (step.finishWhen.includes(';')) add('error', `finish-joined-${step.id}`, t('rules.finishJoined'), path, label, 'finishWhen')
    else checkCondition(step.finishWhen, 'finishWhen', step.id, (st) => { if (st.finishWhen) st.finishWhen = st.finishWhen.replace(/^BUTTON_/, '') })
    step.failWhen.forEach((raw, fi) => checkCondition(raw, 'failWhen', `${step.id}-fail${fi}`, (st) => { st.failWhen = st.failWhen.map((f) => f.replace(/^BUTTON_/, '')) }))
    if (step.failWhen.length > 1) add('tip', `fail-all-${step.id}`, t('rules.failAll'), path, label, 'failWhen')
    if (!step.journal.trim()) add('tip', `journal-${step.id}`, t('rules.journalEmpty'), path, label, 'journal')
    if (i > 0 && !reachable.has(i)) add('warning', `unreach-${step.id}`, t('rules.unreachable', { n }), path, label)
    if (step.checkpoint) {
      // Universe.ReLoadGame raises the warp-end actions after restoring the step; a cold start does not.
      if (i > 0 && /^(WAPR_END|ACTION_WARP_END)/.test(step.finishWhen ?? '')) add('tip', `warp-load-${step.id}`, t('rules.checkpointWarp'), path, label, 'finishWhen')
      if (i === 0) add('tip', `cp-first-${step.id}`, t('rules.checkpointFirst'), path, label, 'checkpoint', {
        label: t('rules.checkpointOff'),
        apply: () => updateQuest(mod.meta.id, (d) => { d.steps[0].checkpoint = false }),
      })
      else if (step.dialogue.length) {
        const stuck = step.dialogue.some((l) => l.choices.length) || step.finishWhen === 'ACTION_DIALOG_COMPLETE'
        add(stuck ? 'warning' : 'tip', `cp-dialog-${step.id}`, t('rules.checkpointDialog'), path, label, 'checkpoint')
      }
      const stranded = strandedPilots(q.steps, i, edges)
      stranded.forEach(({ pilot, spawnedAt }) => {
        const to = checkpointMove(q.steps, i, edges)
        add('warning', `cp-stranded-${step.id}-${pilot}`, t('rules.checkpointStranded', { step: step.name || n, pilot, n: spawnedAt + 1 }), path, label, 'checkpoint', to === null ? undefined : {
          label: t('rules.checkpointMove', { n: to + 1 }),
          apply: () => updateQuest(mod.meta.id, (d) => { d.steps[i].checkpoint = false; d.steps[to].checkpoint = true }),
        })
      })
    }
    if (step.reminder.length) add('warning', `reminder-${step.id}`, t('rules.reminderIgnored'), `${path}/reminder`, label)
    step.dialogue.forEach((line, li) => {
      const lineLabel = t('rules.labelLine', { step: label, n: li + 1 })
      const linePath = `${path}/dialogue/${line.id}`
      if (line.choices.length > MAX_CHOICES) add('error', `choices-${line.id}`, t('rules.tooManyChoices', { max: MAX_CHOICES }), linePath, lineLabel)
      if (!PORTRAITS.includes(line.portrait)) add('warning', `line-portrait-${line.id}`, t('rules.portraitUnknown', { name: line.portrait }), linePath, lineLabel, 'portrait')
      if (line.text.length > MAX_LINE) add('warning', `long-${line.id}`, t('rules.longLine'), linePath, lineLabel)
      if (!line.speaker.trim()) add('tip', `speaker-${line.id}`, t('rules.noSpeaker'), linePath, lineLabel, 'speaker')
      line.choices.forEach((c) => {
        if (c.targetStepId && !q.steps.some((st) => st.id === c.targetStepId))
          add('warning', `choice-missing-${c.id}`, t('rules.choiceNowhere', { name: c.text }), linePath, label)
      })
    })
    const seen = new Set<string>()
    step.ships.forEach((sh) => {
      const shipPath = `${path}/ships/${sh.id}`
      if (sh.pilot && seen.has(sh.pilot)) add('error', `dupe-pilot-${sh.id}`, t('rules.duplicatePilot', { name: sh.pilot }), shipPath, label)
      seen.add(sh.pilot)
      if (!sh.pilot) add('warning', `pilot-${sh.id}`, t('ships.pilotRequired'), shipPath, label, 'pilot')
      const model = shipByKey(sh.model)
      if (!model) add('warning', `model-${sh.id}`, t('rules.modelUnknown', { name: sh.model, fallback: 'Ion' }), shipPath, label, 'model')
      if (!BEHAVIOURS.some((b) => b.key === sh.behaviour)) add('warning', `behaviour-${sh.id}`, t('rules.behaviourUnknown', { name: sh.behaviour, fallback: 'Trader' }), shipPath, label, 'behaviour')
      if (model?.alwaysHostile && !BEHAVIOURS.find((b) => b.key === sh.behaviour)?.hostile)
        add('tip', `hostile-${sh.id}`, t('rules.alwaysHostile', { name: model.name }), shipPath, label)
    })
    step.orders.forEach((o) => {
      const orderPath = `${path}/orders/${o.id}`
      if (o.changeBehaviour && !BEHAVIOURS.some((b) => b.key === o.behaviour)) add('warning', `order-behaviour-${o.id}`, t('rules.behaviourUnknown', { name: o.behaviour, fallback: 'Trader' }), orderPath, label, 'behaviour')
      if (o.ship === 'player') return
      const exists = q.steps.slice(0, i + 1).some((st) => st.ships.some((sh) => sh.pilot === o.ship))
      if (!exists) add('warning', `order-${o.id}`, t('rules.shipMissing', { name: o.ship || '?' }), orderPath, label, 'ship')
    })
    if (step.mission) {
      const m = step.mission
      const missionPath = `${path}/mission`
      if (!MISSION_TYPES.some((x) => x.key === m.type)) add('warning', `mission-type-${step.id}`, t('rules.missionTypeUnknown', { name: m.type }), missionPath, label, 'type')
      if (!m.homeStation) add('error', `mission-station-${step.id}`, t('ships.offeredAtError'), missionPath, label, 'homeStation')
      // Quests load before StarsStations.json and StoryMod derefs GetStation(HomeStation).systemObject: anything but a
      // game station throws, which skips every later quest file and all of StarsStations.json.
      else if (!STATIONS.some((x) => x.name === m.homeStation)) {
        const why = stationExists(m.homeStation, stars) ? t('rules.missionHomeModStation', { name: m.homeStation }) : unknownStation(m.homeStation, stars)
        add('error', `mission-station-${step.id}`, `${why} ${t('rules.missionHomeBreaks')}`, missionPath, label, 'homeStation', choosePlace(mod.meta.id, missionPath, 'homeStation', 'station'))
      }
      if (missionNeedsSystem(m) && !m.targetSystem) add('error', `mission-system-${step.id}`, t('rules.missionSystemMissing'), missionPath, label, 'targetSystem')
      else if (missionNeedsSystem(m)) {
        const sys = systemProblem(m.targetSystem, true)
        // GetSystem returns null for unknown and generated names and the loader then throws on TargetSystem.x.
        if (sys) add(galaxy!.byName.has(m.targetSystem) ? 'warning' : 'error', `mission-target-${step.id}`, sys, missionPath, label, 'targetSystem', choosePlace(mod.meta.id, missionPath, 'targetSystem', 'system'))
      }
      if (m.credits > MISSION_CREDIT_CAP) add('warning', `cap-cr-${step.id}`, t('rules.creditCap', { max: MISSION_CREDIT_CAP.toLocaleString('en-US') }), missionPath, label, 'credits')
      if (m.reputation > MISSION_REP_CAP) add('warning', `cap-rep-${step.id}`, t('rules.repCap', { max: MISSION_REP_CAP }), missionPath, label, 'reputation')
      if (m.targetShipType && !shipByInternal(m.targetShipType)) add('warning', `mission-model-${step.id}`, t('rules.modelUnknown', { name: m.targetShipType, fallback: 'Ion' }), missionPath, label, 'targetShipType')
      // inGameUI lists a story mission only while the step index is above 0.
      if (i === 0) add('warning', `mission-first-${step.id}`, t('rules.missionFirstStep'), missionPath, label)
      // Accept and reward actions fire only for Story missions; other missions also time out.
      if (!m.story) add('warning', `mission-story-${step.id}`, t('rules.missionNotStory'), missionPath, label, 'story', {
        label: t('rules.missionStoryOn'),
        apply: () => updateQuest(mod.meta.id, (d) => { const st = d.steps.find((x) => x.id === step.id); if (st?.mission) st.mission.story = true }),
      })
      if (!isTurnIn(step.finishWhen) && !(step.finishWhen === ACCEPT && q.steps.slice(i + 1).some((st) => isTurnIn(st.finishWhen)))) {
        add('warning', `mission-turnin-${step.id}`, t('rules.missionTurnIn'), path, label, 'finishWhen', step.finishWhen !== ACCEPT ? undefined : {
          label: t('rules.missionAddTurnIn'),
          apply: () => updateQuest(mod.meta.id, (d) => { d.steps.splice(d.steps.findIndex((x) => x.id === step.id) + 1, 0, newStep({ name: t('rules.turnInStepName'), finishWhen: REWARD })) }),
        })
      }
      if (m.goods && !GOODS.includes(m.goods)) add('warning', `mission-goods-${step.id}`, t('rules.goodsUnknown', { name: m.goods, fallback: 'Water' }), missionPath, label, 'goods')
    }
  })

  fallThroughs(edges).forEach((e) => {
    const from = q.steps[e.from]
    const to = q.steps[e.to]
    add('warning', `fall-${from.id}`, t('rules.fallThrough', { from: from.name, to: to.name }), `steps/${from.id}`, t('rules.labelStep', { n: e.from + 1, name: from.name }))
  })

  dependencyProblems(mod, all, galaxy, add)

  q.rumors.forEach((r) => {
    if (r.scope === 'local' && s.startMode === 'space') add('warning', `rumor-${r.id}`, t('rules.localRumor'), 'rumors', t('rules.labelRumors'), 'rumors')
  })
  return out
}

const ACCEPT = 'CLICK_ACCEPT_STORY_MISSION'
const REWARD = 'GET_STORY_REWARD'
/** Actions MissionsScreen raises when a mission is handed in. */
export const isTurnIn = (action: string | null | undefined) => !!action && (action === REWARD || /^ACTION_Mission\w*COMPLETE$/.test(action))

/** The loader resolves TargetSystem unless a Courier or Transfer mission sends the player back to its own station. */
export const missionNeedsSystem = (m: { type: string; homeStation: string; targetStation: string }) =>
  !((m.type === 'Courier' || m.type === 'TransferGoods') && m.targetStation === m.homeStation)

/** Where each step can go: fall-through to the next index plus choice targets. */
export function stepGraph(steps: Step[]) {
  const index = new Map(steps.map((s, i) => [s.id, i]))
  const edges: { from: number; to: number; kind: 'next' | 'choice'; label?: string }[] = []
  steps.forEach((s, i) => {
    const choices = s.dialogue.flatMap((l) => l.choices)
    const jumps = choices.filter((c) => c.targetStepId && index.has(c.targetStepId))
    jumps.forEach((c) => edges.push({ from: i, to: index.get(c.targetStepId!)!, kind: 'choice', label: c.text }))
    const allJump = choices.length > 0 && choices.every((c) => c.targetStepId && index.has(c.targetStepId))
    if (!allJump && i + 1 < steps.length) edges.push({ from: i, to: i + 1, kind: 'next' })
  })
  const reachable = new Set<number>([0])
  const queue = [0]
  while (queue.length) {
    const n = queue.shift()!
    edges.filter((e) => e.from === n).forEach((e) => { if (!reachable.has(e.to)) { reachable.add(e.to); queue.push(e.to) } })
  }
  return { edges, reachable }
}

/** The pilot a step's Finishes when waits on; an order or fail condition naming a missing ship does nothing instead. */
const pilotNeeded = (s: Step) => {
  const { def, param } = s.finishWhen ? parseCondition(s.finishWhen) : { def: null, param: '' }
  return def?.param === 'pilot' ? param : null
}

/**
 * Pilots a reload at checkpoint `c` cannot bring back. Resuming runs none of step c's dialog, ships or orders; ships
 * are not saved, so only spawns in steps entered after c exist. Walks every path from c up to the next checkpoint and
 * reports each pilot a step needs that was spawned at or before c and not on every path since.
 */
export function strandedPilots(steps: Step[], c: number, edges = stepGraph(steps).edges) {
  const missionShips = new Set(steps.map((s) => s.mission?.targetShipName))
  const spawnedAt = new Map<string, number>()
  steps.slice(0, c + 1).forEach((s, i) => s.ships.forEach((sh) => { if (!missionShips.has(sh.pilot)) spawnedAt.set(sh.pilot, i) }))
  const have = new Map<number, Set<string>>([[c, new Set()]])
  const queue = [c]
  while (queue.length) {
    const from = queue.shift()!
    for (const e of edges) {
      if (e.from !== from || e.to === c || steps[e.to].checkpoint) continue
      const arriving = new Set([...have.get(from)!, ...steps[e.to].ships.map((sh) => sh.pilot)])
      const prev = have.get(e.to)
      const next = prev ? new Set([...prev].filter((p) => arriving.has(p))) : arriving
      if (!prev || next.size < prev.size) { have.set(e.to, next); queue.push(e.to) }
    }
  }
  const out = new Map<string, number>()
  have.forEach((present, i) => { const p = pilotNeeded(steps[i]); if (p && spawnedAt.has(p) && !present.has(p)) out.set(p, spawnedAt.get(p)!) })
  return [...out].map(([pilot, at]) => ({ pilot, spawnedAt: at }))
}

/** The latest step before c that saves (not step 1) and strands nothing once it holds c's checkpoint, or null. */
export function checkpointMove(steps: Step[], c: number, edges = stepGraph(steps).edges) {
  for (let n = c - 1; n > 0; n--) {
    if (steps[n].checkpoint) continue
    const moved = steps.map((s, i) => (i === c || i === n ? { ...s, checkpoint: i === n } : s))
    if (!strandedPilots(moved, n, edges).length) return n
  }
  return null
}

/** "next" edges where a branch's last step runs on into a step another choice jumps to. */
export function fallThroughs(edges: ReturnType<typeof stepGraph>['edges']) {
  const choiceTargets = new Set(edges.filter((e) => e.kind === 'choice').map((e) => e.to))
  return edges.filter((e) => {
    if (e.kind !== 'next' || !choiceTargets.has(e.to) || e.from === 0) return false
    const cameFromChoice = edges.some((x) => x.kind === 'choice' && x.to === e.to && x.from !== e.from)
    return cameFromChoice && choiceTargets.has(e.from)
  })
}

/** Star types the game recognises; `Preonstar` and `Quarkstar` are the two it refuses for stars. */
const STAR_TYPES = new Set(STAR_TYPE_GROUPS.flatMap((g) => g.items))
const REFUSED_STAR_TYPES = ['Preonstar', 'Quarkstar']

/** Every type name in PlanetType.enum; a planet of any of them loads. */
const BODY_TYPES = new Set([...PLANET_TYPES, 'Asteroids', ...STAR_TYPES, ...REFUSED_STAR_TYPES])
/** Planet types and Asteroids sit below StarM_RedDwarf in PlanetType.enum: their orbit is floored and a station may sit on them. */
const isPlanetBody = (type: string) => type === 'Asteroids' || PLANET_TYPES.includes(type)
const orbitKey = (p: Planet) => `${p.system}:${isPlanetBody(p.type) ? Math.floor(p.orbit / 100) * 100 : Math.trunc(p.orbit)}`

/** Planets StationsStarsMod keeps, in load order: any PlanetType name, first per orbit per system. */
export function loadedPlanets(mod: StarsView) {
  const kept: Planet[] = []
  const orbits = new Set<string>()
  for (const p of mod.planets) {
    if (!BODY_TYPES.has(p.type)) continue
    const key = orbitKey(p)
    if (orbits.has(key)) continue
    orbits.add(key)
    kept.push(p)
  }
  return kept
}

export function starsProblems(mod: StarsView): Problem[] {
  const out: Problem[] = []
  const push = (severity: Problem['severity'], id: string, message: string, path: string, label: string, field?: string) =>
    out.push({ id, severity, message, location: { path, label, field } })
  if (!mod.meta.title.trim()) push('warning', 'title', t('stars.modNameRequired'), 'overview', t('stars.modName'), 'title')
  mod.stars.forEach((s) => {
    const path = `stars/${s.id}`
    if (!s.name.trim()) push('warning', `sname-${s.id}`, t('stars.starNameRequired'), path, t('stars.untitledStar'), 'name')
    if (s.name === 'Sagittarius A*') push('error', `sgr-${s.id}`, t('rules.sagittarius'), path, s.name, 'name')
    if (!STAR_TYPES.has(s.type) || REFUSED_STAR_TYPES.includes(s.type)) push('warning', `stype-${s.id}`, t('rules.starTypeUnknown', { name: s.type }), path, s.name || t('stars.untitledStar'), 'type')
  })
  const galaxy = getGalaxy()
  if (galaxy) {
    for (const c of mapChecks(mod.stars, galaxy)) {
      const star = mod.stars.find((s) => s.id === c.starId)!
      push(c.severity, c.id, t(`map.${c.key}`, c.vars), `stars/${c.starId}`, star.name || t('stars.untitledStar'), c.key === 'moves' ? 'name' : 'position')
    }
  }
  const loaded = new Set(loadedPlanets(mod))
  const orbits = new Set<string>()
  mod.planets.forEach((p) => {
    const path = `planets/${p.id}`
    const label = p.name || t('stars.untitledPlanet')
    if (!p.name.trim()) push('warning', `pname-${p.id}`, t('stars.planetNameRequired'), path, label, 'name')
    if (!p.system) push('error', `psys-${p.id}`, t('stars.chooseSystem'), path, label, 'system')
    if (!BODY_TYPES.has(p.type)) {
      push('error', `ptype-${p.id}`, t('rules.planetTypeUnknown', { name: p.type }), path, label, 'type')
      return
    }
    const key = orbitKey(p)
    if (!loaded.has(p) && orbits.has(key)) push('error', `orbit-${p.id}`, t('rules.orbitTaken', { system: p.system }), path, label, 'orbit')
    else if (loaded.has(p) && p.system) {
      // In game a star-type entry becomes a companion star, and later planets of the system orbit it.
      const companion = [...loaded].slice(0, [...loaded].indexOf(p)).find((o) => o.system === p.system && !isPlanetBody(o.type))
      if (!isPlanetBody(p.type)) push('warning', `pcompanion-${p.id}`, t('rules.planetCompanion', { name: p.type, system: p.system }), path, label, 'type')
      else if (companion) push('warning', `pafter-${p.id}`, t('rules.planetAfterCompanion', { name: companion.name || companion.type }), path, label, 'system')
    }
    orbits.add(key)
  })
  const starNames = new Set(mod.stars.map((s) => s.name))
  const stationNames = new Set(STATIONS.map((s) => s.name))
  mod.stations.forEach((st) => {
    const path = `stations/${st.id}`
    const label = st.name || t('stars.untitledStation')
    if (!st.name.trim()) push('warning', `stname-${st.id}`, t('stars.stationNameRequired'), path, label, 'name')
    else if (stationNames.has(st.name)) push('error', `stdupe-${st.id}`, t('rules.stationNameTaken', { name: st.name }), path, label, 'name')
    stationNames.add(st.name)
    if (!st.system) { push('error', `stsys-${st.id}`, t('stars.chooseSystem'), path, label, 'system'); return }
    if (!starNames.has(st.system)) push('error', `stnostar-${st.id}`, t('rules.stationNoStar', { system: st.system }), path, label, 'system')
    const inSystem = [...loaded].filter((p) => p.system === st.system)
    const body = inSystem[st.bodyIndex - 1]
    if (!body) push('error', `onplanet-${st.id}`, inSystem.length ? t('rules.stationPlanetMissing', { n: st.bodyIndex, count: inSystem.length, system: st.system }) : t('rules.stationNoPlanets', { system: st.system }), path, label, 'bodyIndex')
    else if (!isPlanetBody(body.type)) push('error', `onplanet-${st.id}`, t('rules.stationOnStar', { n: st.bodyIndex, name: body.name || body.type }), path, label, 'bodyIndex')
  })
  return out
}

export function modProblems(mod: ModPart, all: ModPart[]) {
  return mod.meta.type === 'quest' ? questProblems(mod as QuestView, all) : starsProblems(mod as StarsView)
}

export const conditionSentence = describeCondition

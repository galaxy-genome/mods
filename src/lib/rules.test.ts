// node src/lib/rules.test.ts — problem severities and the stars loader rules.
import { strict as assert } from 'node:assert'
import { registerHooks } from 'node:module'

const src = new URL('../', import.meta.url)
const stubs: Record<string, string> = {
  '@/i18n': 'export const t = (key) => key; export const useT = () => t',
  '@/store/editor': 'export const updateQuest = () => {}',
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier in stubs) return { url: `stub:${specifier}`, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      const path = specifier.slice(2)
      return next(new URL(/\.\w+$/.test(path) ? path : `${path}.ts`, src).href, context)
    }
    if (specifier.startsWith('./') && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context)
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: stubs[url.slice(5)], shortCircuit: true }
    if (url.endsWith('.json')) {
      const { source } = next(url, { ...context, format: 'json', importAttributes: { type: 'json' } })
      return { format: 'module', source: `export default ${source}`, shortCircuit: true }
    }
    return next(url, context)
  },
})

const { questProblems, starsProblems } = await import('./rules.ts')
const { newLine, newMission, newQuestView, newShip, newStarsView, newStep } = await import('./factory.ts')

const byPrefix = (list: { id: string; severity: string }[], prefix: string) => list.find((p) => p.id.startsWith(prefix))?.severity

// Quest rules
const bad = newQuestView('', {
  settings: { questName: '', description: '', charName: '', stationName: 'Nowhere Hub', charImage: 'Nobody', questId: 100010 },
  steps: [
    newStep({
      finishWhen: 'BUTTON_ACTION_DIALOG_COMPLETE',
      dialogue: [newLine({ portrait: 'Nobody', choices: [1, 2, 3, 4].map((n) => ({ id: `c${n}`, text: `${n}`, targetStepId: null })) })],
      ships: [newShip({ pilot: 'Rex' }), newShip({ pilot: 'Rex' }), newShip({ pilot: '' })],
      mission: newMission({ type: 'Smuggling', homeStation: 'Nowhere Hub', targetSystem: '' }),
    }),
  ],
  rumors: [],
})
const qp = questProblems(bad, [bad])
for (const [prefix, severity] of Object.entries({
  'quest-name': 'warning', description: 'warning', 'char-name': 'warning', 'min-steps': 'error',
  'id-game': 'error', 'station-unknown': 'warning', portrait: 'warning',
})) assert.equal(byPrefix(qp, prefix), severity, prefix)
assert.equal(byPrefix(qp, 'button-'), 'error')
assert.equal(byPrefix(qp, 'choices-'), 'error')
assert.equal(byPrefix(qp, 'line-portrait-'), 'warning')
assert.equal(byPrefix(qp, 'dupe-pilot-'), 'error')
assert.equal(byPrefix(qp, 'pilot-'), 'warning')
assert.equal(byPrefix(qp, 'mission-type-'), 'warning')
assert.equal(byPrefix(qp, 'mission-station-'), 'error')
assert.equal(byPrefix(qp, 'mission-system-'), 'error')

// A station mission offered anywhere but a game station breaks quest and stars loading.
{
  const modStars = newStarsView('M')
  modStars.stations = [{ id: 'x', name: 'Mod Ring', system: 'Kestrel', bodyIndex: 1, type: 'OrbitalDark', faction: 'Independent' }]
  const home = (homeStation: string) => {
    const v = newQuestView('H', { settings: { stationName: 'Mod Ring' }, steps: [newStep(), newStep({ mission: newMission({ type: 'Courier', homeStation, targetStation: homeStation, story: true }) })], rumors: [] })
    return questProblems(v, [v, modStars], null).filter((p) => p.id.startsWith('mission-station-')).map((p) => `${p.severity}:${p.message}`)
  }
  assert.deepEqual(home('Thunder Station'), [])
  assert.deepEqual(home('Mod Ring'), ['error:rules.missionHomeModStation rules.missionHomeBreaks'])
  assert.deepEqual(home('Nowhere Hub'), ['error:rules.stationUnknown rules.missionHomeBreaks'])
}

// A checkpoint on a step that finishes on a warp end completes on an in-game load.
{
  const warp = (finishWhen: string, checkpoint = true) => {
    const v = newQuestView('W', { settings: {}, steps: [newStep(), newStep({ checkpoint, finishWhen })], rumors: [] })
    return questProblems(v, [v], null).filter((p) => p.id.startsWith('warp-load-')).map((p) => p.severity)
  }
  assert.deepEqual(warp('ACTION_WARP_END_SYSTEM_Sirius'), ['tip'])
  assert.deepEqual(warp('ACTION_WARP_END'), ['tip'])
  assert.deepEqual(warp('ACTION_WARP_END', false), [])
  assert.deepEqual(warp('ACTION_DIALOG_COMPLETE'), [])
}

const space = newQuestView('Space', { settings: { startMode: 'space', chance: 0 }, steps: [newStep({ finishWhen: null }), newStep()], rumors: [] })
const sp = questProblems(space, [space])
assert.equal(byPrefix(sp, 'chance-zero'), 'error')
assert.equal(byPrefix(sp, 'finish-'), 'error')

// A courier back to its own station needs no target system.
const courier = newQuestView('Courier', {
  settings: { stationName: 'Thunder Station', charName: 'A', description: 'd' },
  steps: [newStep({ mission: newMission({ type: 'Courier', targetStation: 'Thunder Station', targetSystem: '' }) }), newStep()],
  rumors: [],
})
assert.equal(byPrefix(questProblems(courier, [courier]), 'mission-system-'), undefined)

// Stars loader rules
const stars = newStarsView('')
stars.stars = [
  { id: 's1', name: 'Kestrel', x: 0, y: 0, z: 0, security: 'High', type: 'G-WhiteYellow' },
  { id: 's2', name: 'Odd', x: 0, y: 0, z: 0, security: 'High', type: 'M-Dwarf' },
  { id: 's3', name: 'Preon', x: 0, y: 0, z: 0, security: 'High', type: 'Preonstar' },
  { id: 's4', name: 'Sagittarius A*', x: 0, y: 0, z: 0, security: 'High', type: 'BlackHole' },
]
const planet = (id: string, type: string, orbit: number, system = 'Kestrel') => ({ id, name: id, system, type, orbit, moons: 0, size: 1, rings: 0, material: null })
stars.planets = [
  planet('belt', 'Asteroids', 100),
  planet('sun', 'M-RedDwarf', 200),
  planet('a', 'RockPlanet', 350),
  planet('b', 'IcePlanet', 399),
  planet('c', 'WaterWorld', 400),
  planet('nosys', 'RockPlanet', 500, ''),
  planet('sunb', 'K-YellowOrange', 250),
  planet('junk', 'Nebula', 600),
]
const station = (id: string, name: string, system: string, bodyIndex: number) => ({ id, name, system, bodyIndex, type: 'OrbitalDark' as const, faction: 'Independent' as const })
stars.stations = [
  station('ok', 'Harvest Ring', 'Kestrel', 1),
  station('ok2', 'Belt Ring', 'Kestrel', 3),
  station('onstar', 'Sun Ring', 'Kestrel', 2),
  station('gone', 'Far Ring', 'Kestrel', 5),
  station('taken', 'Thunder Station', 'Kestrel', 1),
  station('nostar', 'Lost Ring', 'Sirius', 1),
  station('empty', '', 'Kestrel', 1),
]
const sp2 = starsProblems(stars)
const at = (id: string) => sp2.filter((p) => p.id.endsWith(`-${id}`)).map((p) => `${p.id.split('-')[0]}:${p.severity}`).sort()
assert.equal(byPrefix(sp2, 'title'), 'warning')
assert.deepEqual(at('s1'), [])
assert.deepEqual(at('s2'), ['stype:warning'])
assert.deepEqual(at('s3'), ['stype:warning'])
assert.deepEqual(at('s4'), ['sgr:error'])
assert.deepEqual(at('belt'), [])
assert.deepEqual(at('sun'), ['pcompanion:warning'])
assert.deepEqual(at('a'), ['pafter:warning'])
assert.deepEqual(at('b'), ['orbit:error'])
assert.deepEqual(at('c'), ['pafter:warning'])
assert.deepEqual(at('nosys'), ['psys:error'])
assert.deepEqual(at('sunb'), ['pcompanion:warning'], 'a star-type orbit is not rounded, so 250 does not collide with 200')
// Every type loads: Kestrel's planets are belt, sun, a, c, sunb; PlanetID 2 is a star and 6 does not exist.
assert.deepEqual(at('ok'), [])
assert.deepEqual(at('ok2'), [])
assert.deepEqual(at('onstar'), ['onplanet:error'])
assert.equal(sp2.find((p) => p.id === 'onplanet-onstar')?.message, 'rules.stationOnStar')
assert.deepEqual(at('gone'), ['onplanet:error'])
assert.deepEqual(at('taken'), ['stdupe:error'])
assert.deepEqual(at('nostar'), ['onplanet:error', 'stnostar:error'])
assert.deepEqual(at('empty'), ['stname:warning'])
assert.deepEqual(at('junk'), ['ptype:error'])
console.log('rules ok')

// System names: arrivals match catalogue, mod and generated systems; mission targets only catalogue and mod.
{
  const { readFileSync } = await import('node:fs')
  const { makeGalaxy } = await import('../features/map/galaxy.ts')
  const galaxy = makeGalaxy(JSON.parse(readFileSync(new URL('../../public/data/galaxy.json', import.meta.url), 'utf8')))
  const modStars = newStarsView('S')
  modStars.stars.push({ id: 'n', name: 'Nova', x: 500, y: 600, z: 0, security: 'Low', type: 'M-RedDwarf' })
  const gen = 'Algira Eg-Bd D4'
  const quest = (system: string, target: string) => newQuestView('Q', {
    settings: { stationName: 'Thunder Station' },
    steps: [
      newStep({ finishWhen: 'ACTION_DIALOG_COMPLETE' }),
      newStep({ finishWhen: `ACTION_WARP_END_SYSTEM_${system}`, mission: newMission({ type: 'Smuggling', homeStation: 'Thunder Station', targetSystem: target, story: true }) }),
    ],
    rumors: [],
  })
  const sys = (v: ReturnType<typeof quest>, g: typeof galaxy | null = galaxy) =>
    questProblems(v, [v, modStars], g).filter((p) => /^(sys|mission-target)-/.test(p.id)).map((p) => `${p.id.split('-').slice(0, p.id.startsWith('sys') ? 1 : 2).join('-')}:${p.severity}:${p.message}`)
  assert.deepEqual(sys(quest('Sirius', 'Sirius')), [])
  assert.deepEqual(sys(quest('Nova', 'Nova')), [])
  assert.deepEqual(sys(quest(gen, gen)), ['mission-target:error:rules.systemGenerated'])
  assert.deepEqual(sys(quest('Ross 128', 'Sirius')), ['sys:warning:rules.systemHidden'])
  assert.deepEqual(sys(quest('Sirus', 'Nowhere at all')), ['sys:warning:rules.systemUnknownGuess', 'mission-target:error:rules.systemUnknown'])
  assert.deepEqual(sys(quest('Sirus', 'Nowhere at all'), null), [])
}

// Samples built from templates model good practice: no errors or warnings. The Long Haul is an imported mod, kept as written.
{
  const { modProblems } = await import('./rules.ts')
  const { sampleMods } = await import('./templates.ts')
  const all = sampleMods()
  for (const m of all.filter((m) => m.meta.id !== 'sample-long-haul')) assert.deepEqual(modProblems(m, all).filter((p) => p.severity !== 'tip').map((p) => p.id), [], m.meta.title)
}

// Required mods: places from another mod need it required; a missing requirement and an unused one are flagged.
{
  const { modFromParts, partsOf } = await import('./mods.ts')
  const { SYSTEMS } = await import('./reference.ts')
  const stars = newStarsView('Trappist')
  stars.stars = [{ id: 's1', name: 'Trappist-1', x: 0, y: 0, z: 0, security: 'High', type: 'G-WhiteYellow' }]
  const trappist = modFromParts([stars], { id: 'trappist', title: 'Trappist', version: '2.0', community: { entryId: 'community-trappist', entryTitle: 'Trappist', author: '', licence: '', popularity: 0 } })
  const questMod = (system: string, requires?: { modId: string; entryId?: string; title: string }[]) =>
    modFromParts([newQuestView('Q', { settings: {}, steps: [newStep(), newStep({ finishWhen: `ACTION_WARP_END_SYSTEM_${system}` })], rumors: [] })], { id: 'q', title: 'Q', requires })
  const deps = (q: ReturnType<typeof questMod>, others = [trappist]) => {
    const all = [q, ...others].flatMap(partsOf)
    return questProblems(partsOf(q)[0] as never, all, null).filter((p) => p.id.startsWith('dep-')).map((p) => `${p.id}:${p.severity}:${p.fix?.label ?? ''}`)
  }
  assert.deepEqual(deps(questMod('Trappist-1')), ['dep-add-trappist:warning:rules.depAdd'])
  assert.deepEqual(deps(questMod('Trappist-1', [{ modId: 'trappist', title: 'Trappist' }])), [])
  assert.deepEqual(deps(questMod('Trappist-1', [{ modId: 'trappist@1.0', entryId: 'community-trappist', title: 'Trappist' }])), [], 'a library entry satisfies by entry id')
  assert.deepEqual(deps(questMod(SYSTEMS[0].name, [{ modId: 'trappist', title: 'Trappist' }])), ['dep-unused-trappist:tip:rules.depRemove'])
  assert.deepEqual(deps(questMod('Trappist-1', [{ modId: 'gone', entryId: 'community-gone', title: 'Gone' }]), [trappist]), ['dep-add-trappist:warning:rules.depAdd', 'dep-missing-gone:warning:rules.depAddFromLibrary'])
  assert.deepEqual(deps(questMod(SYSTEMS[0].name, [{ modId: 'local', title: 'Local' }]), []), ['dep-missing-local:warning:'])
}

// Required quests: game IDs are known without the local names file; an unknown ID offers Choose a quest.
{
  const v = newQuestView('R', { settings: { requiredQuestIds: [100010, 3_123_456] }, steps: [newStep(), newStep()], rumors: [] })
  const reqs = questProblems(v, [v], null).filter((p) => p.id.startsWith('req-')).map((p) => `${p.id}:${p.fix?.label}`)
  assert.deepEqual(reqs, ['req-3123456:rules.chooseQuest'])
}

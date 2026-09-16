// node --import ./scripts/test-hooks.mjs src/lib/dependencies.test.ts — picker valid sets, mod dependencies, the migration.
import { strict as assert } from 'node:assert'
import { addRequires } from '../data/migrations.ts'
import { modDependencies, placeOptions, satisfies } from './dependencies.ts'
import { newMission, newQuestView, newStarsView, newStep, uid } from './factory.ts'
import { modFromParts } from './mods.ts'
import { STATIONS, SYSTEMS } from './reference.ts'
import type { Mod, StarsView } from './types.ts'

const starsMod = (id: string, star: string, station: string, entryId?: string): Mod => {
  const v = newStarsView(id)
  v.stars = [{ id: uid(), name: star, x: 10, y: 20, z: 0, security: 'High', type: 'G-WhiteYellow' }]
  v.planets = [{ id: uid(), name: `${star} b`, system: star, type: 'RockPlanet', orbit: 100, moons: 0, size: 50, rings: 0, material: null }]
  v.stations = [{ id: uid(), name: station, system: star, bodyIndex: 1 } as StarsView['stations'][number]]
  return modFromParts([v], { id, title: id, version: '2.0', ...(entryId ? { community: { entryId, entryTitle: id, author: '', licence: '', popularity: 0 } } : {}) })
}
const questMod = (id: string, system: string, station = STATIONS[0].name) => modFromParts([newQuestView(id, {
  settings: { stationName: station },
  steps: [newStep({ finishWhen: `ACTION_WARP_END_SYSTEM_${system}` }), newStep({ mission: newMission({ homeStation: station, targetSystem: system }) })],
  rumors: [],
})], { id, title: id })

const trappist = starsMod('trappist', 'Trappist-1', 'Trappist Hub', 'community-trappist')
const other = starsMod('other', 'Elsewhere', 'Else Port')

// Picker valid sets
const sys = placeOptions('system', trappist, [trappist, other])
assert.equal(sys.game.length, SYSTEMS.length)
assert.deepEqual(sys.own.map((o) => o.name), ['Trappist-1'])
assert.deepEqual(sys.others.map((x) => [x.mod.meta.id, x.options.map((o) => o.name)]), [['other', ['Elsewhere']]])
const quest = questMod('q', 'Trappist-1')
assert.deepEqual(placeOptions('system', quest, [quest, trappist]).own, [])
assert.deepEqual(placeOptions('station', quest, [quest, trappist], { system: 'Trappist-1' }).others[0].options.map((o) => o.name), ['Trappist Hub'])
assert.equal(placeOptions('station', quest, [], { system: STATIONS[0].system }).game.every((o) => o.system === STATIONS[0].system), true)
assert.deepEqual(placeOptions('planet', null, [], {}).game, [], 'planets need a system')
assert.deepEqual(placeOptions('planet', trappist, [trappist], { system: 'Trappist-1' }).own.map((o) => o.name), ['Trappist-1 b'])
assert.deepEqual(placeOptions('system', null, [trappist], { catalogue: [{ name: 'Trappist-1' }] }).others, [], 'a catalogue name is not offered twice')

// Dependencies
assert.deepEqual(modDependencies(questMod('g', SYSTEMS[0].name), [trappist]), [], 'game places need no mod')
const deps = modDependencies(quest, [quest, trappist, other])
assert.equal(deps.length, 1)
assert.deepEqual(deps[0].requirement, { modId: 'trappist', title: 'trappist', version: '2.0', entryId: 'community-trappist' })
assert.deepEqual(deps[0].uses.map((u) => u.field), ['finishWhen', 'targetSystem'])
assert.deepEqual(modDependencies(questMod('s', SYSTEMS[0].name, 'Trappist Hub'), [trappist])[0].uses.map((u) => u.field), ['stationName', 'homeStation'])
// A mod's own stars are not a dependency; names change and dependencies follow.
const both = questMod('both', 'Trappist-1')
both.stars = structuredClone(trappist.stars)
assert.deepEqual(modDependencies(both, [both, trappist]), [])
const renamed = structuredClone(quest)
renamed.quests[0].versions.en!.steps.forEach((s) => { if (s.finishWhen) s.finishWhen = 'ACTION_WARP_END_SYSTEM_Elsewhere'; if (s.mission) s.mission.targetSystem = 'Elsewhere' })
assert.deepEqual(modDependencies(renamed, [trappist, other]).map((d) => d.source.meta.id), ['other'])
// A required mod wins when two mods provide the name; a reinstalled library entry still satisfies it.
const trappist2 = starsMod('trappist@2.1', 'Trappist-1', 'Trappist Hub', 'community-trappist')
const pinned = structuredClone(quest)
pinned.meta.requires = [{ modId: 'trappist', entryId: 'community-trappist', title: 'trappist' }]
assert.equal(modDependencies(pinned, [starsMod('copy', 'Trappist-1', 'X'), trappist2])[0].source.meta.id, 'trappist@2.1')
assert.equal(satisfies(pinned.meta.requires[0], trappist2), true)

// Migration 1 → 2 computes requires from current references.
const stored = (m: Mod) => JSON.parse(JSON.stringify({ ...m, textures: [] }))
const migrated = addRequires(stored(quest), [stored(quest), stored(trappist)]) as { meta: { requires?: unknown } }
assert.deepEqual(migrated.meta.requires, [{ modId: 'trappist', title: 'trappist', version: '2.0', entryId: 'community-trappist' }])
assert.equal((addRequires(stored(questMod('g', SYSTEMS[0].name)), [stored(trappist)]) as { meta: object }).meta.hasOwnProperty('requires'), false)
assert.deepEqual(addRequires({ x: 1 }, []), { x: 1 })
console.log('dependencies ok')

{
  const { withRequired } = await import('./dependencies.ts')
  const m = (id: string, ...req: string[]) => ({ meta: { id, title: id, version: '', favorite: false, requires: req.map((modId) => ({ modId, title: modId })) }, quests: [], stars: null })
  assert.deepEqual(withRequired(['a'], [m('a', 'b'), m('b', 'c', 'a'), m('c'), m('d')]).sort(), ['a', 'b', 'c'])
  assert.deepEqual(withRequired(['d'], [m('d', 'gone')]), ['d'])
  console.log('withRequired ok')
}

// A required quest ID found only in another mod is a dependency; game IDs and the main story are not.
{
  const giver = modFromParts([newQuestView('Giver', { settings: { questId: 3_500_000 }, steps: [], rumors: [] })], { id: 'giver', title: 'Giver' })
  const follow = (ids: number[]) => modFromParts([newQuestView('F', { settings: { requiredQuestIds: ids }, steps: [], rumors: [] })], { id: 'f', title: 'F' })
  assert.deepEqual(modDependencies(follow([3_500_000]), [giver]).map((d) => [d.source.meta.id, d.uses[0].kind, d.uses[0].field]), [['giver', 'quest', 'requiredQuestIds']])
  assert.deepEqual(modDependencies(follow([0, 100002, 3_999_999]), [giver]), [])
  console.log('quest dependencies ok')
}

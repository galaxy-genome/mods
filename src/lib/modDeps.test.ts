// node --import ./scripts/test-hooks.mjs src/lib/modDeps.test.ts — the dependencies JSON and the checks that intersect it.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { GRID } from '../features/map/camera.ts'
import { type GalaxyData, makeGalaxy } from '../features/map/galaxy.ts'
import { planDownload } from './download.ts'
import { newQuestView, newStarsView, newStep, uid } from './factory.ts'
import { modDeps } from './modDeps.ts'
import { modFromParts, partsOf } from './mods.ts'
import { questProblems } from './rules.ts'
import { STATIONS } from './reference.ts'
import type { Mod, QuestView } from './types.ts'

const galaxy = makeGalaxy(JSON.parse(readFileSync(new URL('../../public/data/galaxy.json', import.meta.url), 'utf8')) as GalaxyData)
const fixture = JSON.parse(readFileSync(new URL('../features/map/fixtures/cells.json', import.meta.url), 'utf8'))
const side = new Uint8Array(GRID * GRID), zones = new Uint8Array(GRID * GRID * 3)
for (const c of fixture.cells) { side[c.cy * GRID + c.cx] = c.side; zones.set(c.zones, (c.cy * GRID + c.cx) * 3) }
galaxy.generator.setMaps(side, zones)

// Cell 1259,888: a star on D8 removes D4 and changes D5–D9 (map.test.ts checks the generation itself).
const cell = fixture.expected[fixture.cells.findIndex((c: { cx: number; cy: number }) => c.cx === 1259 && c.cy === 888)][0] as { name: string; x: number; z: number }[]
const [D4, D6, D12] = [cell[4].name, cell[6].name, cell[12].name]

const starsMod = (title: string, x: number, y: number, extra: Partial<Mod['meta']> = {}) => {
  const v = newStarsView(title)
  v.stars = [{ id: uid(), name: `${title} Star`, x, y, z: 0, security: 'High', type: 'G-WhiteYellow' }, { id: uid(), name: `${title} Twin`, x: 0.1, y: 0, z: 0, security: 'High', type: 'G-WhiteYellow' }]
  v.stations = [{ id: uid(), name: `${title} Port`, system: `${title} Star`, bodyIndex: 1 } as never]
  return modFromParts([v], { title, favorite: true, ...extra })
}
const quest = (title: string, ...systems: string[]) => newQuestView(title, {
  settings: { questId: 3_400_000, stationName: STATIONS[0].name, requiredQuestIds: [3_500_000] },
  steps: systems.map((s) => newStep({ finishWhen: `ACTION_WARP_END_SYSTEM_${s}` })),
  rumors: [],
})

// Quest-only mod: uses sorted and split, adds only its quest ID, changes nothing.
{
  const m = modFromParts([quest('Q', D6, 'Sol', D4, D4)], { title: 'Q' })
  assert.deepEqual(modDeps(m, { galaxy }), {
    uses: { systems: ['Sol'], stations: [STATIONS[0].name], planets: [], generated: [D4, D6].sort(), quests: ['3500000'] },
    adds: { systems: [], stations: [], planets: [], quests: ['3400000'] },
    changes: { cells: [], hiddenSlots: [], deletedGenerated: [], renumberedGenerated: [] },
  })
  assert.equal(modDeps(m, { galaxy }), modDeps(m, { galaxy }), 'memoized per mod')
}

// Stars-only mod: one star on D8, one in Sol's slot.
const stars = starsMod('S', cell[8].x, cell[8].z)
{
  const d = modDeps(stars, { galaxy })
  assert.deepEqual(d.adds, { systems: ['S Star', 'S Twin'], stations: ['S Port'], planets: [], quests: [] })
  assert.deepEqual(d.changes.cells, ['1259,888'])
  assert.deepEqual(d.changes.hiddenSlots, ['1025,1591,0,0'])
  assert.deepEqual(d.changes.deletedGenerated, [D4])
  assert.deepEqual(d.changes.renumberedGenerated, cell.slice(5, 10).map((s) => s.name).sort())
  assert.equal(modDeps(stars, { galaxy: null }).changes.cells.length, 0, 'no galaxy, no changes')
}

// Cross-mod: a favorite quest on a generated system another favorite removes or changes is an error naming both.
{
  const q = modFromParts([quest('Road Trip', D4, D6, D12)], { title: 'Road Trip', favorite: true })
  const issues = planDownload([q, stars], 'en', [q, stars].flatMap(partsOf), [q, stars], galaxy).issues.filter((i) => i.severity === 'error')
  assert.deepEqual(issues.map((i) => i.message), [
    `“Road Trip” uses the generated system ${D4}, which the stars of “S” remove from the game’s map.`,
    `“Road Trip” uses the generated system ${D6}, which the stars of “S” move or turn into a different star.`,
  ])
  assert.equal(planDownload([q], 'en', partsOf(q), [q, stars], galaxy).issues.filter((i) => i.severity === 'error').length, 0, 'only favorites count')

  // The same two checks within one mod: its own quests against its own stars, in Download and in the quest's problems.
  const both = starsMod('Both', cell[8].x, cell[8].z)
  both.quests = q.quests
  const parts = partsOf(both)
  assert.equal(planDownload([both], 'en', parts, [both], galaxy).issues.filter((i) => i.severity === 'error').length, 2)
  const problems = questProblems(parts.find((p) => p.meta.type === 'quest') as QuestView, parts, galaxy).filter((p) => p.id.startsWith('generated-'))
  assert.deepEqual(problems.map((p) => [p.severity, p.message]), [
    ['error', `“Road Trip” uses the generated system ${D4}, which the stars of “Both” remove from the game’s map.`],
    ['error', `“Road Trip” uses the generated system ${D6}, which the stars of “Both” move or turn into a different star.`],
  ])
}
console.log('modDeps ok')

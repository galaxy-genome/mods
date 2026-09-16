// npm test — the place resolver and the quest and series place layers, against committed data only.
// SURVEY=1 prints resolved and unresolved counts for the community library and, when present locally, the game's quests.
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

const src = new URL('../../', import.meta.url)
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

const { makeGalaxy } = await import('./galaxy.ts')
const { GRID } = await import('./camera.ts')
const { makeResolver, placeContext, compassOf, placeLabel, questPlaces, inheritPlaces, placeRoutes, routeLegs, seriesPlaces, sharedPlaces, distanceLy } = await import('./places.ts')
const { newLine, newMission, newQuestView, newStarsView, newStep } = await import('@/lib/factory.ts')
import type { GalaxyData } from './galaxy'
import type { QuestContent, QuestView } from '@/lib/types'

const data = JSON.parse(readFileSync(new URL('../../../public/data/galaxy.json', import.meta.url), 'utf8')) as GalaxyData
const fixture = JSON.parse(readFileSync(new URL('./fixtures/cells.json', import.meta.url), 'utf8')) as {
  cells: { cx: number; cy: number; side: number; zones: number[] }[]
  expected: { name: string; x: number; z: number }[][][]
}
const content = (v: QuestView) => v.versions[v.primaryLang] as QuestContent

// Catalogue, reference station and mod star (which moves a catalogue system).
{
  const galaxy = makeGalaxy(data)
  const stars = newStarsView('S')
  stars.stars.push({ id: 's', name: 'Wolf 359', x: 1, y: 2, z: 0, security: 'Low', type: 'M-RedDwarf' }, { id: 'n', name: 'Nova', x: 500, y: 600, z: 0, security: 'Low', type: 'M-RedDwarf' })
  stars.stations.push({ id: 'st', name: 'Nova Port', system: 'Nova', bodyIndex: 1, type: 'NovaStation', faction: 'Independent' })
  const r = makeResolver(galaxy, [stars])
  assert.deepEqual(r.station('Thunder Station'), { x: 0, y: 0, system: 'Sol', source: 'catalogue' })
  assert.equal(r.system('Wolf 359')?.source, 'mod')
  assert.deepEqual([r.station('Nova Port')?.x, r.station('Nova Port')?.system], [500, 'Nova'])
  assert.equal(r.system('Nowhere at all'), null)
  // A2 exists in many systems: only the quest's own systems choose one.
  assert.equal(r.planet('A2'), null)
  assert.equal(r.planet('A2', new Set(['Capella']))?.system, 'Capella')
  assert.equal(r.planet('B7')?.system, '36 Ophiuchi')
}

// Generated names decode to their cell, and to the exact star once the generation maps are loaded.
{
  const galaxy = makeGalaxy(data)
  const side = new Uint8Array(GRID * GRID), zones = new Uint8Array(GRID * GRID * 3)
  for (const c of fixture.cells) { side[c.cy * GRID + c.cx] = c.side; zones.set(c.zones, (c.cy * GRID + c.cx) * 3) }
  const cells = fixture.cells.map((c, i) => ({ c, stars: fixture.expected[i][0] })).filter((x) => x.stars.length)
  assert.ok(cells.length > 5)
  const before = makeResolver(galaxy, [])
  for (const { stars: list } of cells) {
    const st = list[list.length - 1]
    const at = before.system(st.name)
    assert.ok(at?.approx, st.name)
    assert.ok(Math.abs(at.x - st.x) < 44 && Math.abs(at.y - st.z) < 44, `${st.name} in its cell`)
  }
  galaxy.generator.setMaps(side, zones)
  const after = makeResolver(galaxy, [])
  for (const { stars: list } of cells) for (const st of list) {
    const at = after.system(st.name)
    assert.deepEqual([at?.x, at?.y, at?.approx], [st.x, st.z, undefined], st.name)
  }
  assert.equal(after.system(cells[0].stars[0].name.replace(/\d+$/, '999')), null)
}

// Quest places per step, routes through a talk-only step, fork labels and a loop.
const galaxy = makeGalaxy(data)
const resolve = makeResolver(galaxy, [])
{
  const talk = newStep({ name: 'Talk', finishWhen: 'ACTION_DIALOG_COMPLETE' })
  const left = newStep({ name: 'Left', finishWhen: 'ACTION_WARP_END_SYSTEM_Sirius' })
  const right = newStep({ name: 'Right', finishWhen: 'ACTION_WARP_END_SYSTEM_Wolf 359', failWhen: ['ACTION_CLICK_STATION_Nowhere Station'] })
  const end = newStep({ name: 'End', mission: newMission({ type: 'Courier', homeStation: 'Thunder Station', targetStation: 'Thunder Station', targetSystem: 'Sirius' }) })
  talk.dialogue = [newLine({ choices: [{ id: 'a', text: 'Go left', targetStepId: left.id }, { id: 'b', text: 'Go right', targetStepId: right.id }] })]
  right.dialogue = [newLine({ choices: [{ id: 'c', text: 'Again', targetStepId: left.id }] })]
  const v = newQuestView('Q', { settings: { stationName: 'Thunder Station' }, steps: [newStep({ finishWhen: 'ACTION_CLICK_STATION_Thunder Station' }), talk, left, right, end], rumors: [] })
  const qp = questPlaces(content(v), resolve)
  assert.deepEqual(qp.steps.map((s) => s.map((p) => `${p.role}:${p.name}`)), [
    ['offer:Thunder Station'], [], ['arrive:Sirius'], ['arrive:Wolf 359'], ['missionHome:Thunder Station'],
  ])
  assert.deepEqual(qp.unresolved.map((u) => `${u.step}:${u.place.kind}:${u.place.name}`), ['3:station:Nowhere Station'])
  const routes = placeRoutes(content(v), qp).map((r) => `${r.from}>${r.to}:${r.kind}:${r.label ?? ''}${r.back ? ':back' : ''}`)
  assert.deepEqual(routes.sort(), ['0>2:next:', '0>3:next:', '2>3:next:', '3>2:choice:Again:back'].sort())
  assert.deepEqual(placeRoutes(content(v), qp).filter((r) => r.from === 0).map((r) => r.via), [[1], [1]])
}

// A placeless step takes its predecessors' place only when every path into it arrives from one place.
{
  const at = (name: string) => `ACTION_WARP_END_SYSTEM_${name}`
  const names = (v: QuestView) => inheritPlaces(content(v), questPlaces(content(v), resolve)).steps.map((s) => s.map((p) => p.name).join())
  // Linear chain: offer, talk, talk, Sirius, talk.
  const chain = newQuestView('C', { settings: { stationName: 'Thunder Station' }, steps: [newStep({}), newStep({}), newStep({}), newStep({ finishWhen: at('Sirius') }), newStep({})], rumors: [] })
  assert.deepEqual(names(chain), ['Thunder Station', 'Thunder Station', 'Thunder Station', 'Sirius', 'Sirius'])
  // Branches from Sirius through placeless steps rejoin at a placeless step: it is still at Sirius.
  const a = newStep({}), b = newStep({}), join = newStep({})
  const fork = newStep({ finishWhen: at('Sirius') })
  fork.dialogue = [newLine({ choices: [{ id: 'a', text: 'A', targetStepId: a.id }, { id: 'b', text: 'B', targetStepId: b.id }] })]
  a.dialogue = [newLine({ choices: [{ id: 'j', text: 'J', targetStepId: join.id }] })]
  const rejoin = newQuestView('R', { settings: { stationName: 'Thunder Station' }, steps: [fork, a, b, join], rumors: [] })
  assert.deepEqual(names(rejoin), ['Thunder Station,Sirius', 'Sirius', 'Sirius', 'Sirius'])
  // Paths from Sirius and from Wolf 359 into one placeless step: its place is unknown.
  const left = newStep({ finishWhen: at('Sirius') }), right = newStep({ finishWhen: at('Wolf 359') }), meet = newStep({})
  const start = newStep({})
  start.dialogue = [newLine({ choices: [{ id: 'l', text: 'L', targetStepId: left.id }, { id: 'r', text: 'R', targetStepId: right.id }] })]
  left.dialogue = [newLine({ choices: [{ id: 'm', text: 'M', targetStepId: meet.id }] })]
  const two = newQuestView('T', { settings: { stationName: 'Thunder Station' }, steps: [start, left, right, meet], rumors: [] })
  assert.deepEqual(names(two), ['Thunder Station', 'Sirius', 'Wolf 359', ''])
}

// Waypoints: a round trip through a placeless step lifts its waypoint off the shared place; a true loop keeps one leg.
{
  const fight = newStep({ name: 'Fight', finishWhen: 'NO_ENEMY' })
  const end = newStep({ name: 'End', finishWhen: 'ACTION_CLICK_STATION_Thunder Station' })
  const sneak = newStep({ name: 'Sneak', finishWhen: 'ACTION_WARP_END_SYSTEM_Sirius' })
  const offer = newStep({ finishWhen: 'ACTION_CLICK_STATION_Thunder Station' })
  offer.dialogue = [newLine({ choices: [{ id: 'f', text: 'Fight', targetStepId: fight.id }, { id: 's', text: 'Sneak', targetStepId: sneak.id }] })]
  fight.dialogue = [newLine({ choices: [{ id: 'h', text: 'Home', targetStepId: end.id }] })]
  sneak.dialogue = [newLine({ choices: [{ id: 'b', text: 'Back', targetStepId: offer.id }] })]
  const v = newQuestView('R', { settings: { stationName: 'Thunder Station' }, steps: [offer, fight, sneak, end], rumors: [] })
  const qp = questPlaces(content(v), resolve)
  const routes = placeRoutes(content(v), qp)
  const { legs, waypoints } = routeLegs(routes, qp, 2)
  const show = (l: { route: { from: number; to: number; back: boolean }; x1: number; y1: number; x2: number; y2: number }) => `${l.route.from}>${l.route.to}${l.route.back ? ':back' : ''} (${l.x1},${l.y1})-(${l.x2},${l.y2})`
  // Offer at Sol → ◯2 above Sol → End at Sol: two legs, not one leg from Sol to Sol.
  assert.deepEqual(waypoints, [{ step: 1, x: 0, y: 2 }])
  const sirius = qp.steps[2][0]
  assert.deepEqual(legs.map(show).sort(), [
    '0>3 (0,0)-(0,2)', '0>3 (0,2)-(0,0)', `0>2 (0,0)-(${sirius.x},${sirius.y})`, `2>0:back (${sirius.x},${sirius.y})-(0,0)`,
  ].sort())
  // Every same-place leg is a real backward jump.
  assert.ok(legs.every((l) => (l.x1 !== l.x2 || l.y1 !== l.y2) || l.route.back))
  // Two steps at one place joined by "next" draw no leg.
  const two = newQuestView('T', { settings: { stationName: 'Thunder Station' }, steps: [newStep({ finishWhen: 'ACTION_CLICK_STATION_Thunder Station' }), newStep({ finishWhen: 'ACTION_CLICK_STATION_Thunder Station' })], rumors: [] })
  const tp = questPlaces(content(two), resolve)
  assert.deepEqual(routeLegs(placeRoutes(content(two), tp), tp, 2).legs, [])
  // A backward jump between steps at one place stays a loop.
  const again = content(two).steps
  again[1].dialogue = [newLine({ choices: [{ id: 'a', text: 'Again', targetStepId: again[0].id }] })]
  assert.deepEqual(routeLegs(placeRoutes(content(two), tp), tp, 2).legs.map(show), ['1>0:back (0,0)-(0,0)'])

  // Space quests start in their circle.
  const space = newQuestView('S', { settings: { startMode: 'space', pointX: 10, pointY: 20, radius: 30 }, steps: [newStep()], rumors: [] })
  assert.deepEqual(questPlaces(content(space), resolve).steps[0].map((p) => [p.kind, p.x, p.y, p.r]), [['area', 10, 20, 30]])
}

// Series: beats merge repeats, gates follow requiredQuestIds, places shared by two mods are marked.
{
  const a = newQuestView('A', { settings: { questId: 1, stationName: 'Thunder Station' }, steps: [newStep({ finishWhen: 'ACTION_CLICK_STATION_Thunder Station' }), newStep({ finishWhen: 'ACTION_WARP_END_SYSTEM_Sirius' })], rumors: [] })
  const b = newQuestView('B', { settings: { questId: 2, requiredQuestIds: [1], stationName: 'Thunder Station' }, steps: [newStep({ finishWhen: 'ACTION_WARP_END_SYSTEM_Sirius' })], rumors: [] })
  const { quests, gates } = seriesPlaces([
    { key: 'a', modId: 'm1', modTitle: 'M1', title: 'A', content: content(a) },
    { key: 'b', modId: 'm2', modTitle: 'M2', title: 'B', content: content(b) },
  ], resolve)
  assert.deepEqual(quests[0].beats.map((p) => p.name), ['Thunder Station', 'Sirius'])
  assert.deepEqual(gates, [{ from: 'a', to: 'b' }])
  assert.deepEqual([...sharedPlaces(quests)].sort(), ['Sirius', 'Sol'])
  assert.equal(Math.round(distanceLy(quests[0].beats[0], quests[0].beats[1])), Math.round(Math.hypot(galaxy.byName.get('Sirius')![1], galaxy.byName.get('Sirius')![2])))
}

// Coverage survey.
if (process.env.SURVEY) {
  const { importText } = await import('../start/importer.ts')
  const { COMMUNITY } = await import('@/lib/community.ts')
  const survey = (label: string, texts: string[]) => {
    let quests = 0, resolved = 0
    const unresolved: string[] = []
    for (const text of texts) {
      const r = importText(text)
      if (r.kind !== 'ok' || r.mod.meta.type !== 'quest') continue
      quests++
      const qp = questPlaces(content(r.mod as QuestView), resolve)
      resolved += qp.steps.flat().filter((p) => p.kind !== 'area').length
      unresolved.push(...qp.unresolved.map((u) => `${u.place.kind} ${u.place.name}`))
    }
    console.log(label, { quests, resolved, unresolved: unresolved.length }, [...new Set(unresolved)])
  }
  const gameDir = new URL('../../../../extracted/assets/questsen/', import.meta.url)
  try { survey('game', readdirSync(gameDir).filter((f) => f.endsWith('.json')).map((f) => readFileSync(new URL(f, gameDir), 'utf8'))) } catch { /* no local game files */ }
  survey('community', COMMUNITY.flatMap((e) => e.files.map((f) => f.text)))
}

console.log('places ok')

{
  const at = (kind: 'system' | 'station' | 'area', name: string, system: string) => ({ kind, role: 'arrive' as const, name, system, x: 0, y: 0, source: 'catalogue' as const })
  assert.equal(placeLabel([at('station', 'Manson Orbital', 'Wolf 359')], 'Area'), 'Manson Orbital (Wolf 359)')
  assert.equal(placeLabel([at('system', "Barnard's Star", "Barnard's Star"), at('station', 'Nexus Station', "Barnard's Star"), at('station', 'Vertex Terminal', "Barnard's Star")], 'Area'), "Barnard's Star: Nexus Station, Vertex Terminal")
  assert.equal(placeLabel([at('system', 'Sol', 'Sol')], 'Area'), 'Sol')
  assert.equal(placeLabel([at('area', '', '')], 'Area'), 'Area')
  console.log('placeLabel ok')
}

// Place context: station to system, 2D distance, eight-point direction, neighbours without itself, unresolved names.
{
  const galaxy = makeGalaxy(data)
  const r = makeResolver(galaxy, [])
  const nexus = placeContext(galaxy, r, 'station', 'Nexus Station')!
  assert.equal(nexus.system, "Barnard's Star")
  assert.equal(Math.round(nexus.ly * 100), Math.round(Math.hypot(3, 5) * 100))
  assert.equal(nexus.direction, 'nw')
  assert.deepEqual(nexus.nearest.map((n) => n.name), ['Ross 154', 'Sol', 'Alpha Centauri'])
  assert.equal(placeContext(galaxy, r, 'system', "Barnard's Star")!.nearest.some((n) => n.name === "Barnard's Star"), false)
  assert.equal(placeContext(galaxy, r, 'system', 'Sol')!.direction, null)
  assert.equal(placeContext(galaxy, r, 'station', 'No Such Station'), null)
  assert.equal(placeContext(galaxy, r, 'system', 'Nowhere at all'), null)
  assert.deepEqual([[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]].map(([x, y]) => compassOf({ x, y })), ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])
  console.log('placeContext ok')
}

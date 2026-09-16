// npm test — Quick Build output loads in full: zero starsProblems errors and no map warnings, for many seeds and knobs.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
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

const { starsProblems } = await import('../../lib/rules.ts')
const { newStarsView } = await import('../../lib/factory.ts')
const { makeGalaxy } = await import('../map/galaxy.ts')
const { mapChecks } = await import('../map/checks.ts')
const { Rndm } = await import('../map/generator.ts')
const { BATCH_MAX, PRESETS, applyBatch, generate, presetKnobs } = await import('./generate.ts')
type Knobs = import('./generate.ts').Knobs

const galaxy = makeGalaxy(JSON.parse(readFileSync(new URL('../../../public/data/galaxy.json', import.meta.url), 'utf8')))
const r = new Rndm(20260913)
const int = (a: number, b: number) => a + Math.floor(r.random() * (b - a + 1))
const some = <T,>(list: readonly T[]) => list.filter(() => r.random() < 0.4)
const range = (a: number, b: number): [number, number] => { const x = int(a, b), y = int(a, b); return [Math.min(x, y), Math.max(x, y)] }

const trappist = () => {
  const m = newStarsView('Trappist-1')
  m.stars = [{ id: 's1', name: 'Trappist-1', x: -12.4, y: 38.9, z: 1.2, security: 'Low', type: 'M-RedDwarf' }]
  m.planets = 'bcdefgh'.split('').map((l, i) => ({ id: `p${i}`, name: `Trappist-1 ${l}`, system: 'Trappist-1', type: 'RockPlanet', orbit: 100 * (i + 1), moons: 0, size: 1, rings: 0, material: null }))
  m.stations = [{ id: 'st1', name: 'Red Dawn Outpost', system: 'Trappist-1', bodyIndex: 4, type: 'OrbitalDark', faction: 'Independent' }]
  return m
}
const errors = (m: ReturnType<typeof newStarsView>) => starsProblems(m).filter((p) => p.severity === 'error').map((p) => `${p.id}: ${p.message}`)
const shape = (b: ReturnType<typeof generate>) => JSON.stringify(b.systems, (k, v) => (k === 'id' ? undefined : v))

let runs = 0, systems = 0
const t0 = performance.now()
for (let n = 0; n < 500; n++) {
  const preset = PRESETS[n % PRESETS.length]
  const mode = n % 3 === 0 ? 'point' : 'region'
  const base = presetKnobs(preset, { x: int(-3000, 3000), y: int(-3000, 3000), seed: int(1, 2 ** 31), mode })
  // Half the runs randomise every knob, including empty and out-of-range lists.
  const k: Knobs = n % 2 ? base : {
    ...base, count: int(1, 140), radius: int(5, 900), spacing: int(0, 60), planets: range(0, 12), orbit: range(0, 2000), moons: range(0, 6),
    size: range(1, 10), rings: range(0, 3), stations: range(0, 4), stationShare: r.random(), materialShare: r.random(), belts: r.random() < 0.5,
    starGroups: some([0, 1, 2, 3, 4, 5, 6, 7, 99]), security: some(base.security), planetTypes: some([...base.planetTypes, 'Asteroids', 'M-RedDwarf']),
    stationTypes: some(base.stationTypes), factions: some(base.factions), materials: some(base.materials),
  }
  const replace = n % 4 === 1
  const into = n % 2 ? trappist() : newStarsView('Empty')
  const before = errors(into).length
  const batch = generate(k, galaxy, into, replace)
  assert.ok(batch.systems.length <= BATCH_MAX, 'batch cap')
  if (mode === 'point') assert.equal(batch.systems.length, 1)
  for (const g of batch.systems) {
    assert.equal(g.star.z, 0, 'visible on the game map')
    const lo = Math.max(1, Math.floor(k.orbit[0] / 100)), slots = Math.max(lo, Math.floor(k.orbit[1] / 100)) - lo + 1
    assert.ok(g.planets.length >= Math.min(k.planets[0], slots), 'planet floor')
    assert.ok(g.planets.length <= Math.max(k.planets[1], 0), 'planet ceiling')
  }
  applyBatch(into, batch.systems, replace)
  const fresh = errors(into).length - (replace ? 0 : before)
  if (fresh) assert.fail(`run ${n} (${preset}, ${mode}, replace ${replace}): ${errors(into).join('\n')}`)
  const ours = new Set(batch.systems.map((g) => g.star.id))
  const map = mapChecks(into.stars, galaxy).filter((c) => ours.has(c.starId) && c.severity !== 'tip')
  if (mode === 'region') assert.deepEqual(map, [], `run ${n}: map warnings`)
  runs++; systems += batch.systems.length
}

// Same seed and knobs, same systems; a reroll changes one system only; kept planets survive a reroll.
const k = presetKnobs('trading', { x: 0, y: 0, seed: 42, mode: 'region' })
const a = generate(k, galaxy, null), b = generate(k, galaxy, null)
assert.equal(shape(a), shape(b), 'deterministic')
const rolled = generate(k, galaxy, null, false, { salts: { 2: 1 } })
assert.notEqual(shape({ ...rolled, systems: [rolled.systems[2]] }), shape({ ...a, systems: [a.systems[2]] }), 'reroll changes the system')
assert.equal(shape({ ...rolled, systems: [rolled.systems[0], rolled.systems[1]] }), shape({ ...a, systems: [a.systems[0], a.systems[1]] }), 'reroll leaves the others')
const lockedPlanet = a.systems[3].planets[0]
const relocked = generate({ ...k, seed: 43 }, galaxy, null, false, { planets: { 3: [lockedPlanet] } })
assert.ok(relocked.systems[3].planets.some((p) => p.id === lockedPlanet.id && p.orbit === lockedPlanet.orbit), 'locked planet kept')
const kept = generate({ ...k, seed: 44 }, galaxy, null, false, { systems: { 0: a.systems[0] } })
assert.equal(kept.systems[0], a.systems[0], 'locked system kept')
// One chip fixes the value.
const fixed = generate({ ...k, count: 30, planetTypes: ['IcePlanet'], security: ['Only'], factions: ['Pirates'] }, galaxy, null)
assert.ok(fixed.systems.every((g) => g.star.security === 'Only' && g.planets.every((p) => p.type === 'IcePlanet') && g.stations.every((s) => s.faction === 'Pirates')))
// Spacing is a preference: 3 systems fit a 5 ly circle among Sol's neighbours, and Regenerate moves them.
const ben = (seed: number) => generate({ ...presetKnobs('random', { x: -8.5, y: 6.4, seed, mode: 'region' }), radius: 5, count: 3 }, galaxy, newStarsView('Ben'))
assert.equal(ben(1).systems.length, 3, 'three systems near Sol')
assert.equal(generate({ ...presetKnobs('random', { x: -8.5, y: 6.4, seed: 1, mode: 'region' }), radius: 5, count: 1 }, galaxy, newStarsView('Ben')).systems.length, 1, 'one system near Sol')
assert.notEqual(JSON.stringify(ben(1).systems.map((g) => g.star)), JSON.stringify(ben(2).systems.map((g) => g.star)), 'regenerate differs')
// More systems than room: the shortfall names what took the circle.
const crowded = generate({ ...presetKnobs('mining', { x: 0, y: 0, seed: 7, mode: 'region' }), count: 100, radius: 2 }, galaxy, null)
assert.ok(crowded.systems.length < 100, 'shortfall')
assert.equal(crowded.blocked, 'near', 'Sol takes the circle')

// Systems land inside the circle and pass the stars rules.
const demo = generate({ ...presetKnobs('random', { x: 0, y: 0, seed: 359, mode: 'region' }), count: 3, radius: 120 }, galaxy, newStarsView('Demo'))
assert.equal(demo.systems.length, 3, 'three systems placed')
for (const g of demo.systems) assert.ok(Math.hypot(g.star.x, g.star.y) <= 120 + 0.1, `${g.star.name} inside the radius`)
const demoMod = newStarsView('Demo')
applyBatch(demoMod, demo.systems, false)
assert.deepEqual(errors(demoMod), [], 'demo batch has no errors')
const noBelts = generate({ ...k, count: 40 }, galaxy, null)
assert.ok(noBelts.systems.every((g) => g.planets.every((p) => p.type !== 'Asteroids')), 'belts off by default')

// Generated systems block nothing: a small circle near Sol fits three systems.
for (let seed = 1; seed <= 50; seed++) {
  const near = generate({ ...presetKnobs('random', { x: -8.5, y: 6.4, seed, mode: 'region' }), radius: 5, count: 3 }, galaxy, null)
  assert.equal(near.systems.length, 3, `three systems in radius 5 at (-8.5, 6.4), seed ${seed}`)
}

// Random packing fits 16 in a 10 ly circle at seed 5; the hex lattice fits all 18, spaced from each other and from Sol's
// neighbours.
const packed = generate({ ...presetKnobs('random', { x: 0, y: 0, seed: 5, mode: 'region' }), radius: 10, count: 18 }, null, null)
assert.equal(packed.systems.length, 18, 'hex lattice fills the circle')
const solNear = { x: -8.5, y: 6.4 }
const blockers = galaxy.reachable.map((s) => ({ x: s[1], y: s[2] })).filter((s) => Math.hypot(s.x - solNear.x, s.y - solNear.y) < 20)
const crowdedHex = generate({ ...presetKnobs('random', { x: solNear.x, y: solNear.y, seed: 5, mode: 'region' }), radius: 12, count: 100 }, galaxy, null)
for (const batch of [packed, crowdedHex]) {
  const stars = batch.systems.map((g) => g.star)
  stars.forEach((a, i) => stars.slice(i + 1).forEach((b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 4.37, `${a.name} and ${b.name} spaced`)))
}
for (const s of crowdedHex.systems) for (const o of blockers) assert.ok(Math.hypot(s.star.x - o.x, s.star.y - o.y) >= 4.37, `${s.star.name} clear of the catalogue`)

const ms = performance.now() - t0
console.log(`quickbuild: ${runs} batches, ${systems} systems, 0 errors (${Math.round(ms)} ms)`)

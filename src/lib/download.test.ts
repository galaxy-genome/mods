// node --import ./scripts/test-hooks.mjs src/lib/download.test.ts — merge warnings name clashes between favorites only.
import { strict as assert } from 'node:assert'
import { newStarsView, uid } from './factory.ts'
import { modFromParts, partsOf } from './mods.ts'
import { planDownload } from './download.ts'

const starsMod = (title: string, planets: [string, number][]) => {
  const view = newStarsView(title)
  view.stars = [{ id: uid(), name: 'Probe', x: 0, y: 0, z: 0, security: 'High', type: 'G-WhiteYellow' }]
  view.planets = planets.map(([name, orbit]) => ({ id: uid(), name, system: 'Probe', type: 'RockPlanet', orbit, moons: 0, size: 50, rings: 0, material: null }))
  return modFromParts([view], { title, favorite: true })
}
const issues = (...mods: ReturnType<typeof starsMod>[]) => planDownload(mods, 'en', mods.flatMap(partsOf)).issues.map((i) => i.message)

assert.deepEqual(issues(starsMod('A', [['A1', 400], ['A2', 450]]), starsMod('B', [['B1', 100]])).filter((m) => !m.includes('Probe is added')), [])
const clash = issues(starsMod('A', [['A1', 400]]), starsMod('B', [['B1', 420]]))
assert.equal(clash.filter((m) => m.startsWith('B1')).length, 1)
assert.equal(clash.filter((m) => m.startsWith('Probe')).length, 1)
console.log('download ok')

// A favorite that requires an unfavorited mod asks for it; favoriting it clears the issue.
{
  const trappist = starsMod('Trappist', [['T1', 100]])
  trappist.meta.favorite = false
  const quest = modFromParts([], { title: 'Q', favorite: true, requires: [{ modId: trappist.meta.id, title: 'Trappist' }] })
  const plan = (favs: typeof trappist[]) => planDownload(favs, 'en', favs.flatMap(partsOf), [quest, trappist]).issues
  assert.deepEqual(plan([quest]).map((i) => [i.message, i.favorite]), [['Q requires Trappist, which is not a favorite. The game needs both files.', trappist.meta.id]])
  assert.deepEqual(plan([quest, trappist]).filter((i) => i.message.includes('requires')), [])
  assert.equal(planDownload([quest], 'en', [], [quest]).issues[0].message, 'Q requires Trappist, which is not on this device.')
  console.log('download requires ok')
}

// Over 200 quest files is an error naming the largest favorites.
{
  const { newQuestView } = await import('./factory.ts')
  const big = modFromParts(Array.from({ length: 201 }, (_, i) => newQuestView(`Q${i}`, { settings: { questId: 3_000_000 + i }, steps: [], rumors: [] })), { title: 'Big', favorite: true })
  const err = planDownload([big], 'en', []).issues.find((i) => i.severity === 'error')!
  assert.match(err.message, /201 quest files, 1 past the game’s 200\. Files past Quest199\.json never load\..*Big \(201\)/)
  console.log('download limit ok')
}

// Cross-mod stars: station names, PlanetID shifts, companion stars and which catalogue values win.
{
  const port = (m: ReturnType<typeof starsMod>, name: string, bodyIndex: number) => { m.stars!.stations.push({ id: uid(), name, system: 'Probe', bodyIndex } as never); return m }
  const errors = (...mods: ReturnType<typeof starsMod>[]) => planDownload(mods, 'en', []).issues.filter((i) => i.severity === 'error').map((i) => i.message)
  const a = starsMod('A', [['A1', 400]])
  const b = port(starsMod('B', [['B1', 100]]), 'Dock', 1)
  assert.deepEqual(errors(a, b), ['Station “Dock” of “B” sits on body 1 of Probe, but with the planets of “A” loaded first, body 1 is A1.'])
  assert.deepEqual(errors(b, a), [], 'B first keeps its body')

  const c = port(starsMod('C', []), 'Dock', 1)
  assert.ok(errors(b, c).includes('Station “Dock” is in both “B” and “C”; the game skips the second.'))

  const moved = starsMod('M', [])
  moved.stars!.stars[0] = { ...moved.stars!.stars[0], x: 5, security: 'Low' }
  assert.ok(issues(a, moved).includes('Probe is in both “A” and “M” with a different X, security; the values of “M” win because it loads later.'))

  const bin = starsMod('Bin', [])
  bin.stars!.planets.push({ id: uid(), name: 'Probe B', system: 'Probe', type: 'G-WhiteYellow', orbit: 900, moons: 0, size: 50, rings: 0, material: null })
  assert.ok(issues(bin, a).includes('A1 of “A” orbits the companion star Probe B of “Bin” in Probe, not the main star.'))
  console.log('download cross-mod stars ok')
}

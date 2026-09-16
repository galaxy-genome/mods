// npm test — the map's camera, generator, picking, mode logic and checks, against committed data only.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import type { Star } from '@/lib/types'
import { type Camera, CELL_LY, GRID, cellOf, clampScale, flight, flyStep, gridStep, panBy, pinchTo, sx, sy, wxOf, wzOf, zoomAt } from './camera'
import { mapChecks } from './checks'
import { placeStars } from './placement'
import { Labels, type GalaxyData, insideOutline, makeGalaxy } from './galaxy'
import { Generator, Rndm } from './generator'
import { dragTo, grabAt, pick, tapAction, worldAt, type Hit } from './picking'

const data = JSON.parse(readFileSync(new URL('../../../public/data/galaxy.json', import.meta.url), 'utf8')) as GalaxyData
const fixture = JSON.parse(readFileSync(new URL('./fixtures/cells.json', import.meta.url), 'utf8')) as {
  cells: { cx: number; cy: number; side: number; zones: number[] }[]
  shares: number[]
  expected: { name: string; x: number; z: number; type: string; colour: string; raw: string; fuel: boolean; seed: number }[][][]
}
let passed = 0
const test = (name: string, fn: () => void) => { try { fn(); passed++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps

const fixtureMaps = () => {
  const side = new Uint8Array(GRID * GRID), zones = new Uint8Array(GRID * GRID * 3)
  for (const c of fixture.cells) { side[c.cy * GRID + c.cx] = c.side; zones.set(c.zones, (c.cy * GRID + c.cx) * 3) }
  return { side, zones }
}
const galaxy = makeGalaxy(data)
const maps = fixtureMaps()
galaxy.generator.setMaps(maps.side, maps.zones)

/* ---------- data ---------- */

test('galaxy.json holds the catalogue and the published map’s reachable set', () => {
  assert.equal(data.systems.length, 14906)
  assert.equal(galaxy.reachable.length, 5340)
  const sol = galaxy.byName.get('Sol')!
  assert.deepEqual([sol[1], sol[2], sol[5]], [0, 0, 1])
  assert.ok(data.types.every(([raw, colour]) => raw && /^#[0-9a-f]{6}$/i.test(colour)))
})

/* ---------- camera ---------- */

const cam: Camera = { cx: 120, cz: -40, scale: 3.5, W: 390, H: 700 }

test('projection round-trips and puts the centre in the middle', () => {
  assert.equal(sx(cam, cam.cx), cam.W / 2)
  assert.equal(sy(cam, cam.cz), cam.H / 2)
  assert.ok(near(wxOf(cam, sx(cam, 1234.5)), 1234.5))
  assert.ok(near(wzOf(cam, sy(cam, -987.6)), -987.6))
  assert.ok(sy(cam, cam.cz + 10) < sy(cam, cam.cz), '+Y is toward the top')
})

test('cell of a point matches the game’s pixel formula', () => {
  assert.deepEqual(cellOf(0, 0), [1025, 1591])
  assert.deepEqual(cellOf(-1, 1), [1024, 1590])
  assert.deepEqual(cellOf(CELL_LY, -CELL_LY), [1026, 1592])
})

test('scale clamps between the whole galaxy and 40 px per ly', () => {
  assert.equal(clampScale(400, 1000), 40)
  assert.equal(clampScale(400, 1e-9), 400 / 200000)
})

test('grid steps are the cell halved or doubled, about 120 px apart', () => {
  for (const scale of [0.01, 0.5, 3, 40]) {
    const step = gridStep(scale)
    assert.ok(Number.isInteger(Math.log2(step / CELL_LY)))
    assert.ok(step * scale >= 120 && step * scale < 240)
  }
})

test('zoom and pinch hold the world point under the pointer', () => {
  const wx = wxOf(cam, 50), wz = wzOf(cam, 600)
  const z = zoomAt(cam, 50, 600, cam.scale * 2)
  assert.ok(near(wxOf(z, 50), wx, 1e-6) && near(wzOf(z, 600), wz, 1e-6))
  const p = pinchTo(cam, { d: 100, scale: cam.scale, wx, wz }, 250, 50, 600)
  assert.ok(near(p.scale, cam.scale * 2.5) && near(wxOf(p, 50), wx, 1e-6))
  const pan = panBy(cam, 35, -70)
  assert.ok(near(pan.cx, cam.cx - 10) && near(pan.cz, cam.cz - 20))
})

test('a flight lands on its target', () => {
  let c = cam
  const f = flight(5000, 2000, 1)
  let done = false
  for (let i = 0; i < 600 && !done; i++) ({ camera: c, done } = flyStep(c, f, 1 / 60))
  assert.ok(done)
  assert.deepEqual([c.cx, c.cz, c.scale], [5000, 2000, 1])
})

/* ---------- generator ---------- */

test('Rndm walks the game’s stream', () => {
  const r = new Rndm(1025 * 10000 + 1591)
  const a = [r.random(), r.random(), r.integer(0, 255)]
  const b = new Rndm(1025 * 10000 + 1591)
  assert.deepEqual([b.random(), b.random(), b.integer(0, 255)], a)
  assert.ok(a[0] >= 0 && a[0] < 1)
})

test('cellStars matches the published map for the fixture cells at every share', () => {
  const gen = new Generator(data.starTable, data.sectorAnchors)
  gen.setReal(galaxy.reachable.map((s) => [s[1], s[2]] as const))
  gen.setMaps(maps.side, maps.zones)
  let n = 0
  fixture.cells.forEach((c, i) => fixture.shares.forEach((share, j) => {
    const got = gen.cellStars(c.cx, c.cy, share).map(({ name, x, z, type, colour, raw, fuel, seed }) => ({ name, x, z, type, colour, raw, fuel, seed }))
    assert.deepEqual(got, fixture.expected[i][j], `cell ${c.cx},${c.cy} share ${share}`)
    n += got.length
  }))
  assert.ok(n > 300)
})

test('a real star removes the generated systems it sits on', () => {
  const c = fixture.cells[11]
  const target = fixture.expected[11][0][5]
  const gen = new Generator(data.starTable, data.sectorAnchors)
  gen.setMaps(maps.side, maps.zones)
  gen.setReal([...galaxy.reachable.map((s) => [s[1], s[2]] as const), [target.x, target.z]])
  assert.ok(!gen.cellStars(c.cx, c.cy).some((s) => s.name === target.name))
})

/* ---------- picking and modes ---------- */

const hit = (kind: Hit['kind'], name: string, x: number, y: number, id?: string): Hit => ({ kind, name, x, y, id })
const layers = {
  mod: [hit('mod', 'Nova', 120, -40, 's1')],
  other: [hit('other', 'Faraway', 121, -40)],
  catalogue: [hit('catalogue', 'Wolf 359', 120.5, -40)],
  generated: [hit('generated', 'Caelia Aa-Bb B3', 130, -40)],
}

test('pick prefers mod stars, then other favorites, catalogue, generated, within the radius', () => {
  const [px, py] = [sx(cam, 120.5), sy(cam, -40)]
  assert.equal(pick(cam, px, py, layers, false)?.name, 'Nova')
  assert.equal(pick(cam, px, py, { ...layers, mod: [] }, false)?.name, 'Faraway')
  assert.equal(pick(cam, px, py, { ...layers, mod: [], other: [] }, false)?.name, 'Wolf 359')
  assert.equal(pick(cam, sx(cam, 130), py, layers, false)?.name, 'Caelia Aa-Bb B3')
  assert.equal(pick(cam, sx(cam, 125), py, layers, false), null, '17.5 px is outside the desktop radius')
  assert.equal(pick(cam, sx(cam, 125), py, { ...layers, mod: [], other: [] }, true)?.name, 'Wolf 359', 'inside the touch radius')
})

test('a press drags only a handle or a mod star; anything else pans', () => {
  const at = [sx(cam, 120), sy(cam, -40)] as const
  assert.deepEqual(grabAt('edit', cam, ...at, { stars: layers.mod, touch: false }), { kind: 'star', id: 's1' })
  assert.deepEqual(grabAt('edit', cam, at[0] + 40, at[1], { stars: layers.mod, touch: false }), { kind: 'pan' })
  assert.deepEqual(grabAt('pick', cam, ...at, { stars: layers.mod, touch: false }), { kind: 'pan' })
  assert.deepEqual(grabAt('point', cam, ...at, { stars: [], point: { x: 120, y: -40 }, touch: false }), { kind: 'point' })
  const circle = { x: 120, y: -40, r: 20 }
  assert.deepEqual(grabAt('circle', cam, ...at, { stars: [], circle, touch: false }), { kind: 'centre' })
  assert.deepEqual(grabAt('circle', cam, at[0] + 20 * cam.scale + 5, at[1], { stars: [], circle, touch: false }), { kind: 'ring' })
  assert.deepEqual(grabAt('circle', cam, at[0] + 40, at[1], { stars: [], circle, touch: false }), { kind: 'pan' })
})

test('taps do what each mode says', () => {
  const world = { x: 1, y: 2 }
  assert.deepEqual(tapAction('edit', null, world), { kind: 'add', x: 1, y: 2 })
  assert.deepEqual(tapAction('edit', layers.mod[0], world), { kind: 'open', id: 's1' })
  assert.equal(tapAction('edit', layers.other[0], world).kind, 'select')
  assert.deepEqual(tapAction('point', null, world), { kind: 'point', x: 1, y: 2 })
  assert.deepEqual(tapAction('point', layers.catalogue[0], world), { kind: 'point', x: 120.5, y: -40 })
  assert.deepEqual(tapAction('circle', null, world, { x: 0, y: 0, r: 30 }), { kind: 'circle', x: 1, y: 2, r: 30 })
  assert.deepEqual(tapAction('circle', layers.catalogue[0], world, { x: 0, y: 0, r: 30 }), { kind: 'circle', x: 120.5, y: -40, r: 30 })
  assert.deepEqual(tapAction('pick', layers.generated[0], world), { kind: 'pick', name: 'Caelia Aa-Bb B3' })
  assert.deepEqual(tapAction('pick', null, world), { kind: 'none' })
  assert.deepEqual(worldAt(cam, cam.W / 2, cam.H / 2), { x: 120, y: -40 })
})

test('drags move the star or centre, and the ring sets the radius', () => {
  const circle = { x: 0, y: 0, r: 5 }
  assert.deepEqual(dragTo({ kind: 'star', id: 's1' }, { x: 3, y: 4 }), { x: 3, y: 4, r: undefined })
  assert.deepEqual(dragTo({ kind: 'centre' }, { x: 3, y: 4 }, circle), { x: 3, y: 4, r: 5 })
  assert.deepEqual(dragTo({ kind: 'ring' }, { x: 3, y: 4 }, circle), { x: 0, y: 0, r: 5 })
  assert.equal(dragTo({ kind: 'pan' }, { x: 3, y: 4 }), null)
})

/* ---------- labels ---------- */

test('labels do not overlap and the best rank wins the ground', () => {
  const l = new Labels()
  assert.ok(l.claim(100, 100, 60))
  assert.ok(!l.claim(130, 102, 60))
  assert.ok(l.claim(100, 130, 60))
})

/* ---------- checks ---------- */

const star = (id: string, name: string, x: number, y: number): Star => ({ id, name, x, y, z: 0, security: 'Anarchy', type: 'M-RedDwarf' })

test('outline contains Sol and not the far black', () => {
  assert.ok(insideOutline(data.outline, 0, 0))
  assert.ok(!insideOutline(data.outline, 150000, 150000))
})

test('checks flag outside, overlap, hides and moved catalogue systems', () => {
  const target = fixture.expected[11][0][5]
  const stars = [
    star('a', 'Nova Prime', 150000, 150000),
    star('b', 'Close', 0.1, 0),
    star('c', 'Hider', target.x, target.z),
    star('d', 'Wolf 359', 2000, 2000),
    star('e', 'Alone', 10000, 10000),
  ]
  const ids = mapChecks(stars, galaxy).map((c) => `${c.id}:${c.severity}`)
  assert.ok(ids.includes('soutside-a:warning'))
  assert.ok(ids.includes('soverlap-b:error'), 'Sol holds the reservation slot 0.1 ly away')
  assert.ok(ids.includes('sremoves-c:tip'))
  assert.ok(ids.includes('sname-exists-d:tip'))
  assert.ok(!ids.some((i) => i.startsWith('soverlap-d')), 'a moved system does not overlap its own old position')
  const wolf = galaxy.byName.get('Wolf 359')!
  const moves = mapChecks([star('d', 'Wolf 359', wolf[1] + 1, wolf[2])], galaxy).find((c) => c.key === 'moves')!
  assert.deepEqual(moves.vars, { name: 'Wolf 359', x: Math.round(wolf[1]).toLocaleString('en-US'), y: Math.round(wolf[2]).toLocaleString('en-US') })
  const hides = mapChecks([stars[2]], galaxy).find((c) => c.key === 'removes')!
  assert.ok(hides.vars.other.split(', ').includes(target.name))
  assert.equal(mapChecks([stars[4]], galaxy).filter((c) => c.key !== 'outside').length, 0)
  const d8 = fixture.expected[fixture.cells.findIndex((c) => c.cx === 1259 && c.cy === 888)][0]
  const shifts = mapChecks([star('r', 'Shift', d8[8].x, d8[8].z)], galaxy)
  assert.deepEqual(shifts.map((c) => `${c.id}:${c.severity}:${c.vars.other}`), [
    `sremoves-r:tip:${d8[4].name}`,
    `srenumbers-r:tip:${d8.slice(5, 10).map((x) => x.name).sort().join(', ')}`,
  ])
})

test('of two mod stars in one reservation slot, the later is hidden; 2 ly apart both show', () => {
  const ids = mapChecks([star('a', 'One', 5000, 5000), star('b', 'Two', 5000.1, 5000)], galaxy).map((c) => c.id)
  assert.deepEqual(ids.filter((i) => i.startsWith('soverlap')), ['soverlap-b'])
  assert.ok(!mapChecks([star('a', 'One', 5000, 5000), star('b', 'Two', 5002, 5001)], galaxy).some((c) => c.key === 'overlap'))
})

/* ---------- placement ---------- */

test('placement: a star on a generated system removes the first one in reach; the shifted stream changes later ones', () => {
  fixture.cells.forEach((c, i) => {
    const before = fixture.expected[i][0]
    if (before.length < 3 || galaxy.generator.catalogueInCell(c.cx, c.cy).length) return
    const target = before[before.length >> 1]
    const [p] = placeStars(galaxy, [star('p', 'Probe', target.x, target.z)])
    assert.equal(p.cell, `${c.cx},${c.cy}`)
    assert.equal(p.hiddenBy, null)
    const first = before.findIndex((st) => p.deletedGenerated.includes(st.name) || p.renumberedGenerated.includes(st.name))
    // GenerateSector skips a position within cell / (side √2) of a real star; systems before it keep their stream.
    assert.ok(p.deletedGenerated.includes(before[first].name), `cell ${p.cell}`)
    assert.ok(Math.hypot(before[first].x - target.x, before[first].z - target.z) < CELL_LY / (c.side * Math.SQRT2))
    assert.ok(first <= before.indexOf(target))
    assert.ok(p.renumberedGenerated.every((n) => !p.deletedGenerated.includes(n)))
  })
})

test('placement: a star far from every generated position changes nothing; slots, height and catalogue cells', () => {
  const sol = placeStars(galaxy, [star('a', 'Close', 0.1, 0), star('b', 'Far', 5000, 5000)])
  assert.equal(sol[0].hiddenBy, 'Sol')
  assert.deepEqual([sol[0].deletedGenerated, sol[0].renumberedGenerated], [[], []], 'a hidden star does not generate around itself')
  assert.equal(sol[1].hiddenBy, null)
  assert.equal(placeStars(galaxy, [{ ...star('h', 'High', 10, 10), z: 8 }])[0].tooHigh, true)
  const [first, last] = [galaxy.reachable[0], galaxy.reachable[galaxy.reachable.length - 1]]
  const moved = mapChecks([star('m', first[0], last[1], last[2])], galaxy).find((c) => c.key === 'hides')!
  assert.deepEqual([moved.severity, moved.vars.other], ['error', last[0]], 'a moved catalogue system that takes a later one’s slot hides it')
  assert.equal(placeStars(galaxy, [{ ...star('h', 'High', 300, 10), z: 8 }])[0].tooHigh, false)
  // Without the mod star the Sol cell matches the published fixture; with it, the result is the difference.
  const solCell = fixture.cells.findIndex((c) => c.cx === 1025 && c.cy === 1591)
  const names = fixture.expected[solCell][0].map((st) => st.name)
  const [q] = placeStars(galaxy, [star('q', 'Probe', fixture.expected[solCell][0][0].x, fixture.expected[solCell][0][0].z)])
  assert.ok(q.deletedGenerated.includes(names[0]))
  assert.ok([...q.deletedGenerated, ...q.renumberedGenerated].every((n) => names.includes(n)))
})

console.log(`map.test.ts: ${passed} passed`)

// npm run test:parity — the editor's map against the published map's sources in the parent repo
// (tools/port/*.js, tools/port/galaxy.db, map/docs/data). Fails when any source or pattern is missing.
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import vm from 'node:vm'
import type { Star } from '@/lib/types'
import { type Camera, GRID, clampScale, homeLy, sx, sy, wxOf, wzOf } from './camera'
import { mapChecks } from './checks'
import { type GalaxyData, DOT_R, dotSm, makeGalaxy } from './galaxy'
import { Generator } from './generator'

const root = new URL('../../../../', import.meta.url)
const source = (path: string) => {
  const url = new URL(path, root)
  if (!existsSync(url)) throw new Error(`parity source missing: ${url.pathname}`)
  return url
}
const text = (path: string) => readFileSync(source(path), 'utf8')
const pattern = (src: string, re: RegExp, what: string) => {
  const m = re.exec(src)
  if (!m) throw new Error(`parity pattern missing in the published map: ${what}`)
  return m
}

const starmap = text('tools/port/starmap_js.js')
const published = JSON.parse(text('map/docs/data/galaxy.json'))
const data = JSON.parse(readFileSync(new URL('../../../public/data/galaxy.json', import.meta.url), 'utf8')) as GalaxyData
const fixture = JSON.parse(readFileSync(new URL('./fixtures/cells.json', import.meta.url), 'utf8'))
const galaxy = makeGalaxy(data)

let passed = 0
const test = (name: string, fn: () => void) => { try { fn(); passed++ } catch (e) { console.error(`✗ ${name}`); throw e } }

/* ---------- generator ---------- */

const vmContext = vm.createContext({ D: published })
vm.runInContext('const S = D.systems, X = 1, Z = 2;', vmContext)
vm.runInContext(text('tools/port/galaxygrid.js') + text('tools/port/generated.js'), vmContext)
const side = new Uint8Array(GRID * GRID), zones = new Uint8Array(GRID * GRID * 3)
for (const c of fixture.cells) { side[c.cy * GRID + c.cx] = c.side; zones.set(c.zones, (c.cy * GRID + c.cx) * 3) }
vmContext.side = side
vmContext.zones = zones
vm.runInContext('GEN.side = side; GEN.zones = zones;', vmContext)
const realCellStars = (cx: number, cy: number, share: number) =>
  (JSON.parse(vm.runInContext(`JSON.stringify(cellStars(${cx}, ${cy}, ${share}))`, vmContext)) as Record<string, unknown>[]).map(({ name, x, z, type, colour, raw, fuel, seed }) => ({ name, x, z, type, colour, raw, fuel, seed }))
galaxy.generator.setMaps(side, zones)

test('generator: cellStars equals the published map’s, and the committed fixture is current', () => {
  const gen = new Generator(data.starTable, data.sectorAnchors)
  gen.setReal(galaxy.reachable.map((s) => [s[1], s[2]] as const))
  gen.setMaps(side, zones)
  fixture.cells.forEach((c: { cx: number; cy: number }, i: number) => fixture.shares.forEach((share: number, j: number) => {
    const real = realCellStars(c.cx, c.cy, share)
    const ours = gen.cellStars(c.cx, c.cy, share).map(({ name, x, z, type, colour, raw, fuel, seed }) => ({ name, x, z, type, colour, raw, fuel, seed }))
    assert.deepEqual(ours, real, `cell ${c.cx},${c.cy} share ${share}`)
    assert.deepEqual(fixture.expected[i][j], real, `fixture cell ${c.cx},${c.cy} share ${share}; run scripts/build-galaxy.py`)
  }))
  for (const [a, b] of [[1025, 1591], [700, 1300], [1407, 444], [2000, 30]]) {
    assert.deepEqual(gen.sectorName(a, b), JSON.parse(vm.runInContext(`JSON.stringify(sectorName(${a}, ${b}))`, vmContext)))
  }
})

/* ---------- projection and constants ---------- */

test('projection: sx, sy, wxOf, wzOf match the published formulas', () => {
  const lines = ['sx', 'sy', 'wxOf', 'wzOf'].map((f) => pattern(starmap, new RegExp(`^const ${f} = .*;$`, 'm'), f)[0]).join('\n')
  const cameras: Camera[] = [{ cx: 0, cz: 0, scale: 4, W: 390, H: 844 }, { cx: -2236, cz: -3998, scale: 0.05, W: 1440, H: 900 }, { cx: 25, cz: 25898, scale: 37, W: 800, H: 600 }]
  const names = ['Sol', 'Alpha Centauri', ...galaxy.reachable.slice(-5).map((s) => s[0])]
  for (const c of cameras) {
    const ctx = vm.createContext({ W: c.W, H: c.H, cx: c.cx, cz: c.cz, scale: c.scale })
    vm.runInContext(`${lines}\nthis.f = {sx, sy, wxOf, wzOf}`, ctx)
    const f = ctx.f as Record<string, (v: number) => number>
    for (const n of names) {
      const s = galaxy.byName.get(n)!
      assert.equal(sx(c, s[1]), f.sx(s[1]), `sx ${n}`)
      assert.equal(sy(c, s[2]), f.sy(s[2]), `sy ${n}`)
      assert.equal(wxOf(c, f.sx(s[1])), f.wxOf(f.sx(s[1])), `wxOf ${n}`)
      assert.equal(wzOf(c, f.sy(s[2])), f.wzOf(f.sy(s[2])), `wzOf ${n}`)
    }
  }
})

test('constants: zoom limits, home view, dot sizes and generated cut-offs', () => {
  const num = (name: string) => Number(pattern(starmap, new RegExp(`const ${name} = ([\\d.]+)`), name)[1])
  assert.equal(clampScale(1000, 1e9), Number(pattern(starmap, /Math\.min\(v, (\d+)\)/, 'clampScale max')[1]))
  assert.equal(clampScale(1000, 0), 1000 / num('MAX_OUT_LY'))
  const home = pattern(starmap, /const HOME_LY = TOUCH \? (\d+) : (\d+)/, 'HOME_LY')
  assert.deepEqual([homeLy(true), homeLy(false)], [Number(home[1]), Number(home[2])])
  assert.equal(DOT_R, num('DOT_R'))
  const W = 1000
  assert.equal(dotSm({ cx: 0, cz: 0, W, H: 800, scale: W / 5000 }), Math.max(0.35, Math.min(DOT_R, DOT_R * num('DOT_FULL_LY') / 5000)))
  const starMap = readFileSync(new URL('./StarMap.tsx', import.meta.url), 'utf8')
  for (const name of ['SYSTEM_LY', 'GEN_MAX_LY']) assert.equal(Number(pattern(starMap, new RegExp(`const ${name} = (\\d+)`), `StarMap ${name}`)[1]), num(name), name)
  pattern(starmap, /\(x1 - x0\) \* \(y1 - y0\) > 60000/, 'generated cell budget')
  assert.ok(starMap.includes('(x1 - x0) * (y1 - y0) > 60000'))
})

/* ---------- export ---------- */

test('export: galaxy.json matches galaxy.db row for row, and the published map’s reachable set', () => {
  const db = new DatabaseSync(source('tools/port/galaxy.db').pathname, { readOnly: true })
  const rows = db.prepare('SELECT name, map_x, map_z, reachable FROM system').all() as { name: string; map_x: number; map_z: number; reachable: number }[]
  assert.equal(data.systems.length, rows.length)
  for (const r of rows) {
    const s = galaxy.byName.get(r.name)
    assert.ok(s, r.name)
    assert.deepEqual([s[1], s[2], s[5]], [Math.round(r.map_x * 10) / 10, Math.round(r.map_z * 10) / 10, r.reachable], r.name)
  }
  assert.equal(galaxy.reachable.length, published.systems.length)
  for (const p of published.systems) {
    const s = galaxy.byName.get(p[0])!
    assert.deepEqual([s[1], s[2], s[5]], [p[1], p[2], 1], p[0])
    assert.equal(data.types[s[3]][1].toLowerCase(), published.palette[p[4]].toLowerCase(), `colour of ${p[0]}`)
  }
})

/* ---------- checks against the real generator ---------- */

test('checks: a star on a published generated system hides exactly that one', () => {
  fixture.cells.forEach((c: { cx: number; cy: number }) => {
    const real = realCellStars(c.cx, c.cy, 1)
    if (!real.length) return
    const target = real[real.length >> 1] as { name: string; x: number; z: number }
    const star: Star = { id: 's', name: 'Probe', x: target.x, y: target.z, z: 0, security: 'Anarchy', type: 'M-RedDwarf' }
    const hides = mapChecks([star], galaxy).find((x) => x.key === 'hides')
    assert.equal(hides?.vars.other, target.name, `cell ${c.cx},${c.cy}`)
  })
})

console.log(`parity.test.ts: ${passed} passed`)

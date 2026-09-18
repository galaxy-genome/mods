// node --import ./scripts/test-hooks.mjs scripts/urlnav.check.ts — the keyboard-nav selection each list writes to the address
// (j j, reload, Back to the page, a key that matches no row), against a running dev server (KEYNAV_BASE, default http://localhost:5173/).
import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'

const BASE = process.env.KEYNAV_BASE ?? 'http://localhost:5173/'

const STARS = JSON.stringify({
  Stars: [
    { Name: 'Alpha', X: 10, Y: 0, Z: 5, security: 'Low', type: 'YellowStar' },
    { Name: 'Beta', X: 20, Y: 0, Z: 8, security: 'High', type: 'RedStar' },
    { Name: 'Gamma', X: 30, Y: 0, Z: 2, security: 'Low', type: 'BlueStar' },
  ],
  Planets: [
    { Name: 'Alpha I', system: 'Alpha', type: 'Rocky', dist: 100, sput: 0, size: 1, rings: 0 },
    { Name: 'Alpha II', system: 'Alpha', type: 'Gas', dist: 300, sput: 1, size: 2, rings: 0 },
    { Name: 'Beta I', system: 'Beta', type: 'Rocky', dist: 200, sput: 0, size: 1, rings: 0 },
  ],
  Stations: [
    { Name: 'Alpha Depot', StarSystem: 'Alpha', PlanetID: 1, type: 'OrbitalDark', Faction: 'Independent' },
    { Name: 'Beta Depot', StarSystem: 'Beta', PlanetID: 1, type: 'OrbitalDark', Faction: 'USA' },
  ],
})

const state = (p: any) => p.evaluate(() => {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  const scope: ParentNode = dialogs[dialogs.length - 1] ?? document
  const rows = [...scope.querySelectorAll<HTMLElement>('[data-opt]')].filter((el) => el.offsetParent !== null)
  const active = document.activeElement as HTMLElement
  return {
    count: rows.length,
    index: rows.indexOf(active),
    nav: active?.closest?.('[data-nav]')?.getAttribute('data-nav') ?? null,
    search: location.search,
  }
})

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const size = `${w}x${h}`
  const browser = await chromium.launch()
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
  const errors: string[] = []
  p.on('pageerror', (e: Error) => errors.push(e.message))
  const wait = (ms: number) => p.waitForTimeout(ms)
  const press = async (k: string) => { await p.keyboard.press(k); await wait(120) }

  await p.goto(`${BASE}?samples`); await wait(3000)
  // A stars mod to navigate: import one.
  await p.evaluate(() => dispatchEvent(new Event('open-file'))); await wait(800)
  await p.locator('input[type="file"]').first().setInputFiles({ name: 'StarsStations.json', mimeType: 'application/json', buffer: Buffer.from(STARS) })
  await wait(2500)
  await p.getByRole('button', { name: 'Import', exact: true }).first().click(); await wait(2500)
  const starsMod = new URL(p.url()).pathname.replace(/^\/mod\//, '').replace(/\/.*$/, '')
  assert.match(starsMod, /~stars$/, `${size}: import opened the stars mod, got ${p.url()}`)

  const paths = ['', 'help', `mod/${starsMod}/stars`, `mod/${starsMod}/planets`, `mod/${starsMod}/stations`]
  for (const path of paths) {
    await p.goto(BASE + path); await wait(2500)
    let s = await state(p)
    assert.ok(s.count >= 2, `${size} /${path}: ${s.count} rows at ${p.url()}`)
    await press('j'); await press('j')
    s = await state(p)
    assert.equal(s.index, 1, `${size} /${path}: second row active`)
    assert.ok(s.nav, `${size} /${path}: row declares a place`)
    const name = s.nav!.slice(0, s.nav!.indexOf(':'))
    const key = s.nav!.slice(s.nav!.indexOf(':') + 1)
    assert.equal(new URLSearchParams(s.search).get(name), key, `${size} /${path}: ?${name}=${key} in the address`)

    await p.reload(); await wait(2500)
    let r = await state(p)
    assert.equal(r.nav, s.nav, `${size} /${path}: reload keeps the same row active`)
    assert.equal(r.index, 1, `${size} /${path}: reload keeps the same index`)

    await p.goto(`${BASE}settings`); await wait(1200)
    await p.goBack(); await wait(2500)
    r = await state(p)
    assert.equal(r.nav, s.nav, `${size} /${path}: Back returns to the same active row`)

    await p.goto(`${BASE}${path}?${name}=no-such-row`); await wait(2500)
    r = await state(p)
    assert.equal(r.count, s.count, `${size} /${path}: a bogus key leaves the list alone`)
    assert.equal(r.index, -1, `${size} /${path}: a bogus key selects nothing`)
    console.log(`${size} /${path || 'home'}: ok (${s.count} rows, ?${name}=${key}, reload + Back + bogus key)`)
  }
  assert.deepEqual(errors, [], `${size}: page errors`)
  await browser.close()
}
console.log('url nav ok')

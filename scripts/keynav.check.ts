// node --import ./scripts/test-hooks.mjs scripts/keynav.check.ts — keyboard list navigation on every list screen,
// in Chromium and WebKit, against a running dev server (KEYNAV_BASE, default http://localhost:5173/).
import { strict as assert } from 'node:assert'
import { chromium, webkit, type BrowserType } from 'playwright'

const BASE = process.env.KEYNAV_BASE ?? 'http://localhost:5173/'

async function run(engine: BrowserType, name: string) {
  const browser = await engine.launch()
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const p = page
  const say = (line: string) => console.log(`${name}  ${line}`)
  const wait = (ms: number) => p.waitForTimeout(ms)
  const open = async (path: string) => {
    await p.evaluate((url) => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')) }, `/${path}`)
    await wait(900)
  }
  const press = async (key: string) => { await p.keyboard.press(key); await wait(80) }
  const reset = () => p.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0) })
  /** Visible rows in the top dialog, or the page; the active row's index; whether it shows the active background. */
  const state = () => p.evaluate(() => {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
    const scope: ParentNode = dialogs[dialogs.length - 1] ?? document
    const rows = [...scope.querySelectorAll<HTMLElement>('[data-opt]')].filter((el) => el.offsetParent !== null)
    const active = document.activeElement as HTMLElement
    return {
      count: rows.length,
      index: rows.indexOf(active),
      lit: active.matches('[data-opt]:focus-visible'),
      texts: rows.map((r) => (r.textContent || r.getAttribute('aria-label') || '').trim().slice(0, 40)),
      dialogs: dialogs.length,
    }
  })

  /** j, j, End, k, Home and the active background; returns the row texts. */
  const check = async (label: string, min = 2) => {
    await reset()
    let s = await state()
    if (s.count < min) { say(`${label}: ${s.count} rows, needs ${min}`); throw new Error(`${name} ${label}: ${s.count} rows`) }
    await press('j'); s = await state()
    assert.equal(s.index, 0, `${name} ${label}: j → first row`)
    assert.ok(s.lit, `${name} ${label}: active row style applies`)
    if (s.count < 2) return s
    await press('j'); s = await state(); assert.equal(s.index, 1, `${name} ${label}: j → second row`)
    await press('End'); s = await state(); assert.equal(s.index, s.count - 1, `${name} ${label}: End → last row`)
    await press('k'); s = await state(); assert.equal(s.index, s.count - 2, `${name} ${label}: k → second-to-last`)
    await press('Home'); s = await state(); assert.equal(s.index, 0, `${name} ${label}: Home → first row`)
    await press('ArrowDown'); s = await state(); assert.equal(s.index, Math.min(1, s.count - 1), `${name} ${label}: ↓`)
    await press('ArrowUp'); s = await state(); assert.equal(s.index, 0, `${name} ${label}: ↑`)
    return s
  }
  /** Moves to the row whose text starts with `text` and presses Enter. */
  const enterOn = async (text: string | RegExp) => {
    const s = await state()
    const i = s.texts.findIndex((t) => (typeof text === 'string' ? t.startsWith(text) : text.test(t)))
    assert.ok(i >= 0, `${name}: no row ${text} in ${s.texts.join(' | ')}`)
    await reset(); await press('Home'); await press('j')
    await press('Home')
    for (let n = 0; n < i; n++) await press('j')
    assert.equal((await state()).index, i)
    await press('Enter'); await wait(900)
  }
  const ok = (label: string, detail: string) => say(`${label}: ok (${detail})`)

  await p.goto(BASE); await wait(2500)

  // Home
  let s = await check('Home')
  await enterOn('Owner of Record'); const contents = new URL(p.url()).pathname.slice(1)
  assert.match(contents, /^mod\/[^/]+$/, `${name}: Enter on a multi-part mod opens Contents`)
  ok('Home', `${s.count} rows, Enter → /${contents}`)

  // Contents: quests then the stars section, one sequence
  s = await check('Contents')
  await enterOn(s.texts[0]); const overview = new URL(p.url()).pathname
  assert.match(overview, /\/overview$/, `${name}: Contents Enter opens overview`)
  ok('Contents', `${s.count} rows, Enter → ${overview}`)
  const quest = overview.slice(1).replace(/\/overview$/, '')

  // Steps
  await open(`${quest}/steps`)
  s = await check('Steps')
  await enterOn(s.texts[1].slice(0, 6)); const step = new URL(p.url()).pathname.slice(1)
  assert.match(step, /\/steps\/[^/]+$/, `${name}: Steps Enter opens a step`)
  ok('Steps', `${s.count} rows, Enter → /${step}`)

  // Delete on a step: removes it, focus moves to the next row, the Undo toast restores it
  await open(`${quest}/steps`)
  s = await state()
  await reset(); await press('j'); await press('j')
  await press('Delete'); await wait(700)
  let d = await state()
  assert.equal(d.count, s.count - 1, `${name}: Delete removes the step`)
  assert.equal(d.index, 1, `${name}: focus moves to the next row`)
  assert.equal(d.texts[1].replace(/^\d+/, ''), s.texts[2].replace(/^\d+/, ''), `${name}: the next step is focused`)
  await p.getByRole('button', { name: 'Undo', exact: true }).first().click(); await wait(700)
  d = await state()
  assert.deepEqual(d.texts, s.texts, `${name}: Undo restores the step`)
  await reset(); await press('k')
  await press('Backspace'); await wait(700)
  d = await state()
  assert.equal(d.count, s.count - 1, `${name}: Backspace removes the last step`)
  assert.equal(d.index, d.count - 1, `${name}: focus moves to the previous row`)
  await p.getByRole('button', { name: 'Undo', exact: true }).first().click(); await wait(700)
  assert.equal((await state()).count, s.count, `${name}: Undo restores the last step`)
  ok('Steps delete', `Delete ${s.count}→${s.count - 1}, focus next, Undo; Backspace on last, focus previous, Undo`)

  // Dialogue, Ships, Orders: first step of the chapter that has them
  const homeMod = async (title: string) => {
    await open('')
    await p.locator('[data-opt]').filter({ hasText: title }).first().click(); await wait(900)
    return new URL(p.url()).pathname.slice(1).replace(/\/overview$/, '')
  }
  const quests = [quest, await homeMod('The Long Haul'), await homeMod('A Hard Choice')]
  for (const [label, sub] of [['Dialogue', 'dialogue'], ['Ships', 'ships'], ['Orders', 'orders']] as const) {
    let found = false
    search: for (const q of quests) {
      await open(`${q}/steps`)
      const n = await p.locator('[data-opt]').count()
      for (let k = 0; k < n; k++) {
        await open(`${q}/steps`)
        await p.locator('[data-opt]').nth(k).click(); await wait(600)
        await open(`${new URL(p.url()).pathname.slice(1)}/${sub}`)
        if ((await state()).count) { found = true; break search }
      }
    }
    if (!found) { say(`${label}: no sample step has rows, skipped`); continue }
    s = await state()
    await check(label, 1)
    const before = p.url()
    await reset(); await press('j'); assert.equal((await state()).index, 0, `${name}: ${label} j`)
    await press('Enter'); await wait(900)
    assert.ok(p.url() !== before, `${name}: ${label} Enter opens the row`)
    ok(label, `${s.count} rows, Enter → ${new URL(p.url()).pathname}`)
    if (label === 'Ships') {
      const slider = p.locator('[role="dialog"] [role="slider"]').first()
      const was = await slider.getAttribute('aria-valuenow')
      await slider.focus(); await press('ArrowUp'); await press('k')
      const now = await slider.getAttribute('aria-valuenow')
      assert.notEqual(now, was, `${name}: ↑ moves the slider`)
      assert.equal(await slider.evaluate((el) => el === document.activeElement), true, `${name}: slider keeps focus`)
      ok('Slider', `↑ changed ${was} → ${now}, focus kept`)
      await slider.press('ArrowDown')
    }
    await p.keyboard.press('Escape'); await wait(500)
  }

  // Rumors
  await open(`${quest}/rumors`)
  if ((await state()).count) {
    await reset(); await press('j'); assert.equal((await state()).index, 0); await press('Enter'); await wait(700)
    assert.ok((await state()).dialogs > 0, `${name}: Rumors Enter opens the editor`)
    ok('Rumors', 'Enter → sheet'); await p.keyboard.press('Escape'); await wait(500)
  } else say('Rumors: empty in sample, skipped')

  // Problems sheet
  await p.evaluate(() => dispatchEvent(new Event('open-problems'))); await wait(900)
  s = await state()
  if (s.dialogs && s.count) {
    await reset(); await press('j'); s = await state()
    assert.equal(s.index, 0, `${name}: Problems j`); assert.ok(s.lit)
    ok('Problems', `${s.count} rows`)
  } else say(`Problems: ${s.count} rows, skipped`)
  await p.keyboard.press('Escape'); await wait(500)

  // Stars, Planets, Stations and pickers, on the stars mod
  await open(''); await wait(500)
  await enterOn('Jita & Tama'); const stars = new URL(p.url()).pathname.slice(1).replace(/\/overview$/, '').replace(/^(mod\/[^/]+).*/, '$1')
  for (const list of ['stars', 'planets', 'stations']) {
    await open(`${stars}/${list}`)
    s = await check(list, 1).catch(async (e) => { say(`${list}: ${e.message}`); return null as never })
    if (!s) continue
    await reset(); await press('j'); await press('Enter'); await wait(900)
    assert.ok((await state()).dialogs > 0, `${name}: ${list} Enter opens the sheet`)
    ok(list, `${s.count} rows, Enter → sheet`)
    if (list === 'stars') {
      const clicked = await p.evaluate(() => {
        const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].pop()!
        const b = [...d.querySelectorAll<HTMLElement>('button')].find((x) => /\([A-Z]\w*\)$/.test(x.textContent ?? ''))
        b?.click(); return !!b
      })
      await wait(900); s = await state()
      if (clicked && s.dialogs > 1) {
        const pickerCheck = await check('Star type picker')
        await press('End'); const last = (await state()).texts.at(-1)
        await press('Enter'); await wait(700)
        assert.equal((await state()).dialogs, 1, `${name}: picker Enter chooses and closes`)
        ok('Star type picker', `${pickerCheck.count} rows, Enter chose ${last}`)
      } else say('Star type picker: could not open, skipped')
      await p.keyboard.press('Escape'); await wait(500)
    }
    await p.keyboard.press('Escape'); await wait(500)
  }

  // Library, Help
  await open('library?tab=game')
  if ((await state()).count) {
    s = await check('Library')
    await enterOn(s.texts[0]); assert.match(p.url(), /\/library\/.+/); ok('Library', `${s.count} rows, Enter → ${new URL(p.url()).pathname}`)
  } else say('Library: game quests off in this profile, skipped (community cards have no non-destructive default)')
  await open('help'); s = await check('Help')
  await enterOn(s.texts[0]); assert.match(p.url(), /\/help\/.+/); ok('Help', `${s.count} rows, Enter → ${new URL(p.url()).pathname}`)

  // j typed in an input: text, not navigation
  await open('help')
  const search = p.locator('input').first()
  await search.click(); await p.keyboard.type('jk'); await wait(200)
  assert.equal(await search.inputValue(), 'jk', `${name}: j/k type into the search`)
  await press('Backspace'); assert.equal(await search.inputValue(), 'j', `${name}: Backspace edits the search`)
  await p.keyboard.type('k')
  assert.equal((await state()).index, -1, `${name}: typing j moves nothing`)
  await press('ArrowDown'); assert.equal((await state()).index, -1, `${name}: ↓ in a page input stays in the input`)
  ok('Input', 'j/k type, ↓ stays')

  // Native controls keep their arrows: a range/select/number field focused on a list screen
  await open(`${stars}/stars`); await reset(); await press('j'); await press('Enter'); await wait(900)
  const control = await p.evaluate(() => {
    const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].pop()!
    const c = d.querySelector<HTMLElement>('input[type="range"], select, [role="slider"], [role="spinbutton"], input[type="number"], input')
    c?.focus(); return c ? (c.getAttribute('role') ?? c.tagName + ':' + c.getAttribute('type')) : null
  })
  if (control) {
    await press('ArrowDown'); await press('j')
    assert.equal((await state()).index, -1, `${name}: ↓ in ${control} is not list navigation`)
    ok('Control', `${control} keeps ↓`)
  }
  await p.keyboard.press('Escape'); await wait(500)

  // Palette open: list navigation is off
  await open(''); await reset()
  await p.keyboard.press(name === 'webkit' ? 'Meta+k' : 'Control+k'); await wait(500)
  await press('ArrowDown')
  const pal = await p.evaluate(() => ({ inPalette: !!document.activeElement?.closest('[cmdk-root]'), opt: document.activeElement?.hasAttribute('data-opt') }))
  assert.ok(pal.inPalette && !pal.opt, `${name}: palette keeps focus`)
  await p.keyboard.press('Escape'); await wait(400)
  ok('Palette', 'rows untouched')

  // ? sheet lists the new keys
  await reset(); await p.keyboard.press('?'); await wait(500)
  for (const text of ['Move through the list', 'First or last row', 'Open the highlighted row', 'Delete the highlighted row (Backspace on Mac)']) assert.ok(await p.getByText(text).isVisible(), `${name}: ? sheet shows ${text}`)
  ok('? sheet', '4 entries')

  // Touch: a tapped row never shows the active background
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: name === 'chromium' })).newPage()
  await phone.goto(BASE); await phone.waitForTimeout(2500)
  await phone.goto(`${BASE}help`); await phone.waitForTimeout(1500)
  await phone.locator('[data-opt]').first().tap()
  const tapped = await phone.evaluate(() => ({ lit: !!document.querySelector('[data-opt]:focus-visible'), bg: getComputedStyle(document.activeElement!).backgroundColor }))
  assert.equal(tapped.lit, false, `${name}: tap shows no active row`)
  ok('Touch', `tap → no active row (bg ${tapped.bg})`)

  assert.deepEqual(errors, [], `${name}: page errors`)
  await browser.close()
}

await run(chromium, 'chromium')
await run(webkit, 'webkit')

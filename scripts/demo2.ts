// Mode 2: record one beat without playing the ones before it.
//
//   node --no-warnings scripts/demo2.ts --capture       # replay the whole demo, saving a fixture before each beat
//   node --no-warnings scripts/demo2.ts autofix         # restore beat 5's fixture, set it up, record just that beat
//
// Nothing in mode 1 reaches this file. Its fixtures carry the hashes of the app build and of the beat source that
// produced them; a mismatch stops the run.
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import {
  BEATS, BASE, DONE, FPS, NAMES, OUT, ROOT, VARIANTS, makeCapture, makeCtx, runSetup, segDir, stitch, wait, withPreview,
  type Ctx, type Variant,
} from './demo-core.ts'

const FIX = `${OUT}fixtures/`
const DB_NAME = 'gg-editor'

/** Every object store as [key, value] rows; the key is null where the store takes it from the value. */
type FixtureDb = Record<string, [string | null, unknown][]>

// ---------------------------------------------------------------- staleness

/** Every built file, so a fixture captured against an older app refuses to load into a newer one. */
function buildHash() {
  const h = createHash('sha1')
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = `${dir}/${name}`
      if (statSync(path).isDirectory()) walk(path)
      else { h.update(path.slice(ROOT.length)); h.update(readFileSync(path)) }
    }
  }
  walk(`${ROOT}dist`)
  return h.digest('hex').slice(0, 16)
}

/** The source that actually produced the state entering beat `i`: the setup plus every earlier beat. */
const sourceHash = (i: number) =>
  createHash('sha1').update([runSetup, ...BEATS.slice(0, i - 1)].map((f) => f.toString()).join('\n')).digest('hex').slice(0, 16)

// ---------------------------------------------------------------- fixtures

type Fixture = {
  beat: string
  build: string
  source: string
  ids: Ctx['ids']
  at: Ctx['at']
  pace: number
  local: Record<string, string>
  idb: FixtureDb
}

/** Reads the editor's own storage out of the live page. Blobs (texture PNGs) become base64 so the fixture is JSON. */
async function dumpState(ctx: Ctx) {
  return ctx.p.evaluate(async (name: string) => {
    const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const db = await req(indexedDB.open(name))
    const stores = [...db.objectStoreNames]
    const t = db.transaction(stores, 'readonly')
    const idb: Record<string, [string | null, unknown][]> = {}
    for (const store of stores) {
      const s = t.objectStore(store)
      const inline = s.keyPath != null
      const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())])
      idb[store] = values.map((v, i) => [inline ? null : String(keys[i]), v] as [string | null, unknown])
    }
    db.close()
    const pack = async (v: unknown): Promise<unknown> => {
      if (v instanceof Blob) return { __blob: [...new Uint8Array(await v.arrayBuffer())], type: v.type }
      if (Array.isArray(v)) return Promise.all(v.map(pack))
      if (v && typeof v === 'object') return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await pack(x)])))
      return v
    }
    return {
      local: Object.fromEntries(Object.entries(localStorage)) as Record<string, string>,
      idb: await pack(idb) as Record<string, [string | null, unknown][]>,
    }
  }, DB_NAME)
}

/** Writes a fixture's storage into a blank same-origin page, before the app has ever opened the database. */
async function loadState(ctx: Ctx, f: Fixture) {
  await ctx.p.route('**/__fixture', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fixture</title>' }))
  await ctx.p.goto(`${BASE}__fixture`)
  await ctx.p.evaluate(async ({ name, local, idb }: { name: string; local: Record<string, string>; idb: FixtureDb }) => {
    const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    localStorage.clear()
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
    await new Promise<void>((res, rej) => { const d = indexedDB.deleteDatabase(name); d.onsuccess = () => res(); d.onerror = () => rej(d.error) })
    // Mirrors src/data/db.ts: the app opens this database at version 1 and never upgrades it here.
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () => {
      const db = open.result
      db.createObjectStore('mods', { keyPath: 'mod.meta.id' })
      db.createObjectStore('textures')
      db.createObjectStore('history', { keyPath: 'id' }).createIndex('modId', 'modId')
      db.createObjectStore('meta')
    }
    const db = await req(open)
    const unpack = (v: any): any => {
      if (v && typeof v === 'object' && Array.isArray(v.__blob)) return new Blob([new Uint8Array(v.__blob)], { type: v.type })
      if (Array.isArray(v)) return v.map(unpack)
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]))
      return v
    }
    const t = db.transaction([...db.objectStoreNames], 'readwrite')
    for (const [store, rows] of Object.entries(idb)) for (const [key, value] of rows) t.objectStore(store).put(unpack(value), key ?? undefined)
    await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
    db.close()
  }, { name: DB_NAME, local: f.local, idb: f.idb })
  await ctx.p.goto(BASE)
  await ctx.p.waitForLoadState('networkidle')
  await ctx.p.evaluate(() => document.fonts.ready)
  await wait(800)
  ctx.ids = f.ids
  ctx.at = f.at
  ctx.pace = f.pace
  await ctx.p.mouse.move(f.at.x, f.at.y)
}

const fixturePath = (i: number) => `${FIX}${i}-${NAMES[i - 1]}.json`

/** Restores the state entering beat `i`, refusing a fixture that no longer matches this build or these beats. */
async function restore(ctx: Ctx, i: number) {
  const path = fixturePath(i)
  assert(existsSync(path), `no fixture for ${NAMES[i - 1]}: run "node --no-warnings scripts/demo2.ts --capture"`)
  const f = JSON.parse(readFileSync(path, 'utf8')) as Fixture
  assert.equal(f.build, buildHash(), `fixture ${NAMES[i - 1]} was captured against a different app build; re-capture`)
  assert.equal(f.source, sourceHash(i), `fixture ${NAMES[i - 1]} was captured against different beat source; re-capture`)
  await loadState(ctx, f)
}

// ---------------------------------------------------------------- per-beat setup

/**
 * The undo stack lives in memory, so a mod restored from storage starts with Undo greyed out where mode 1 has it lit.
 * Toggling step 1's checkpoint off and back on through the UI is two edits that cancel out: the data is what it was,
 * Undo is enabled and Redo is empty (every recorded edit clears the redo stack).
 */
async function primeUndo(ctx: Ctx) {
  await ctx.open(`mod/${ctx.ids.choice}/steps/${ctx.ids.step}`)
  const checkpoint = ctx.byName('switch', /^Save checkpoint here/, false)
  await checkpoint.click()
  await checkpoint.click()
  await ctx.p.locator('[role="status"][data-save="saved"]').waitFor()
  assert(await ctx.byName('button', 'Undo').isEnabled(), 'Undo is still greyed out')
  assert.equal(await checkpoint.getAttribute('aria-checked'), 'true', 'the checkpoint did not come back on')
}

/** Each ends by checking the state it says it established, so a wrong setup fails before a frame is recorded. */
const SETUPS: ((ctx: Ctx) => Promise<void>)[] = [
  // 1. poster — The Long Haul's flow, as runSetup leaves it.
  async (ctx) => {
    await ctx.open(`mod/${ctx.ids.haul}/flow`)
    assert.equal(await ctx.p.getByRole('group', { name: 'Graph of how steps connect' }).getByRole('link').count(), 9)
  },
  // 2. map — playMap navigates to the map itself; it needs The Long Haul present and the caption band gone.
  async (ctx) => {
    await ctx.open(`mod/${ctx.ids.haul}/flow`)
    await ctx.caption(null, true)
    assert.equal(await ctx.p.getByRole('group', { name: 'Graph of how steps connect' }).getByRole('link').count(), 9)
  },
  // 3. dialogue — A Hard Choice's first step, still empty of the line the beat adds.
  async (ctx) => {
    await primeUndo(ctx)
    await ctx.open(`mod/${ctx.ids.choice}/steps/${ctx.ids.step}/dialogue`)
    await ctx.byName('button', 'Add a line').waitFor()
    assert(!(await ctx.p.locator('body').innerText()).includes('The cargo is still warm'))
  },
  // 4. quickbuild — Home, with beat 3's line saved into A Hard Choice.
  async (ctx) => {
    await ctx.open(`mod/${ctx.ids.choice}/steps/${ctx.ids.step}/dialogue`)
    assert((await ctx.p.locator('body').innerText()).includes('The cargo is still warm'), 'beat 3 dialogue line is missing')
    await ctx.open('')
    await ctx.byName('button', 'Download').waitFor()
  },
  // 5. autofix — A Hard Choice's problems sheet holds the one checkpoint tip the beat fixes; the beat re-opens it itself.
  async (ctx) => {
    await primeUndo(ctx)
    await ctx.open(`mod/${ctx.ids.choice}/flow?sheet=problems`)
    for (const tab of ['Errors 0', 'Warnings 0', 'Tips 1']) await ctx.byName('tab', tab).waitFor()
    await ctx.byName('button', 'Turn off checkpoint').waitFor()
    await ctx.open(`mod/${ctx.ids.choice}/flow`)
  },
  // 6. download — Home, with beat 5's fix applied and beat 4's generated mod present, and no toast left over.
  async (ctx) => {
    await ctx.open('')
    await ctx.noPending()
    for (const title of ['Owner of Record', 'The Long Haul', 'A Hard Choice']) await ctx.byName('button', `Unfavorite ${title}`).waitFor()
    await ctx.byName('button', 'Download').waitFor()
    assert.equal(await ctx.p.locator('[data-sonner-toast]').count(), 0)
  },
]

// ---------------------------------------------------------------- runs

/** Plays the whole demo with recording turned off, saving the state entering each beat. */
async function capture(browser: Browser) {
  const { ctx } = await makeCtx(browser, VARIANTS[0])
  ctx.segment = (_seconds, beat) => beat()
  await runSetup(ctx)
  mkdirSync(FIX, { recursive: true })
  const build = buildHash()
  for (let i = 1; i <= BEATS.length; i++) {
    // The store writes in the background; let its flush land before reading the database.
    await wait(1500)
    const { local, idb } = await dumpState(ctx)
    const f: Fixture = { beat: NAMES[i - 1], build, source: sourceHash(i), ids: ctx.ids, at: ctx.at, pace: ctx.pace, local, idb }
    writeFileSync(fixturePath(i), JSON.stringify(f))
    console.log(`fixture ${i} ${NAMES[i - 1]} (${(JSON.stringify(f).length / 1e6).toFixed(2)} MB)`)
    await BEATS[i - 1](ctx)
  }
}

async function recordBeat(browser: Browser, variant: Variant, i: number) {
  const { context, ctx } = await makeCtx(browser, variant)
  await restore(ctx, i)
  await SETUPS[i - 1](ctx)
  await makeCapture(ctx, context, variant, { only: new Set([i]), last: i, start: i - 1 })
  try { await BEATS[i - 1](ctx) } catch (e) { if (e !== DONE) throw e }
}

async function run(variant: Variant, body: (browser: Browser, variant: Variant) => Promise<void>) {
  const browser = await chromium.launch({ channel: 'chromium' })
  try { await body(browser, variant) } finally { await browser.close() }
}

const arg = process.argv[2]
assert(arg, 'usage: demo2.ts --capture | <beat name or number>')
const wallStart = Date.now()
await withPreview(async () => {
  if (arg === '--capture') {
    await run(VARIANTS[0], capture)
  } else {
    const i = /^\d+$/.test(arg) ? +arg : NAMES.indexOf(arg) + 1
    assert(NAMES[i - 1], `unknown beat ${arg}`)
    await Promise.all(VARIANTS.map((v) => run(v, (b) => recordBeat(b, v, i))))
    console.log(`${NAMES[i - 1]}: ${VARIANTS.map((v) => `${v} ${(readdirSync(`${segDir(i, v)}frames`).length / FPS).toFixed(1)}s`).join(', ')}`)
    if (NAMES.every((_, k) => VARIANTS.every((v) => existsSync(`${segDir(k + 1, v)}frames`)))) await stitch()
    else console.log('other beats have no cached segments; skipping the stitch')
  }
  console.log(`wall ${((Date.now() - wallStart) / 1000).toFixed(1)}s`)
})

// Shared by both demo rendering modes: the beat functions, the helpers they use, the segment cache and the stitching.
import { strict as assert } from 'node:assert'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Locator, Page } from 'playwright'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = `${ROOT}demo-out/`
const PORT = 4173
const BASE = `http://localhost:${PORT}/mods/`
const FPS = 30
const CUT = 0.2
const SEAM = 0.5
const SEGS = `${OUT}segments/`
// Segment names, in order; DEMO_ONLY=<n or name>[,...] re-records only those and stitches the rest from demo-out/segments/.
const NAMES = ['poster', 'map', 'dialogue', 'quickbuild', 'autofix', 'download']
const ONLY = process.env.DEMO_ONLY
  ? new Set(process.env.DEMO_ONLY.split(',').map((a) => { const i = /^\d+$/.test(a) ? +a : NAMES.indexOf(a) + 1; assert(NAMES[i - 1], `unknown segment ${a}`); return i }))
  : null
const LAST = ONLY ? Math.max(...ONLY) : NAMES.length
const segDir = (i: number, variant: Variant) => `${SEGS}${i}-${variant}/`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pExecFile = promisify(execFile)

const PENDING_DIR = `${ROOT}src/data/library-pending/`
const pendingTitles = existsSync(PENDING_DIR)
  ? readdirSync(PENDING_DIR).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(PENDING_DIR + n, 'utf8')).title as string)
  : []

type Variant = 'dark' | 'light'
// Dark only unless DEMO_THEMES=dark,light.
const VARIANTS = (process.env.DEMO_THEMES ?? 'dark').split(',') as Variant[]
const PALETTE = {
  dark: { text: '#FFFFFF', scrim: '11,16,32', ring: 'rgba(255,255,255,.8)', card: '#04060e', name: '#FFFFFF', line: '#bcdbe6', accent: '#35e0f5' },
  light: { text: '#0B1020', scrim: '255,255,255', ring: '#0B1020', card: '#F7F9FC', name: '#0B1020', line: '#2B3A4A', accent: '#006B7D' },
}

/** Tap indicator, caption band and closing card: the only things drawn over the app. */
function overlay(c: (typeof PALETTE)['dark']) {
  const w = window as unknown as { __demo: object }
  addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style')
    css.textContent = `
      #demo-tap{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.35);
        box-shadow:0 0 0 2px ${c.ring};z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .15s,transform .1s}
      .demo-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;box-shadow:0 0 0 2px ${c.ring};
        z-index:2147483647;pointer-events:none;animation:demo-ripple .3s ease-out forwards}
      @keyframes demo-ripple{to{transform:scale(1.636);opacity:0}}
      #demo-cap{position:fixed;inset:auto 0 0 0;height:88px;display:flex;align-items:center;justify-content:center;padding:0 16px;text-align:center;
        background:linear-gradient(rgba(${c.scrim},0),rgba(${c.scrim},.85) 45%);color:${c.text};font:600 22px/1.2 var(--font-ui);
        z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .15s}
      #demo-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:${c.card};
        z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .3s;font-family:var(--font-ui);text-align:center;padding:0 16px}
      #demo-card img{width:96px;height:96px;margin-bottom:12px}
      #demo-card b{font-size:32px;line-height:1.15;color:${c.name}} #demo-card span{font-size:20px;color:${c.line}} #demo-card i{font-style:normal;font-size:20px;color:${c.accent}}`
    document.head.append(css)
    const tap = Object.assign(document.createElement('div'), { id: 'demo-tap' })
    const cap = Object.assign(document.createElement('div'), { id: 'demo-cap' })
    const card = Object.assign(document.createElement('div'), { id: 'demo-card' })
    card.innerHTML = `<img src="icon.svg" alt=""><b>Galaxy Genome<br>Quest Editor</b><span>Free. In your browser. Offline.</span><i>galaxy-genome.github.io/mods</i>`
    document.body.append(tap, cap, card)
    let idle = 0
    const show = (e: PointerEvent) => {
      tap.style.left = `${e.clientX}px`; tap.style.top = `${e.clientY}px`; tap.style.opacity = '1'
      clearTimeout(idle); idle = window.setTimeout(() => { tap.style.opacity = '0' }, 1000)
    }
    addEventListener('pointermove', show, true)
    addEventListener('pointerdown', (e) => { show(e); tap.style.transform = 'scale(.85)' }, true)
    addEventListener('pointerup', (e) => {
      show(e); tap.style.transform = ''
      const r = Object.assign(document.createElement('div'), { className: 'demo-ripple' })
      r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`
      document.body.append(r); setTimeout(() => r.remove(), 400)
    }, true)
    w.__demo = {
      // `above`: the band's bottom edge in px from the top, so it sits over the dimmed app above a sheet.
      caption(text: string | null, instant = false, above?: number) {
        cap.style.transition = instant ? 'none' : ''
        if (text) cap.style.bottom = above === undefined ? '0' : `${innerHeight - above}px`
        if (text) cap.textContent = text
        cap.style.opacity = text ? '1' : '0'
      },
      card() { card.style.opacity = '1' },
    }
  })
}

/** What a beat needs from the recording script: the page, the scripted-motion helpers, the ids the setup found, and the pace. */
type Ctx = {
  p: Page
  byName: (role: Parameters<Page['getByRole']>[0], name: string | RegExp, exact?: boolean) => Locator
  open: (path: string) => Promise<void>
  caption: (text: string | null, instant?: boolean, above?: number) => Promise<unknown>
  sheetTop: () => Promise<number>
  hold: (ms: number) => Promise<unknown>
  tap: (l: Locator, after?: number) => Promise<void>
  drag: (x1: number, y1: number, x2: number, y2: number, ms: number, ...more: number[]) => Promise<void>
  type: (text: string) => Promise<void>
  noPending: () => Promise<void>
  segment: (seconds: number, beat: () => Promise<void>) => Promise<void>
  ids: { choice: string; step: string; haul: string }
  pace: number
  at: { x: number; y: number }
}

/** The page and the scripted-motion helpers, before any capture is attached. */
async function makeCtx(browser: Browser, variant: Variant) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'en-US', timezoneId: 'America/Chicago', colorScheme: variant, reducedMotion: 'no-preference', serviceWorkers: 'block',
  })
  const page = await context.newPage()
  await page.clock.install({ time: new Date('2026-09-14T15:00:00-05:00') })
  await page.clock.resume()
  await page.addInitScript(overlay, PALETTE[variant])
  const p = page
  const byName = (role: Parameters<Page['getByRole']>[0], name: string | RegExp, exact = true) => p.getByRole(role, { name, exact })

  // In-app navigation: a reload would drop the store's pending writes.
  const open = async (path: string) => {
    await p.evaluate((url) => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')) }, `/mods/${path}`)
    await wait(800)
  }
  const caption = (text: string | null, instant = false, above?: number) =>
    p.evaluate(([t, i, a]) => (window as any).__demo.caption(t, i, a ?? undefined), [text, instant, above ?? null] as const)
  const sheetTop = async () => (await p.getByRole('dialog').boundingBox())!.y

  // Pointer motion: eased over wall-clock time, so a slow machine drops steps rather than stretching the motion.
  const ease = (s: number) => (s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2)
  const animate = async (ms: number, step: (e: number) => Promise<void>) => {
    const start = Date.now()
    for (let s = 0; s < 1; await wait(8)) {
      s = ms > 0 ? Math.min(1, (Date.now() - start) / ms) : 1
      await step(ease(s))
    }
  }
  const hold = (ms: number) => wait(ms * ctx.pace)
  // A curved path at about 900 px/s, so the eye can follow the indicator.
  const moveTo = async (x: number, y: number) => {
    const from = ctx.at
    const bend = { x: (from.y - y) * 0.15, y: (x - from.x) * 0.15 }
    await animate((Math.hypot(x - from.x, y - from.y) / 900) * 1000 * ctx.pace, (e) =>
      p.mouse.move(from.x + (x - from.x) * e + bend.x * Math.sin(Math.PI * e), from.y + (y - from.y) * e + bend.y * Math.sin(Math.PI * e)))
    ctx.at = { x, y }
  }
  const tap = async (l: Locator, after = 350) => {
    const scrolled = await l.evaluate((el) => {
      const r = el.getBoundingClientRect()
      if (r.top >= 60 && r.bottom <= 740) return false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return true
    })
    for (let prev = '', bb = ''; scrolled; prev = bb) {
      await wait(60)
      bb = JSON.stringify(await l.boundingBox())
      if (bb === prev) break
    }
    const bb = (await l.boundingBox())!
    await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await hold(250)
    await p.mouse.down(); await hold(90); await p.mouse.up()
    await hold(after)
  }
  // One touch through each point in turn, `ms` per leg.
  const drag = async (x1: number, y1: number, x2: number, y2: number, ms: number, ...more: number[]) => {
    await moveTo(x1, y1); await hold(250)
    await p.mouse.down()
    const pts = [x1, y1, x2, y2, ...more]
    for (let i = 2; i < pts.length; i += 2) {
      const [ax, ay, bx, by] = pts.slice(i - 2, i + 2)
      await animate(ms * ctx.pace, (e) => p.mouse.move(ax + (bx - ax) * e, ay + (by - ay) * e))
    }
    await p.mouse.up()
    ctx.at = { x: pts.at(-2)!, y: pts.at(-1)! }
  }
  // 45 ms a character and 250 ms more after punctuation, scheduled on the clock so the page's round trips do not add up.
  const type = async (text: string) => {
    let due = Date.now()
    for (const ch of text) {
      await p.keyboard.type(ch)
      due += (/[.,?!]/.test(ch) ? 295 : 45) * ctx.pace
      await wait(due - Date.now())
    }
  }
  const noPending = async () => {
    const text = await p.locator('body').innerText()
    for (const title of pendingTitles) assert(!text.includes(title), `pending community mod "${title}" is on screen`)
  }

  const ctx: Ctx = {
    p, byName, open, caption, sheetTop, hold, tap, drag, type, noPending,
    segment: () => assert.fail('no capture attached'),
    ids: { choice: '', step: '', haul: '' },
    // Scales every scripted duration; 2 plays a stretch at half speed.
    pace: 1,
    at: { x: 195, y: 600 },
  }

  return { context, ctx }
}

/** Attaches the CDP screencast and gives `ctx.segment` its recording behaviour. */
async function makeCapture(ctx: Ctx, context: BrowserContext, variant: Variant, { only = ONLY, last = LAST, start = 0 }: { only?: Set<number> | null; last?: number; start?: number } = {}) {
  const { p } = ctx
  // Capture: CDP screencast frames, each segment resampled to constant frame rate afterwards.
  const cdp = await context.newCDPSession(p)
  const dir = `${OUT}frames-${variant}/`
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  let frames: { ts: number; file: string }[] = []
  let n = 0
  cdp.on('Page.screencastFrame', (f) => {
    const file = `${dir}${String(n++).padStart(6, '0')}.png`
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    frames.push({ ts: f.metadata.timestamp!, file })
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  // Each segment runs to a fixed length, so both variants cut at the same frames.
  let index = start
  const segment = async (seconds: number, beat: () => Promise<void>) => {
    const i = ++index
    if (only && !only.has(i)) return beat()
    frames = []
    await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 })
    while (!frames.length) await wait(20)
    await wait(300)
    const t0 = Date.now() / 1000
    await beat()
    // `seconds` is a minimum: a beat that runs long lengthens its segment rather than being cut.
    const t1 = Math.max(t0 + seconds, Date.now() / 1000)
    await wait((t1 - Date.now() / 1000) * 1000)
    await cdp.send('Page.stopScreencast')
    const list = frames.sort((a, b) => a.ts - b.ts)
    const ticks = []
    for (let t = t0, i = 0; t < t1; t += 1 / FPS) {
      while (i + 1 < list.length && list[i + 1].ts <= t) i++
      ticks.push(list[i])
    }
    const out = segDir(i, variant)
    rmSync(out, { recursive: true, force: true }); mkdirSync(`${out}frames`, { recursive: true })
    ticks.forEach((f, k) => linkSync(f.file, `${out}frames/${String(k).padStart(5, '0')}.png`))
    if (i === last) throw DONE
  }
  ctx.segment = segment
  return segment
}

const DONE = Symbol('done')

/** Setup, not recorded: dismisses the first-run chrome, favourites the defaults and finds the ids the beats navigate to. */
async function runSetup(ctx: Ctx) {
  const { p, byName, open, noPending } = ctx
  // ?samples adds the example mods the beats use; a plain first visit now starts with the library's mods only.
  await p.goto(`${BASE}?samples`)
  await p.waitForLoadState('networkidle')
  await p.evaluate(() => document.fonts.ready)
  await wait(800)
  await byName('button', 'Dismiss').click()
  await byName('button', 'Dismiss tip').click()
  // The three default mods, all on Home after a fresh start.
  const defaults = ['Owner of Record', 'The Long Haul', 'A Hard Choice']
  for (const title of defaults) {
    const fav = byName('button', `Favorite ${title}`)
    if (await fav.count()) { await fav.click(); await wait(300) }
  }
  await noPending()
  await open('library')
  await noPending()
  await open('')
  for (const title of defaults) await byName('button', `Unfavorite ${title}`).waitFor()

  await byName('button', /^A Hard Choice EN/, false).click()
  await p.waitForURL(/\/mod\//)
  const choice = p.url().match(/mod\/([^/?]+)/)![1]
  await open(`mod/${choice}/steps`)
  await byName('button', /^Step 1:/, false).click()
  await p.waitForURL(/steps\/[^/?]+/)
  const step = p.url().match(/steps\/([^/?]+)/)![1]
  await byName('switch', /^Save checkpoint here/, false).click()
  await wait(500)
  await open(`mod/${choice}/flow?sheet=problems`)
  await p.getByRole('listitem').filter({ hasText: 'journal is empty' }).getByRole('button', { name: 'Hide this tip' }).click()
  for (const tab of ['Errors 0', 'Warnings 0', 'Tips 1']) await byName('tab', tab).waitFor()
  await byName('button', 'Turn off checkpoint').waitFor()

  await open('')
  await byName('button', /^The Long Haul EN/, false).click()
  await p.waitForURL(/\/mod\//)
  const haul = p.url().match(/mod\/([^/?]+)/)![1]
  await open(`mod/${haul}/flow`)
  assert.equal(await p.getByRole('group', { name: 'Graph of how steps connect' }).getByRole('link').count(), 9)
  for (const label of ['Ask about the pay', 'Fast route', 'Safe route']) assert(await p.getByText(label, { exact: false }).count(), label)
  ctx.ids = { choice, step, haul }
}

// 1. The poster: The Long Haul's flow, then a pan down to the fork.
async function playPoster(ctx: Ctx) {
  const { caption, segment, hold, drag } = ctx
  await caption('Write Galaxy Genome quests on your phone', true)
  ctx.pace = 2
  await segment(6.6, async () => {
    await hold(1100)
    await drag(250, 700, 250, 330, 900)
    await hold(750)
  })
  ctx.pace = 1
}

// 2. The whole route on the galaxy map, zoomed in one step to the fitted view.
async function playMap(ctx: Ctx) {
  const { byName, open, caption, segment, tap } = ctx
  await caption(null, true)
  await open(`mod/${ctx.ids.haul}/flow?view=map`)
  await wait(1200)
  await byName('button', 'Fit to quest places').click()
  await wait(1200)
  await byName('button', 'Zoom out').click()
  await wait(1200)
  await segment(3.6, async () => {
    await caption('Every step placed on the galaxy')
    await wait(850)
    await tap(byName('button', 'Zoom in'), 0)
    await wait(2000)
  })
}

// 3-4. A new line with dialogue, a portrait and a choice.
async function playDialogue(ctx: Ctx) {
  const { byName, open, caption, segment, hold, tap, type } = ctx
  await caption(null, true)
  await open(`mod/${ctx.ids.choice}/steps/${ctx.ids.step}/dialogue`)
  ctx.pace = 2
  await segment(20.5, async () => {
    await caption('Dialogue, portraits and choices'); await hold(200); await wait(1000)
    await tap(byName('button', 'Add a line'), 350)
    await tap(byName('button', 'Tourist1 Tourist1'), 300)
    await tap(byName('button', 'Tourist2'), 300)
    await tap(byName('textbox', 'Message'), 100)
    ctx.pace = 1
    await type('The cargo is still warm. Who asked you to look?')
    ctx.pace = 2
    await hold(300)
    await caption(null); await wait(150); await caption('No JSON. Pick, type, done.'); await hold(200)
    await tap(byName('button', 'Add choice'), 200)
    await tap(byName('textbox', 'Choice 1 text'), 100)
    await type('Hand it over')
    await tap(byName('button', /^Goes to/, false), 400)
    await wait(500)
    await tap(byName('button', '4 Ending'), 600)
  })
  ctx.pace = 1
  await byName('button', 'Done').click()
  await wait(800)
}

// 5. Quick build: a new stars mod, the circle centred on Wolf 359 and sized, ten systems generated inside it.
async function playQuickBuild(ctx: Ctx) {
  const { p, byName, open, caption, sheetTop, segment, hold, tap, drag } = ctx
  await caption(null, true)
  await open('')
  await segment(17, async () => {
    await caption('Build new stars and stations')
    await wait(400)
    await tap(p.getByRole('button', { name: 'New', exact: true }).first(), 500)
    // The band moves above the New mod sheet while it is open.
    await caption('Build new stars and stations', true, await sheetTop())
    await tap(p.getByRole('button', { name: /^Stars & stations/ }).first(), 0)
    await caption(null, true)
    await wait(900)
    await caption('Build new stars and stations', true)
    await tap(p.getByRole('button', { name: /^Quick build systems/ }).or(p.getByRole('link', { name: /^Quick build systems/ })).first(), 1000)
    // Two steps in from the new mod's 300 ly view: 3.33 px a light year, past the 2.2 threshold catalogue star labels need to draw.
    await tap(byName('button', 'Zoom in'), 900)
    await tap(byName('button', 'Zoom in'), 300)
    // Wolf 359 is at (4, -2) ly: 13.3 px right of Sol and 6.7 px below it at this scale. The drag swings out and settles there.
    await drag(230, 400, 150, 330, 500, 216.7, 393.3)
    await wait(400)
    // Radius thumb: the slider's 1 ly steps below 100 ly now cover more track (domain shrank from 500 to 180 positions
    // when steps above 100 ly went coarser), so the same ly value sits further right than before.
    // 40 ly at x 98.6, out to 75 ly (x 164.4), back to 55 ly (x 126.8) — a 55 ly circle stays inside the viewport at this zoom.
    const slider = (await p.getByRole('slider').boundingBox())!
    const y = slider.y + slider.height / 2
    await drag(98.6, y, 164.4, y, 600, 126.8, y)
    await wait(400)
    const plus = p.locator('#qb-count').locator('xpath=../..').getByRole('button').last()
    await tap(plus, 100)
    for (let i = 1; i < 7; i++) { await p.mouse.down(); await hold(30); await p.mouse.up(); await hold(100) }
    assert.equal(await p.locator('#qb-count').inputValue(), '10')
    await wait(400)
    await tap(byName('button', 'Generate'), 0)
    await wait(2200)
  })
  // The Undo toast outlives the beat, and pauses while the pointer rests on it.
  await p.mouse.move(195, 300); ctx.at = { x: 195, y: 300 }
  await p.locator('[data-sonner-toast]').waitFor({ state: 'detached', timeout: 15000 })
}

// 6. A real tip from the checks, fixed by the app's own button.
async function playAutofix(ctx: Ctx) {
  const { byName, open, caption, sheetTop, segment, tap } = ctx
  await caption(null, true)
  await open(`mod/${ctx.ids.choice}/flow?sheet=problems`)
  await segment(4.8, async () => {
    await caption('Auto-fix common mod issues', true, await sheetTop())
    await wait(1900)
    await tap(byName('button', 'Turn off checkpoint'), 0)
    await byName('heading', 'No problems').waitFor()
    // The sheet grows for the empty state; the band follows its top.
    for (const end = Date.now() + 1800; Date.now() < end; await wait(30)) await caption('Auto-fix common mod issues', true, await sheetTop())
  })
}

// 7-8. The download, then the closing card.
async function playDownload(ctx: Ctx) {
  const { p, byName, open, caption, sheetTop, segment, tap, noPending } = ctx
  await caption(null, true)
  await open('')
  await noPending()
  await segment(8.6, async () => {
    await wait(300)
    await tap(byName('button', 'Download'), 0)
    await byName('button', 'Download zip').waitFor()
    await wait(500)
    await caption('One zip, ready for your phone', false, await sheetTop())
    await wait(1400)
    const download = p.waitForEvent('download')
    await tap(byName('button', 'Download zip'), 0)
    assert.equal((await download).suggestedFilename(), '20260914-ggmods-my-mods.zip')
    await caption(null)
    await wait(950)
    await p.evaluate(() => (window as any).__demo.card())
    // 300 ms fade-in, 3 s fully visible, then the seam's cross-fade.
    await wait(300 + 3000 + SEAM * 1000)
  })
}

const frameCount = (i: number, variant: Variant) => {
  const dir = `${segDir(i, variant)}frames/`
  if (!existsSync(dir)) throw new Error(`segment ${i} (${NAMES[i - 1]}, ${variant}) has no cache: run DEMO_ONLY=${NAMES[i - 1]}`)
  return readdirSync(dir).length
}

/** One segment as it appears in the finished loop: from the end of its fade-in through its fade into the next segment. */
async function piece(i: number, variant: Variant) {
  const dir = segDir(i, variant)
  const last = i === NAMES.length
  const next = last ? 1 : i + 1
  const newest = Math.max(statSync(`${dir}frames`).mtimeMs, statSync(`${segDir(next, variant)}frames`).mtimeMs)
  const done = `${dir}piece.webp`
  if (existsSync(done) && statSync(done).mtimeMs > newest && (variant === 'light' || existsSync(`${dir}piece.mp4`))) return
  const len = frameCount(i, variant) / FPS
  const din = i === 1 ? 0 : CUT
  const dout = last ? SEAM : CUT
  // The loop's seam fades into beat 1's first frame, held.
  const nextIn = last
    ? ['-loop', '1', '-framerate', String(FPS), '-t', String(SEAM + 0.1), '-i', `${segDir(1, variant)}frames/00000.png`]
    : ['-framerate', String(FPS), '-i', `${segDir(next, variant)}frames/%05d.png`]
  const prep = 'scale=780:1688,setsar=1,format=yuv444p,settb=AVTB'
  const graph = [
    `[0:v]${prep},trim=start=${din},setpts=PTS-STARTPTS[a]`,
    `[1:v]${prep},trim=duration=${last ? SEAM + 0.1 : dout},setpts=PTS-STARTPTS[b]`,
    `[a][b]xfade=transition=fade:duration=${dout}:offset=${(len - din - dout).toFixed(3)},split=2[m][w]`,
    `[w]fps=15,scale=640:-1:flags=lanczos[wo]`,
  ].join(';')
  const stills = `${dir}webp/`
  rmSync(stills, { recursive: true, force: true }); mkdirSync(stills)
  const mp4 = variant === 'dark' ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${dir}piece.mp4`] : ['-f', 'null', '-']
  await pExecFile('nice', ['-n', '19', 'ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}frames/%05d.png`, ...nextIn,
    '-filter_complex', graph, '-map', '[wo]', `${stills}%05d.png`, '-map', '[m]', ...mp4])
  const pngs = readdirSync(stills).sort().map((f) => stills + f)
  await pExecFile('nice', ['-n', '19', 'img2webp', '-loop', '0', '-lossy', '-q', '60', '-m', '4', '-d', '67', ...pngs, '-o', done])
}

/** Joins animated WebPs by concatenating their ANMF chunks; each piece's first frame is a full frame, so no re-encode. */
function joinWebp(files: string[], out: string) {
  const chunks = (buf: Buffer) => {
    const list: Buffer[] = []
    for (let o = 12; o < buf.length; o += 8 + buf.readUInt32LE(o + 4) + (buf.readUInt32LE(o + 4) & 1)) list.push(buf.subarray(o, o + 8 + buf.readUInt32LE(o + 4) + (buf.readUInt32LE(o + 4) & 1)))
    return list
  }
  const all = files.map((f) => chunks(readFileSync(f)))
  const fourcc = (c: Buffer) => c.toString('ascii', 0, 4)
  const head = all[0].filter((c) => fourcc(c) !== 'ANMF')
  const body = Buffer.concat([...head, ...all.flatMap((l) => l.filter((c) => fourcc(c) === 'ANMF'))])
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0); riff.writeUInt32LE(body.length + 4, 4); riff.write('WEBP', 8)
  writeFileSync(out, Buffer.concat([riff, body]))
}

async function stitch() {
  const t0 = Date.now()
  const ids = NAMES.map((_, i) => i + 1)
  const variants = VARIANTS
  for (const v of variants) for (const i of ids) frameCount(i, v)
  await Promise.all(variants.flatMap((v) => ids.map((i) => piece(i, v))))
  const list = `${SEGS}concat.txt`
  writeFileSync(list, ids.map((i) => `file '${segDir(i, 'dark')}piece.mp4'`).join('\n'))
  await pExecFile('nice', ['-n', '19', 'ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', `${OUT}demo.mp4`])
  for (const v of variants) {
    joinWebp(ids.map((i) => `${segDir(i, v)}piece.webp`), `${OUT}demo-${v}.webp`)
    const beat1 = createHash('sha1')
    for (const f of readdirSync(`${segDir(1, v)}frames`).sort()) beat1.update(readFileSync(`${segDir(1, v)}frames/${f}`))
    console.log(`${v}: segments ${ids.map((i) => (frameCount(i, v) / FPS).toFixed(1)).join(' ')}, beat 1 ${beat1.digest('hex').slice(0, 12)}, webp ${(statSync(`${OUT}demo-${v}.webp`).size / 1e6).toFixed(2)} MB`)
  }
  console.log(`mp4 ${(statSync(`${OUT}demo.mp4`).size / 1e6).toFixed(2)} MB, stitch ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

/** Builds the app and serves it at BASE for the duration of `body`. */
async function withPreview<T>(body: () => Promise<T>) {
  mkdirSync(OUT, { recursive: true })
  execFileSync('nice', ['-n', '19', 'npm', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  const preview = spawn(`${ROOT}node_modules/.bin/vite`, ['preview', '--config', 'scripts/vite.config.ts', '--base', '/mods/', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(BASE)).ok) break } catch { if (i > 100) throw new Error('vite preview did not start') }
      await wait(100)
    }
    return await body()
  } finally {
    preview.kill()
  }
}

/** The six beats, in order, indexed as NAMES is. */
const BEATS = [playPoster, playMap, playDialogue, playQuickBuild, playAutofix, playDownload]

export {
  type Ctx, type Variant,
  ROOT, OUT, SEGS, BASE, NAMES, FPS, VARIANTS, ONLY, LAST, DONE,
  wait, segDir, makeCtx, makeCapture, runSetup, BEATS, stitch, withPreview,
}

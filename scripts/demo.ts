// npm run demo — records the README animation from a local production build: demo-out/demo-dark.webp
// and demo-out/demo.mp4.
import { chromium, type Browser } from 'playwright'
import { BEATS, DONE, makeCapture, makeCtx, runSetup, stitch, VARIANTS, withPreview, type Variant } from './demo-core.ts'

async function record(variant: Variant) {
  const browser = await chromium.launch({ channel: 'chromium' })
  try { await script(browser, variant) } catch (e) { if (e !== DONE) throw e } finally { await browser.close() }
}

async function script(browser: Browser, variant: Variant) {
  const { context, ctx } = await makeCtx(browser, variant)
  await runSetup(ctx)
  await makeCapture(ctx, context, variant)
  for (const beat of BEATS) await beat(ctx)
}

const wallStart = Date.now()
await withPreview(async () => {
  await Promise.all(VARIANTS.map(record))
  await stitch()
  console.log(`wall ${((Date.now() - wallStart) / 1000).toFixed(1)}s`)
})

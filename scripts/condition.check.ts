// node --import ./scripts/test-hooks.mjs scripts/condition.check.ts — a step's "Finishes when" and "Fails when" change through
// the condition picker (a category row records ?pick= in the address, which must not reopen another picker), and a
// "Choose a condition" fix link opens the picker, against a running dev server (KEYNAV_BASE, default http://localhost:5173/).
import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'

const BASE = process.env.KEYNAV_BASE ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors: string[] = []
p.on('pageerror', (e: Error) => errors.push(e.message))

await p.goto(`${BASE}new/quest/delivery`)
await p.locator('#quest-name').fill('Condition check')
await p.getByText('Create quest').click()
await p.waitForURL(/overview/)
await p.locator('a[href*="/steps?step"]').first().click()
await p.locator('[role=button][data-opt]').nth(1).click()
await p.waitForURL(/\/steps\/[^/?]+$/)
const stepUrl = p.url()

const card = (title: RegExp) => p.locator('button', { hasText: title }).first()
const heading = () => p.locator('[role=dialog] h2').first().textContent()

await card(/^Finishes when/).click()
await p.locator('[data-nav="pick:Dialogue and time"]').click()
assert.equal(await heading(), 'Dialogue and time', 'the category opens')
await p.locator('[data-nav="pick:ACTION_DIALOG_COMPLETE"]').click()
await p.locator('[role=dialog]').waitFor({ state: 'detached' })
assert.match(await card(/^Finishes when/).textContent() ?? '', /dialogue is closed/)

await p.getByRole('button', { name: /Add failure condition/ }).first().click()
await p.locator('[data-nav="pick:Dialogue and time"]').click()
assert.equal(await heading(), 'Dialogue and time', 'the failure picker opens the category')
await p.locator('[role=dialog]').getByRole('button', { name: /Back/ }).click()
await p.keyboard.press('Escape')

await p.goto(`${stepUrl}?field=finishWhen&open=finish`)
assert.match(await heading() ?? '', /^Finishes when/, 'a fix link opens the finish picker')

assert.deepEqual(errors, [])
await browser.close()
console.log('condition.check: ok')

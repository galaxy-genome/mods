// CREDITS.md matches the mod entries, and every bundled entry states its provenance.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { bundledEntries, CREDITS_PATH, renderCredits } from '../../scripts/credits.ts'

for (const e of bundledEntries()) {
  for (const k of ['author', 'licence', 'source'] as const) assert.ok(e[k]?.trim(), `${e.id} lacks ${k}`)
  assert.ok(['default', 'library', 'both'].includes(e.role), `${e.id} has no valid role`)
}
assert.equal(readFileSync(CREDITS_PATH, 'utf8'), renderCredits(), 'CREDITS.md is stale: run npm run credits')
console.log('credits ok')

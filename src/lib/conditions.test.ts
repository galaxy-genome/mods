// node --import ./scripts/test-hooks.mjs src/lib/conditions.test.ts — the catalogue holds only strings the game dispatches.
import { strict as assert } from 'node:assert'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONDITIONS, parseCondition } from './conditions.ts'

const scripts = new URL('../../../decompiled-all/scripts/', import.meta.url).pathname
if (existsSync(scripts)) {
  const names = readFileSync(join(scripts, 'ui/ButtonNames.as'), 'utf8')
  const values = new Map([...names.matchAll(/const (\w+):\* = "BUTTON_([^"]+)"/g)].map((m) => [m[2], m[1]]))
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.as') ? [p] : [] })
  const used = walk(scripts).filter((p) => !p.endsWith('ButtonNames.as')).map((p) => readFileSync(p, 'utf8')).join('\n')
  for (const c of CONDITIONS) {
    const constant = values.get(c.action)
    const dynamic = /MissionType|MissionRescue/.test(c.action) && used.includes(c.action.replace(/^ACTION_(MissionType|MissionRescue)\w*?(Start|COMPLETE)$/, '$2'))
    assert.ok(dynamic || (constant && used.includes(`ButtonNames.${constant}`)), `${c.action} is not dispatched`)
  }
  console.log('conditions: all', CONDITIONS.length, 'dispatched')
}
assert.equal(parseCondition('SCAN_CARGO').def, null)
assert.equal(parseCondition('PLANET_MINING_DONE_Iron').def?.param, 'material')
console.log('conditions ok')

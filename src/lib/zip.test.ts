// node src/lib/zip.test.ts — round-trips files through zip/unzip, and `unzip -t` checks the archive when present.
import { strict as assert } from 'node:assert'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzip, zip } from './zip.ts'

const files = [{ name: 'mod/Quest0.json', text: '{"settings":{"QuestName":"Сириус ☄"}}' }, { name: 'state/mod.json', text: 'x'.repeat(5000) }]
const blob = zip(files)
assert.deepEqual((await unzip(blob)).map((f) => ({ name: f.name, text: f.text })), files)
const path = join(mkdtempSync(join(tmpdir(), 'zip-')), 'test.zip')
writeFileSync(path, new Uint8Array(await blob.arrayBuffer()))
try { execSync(`unzip -t ${path}`, { stdio: 'pipe' }) } catch (e) { assert.fail(`unzip -t rejected the archive: ${e}`) }
console.log('zip ok')

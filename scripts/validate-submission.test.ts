// A submission zip made from a default mod passes; a broken one reports errors and makes no entry.
import { strict as assert } from 'node:assert'
import { formFields, validateZip } from './validate-submission.ts'

const { sampleMods } = await import('../src/lib/templates.ts')
const { toGameJson } = await import('../src/features/output/gameJson.ts')
const { zip } = await import('../src/lib/zip.ts')

const bytes = async (files: Parameters<typeof zip>[0]) => new Uint8Array(await zip(files).arrayBuffer())
const [parcel] = sampleMods()
const quest = JSON.stringify(toGameJson(parcel.versions.en!), null, 2)
const catalogue = (title: string) => ({ name: 'catalogue-entry.json', text: JSON.stringify({ title, author: 'Tester', summary: 'A test.', tags: ['Short'], version: '1.0', updated: '2026-09-14T00:00:00Z' }) })

const good = await validateZip(await bytes([{ name: 'en/Quest0.json', text: quest }, catalogue('Test Parcel')]), [])
assert.deepEqual(good.errors, [])
assert.equal(good.entry?.id, 'test-parcel-1-0')
assert.equal(good.entry?.files[0].lang, 'en')
assert.equal(good.entry?.role, 'library')

const broken = JSON.parse(quest)
broken.questParts = broken.questParts.slice(0, 1)
const bad = await validateZip(await bytes([
  { name: 'en/Quest0.json', text: JSON.stringify(broken) },
  { name: 'es/Quest1.json', text: '{ not json' },
  { name: '../evil.sh', text: 'rm -rf /' },
  catalogue(''),
]), [])
assert.equal(bad.entry, undefined)
for (const hint of ['evil.sh', 'es/Quest1.json', 'no name', 'Steps']) assert.ok(bad.errors.some((e) => e.includes(hint)), `no error mentions ${hint}: ${bad.errors.join(' | ')}`)

assert.deepEqual((await validateZip(new TextEncoder().encode('not a zip'), [])).errors, ['The attachment is not a zip file.'])
assert.deepEqual(formFields('### Author name\n\nAda\n\n### Licence\n\nMIT\n\n### Other licence\n\n_No response_'), { 'Author name': 'Ada', Licence: 'MIT', 'Other licence': '' })
console.log('validate-submission ok')

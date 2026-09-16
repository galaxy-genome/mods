// Every library entry in src/data/library/ opens in the editor with no rule errors. Warnings and tips are fine.
//   library.test.ts [dir]   checks the entries in dir instead of src/data/library/
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import type { CommunityEntry } from '../lib/community.ts'

await import('../../scripts/validate-submission.ts') // stubs the store the rules reach for
const { importText } = await import('../features/start/importer.ts')
const { modProblems } = await import('../lib/rules.ts')
const { entryMod } = await import('../lib/community.ts')
const { partsOf } = await import('../lib/mods.ts')

const dir = process.argv[2] ?? new URL('./library/', import.meta.url).pathname
const entries: CommunityEntry[] = readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8')))
const parts = entries.map((e) => partsOf(entryMod(e)))
const all = parts.flat()

const failures: string[] = []
entries.forEach((entry, i) => {
  const errors = entry.files.filter((f) => importText(f.text).kind !== 'ok').map((f) => `${f.lang}/${f.name} · import: does not open in the editor`)
  for (const part of parts[i]) {
    for (const p of modProblems(part, all)) if (p.severity === 'error') errors.push(`${part.meta.title} · ${p.id} · ${p.location.label}: ${p.message}`)
  }
  console.log(`${entry.id}: ${errors.length} error${errors.length === 1 ? '' : 's'}`)
  for (const e of errors) console.log(`  ${e}`)
  failures.push(...errors.map((e) => `${entry.id} · ${e}`))
})
assert.deepEqual(failures, [], 'Library entries have rule errors')

// Every screen of every entry has a `/community/` address that reads back as that same screen.
const { communityPath, parseCommunityPath } = await import('../lib/community.ts')
const SCREENS = ['overview', 'flow', 'test', 'steps', 'stars', 'stars/map', 'map', 'build', 'steps/s1/ships/x']
for (const entry of entries) {
  const mod = entryMod(entry)
  for (const part of [...mod.quests.map((q) => q.id), ...(mod.stars ? [mod.stars.id] : [])]) {
    for (const path of SCREENS) {
      const link = communityPath(mod, part, path)
      assert.ok(link?.startsWith(`/community/${entry.id}/`), `no link for ${entry.id} ${part} ${path}`)
      const back = parseCommunityPath(mod, link.replace(`/community/${entry.id}/`, ''))
      assert.deepEqual(back, { partId: part, path }, `${link} reads back wrong`)
    }
  }
  assert.equal(communityPath(mod, mod.quests[0]?.id ?? null, ''), `/community/${entry.id}`)
  assert.equal(communityPath({ ...mod, meta: { ...mod.meta, modified: true } }, mod.quests[0].id, 'flow'), null, 'a modified copy has no shareable link')
}
console.log('community links ok')

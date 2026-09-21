// node src/lib/save/quests.test.ts — marking a quest completed writes that quest and nothing else.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { AmfArray, AmfDouble, AmfObject, AmfVector, decode, encode, type AmfValue, type Save } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { COMPLETED_STEP, UNSTARTED_STEP, questRows, setQuestCompleted } from './quests.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const path = join(repo, 'saves/Save1.SOL')
const QUEST = 100002

/** Every leaf of the decoded tree, as `path=value`, so two saves can be compared field by field. */
function flatten(v: AmfValue, at: string, out: string[] = []): string[] {
  if (v instanceof AmfObject) {
    for (const [k, x] of v.fields) flatten(x, `${at}.${k}`, out)
    for (const [k, x] of v.extra) flatten(x, `${at}.${k}`, out)
    v.raw.forEach(([c, x], i) => (c === 'O' ? flatten(x as AmfValue, `${at}[${i}]`, out) : out.push(`${at}[${i}]=${Buffer.from(x as Uint8Array).toString('hex')}`)))
  } else if (v instanceof AmfVector) {
    v.items.forEach((x, i) => flatten(x, `${at}.${v.cls || v.kind}[${i}]`, out))
  } else if (v instanceof AmfArray) {
    for (const [k, x] of v.assoc) flatten(x, `${at}.${k}`, out)
    v.dense.forEach((x, i) => flatten(x, `${at}[${i}]`, out))
  } else if (v instanceof AmfDouble) out.push(`${at}=${v.v}`)
  else if (v instanceof Uint8Array) out.push(`${at}=${Buffer.from(v).toString('hex')}`)
  else out.push(`${at}=${String(v)}`)
  return out
}

const leaves = (sv: Save) => sv.objs.flatMap((o, i) => flatten(o, `obj${i + 1}`))

const original = new Uint8Array(readFileSync(path))
const clean = encode(decode(original))
assert.deepEqual(clean, original, 'unedited encode is not byte-identical')

const sv = decode(original)
const before = leaves(sv)
assert.equal(questRows(sv).find((r) => r.id === QUEST), undefined, `Save1.SOL already carries quest ${QUEST}`)

setQuestCompleted(sv, QUEST, true)
const row = questRows(sv).find((r) => r.id === QUEST)
assert.ok(row?.completed, 'the quest is not completed after the edit')
assert.equal(row.step, COMPLETED_STEP)

// prepareDownload re-decodes what it is about to hand over and refuses anything the loader dislikes.
const edited = prepareDownload(sv)
const back = decode(edited)

const backRow = questRows(back).find((r) => r.id === QUEST)
assert.ok(backRow?.completed, 'the completed flag did not survive the round-trip')
assert.equal(backRow.step, COMPLETED_STEP)
assert.equal(questRows(back).length, 1, 'more than one quest row was written')

// Every leaf outside the one new quest row is unchanged.
const added = leaves(back).filter((x) => !before.includes(x))
assert.deepEqual(added.map((x) => x.split('=')[0]), ['obj9[1].QuestSaveData[0][0]', 'obj9[1].QuestSaveData[0][1]', 'obj9[1].QuestSaveData[0][2]', 'obj9[1].QuestSaveData[0][3]'], `unexpected changes: ${added}`)
assert.deepEqual(before.filter((x) => !leaves(back).includes(x)), [], 'a field outside the quest list changed')

// Un-marking it returns the save to its original bytes.
setQuestCompleted(back, QUEST, false)
assert.equal(questRows(back)[0].step, UNSTARTED_STEP)
setQuestCompleted(back, QUEST, true)
assert.deepEqual(encode(back), edited, 'un-marking and re-marking is not stable')

// gg_save.py is the oracle: it parses the edited bytes and reports the same row.
const out = join(tmpdir(), 'gg-quests-test.SOL')
writeFileSync(out, edited)
const oracle = execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
import gg_save as g
sv = g.load(${JSON.stringify(out)})
rows = sv.objs[8].raw[1][1].items
print(len(rows), *[(int.from_bytes(r.raw[0][1],'big'), r.raw[1][1][0], int.from_bytes(r.raw[2][1],'big')) for r in rows])
`], { encoding: 'utf8' }).trim()
assert.equal(oracle, `1 (${QUEST}, 1, ${COMPLETED_STEP})`, `gg_save.py disagrees: ${oracle}`)

console.log(`quests ok  ${oracle}  ${edited.length} bytes`)

// node src/lib/save/engineer.test.ts — the engineer's bit packing and the material counts, on a real save.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AmfObject, EXTRA, decode, encode } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { bySaveName, type ModuleRec } from './rules.ts'
import {
  MATERIAL_COUNT, MATERIAL_MAX, MAX_LEVEL, applyBest, atBest, levelOf, materialCounts, moduleBits,
  packLevel, priorityOf, setLevel, setMaterial, setUpgradeType, upgradeTypeOf, upgradeables,
} from './engineer.ts'
import { changed, leaves } from './leaves.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const data = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleRec[]; materials: { id: number; key: string; name: string }[]; materialCountMax: number }
const names = bySaveName(data.modules)

const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL')))
const load = () => decode(bytes)

// ------------------------------------------------------- the bit layout (`Module.as:277-303`)

for (let priority = 0; priority <= 0x0f; priority++) {
  for (let level = 0; level <= 0x3f; level++) {
    for (let type = 0; type <= 3; type++) {
      const v = packLevel(priority, level, type)
      assert.equal(priorityOf(v), priority)
      assert.equal(levelOf(v), level)
      assert.equal(upgradeTypeOf(v), type)
      // The game's own masks, read off `Module.as:279,289,299`.
      assert.equal(v, ((0 & 0xfffffff0) | (priority & 0x0f)) | ((level & 0x3f) << 4) | ((type & 3) << 10))
      assert.ok(v <= 0xfff, 'nothing above bit 11 is used')
    }
  }
}
console.log('bit layout: priority 0-3, level 4-9, upgrade type 10-11 round-trip over every value')

// ------------------------------------------------------- level 25 on a real module

const sv = load()
const list = upgradeables(sv, names)
assert.ok(list.length > 0, 'the save carries a module some engineer upgrades')
const target = list[0]
const before = target.module.raw[12][1] as Uint8Array
const priority = target.priority, type = target.upgradeType

assert.ok(setLevel(target.module, MAX_LEVEL))
const after = new DataView((target.module.raw[12][1] as Uint8Array).buffer).getUint32(0)
assert.equal(after, packLevel(priority, MAX_LEVEL, type))
assert.equal(priorityOf(after), priority, 'priority untouched')
assert.equal(upgradeTypeOf(after), type, 'upgrade type untouched')
assert.equal(levelOf(after), 25)
assert.notEqual(Buffer.from(before).toString('hex'), Buffer.from(target.module.raw[12][1] as Uint8Array).toString('hex'))

assert.equal(setLevel(target.module, 26), false, 'level 26 is refused (`EngineerScreen.as:117`)')
assert.equal(setLevel(target.module, -1), false)
assert.equal(levelOf(new DataView((target.module.raw[12][1] as Uint8Array).buffer).getUint32(0)), 25, 'the refusal wrote nothing')
console.log(`level 25 on ${target.mod?.name ?? target.subtype}: 0x${after.toString(16)}`)

// ------------------------------------------------------- a different upgrade type resets the level

const other = (type + 1) % 4
assert.ok(setUpgradeType(target.module, other))
const reset = new DataView((target.module.raw[12][1] as Uint8Array).buffer).getUint32(0)
assert.equal(levelOf(reset), 1, 'a new upgrade type resets the level to 1 (`EngineerScreen.as:214-216`)')
assert.equal(upgradeTypeOf(reset), other)
assert.equal(priorityOf(reset), priority)
assert.ok(setUpgradeType(target.module, other), 'the same type is accepted')
assert.equal(levelOf(new DataView((target.module.raw[12][1] as Uint8Array).buffer).getUint32(0)), 1, 'the same type leaves the level alone')
assert.ok(setLevel(target.module, MAX_LEVEL))
console.log('changing the upgrade type resets the level to 1')

// ------------------------------------------------------- materials

assert.equal(materialCounts(sv).length, MATERIAL_COUNT)
assert.equal(data.materials.length, MATERIAL_COUNT)
assert.equal(data.materialCountMax, MATERIAL_MAX)

assert.ok(setMaterial(sv, 3, 7))
assert.equal(materialCounts(sv)[3], 7)
assert.ok(setMaterial(sv, 3, 999))
assert.equal(materialCounts(sv)[3], MATERIAL_MAX, 'clamped at 50 (`globalSettings.as:51`)')
assert.ok(setMaterial(sv, 5, -4))
assert.equal(materialCounts(sv)[5], 0, 'clamped at 0')
assert.equal(setMaterial(sv, 32, 1), false, 'there are 32 materials')
assert.ok(setMaterial(sv, 31, 12))
console.log('materials: granted, clamped at 50 and at 0')

// ------------------------------------------------------- the edited save encodes and passes the gate

const out = prepareDownload(sv)
const back = decode(out)
assert.equal(Buffer.from(encode(back)).toString('hex'), Buffer.from(out).toString('hex'), 're-decodes identically')
assert.deepEqual(materialCounts(back), materialCounts(sv))
const backList = upgradeables(back, names)
assert.equal(backList[0].level, 25)
assert.equal(backList[0].upgradeType, other)
console.log('the edited save encodes, re-decodes identically and passes prepareDownload')

// ------------------------------------------------------- the same bytes, read by gg_save.py

const dir = mkdtempSync(join(tmpdir(), 'gg-engineer-'))
const file = join(dir, 'Save1.SOL')
writeFileSync(file, out)
const oracle = execFileSync('python3', ['-c', `
import sys, struct
sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
from gg_save import load, EXTRA, SHIP, STORAGE
sv = load(${JSON.stringify(file)})
mats = [struct.unpack('>b', sv.objs[EXTRA].raw[i][1])[0] for i in range(32)]
mods = [m for m in sv.objs[SHIP].raw[2][1].items if m is not None] + [m for m in sv.objs[STORAGE].raw[0][1].items if m is not None]
lv = [struct.unpack('>I', m.raw[12][1])[0] for m in mods]
print(repr(mats)); print(repr(lv))
`], { encoding: 'utf8' }).trim().split('\n')

assert.deepEqual(JSON.parse(oracle[0]), materialCounts(sv), 'gg_save.py reads the same 32 counts')
const mine = upgradeables(back, names)
const oracleLevels = JSON.parse(oracle[1]) as number[]
for (const u of mine) {
  const packed = packLevel(u.priority, u.level, u.upgradeType)
  assert.ok(oracleLevels.includes(packed), `gg_save.py reads ${packed} for ${u.subtype}`)
}
assert.ok(oracleLevels.includes(packLevel(priority, MAX_LEVEL, other)), 'gg_save.py reads the level 25 module')
console.log('gg_save.py agrees on the 32 material counts and on priority_and_level')

// ------------------------------------------------------- the module panel's engineer

// Opening a module applies the whole ladder, and stepping back down writes the level bits alone.
{
  const sv2 = decode(bytes)
  const all = upgradeables(sv2, names)
  assert.ok(all.length, 'the save carries a module some engineer works on')
  for (const u of all) {
    applyBest(u.module)
    assert.equal(moduleBits(u.module).level, MAX_LEVEL, `${u.subtype}: opening it yields level 25`)
    assert.ok(atBest(u.module), `${u.subtype}: at its best`)
  }

  const one = all[0]
  const before = leaves(sv2)
  const bits = moduleBits(one.module)
  setLevel(one.module, 7)
  const diff = changed(before, leaves(sv2))
  assert.equal(diff.length, 1, `a lower level writes one leaf, not ${diff.length}`)
  assert.ok(diff[0].endsWith(':u'), 'the leaf is the packed priority_and_level field')
  const now = moduleBits(one.module)
  assert.equal(now.level, 7)
  assert.equal(now.priority, bits.priority, 'priority is untouched')
  assert.equal(now.upgradeType, bits.upgradeType, 'the modification is untouched')
  console.log(`opening ${all.length} modules yields level 25; a lower level writes ${diff[0]} alone`)
}

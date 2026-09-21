// node src/features/save/home.test.ts — the nine home cards match what gg_save.py reads from the same file.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decode, getCredits } from '../../lib/save/codec.ts'
import { cardFigures } from '../../lib/save/home.ts'

const repo = resolve(import.meta.dirname, '../../../..')

// The oracle: the same figures read through `tools/bin/gg_save.py`'s own parser.
const ORACLE = `
import json, struct, sys
sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
from gg_save import load
sv = load(sys.argv[1]); o = sv.objs
utf = lambda x, i: x.raw[i][1][2:].decode()
f64 = lambda x, i: struct.unpack('>d', x.raw[i][1])[0]
i32 = lambda x, i: struct.unpack('>i', x.raw[i][1])[0]
i8  = lambda x, i: struct.unpack('>b', x.raw[i][1])[0]
vec = lambda x, i: x.raw[i][1].items
n   = lambda v: f'{v:,}'
mods = lambda s: len(s.raw[2][1].items)
mat = [i8(o[6], i) for i in range(32)]
print(json.dumps([
 {"key": "ship", "stats": [["Ship", utf(o[7], 0)], ["Modules", n(mods(o[7]))]]},
 {"key": "hangar", "stats": [["Ships", n(len(o[3].items))], ["Modules", n(sum(mods(s) for s in o[3].items))]]},
 {"key": "storage", "stats": [["Modules", n(len(vec(o[4], 0)))], ["Station", n(len(set(vec(o[4], 1))))]]},
 {"key": "cargo", "stats": [["Credits", n(struct.unpack('>I', o[2].raw[0][1])[0])], ["Cargo", n(sum(vec(o[2], 2)))], ["Goods", n(len(vec(o[2], 1)))]]},
 {"key": "materials", "stats": [["Materials", n(sum(mat))], ["Kinds", n(len([m for m in mat if m]))]]},
 {"key": "galaxy", "stats": [["Position", f"{f64(o[0], 0):.1f}, {f64(o[0], 1):.1f}"], ["Explored systems", n(len(vec(o[1], 0)) + len(vec(o[1], 1)))], ["System", utf(o[6], 46)]]},
 {"key": "quests", "stats": [["Quests", n(len(vec(o[8], 1)))], ["Active", n(len(vec(o[8], 2)))], ["Main job", n(i32(o[5], 5))]]},
 {"key": "station", "stats": [["Station", utf(o[9], 1) or "None"], ["System", utf(o[9], 0) or "None"], ["Ships", n(len(vec(o[9], 8)))]]},
 {"key": "record", "stats": [["Reputation", n(len(vec(o[5], 0)))], ["Fines", n(len(vec(o[5], 3)))], ["Karma Level", n(i8(o[6], 32))]]},
]))
`

for (const name of ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']) {
  const path = join(repo, 'saves', name)
  const sv = decode(new Uint8Array(readFileSync(path)))
  const cards = cardFigures(sv)
  const oracle = JSON.parse(execFileSync('python3', ['-c', ORACLE, path], { encoding: 'utf8' }))
  assert.deepEqual(cards, oracle, `${name}: cards differ from gg_save.py`)

  // `gg_save.py dump` prints ship, credits and hangar in its own words; those three agree too.
  const dump = execFileSync('python3', [join(repo, 'tools/bin/gg_save.py'), 'dump', path], { encoding: 'utf8' })
  const field = (k: string) => dump.match(new RegExp(`^${k}\\s+(.*)$`, 'm'))![1]
  const by = (key: string, label: string) => cards.find((c) => c.key === key)!.stats.find((s) => s[0] === label)![1]
  assert.equal(by('ship', 'Ship'), field('ship'))
  assert.equal(by('cargo', 'Credits'), field('credits'))
  const listed = field('hangar')
  assert.equal(by('hangar', 'Ships'), String(listed === '(empty)' ? 0 : JSON.parse(listed.replaceAll("'", '"')).length))

  console.log(`${name}  credits ${getCredits(sv).toLocaleString()}`)
  for (const c of cards) console.log(`  ${c.key.padEnd(10)} ${c.stats.map(([l, v]) => `${l}: ${v}`).join('   ')}`)
}

// An edit to credits is what the card reads back: the page recomputes rather than caching.
const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save2.SOL'))))
const { setCredits } = await import('../../lib/save/codec.ts')
setCredits(sv, 4242)
assert.equal(cardFigures(sv).find((c) => c.key === 'cargo')!.stats[0][1], '4,242')
console.log('credits edit follows through to the card')

console.log('home ok')

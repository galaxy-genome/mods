// node src/lib/save/trade.test.ts — a buy and a sell survive a round trip and agree with gg_save.py.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CARGO, decode, encode, getCredits, type AmfObject, type AmfVector } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { cargoTotal, heldGoods, priceOf, trade } from './trade.ts'

const repo = resolve(import.meta.dirname, '../../../..')

// The oracle: balance and the two goods vectors, read by `tools/bin/gg_save.py`'s own parser.
const ORACLE = `
import json, struct, sys
sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
from gg_save import load
o = load(sys.argv[1]).objs[2]
print(json.dumps({
  "balance": struct.unpack('>I', o.raw[0][1])[0],
  "type": list(o.raw[1][1].items),
  "count": list(o.raw[2][1].items),
}))
`

const oracle = (bytes: Uint8Array) => {
  const path = join(tmpdir(), 'gg-trade-test.SOL')
  writeFileSync(path, bytes)
  return JSON.parse(execFileSync('python3', ['-c', ORACLE, path], { encoding: 'utf8' }))
}

const vectors = (b: Uint8Array) => {
  const c = decode(b).objs[CARGO] as AmfObject
  return {
    balance: getCredits(decode(b)),
    type: (c.raw[1][1] as AmfVector).items.map(String),
    count: (c.raw[2][1] as AmfVector).items.map(Number),
  }
}

const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL'))))
const before = getCredits(sv)
const held = heldGoods(sv)
const [sellType] = [...held.keys()]
const sellCount = held.get(sellType)!

// Buy 7 Grain at the first-row price, then sell one of a good the save already carries.
const buyPrice = priceOf(0.1, 0)
const sellPrice = priceOf(0.15, 1)
trade(sv, 'Grain', 7, buyPrice, 'buy')
trade(sv, sellType, 1, sellPrice, 'sell')

const want = before - 7 * buyPrice + sellPrice
assert.equal(getCredits(sv), want)
assert.equal(heldGoods(sv).get('Grain'), 7)
assert.equal(heldGoods(sv).get(sellType) ?? 0, sellCount - 1)

const bytes = prepareDownload(sv)
const back = vectors(bytes)
assert.equal(back.balance, want)
assert.deepEqual(back, oracle(bytes), 'the edited save differs from what gg_save.py reads')
assert.equal(back.count[back.type.indexOf('Grain')], 7)
console.log(`buy 7 Grain at ${buyPrice}, sell 1 ${sellType} at ${sellPrice}: ${before} -> ${back.balance} CR`)
console.log(`  goods ${JSON.stringify(back.type)} counts ${JSON.stringify(back.count)}  total ${cargoTotal(sv)}`)

// Selling the whole stack drops the good's pair of entries rather than leaving a zero.
trade(sv, sellType, sellCount, sellPrice, 'sell')
assert.equal(heldGoods(sv).has(sellType), false)
assert.deepEqual(vectors(prepareDownload(sv)).type, [...heldGoods(sv).keys()])

// Selling more than is held sells only what is held, and buying beyond the balance is the
// caller's business: the balance is clamped into the uint the loader accepts.
const poor = decode(new Uint8Array(readFileSync(join(repo, 'saves/Save2.SOL'))))
trade(poor, 'Grain', 1e6, 100000, 'buy')
assert.equal(getCredits(poor), 0)
assert.doesNotThrow(() => prepareDownload(poor))
console.log('empty stack removed, balance clamped at 0')

// Encoding twice with no further edits is byte-identical, so nothing here writes on read.
assert.deepEqual([...encode(sv)], [...encode(sv)])
console.log('trade ok')

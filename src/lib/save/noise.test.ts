// node src/lib/save/noise.test.ts — the ported Flash PRNG is deterministic, and a
// recorded seed still rolls what it rolled.
import { strict as assert } from 'node:assert'
import { Rndm } from './noise.ts'
import { rollExperimental } from './experimental.ts'

const first = (seed: number, n: number) => {
  const r = new Rndm(seed)
  return Array.from({ length: n }, () => r.random())
}

assert.deepEqual(first(12345, 8), first(12345, 8), 'the same seed gave two different streams')
assert.notDeepEqual(first(1, 8), first(2, 8), 'two seeds gave the same stream')
for (const v of first(1, 2000)) assert.ok(v >= 0 && v < 1, `random() left [0, 1): ${v}`)

// Recorded from this port. A mismatch means the generator changed.
assert.deepEqual(first(7, 3).map((v) => v.toFixed(12)), ['0.963157290817', '0.339235375249', '0.956438952348'])

// `integer(2, 4)` floors a value in [2, 4), so the loop never runs four times.
for (let s = 1; s <= 5000; s++) {
  const n = Object.keys(rollExperimental(s)).length
  assert.ok(n === 1 || n === 2 || n === 3, `seed ${s} produced ${n} boosts`)
}

assert.deepEqual(
  Object.fromEntries(Object.entries(rollExperimental(1)).map(([k, v]) => [k, +v.toFixed(6)])),
  { fsdBoost: 2.121857, shieldsRegBoost: 0.107239 },
)

console.log('noise: generator deterministic, seed 1 rolls', rollExperimental(1))

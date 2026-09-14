// npm test — overlay pin framing and fanning.
import { strict as assert } from 'node:assert'
import { FIT_MIN_LY, PIN_R, fanPins, fitView } from './declutter'

const pin = (px: number, py: number, w = 2 * PIN_R) => ({ px, py, w })

// Framing: the box fills the padded view, centred.
const v = fitView([{ x: 0, y: 0 }, { x: 11, y: 3 }], 390, 400)!
assert.equal(v.x, 5.5); assert.equal(v.y, 1.5)
assert.ok(Math.abs(v.scale - (390 - 128) / 11) < 1e-9)
// One place: the minimum span, not an absurd zoom.
assert.equal(fitView([{ x: 5, y: 5 }], 390, 400)!.scale, Math.min(40, (390 - 128) / FIT_MIN_LY))
// Circles count by their radius; nothing to frame gives nothing.
assert.ok(Math.abs(fitView([{ x: 0, y: 0, r: 50 }], 400, 400)!.scale - (400 - 128) / 100) < 1e-9)
assert.equal(fitView([], 400, 400), undefined)

// Spread pins stay where they are.
const apart = fanPins([pin(0, 0), pin(100, 0), pin(0, 100)])
assert.ok(apart.every((p, i) => !p.fanned && p.x === [0, 100, 0][i] && p.y === [0, 0, 100][i]))

// Close pins fan out: no two overlap, each keeps its side, and zooming out further changes nothing about that.
for (const n of [2, 3, 5, 8]) {
  const close = Array.from({ length: n }, (_, i) => pin(i * 3, i % 2))
  const out = fanPins(close)
  assert.ok(out.every((p) => p.fanned))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y) >= 2 * PIN_R, `n=${n} ${i},${j}`)
}
const two = fanPins([pin(0, 0), pin(6, 0)])
assert.ok(two[0].x < two[1].x)
// Identical positions still separate.
const same = fanPins([pin(10, 10), pin(10, 10)])
assert.ok(Math.hypot(same[0].x - same[1].x, same[0].y - same[1].y) >= 2 * PIN_R)
// Only the crowded group fans.
const mixed = fanPins([pin(0, 0), pin(5, 0), pin(200, 200)])
assert.deepEqual(mixed.map((p) => p.fanned), [true, true, false])
console.log('declutter: ok')

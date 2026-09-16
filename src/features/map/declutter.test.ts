// npm test — overlay pin framing and fanning.
import { strict as assert } from 'node:assert'
import { FIT_MIN_LY, PIN_R, fanPins, fitView } from './declutter'

const pin = (px: number, py: number, w = 2 * PIN_R) => ({ px, py, w })

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol

// Framing: the box fills the padded view, centred.
const v = fitView([{ x: 0, y: 0 }, { x: 11, y: 3 }], 390, 400)!
assert.ok(near(v.x, 5.5) && near(v.y, 1.5))
assert.ok(near(v.scale, (390 - 128) / 11))
// One place: the minimum span, not an absurd zoom.
assert.ok(near(fitView([{ x: 5, y: 5 }], 390, 400)!.scale, Math.min(40, (390 - 128) / FIT_MIN_LY)))
// Circles count by their radius; nothing to frame gives nothing.
assert.ok(near(fitView([{ x: 0, y: 0, r: 50 }], 400, 400)!.scale - (400 - 128) / 100, 0, 1e-6))
assert.equal(fitView([], 400, 400), undefined)

// A pin's drawn pixels are framed too: its label ends inside the padded view, and the pin shifts left to make room.
{
  const W = 400, H = 400, pad = 64
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0, box: { l: 9, r: 9 + 120, t: 9, b: 9 } }]
  const f = fitView(pts, W, H)!
  const px = (x: number) => (x - f.x) * f.scale + W / 2
  assert.ok(px(0) >= pad - 1e-6, `left pin at ${px(0)}`)
  assert.ok(px(4) + 9 + 120 <= W - pad + 1e-6, `label ends at ${px(4) + 129}`)
  // Boxes wider than the padded view are trimmed rather than zooming the view into nothing.
  assert.ok(fitView([{ x: 0, y: 0, box: { l: 9, r: 9999, t: 9, b: 9 } }], W, H)!.scale > 1)
}

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

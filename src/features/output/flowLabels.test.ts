// npm test — Flow edge labels stay off step cards and each other.
import { strict as assert } from 'node:assert'
import { placeLabels, type Cubic, type Rect } from './flowLabels.ts'

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Four stacked cards; two jumps bulge just past the right edge, where a centred label would sit on the card border.
const cards: Rect[] = [0, 1, 2, 3].map((i) => ({ x: 56, y: 20 + i * 118, w: 190, h: 64 }))
const jump = (from: number, to: number, bulge: number): Cubic => {
  const x = 246, y1 = 60 + from * 118, y2 = 44 + to * 118, cx = x + bulge
  return [x, y1, cx, y1, cx, y2, x, y2]
}
const labels = [
  { curve: jump(0, 1, 28), w: 90, h: 14, side: 1 as const },
  { curve: jump(1, 3, 28), w: 60, h: 14, side: 1 as const },
  { curve: jump(0, 2, 42), w: 70, h: 14, side: 1 as const },
]
const out = placeLabels(cards, labels)
assert.equal(out.length, 3)
out.forEach((r, i) => {
  assert.ok(!cards.some((c) => hits(r, c)), `label ${i} on a card`)
  out.forEach((o, j) => assert.ok(i === j || !hits(r, o), `labels ${i} and ${j} overlap`))
})
// A label with room on its curve stays centred there.
assert.deepEqual(placeLabels([], [{ curve: [0, 0, 0, 0, 100, 0, 100, 0], w: 20, h: 10, side: 1 }]), [{ x: 40, y: -5, w: 20, h: 10 }])
console.log('flowLabels ok')

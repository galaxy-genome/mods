// Keyboard list navigation: the index each key moves to.
import { strict as assert } from 'node:assert'
import { navPlace, nextIndex, rowFor } from './listNav.ts'

assert.equal(nextIndex(0, 0, 'j'), -1)
assert.equal(nextIndex(-1, 5, 'j'), 0)
assert.equal(nextIndex(-1, 5, 'ArrowDown'), 0)
assert.equal(nextIndex(-1, 5, 'k'), 4)
assert.equal(nextIndex(-1, 5, 'Home'), 0)
assert.equal(nextIndex(-1, 5, 'End'), 4)
assert.equal(nextIndex(0, 5, 'k'), 0)
assert.equal(nextIndex(0, 5, 'ArrowUp'), 0)
assert.equal(nextIndex(2, 5, 'j'), 3)
assert.equal(nextIndex(2, 5, 'ArrowLeft'), 1)
assert.equal(nextIndex(2, 5, 'ArrowRight'), 3)
assert.equal(nextIndex(4, 5, 'j'), 4)
assert.equal(nextIndex(4, 5, 'Home'), 0)
assert.equal(nextIndex(0, 5, 'End'), 4)

// The `?<name>=<key>` a row records itself as.
assert.deepEqual(navPlace('mod:abc'), { name: 'mod', key: 'abc' })
assert.deepEqual(navPlace('star:Alpha: B'), { name: 'star', key: 'Alpha: B' })
assert.equal(navPlace('mod'), null)
assert.equal(navPlace(''), null)
assert.equal(navPlace(undefined), null)
assert.equal(navPlace(':abc'), null)

// The row a search string names; two lists on one screen keep their own key, and a stale key names nothing.
const row = (nav?: string) => ({ dataset: { nav }, closest: () => (nav ? { dataset: { nav } } : null) }) as unknown as HTMLElement
const rows = [row('mod:a'), row('mod:b'), row('article:intro'), row()]
assert.equal(rowFor('?mod=b', rows), rows[1])
assert.equal(rowFor('?mod=b&article=intro', rows), rows[1])
assert.equal(rowFor('?article=intro', rows), rows[2])
assert.equal(rowFor('?mod=gone', rows), null)
assert.equal(rowFor('', rows), null)

console.log('listNav ok')

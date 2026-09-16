// Keyboard list navigation: the index each key moves to.
import { strict as assert } from 'node:assert'
import { nextIndex } from './listNav.ts'

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
console.log('listNav ok')

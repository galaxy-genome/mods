// node --import ./scripts/test-hooks.mjs src/data/sync.test.ts
import { strict as assert } from 'node:assert'
import { mock, test } from 'node:test'
import { FLUSH_DELAY, FlushScheduler } from './sync.ts'

test('one write 400 ms after the last of several edits; flush writes at once', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const written: string[] = []
  const s = new FlushScheduler((id) => written.push(id))
  s.touch('a'); mock.timers.tick(300)
  s.touch('a'); mock.timers.tick(300)
  s.touch('a'); mock.timers.tick(FLUSH_DELAY - 1)
  assert.deepEqual(written, [])
  mock.timers.tick(1)
  assert.deepEqual(written, ['a'])
  s.touch('b'); s.touch('c')
  s.flush()
  assert.deepEqual(written, ['a', 'b', 'c'])
  mock.timers.tick(1000)
  assert.equal(written.length, 3, 'flushed timers do not fire again')
  mock.timers.reset()
})

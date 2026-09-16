// node src/lib/staleCopy.test.ts — an unmodified copy of an older entry version is stale; nothing else is.
import { strict as assert } from 'node:assert'
import { staleEntry } from './staleCopy.ts'

const entries = [{ id: 'war', version: '0.2' }]
const copy = (version: string, extra: object = {}) => ({ meta: { version, community: { entryId: 'war' }, ...extra } }) as never

assert.equal(staleEntry(copy('0.1'), entries), entries[0])
assert.equal(staleEntry(copy('0.2'), entries), undefined)
assert.equal(staleEntry(copy('0.1', { modified: true }), entries), undefined)
assert.equal(staleEntry(copy('0.1'), []), undefined)
assert.equal(staleEntry({ meta: { version: '0.1' } } as never, entries), undefined)

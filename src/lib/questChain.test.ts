// node --import ./scripts/test-hooks.mjs src/lib/questChain.test.ts — play order and start labels.
import { strict as assert } from 'node:assert'
import { COMMUNITY, entryMod } from './community.ts'
import { newQuestView } from './factory.ts'
import { partsOf } from './mods.ts'
import { chainSummary, isSingleChain, questChain, startPlace } from './questChain.ts'
import type { QuestView } from './types.ts'

const owner = entryMod(COMMUNITY.find((e) => e.title === 'Owner of Record')!)
const views = partsOf(owner).filter((v) => v.meta.type === 'quest') as QuestView[]
const chain = questChain([...views].reverse())
assert.deepEqual(chain.map((c) => c.n), [1, 2, 3, 4])
assert.equal(chain[0].after, undefined)
assert.equal(chain[1].after, `Unlocks after 1 · ${chain[0].view.meta.title}`)
assert.equal(startPlace(chain[0].view, owner), 'Bar at Manson Orbital (Wolf 359)')
assert.equal(chainSummary(views), '4 quests, played in order · starts at Manson Orbital')

const q = (id: number, req: number[] = []) => newQuestView(`q${id}`, { settings: { questId: id, requiredQuestIds: req, startMode: 'space' } }) as QuestView
const content = (c: { view: QuestView }) => c.view.versions[c.view.primaryLang]!.settings.questId
const loose = questChain([q(2, [1]), q(3), q(1)])
assert.deepEqual(loose.map((c) => c.view.versions[c.view.primaryLang]!.settings.questId), [1, 2, 3])
assert.equal(loose[2].n, undefined)
assert.equal(startPlace(loose[0].view), 'Starts in space')
assert.deepEqual(chain.map((c) => c.depth), [0, 1, 1, 1])
assert.equal(isSingleChain(chain), true)
const tree = questChain([q(9), q(1), q(2, [1]), q(3, [1]), q(4, [3])])
assert.deepEqual(tree.map((c) => [content(c), c.depth, c.n ?? 0]), [[1, 0, 1], [2, 1, 2], [3, 1, 3], [4, 2, 4], [9, 0, 0]])
console.log('questChain ok')

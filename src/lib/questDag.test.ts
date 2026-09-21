// node --import ./scripts/test-hooks.mjs src/lib/questDag.test.ts — requirement layering for the game's own quests.
import { strict as assert } from 'node:assert'
import { GAME_QUEST_NAMES } from './reference.ts'
import { MAIN_STORY, mixesMainStory, questDag, requirementEdges } from './questDag.ts'
import type { DagInput } from './questDag.ts'

const BUILTIN: DagInput[] = GAME_QUEST_NAMES.map((g) => ({
  id: g.id,
  label: g.name,
  source: 'game',
  requires: String(g.requires ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number),
}))

const N = (n: number) => 100000 + n

// The Trade tycoon chain: #40 needs #39, which needs #32, which needs #31, which needs four quests at once.
const dag = questDag(BUILTIN, N(40))
const rank = new Map(dag.nodes.map((n) => [n.id, n.rank]))
const bottom = Math.max(...dag.nodes.map((n) => n.rank))
assert.equal(rank.get(N(40)), bottom, '#40 Trade tycoon is the sink')
assert.equal(rank.get(N(39)), bottom - 1)
assert.equal(rank.get(N(32)), bottom - 2)
assert.equal(rank.get(N(31)), bottom - 3)
for (const n of [30, 3, 6, 29]) assert.equal(rank.get(N(n)), bottom - 4, `#${n} is one rank above #31`)
assert.deepEqual(dag.edges.filter((e) => e.to === N(31)).map((e) => e.from).sort(), [N(3), N(6), N(29), N(30)])

// Every kept node is an ancestor of the focus, or the focus itself.
assert.ok(dag.nodes.every((n) => n.source === 'game'))
assert.ok(!dag.nodes.some((n) => n.id === N(41)), 'a quest that #40 does not need stays out')

// Requirement 0 breaks the loop, so nothing listed beside it is ever checked.
assert.deepEqual(requirementEdges([0, 100032]), [MAIN_STORY])
assert.deepEqual(requirementEdges([100032, 100031]), [100032, 100031])
assert.ok(mixesMainStory([0, 100032]))
assert.ok(!mixesMainStory([0]))

const mixed = questDag([
  { id: 500, label: 'Mixed', source: 'mine', requires: [0, 100032] },
], 500)
assert.equal(mixed.edges.length, 1, 'a quest requiring [0, 100032] draws one edge')
assert.deepEqual(mixed.edges[0], { from: MAIN_STORY, to: 500 })
assert.equal(mixed.nodes.find((n) => n.id === MAIN_STORY)?.source, 'story')

// A requirement that resolves to nothing is its own node, never a silent gap.
const orphan = questDag([{ id: 501, label: 'Orphan', source: 'mine', requires: [4242] }], 501)
assert.equal(orphan.edges.length, 1)
assert.equal(orphan.nodes.find((n) => n.id === 4242)?.source, 'unknown')

console.log('questDag ok')

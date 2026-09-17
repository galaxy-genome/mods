// node src/lib/conditions.test.ts — game-over recognition.
import { strict as assert } from 'node:assert'

const { NEVER, describeCondition, isGameOver, neverFires } = await import('./conditions.ts')

const order = (ship: string, destroy: boolean) => ({ ship, destroy })
assert.ok(isGameOver({ orders: [order('player', true)] }) && neverFires(NEVER), 'game-over idiom')
assert.ok(isGameOver({ orders: [order('Saimon', false), order('player', true)] }), 'destroy-only')
assert.ok(!isGameOver({ orders: [order('Saimon', true), order('player', false)] }), 'normal step')
assert.ok(!neverFires('SCREEN_ACTION_ROUTE_SYSTEM_Sol') && !neverFires(null))
assert.ok(neverFires('ACTION_CLICK_STATION_None'))
assert.match(describeCondition(NEVER), /^Never/)
console.log('conditions ok')

// node src/lib/save/specs.test.ts — the specs strip agrees with export_loadouts.py on every
// oracle case, and reports the figures for the ship each save is flying.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decode } from './codec.ts'
import { bySaveName, fittedModules, shipKey } from './rules.ts'
import { MAX_LEVEL } from './engineer.ts'
import { boostOf, computeSpecs, saveSpecs, specCells, type ModuleStats, type ShipSpecs, type Upgrade } from './specs.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { modules, ships, upgrades } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { modules: ModuleStats[]; ships: ShipSpecs[]; upgrades: Upgrade[] }
const byKey = new Map(modules.map((m) => [m.key, m]))
const names = bySaveName(modules)

// ------------------------------------------------------- the Python oracle

/** `tools/port/export_loadouts.py`'s own `evaluate`, over the fits it writes to
 * `loadouts/src/calc/oracle_cases.json`. Its `speed` carries the engine pips, so the strip's
 * figure, which does not, is its `accel` times 4.5 (`export_loadouts.py:352`). */
const cases = JSON.parse(readFileSync(join(repo, 'loadouts/src/calc/oracle_cases.json'), 'utf8')).cases as {
  ship: string; fit: (string | null)[]; cargo: string
  expect: { jump: number; accel: number; shield: number; hull: number }
}[]

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`)

for (const c of cases) {
  const ship = ships.find((s) => `ShipType.${s.var}` === c.ship)
  assert.ok(ship, `${c.ship} is in the table`)
  const mods = c.fit.map((k) => (k ? byKey.get(k) ?? null : null))
  c.fit.forEach((k, i) => assert.ok(!k || mods[i], `${c.ship}: ${k} is in the table`))
  const cargo = c.cargo === 'full'
    ? mods.reduce((n, m) => n + (m?.category === 'CargoRack' ? m.stats.capacity : 0), 0)
    : 0

  // The oracle carries no engineer level, so every boost here is empty.
  const s = computeSpecs({ ship, mods, boosts: mods.map(() => null), cargo, fuel: null })
  close(s.jump, c.expect.jump, `${c.ship} jump`)
  close(s.hull, c.expect.hull, `${c.ship} hull`)
  close(s.shields, c.expect.shield, `${c.ship} shields`)
  close(s.speed, c.expect.accel * 4.5, `${c.ship} speed`)
}
console.log(`${cases.length} oracle cases agree on hull, shields, jump range and speed`)

// ------------------------------------------------------- the engineer moves the jump

{
  const ion = ships.find((s) => s.var === 'ION')!
  const fit = cases.find((c) => c.ship === 'ShipType.ION')!
  const mods = fit.fit.map((k) => (k ? byKey.get(k) ?? null : null))
  const drive = mods[4]!
  const plain = computeSpecs({ ship: ion, mods, boosts: mods.map(() => null), cargo: 0, fuel: null })
  const levels = [0, 5, 13, MAX_LEVEL].map((level) => {
    const boosts = mods.map((m, i) => (i === 4 ? boostOf(m, level, 1, upgrades) : null))
    return computeSpecs({ ship: ion, mods, boosts, cargo: 0, fuel: null }).jump
  })
  close(levels[0], plain.jump, 'level 0 is no boost')
  assert.ok(levels[1] < levels[2] && levels[2] < levels[3], `the level raises the jump: ${levels}`)
  // WaprRange is +55% optimal mass and +30% module mass at level 25 (`ModuleUpgrades.as:19-30`).
  assert.equal(boostOf(drive, MAX_LEVEL, 1, upgrades).optimalMass, 0.55)
  assert.equal(boostOf(drive, 5, 1, upgrades).optimalMass, 0.55 / 5)
  console.log(`Ion jump by drive level 0/5/13/25: ${levels.map((n) => n.toFixed(2)).join(' / ')} ly`)
}

// ------------------------------------------------------- the ship each save is flying

for (const file of ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']) {
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves', file))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const fitted = fittedModules(sv, names) as (ModuleStats | null)[]
  const s = saveSpecs(sv, ship, fitted, upgrades)
  for (const [, v] of specCells(s)) assert.ok(!/NaN|Infinity|—/.test(v), `${file}: ${v}`)
  assert.ok(s.jump > 0 && s.speed > 0 && s.hull > 0, `${file}: every figure is a number`)
  console.log(`${file}  ${ship.overview.name}  ${specCells(s).map(([l, v]) => `${l} ${v}`).join('   ')}`)
}

console.log('specs ok')

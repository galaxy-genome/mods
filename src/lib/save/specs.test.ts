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

// ------------------------------------------------------- the game's own figures, on fixtures

/** The SPECS screen's own rounding (`ui/screens/ShipInfoScreen.as:140-153`). */
const deg = (radians: number) => Math.floor(radians * 180 / Math.PI * 10) / 10
const tenth = (n: number) => Math.floor(n * 10) / 10

/** Two saves the editor wrote and the game read back. One carries more fuel than the other, so
 * a loaded-mass term that is wrong in either direction fails one of them. */
for (const [file, want] of [
  ['nemesis-explorer.SOL', {
    hull: 1400, shields: 892, jump: 54.8, mass: 2178, massMax: 2262, speed: 8.7,
    acceleration: 1.9, rotationSpeed: 37.8, rotation: 50, cargo: 7, cargoMax: 26,
  }],
  // The combat fit's own bytes. Its screen was read with a tank the save does not carry, so the
  // figures that turn on fuel are this file's, not that screen's: see the note below.
  ['nemesis-maxed.SOL', {
    hull: 4000, shields: 1219, jump: 42.8, mass: 2262, massMax: 2317, speed: 8.7,
    acceleration: 1.9, rotationSpeed: 37.8, rotation: 49.9, cargo: 7, cargoMax: 0,
  }],
] as const) {
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/fixtures', file))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const fitted = fittedModules(sv, names) as (ModuleStats | null)[]
  const s = saveSpecs(sv, ship, fitted, upgrades)

  assert.equal(Math.floor(s.hull), want.hull, `${file}: hull`)
  assert.equal(Math.floor(s.shields), want.shields, `${file}: shields`)
  assert.equal(tenth(s.jump), want.jump, `${file}: jump range`)
  assert.equal(Math.floor(s.mass), want.mass, `${file}: total mass`)
  assert.equal(Math.floor(s.massMax), want.massMax, `${file}: mass capacity`)
  assert.equal(tenth(s.speed), want.speed, `${file}: top speed`)
  assert.equal(tenth(s.acceleration), want.acceleration, `${file}: acceleration`)
  assert.equal(deg(s.rotationSpeed), want.rotationSpeed, `${file}: rotation speed`)
  assert.equal(deg(s.rotation), want.rotation, `${file}: rotation acceleration`)
  assert.equal(s.cargo, want.cargo, `${file}: cargo`)
  assert.equal(s.cargoMax, want.cargoMax, `${file}: cargo space`)
  console.log(`${file}  hull ${want.hull}  shields ${want.shields} MW  jump ${want.jump} ly  `
    + `mass ${want.mass}/${want.massMax} T  speed ${want.speed} ls/s  accel ${want.acceleration}  `
    + `rotation ${want.rotationSpeed} deg/s, ${want.rotation} deg/s2  cargo ${want.cargo}/${want.cargoMax} T`)
}

// ------------------------------------------------------- the power budget

// What the plant makes and what the fit draws (`system/modules/Modules.as:249-272`). The plant's
// own modification raises what it makes, so the budget is not the rating printed on the module.
for (const [file, draw, made] of [['nemesis-explorer.SOL', 42.26, 50.4], ['nemesis-maxed.SOL', 31.71, 50.4]] as const) {
  const sv = decode(new Uint8Array(readFileSync(join(repo, 'saves/fixtures', file))))
  const ship = ships.find((s) => s.key === shipKey(sv))!
  const fitted = fittedModules(sv, names) as (ModuleStats | null)[]
  const s = saveSpecs(sv, ship, fitted, upgrades)
  assert.equal(Math.round(s.powerMax * 100) / 100, made, `${file}: available power`)
  assert.equal(Math.round(s.power * 100) / 100, draw, `${file}: the draw`)
  // An 8A Power Plant is rated 36 MW and Power Generation at level 25 adds two fifths of it.
  assert.equal(fitted[1]!.stats.powerGen, 36)
  console.log(`${file} draws ${draw} MW of the ${made} MW its plant makes`)
}

// A jump whose raw value passes 150 is 30, whatever it was (`ShipInfo.as:870-873`).
{
  const ion = ships.find((s) => s.var === 'ION')!
  const fit = cases.find((c) => c.ship === 'ShipType.ION')!
  const mods = fit.fit.map((k) => (k ? byKey.get(k) ?? null : null))
  const huge = byKey.get('DeepSpaceDrive.EightA')!
  const swapped = mods.map((m, i) => (i === 4 ? huge : m))
  const raw = computeSpecs({ ship: ion, mods: swapped, boosts: swapped.map(() => null), cargo: 0, fuel: null })
  assert.equal(raw.jump, 30, `a raw jump past 150 is 30, not ${raw.jump}`)
  console.log(`an ${huge.name} on an Ion clamps to ${raw.jump} ly`)
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

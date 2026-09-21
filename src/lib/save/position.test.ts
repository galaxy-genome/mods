// node src/lib/save/position.test.ts — the position written for a named system is the one the game reads back.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decode, encode } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { LY_PER_PIXEL, SOL_X, SOL_Y, cellOf, getPosition, scannedCount, setPosition, visitedCells } from './position.ts'

const repo = resolve(import.meta.dirname, '../../../..')

// The same fields read through `tools/bin/gg_save.py`'s own parser.
const ORACLE = `
import json, struct, sys
sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
from gg_save import load
sv = load(sys.argv[1]); o = sv.objs
cells = sorted({((struct.unpack('>I', it.raw[0][1])[0] >> 20) & 0xFFF, (struct.unpack('>I', it.raw[0][1])[0] >> 8) & 0xFFF)
                for v in (0, 1) for it in o[1].raw[v][1].items})
print(json.dumps({
  "secXf": struct.unpack('>d', o[0].raw[0][1])[0],
  "secYf": struct.unpack('>d', o[0].raw[1][1])[0],
  "scanned": len(o[1].raw[0][1].items) + len(o[1].raw[1][1].items),
  "cells": [f"{x},{y}" for x, y in cells],
}))
`

const oracleOf = (path: string) => JSON.parse(execFileSync('python3', ['-c', ORACLE, path], { encoding: 'utf8' })) as
  { secXf: number; secYf: number; scanned: number; cells: string[] }

interface MapData { systems: [name: string, x: number, z: number, ...rest: unknown[]][] }
const mapData = JSON.parse(readFileSync(join(repo, 'tools/port/map_data.json'), 'utf8')) as MapData
const systemAt = (name: string) => {
  const row = mapData.systems.find((s) => s[0] === name)
  assert.ok(row, `map_data.json has no system ${name}`)
  return { x: row[1], z: row[2] }
}

const out = mkdtempSync(join(tmpdir(), 'gg-position-'))

// Every save reads the position and the scan data gg_save.py reads from the same bytes.
for (const name of ['Save1.SOL', 'Save2.SOL', 'Save3.SOL']) {
  const path = join(repo, 'saves', name)
  const sv = decode(new Uint8Array(readFileSync(path)))
  const oracle = oracleOf(path)
  const at = getPosition(sv)
  assert.equal(at.x / LY_PER_PIXEL + SOL_X, oracle.secXf, `${name}: secXf`)
  assert.equal(SOL_Y - at.z / LY_PER_PIXEL, oracle.secYf, `${name}: secYf`)
  assert.equal(scannedCount(sv), oracle.scanned, `${name}: scanned count`)
  assert.deepEqual([...visitedCells(sv)].sort(), oracle.cells, `${name}: visited cells`)
  // The game writes its position on the system it last visited, so that system's cell is among the scanned ones.
  assert.ok(visitedCells(sv).has(cellOf(at)), `${name}: the ship's own cell is unscanned`)
}

// Setting the position to a named system survives an encode and a re-decode, in both parsers.
const source = join(repo, 'saves', 'Save1.SOL')
for (const name of ['Sol', 'Alpha Centauri', 'Wolf 359', 'Sirius', 'LHS 2447', 'V1581 Cygni']) {
  const target = systemAt(name)
  const sv = decode(new Uint8Array(readFileSync(source)))
  setPosition(sv, target)

  const bytes = prepareDownload(sv)
  const back = decode(bytes)
  const read = getPosition(back)
  // Light years survive the pixel pair to well under a light year; the pixel pair itself is exact.
  assert.ok(Math.hypot(read.x - target.x, read.z - target.z) < 1e-9, `${name}: position did not survive the round trip`)
  assert.deepEqual(encode(back), bytes, `${name}: the edited save does not re-encode`)

  const file = join(out, `${name.replace(/\W+/g, '_')}.SOL`)
  writeFileSync(file, bytes)
  const oracle = oracleOf(file)
  assert.equal(oracle.secXf, target.x / LY_PER_PIXEL + SOL_X, `${name}: gg_save.py reads a different secXf`)
  assert.equal(oracle.secYf, SOL_Y - target.z / LY_PER_PIXEL, `${name}: gg_save.py reads a different secYf`)
  console.log(`${name.padEnd(16)} ${target.x}, ${target.z} ly  ->  secXf ${oracle.secXf}  secYf ${oracle.secYf}  cell ${cellOf(target)}`)
}

// Sol is the game's own default, so its pair is the one PlayerInfo declares (`system/Save/PlayerInfo.as:12-14`).
const sol = oracleOf(join(out, 'Sol.SOL'))
assert.equal(sol.secXf, SOL_X)
assert.equal(sol.secYf, SOL_Y)

console.log('position: ok')

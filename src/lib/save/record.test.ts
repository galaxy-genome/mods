// node src/lib/save/record.test.ts — every figure the record screen shows is one the reader can
// type, each write lands on its own field, and the wand takes a rank past Elite.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decode } from './codec.ts'
import { prepareDownload } from './safety.ts'
import { changed, leaves } from './leaves.ts'
import {
  ARENA_LEVELS, BATTLE, DISCOVERY, ELITE, KARMA_MAX, KARMA_MIN, REPUTATION_MAX, TRADE, arena,
  getRank, karma, mainJob, moralityRank, playTime, progressOf, reputationOf, setArena, setKarma,
  setMainJob, setPlayTime, setProgress, setReputation, stationRows, type Ladder,
} from './record.ts'
import { RANK_FIELDS, eliteBest, rankAtBest, recordAtBest, setRankBest, setRecordBest } from './best.ts'

const repo = resolve(import.meta.dirname, '../../../..')
const { ranks } = JSON.parse(readFileSync(join(repo, 'editor/public/data/save-data.json'), 'utf8')) as
  { ranks: { trade: Ladder; combat: Ladder; exploration: Ladder; morality: Ladder } }
const bytes = new Uint8Array(readFileSync(join(repo, 'saves/Save1.SOL')))
const load = () => decode(bytes)

// The Elite bands the wand writes past are the tops of the exported ladders.
assert.equal(ranks.trade.at(-1)![0], ELITE.trade)
assert.equal(ranks.combat.at(-1)![0], ELITE.combat)
assert.equal(ranks.exploration.at(-1)![0], ELITE.exploration)

// `GetRank` reaches a band, the karma ladder passes one.
assert.equal(getRank(ranks.trade, ELITE.trade), 'Prime')
assert.equal(getRank(ranks.trade, ELITE.trade - 1), 'Tycoon')
assert.equal(moralityRank(ranks.morality, 60), 'Liked')
assert.equal(moralityRank(ranks.morality, 61), 'Revered')

// ------------------------------------------------------- one typed figure, one field written

const typed = (name: string, write: (sv: ReturnType<typeof load>) => void, read: (sv: ReturnType<typeof load>) => number, want: number) => {
  const sv = load()
  const before = leaves(sv)
  write(sv)
  const diff = changed(before, leaves(sv))
  assert.equal(diff.length, 1, `${name}: wrote ${diff.length} leaves, ${JSON.stringify(diff)}`)
  assert.equal(read(sv), want, `${name}: the figure read back`)
  prepareDownload(sv)
  console.log(`${name}: ${diff[0]} alone -> ${want.toLocaleString('en-US')}`)
}

typed('trade points', (sv) => setProgress(sv, TRADE, 12345), (sv) => progressOf(sv, TRADE), 12345)
typed('combat points', (sv) => setProgress(sv, BATTLE, 6789), (sv) => progressOf(sv, BATTLE), 6789)
typed('exploration points', (sv) => setProgress(sv, DISCOVERY, 42), (sv) => progressOf(sv, DISCOVERY), 42)
typed('karma', (sv) => setKarma(sv, -37), karma, -37)
typed('rating battles level', (sv) => setArena(sv, 9), arena, 9)
typed('play time', (sv) => setPlayTime(sv, 7200), playTime, 7200)
typed('main job', (sv) => setMainJob(sv, 12), mainJob, 12)
typed('station reputation', (sv) => setReputation(stationRows(sv)[0], 61),
  (sv) => reputationOf(stationRows(sv)[0]), 61)

// Every figure clamps where the game clamps.
{
  const sv = load()
  setKarma(sv, 500); assert.equal(karma(sv), KARMA_MAX)
  setKarma(sv, -500); assert.equal(karma(sv), KARMA_MIN)
  setArena(sv, 999); assert.equal(arena(sv), ARENA_LEVELS - 1)
  setReputation(stationRows(sv)[0], 900); assert.equal(reputationOf(stationRows(sv)[0]), REPUTATION_MAX)
  setProgress(sv, TRADE, -5); assert.equal(progressOf(sv, TRADE), 0)
  prepareDownload(sv)
  console.log('karma, arena, reputation and rank points clamp where the game clamps')
}

// ------------------------------------------------------- the wand takes a rank past Elite

{
  const sv = load()
  RANK_FIELDS.forEach((f) => {
    assert.equal(rankAtBest(sv, f), false, `field ${f} starts below Elite`)
    setRankBest(sv, f)
    assert.ok(rankAtBest(sv, f))
  })
  const back = decode(prepareDownload(sv))
  // `MissionsShipScreen.as:601` is a strict greater-than, so equal to the band is not enough.
  assert.ok(progressOf(back, TRADE) > ELITE.trade, `trade ${progressOf(back, TRADE)}`)
  assert.ok(progressOf(back, BATTLE) > ELITE.combat, `combat ${progressOf(back, BATTLE)}`)
  assert.ok(progressOf(back, DISCOVERY) > ELITE.exploration, `exploration ${progressOf(back, DISCOVERY)}`)
  for (const [ladder, field] of [[ranks.trade, TRADE], [ranks.combat, BATTLE], [ranks.exploration, DISCOVERY]] as const) {
    assert.equal(getRank(ladder, progressOf(back, field)), 'Prime')
  }
  console.log(`the wand writes ${RANK_FIELDS.map((f) => eliteBest(f).toLocaleString('en-US')).join(' / ')}, each past its Elite band`)

  // The record card's wand covers the ranks too.
  const all = load()
  assert.equal(recordAtBest(all), false)
  setRecordBest(all)
  assert.ok(recordAtBest(all), 'the record is at its best')
  const oracle = join(tmpdir(), 'gg-record-test.SOL')
  writeFileSync(oracle, prepareDownload(all))
  const dump = execFileSync('python3', ['-c', `
import struct, sys
sys.path.insert(0, ${JSON.stringify(join(repo, 'tools/bin'))})
from gg_save import load
o = load(sys.argv[1]).objs
f64 = lambda x, i: struct.unpack('>d', x.raw[i][1])[0]
print(f64(o[5], 6), f64(o[5], 7), f64(o[5], 8), struct.unpack('>b', o[6].raw[32][1])[0], struct.unpack('>b', o[6].raw[35][1])[0])
`, oracle], { encoding: 'utf8' }).trim().split(' ').map(Number)
  assert.deepEqual(dump, [eliteBest(TRADE), eliteBest(BATTLE), eliteBest(DISCOVERY), KARMA_MAX, ARENA_LEVELS - 1],
    `gg_save.py reads ${dump}`)
  console.log(`gg_save.py agrees: ${dump.join(', ')}`)
}

console.log('record ok')

/** The player's record: object 6 `ProgressData` (`system/Save/ProgressData.as:322-332`) plus
 * object 7 `karma` and `arenaLVL` (`system/Save/ExtraData.as:201-204`).
 *
 * Read-only. Reputation, fines and bounty claims are the vectors the game keeps them in; the rank
 * beside each progress figure is the game's own `GetRank`.
 */
import * as React from 'react'
import { AmfObject, AmfVector, EXTRA, PROGRESS } from '../../../lib/save/codec'
import { extUtf } from '../../../lib/save/safety'
import {
  ARENA_MAX, KARMA_MAX, REPUTATION_MAX, reputationAtBest, setArenaBest, setKarmaBest,
  setReputationBest,
} from '../../../lib/save/best'
import { Wand } from '../wand'
import type { ScreenProps } from './types'
import '../overview.css'

const REPUTATION = 0, BOUNTY = 2, FINES = 3, PLAY_TIME = 4, STORY_QUEST = 5,
  TRADE = 6, BATTLE = 7, DISCOVERY = 8
/** `ExtraData` writes 32 material counts, then karma, drunk, fleetMode, arenaLVL
 * (`system/Save/ExtraData.as:194-204`). */
const KARMA = 32, ARENA = 35

const view = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}
const f64 = (o: AmfObject, i: number) => view(o, i).getFloat64(0)
const i32 = (o: AmfObject, i: number) => view(o, i).getInt32(0)
const vec = (o: AmfObject, i: number) => (o.raw[i][1] as AmfVector).items

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const up = (s: string | number) => String(s).toUpperCase()

/** `MoralityRanks.as:8-16`, picked by `GetRank`: the last band whose lower bound the value passes
 * (`MoralityRanks.as:41-55`). Names are `lang_en.json` `MoralityRank*`. */
const MORALITY: [number, string][] = [
  [-100, 'Despised'], [-60, 'Disliked'], [-20, 'Average'], [20, 'Liked'], [60, 'Revered'],
]
const morality = (v: number) => MORALITY.reduce((best, [from, name], i) => (i && v > from ? name : best), MORALITY[0][1])

/** `TraderRanks.as:8-24`, `CombatRanks.as:8-24`, `ExplorationRanks.as:8-24`, each picked by the
 * last band the value reaches (`TraderRanks.as:52-66`). Names are `lang_en.json` `*Rank*`. */
const TRADER: [number, string][] = [
  [0, 'Penniless'], [10000, 'Mostly Penniless'], [100000, 'Penniless Peddler'], [750000, 'Dealer'],
  [3800000, 'Merchant'], [33000000, 'Broker'], [130000000, 'Entrepreneur'], [380000000, 'Tycoon'],
  [600000000, 'Prime'],
]
const COMBAT: [number, string][] = [
  [0, 'Harmless'], [10000, 'Mostly Harmless'], [185000, 'Novice'], [300000, 'Competent'],
  [1250000, 'Expert'], [3500000, 'Master'], [15000000, 'Dangerous'], [40000000, 'Deadly'],
  [79990000, 'Prime'],
]
const EXPLORATION: [number, string][] = [
  [0, 'Aimless'], [10000, 'Mostly Aimless'], [185000, 'Scout'], [300000, 'Surveyor'],
  [1250000, 'Trailblazer'], [3500000, 'Pathfinder'], [15000000, 'Ranger'], [40000000, 'Pioneer'],
  [79990000, 'Prime'],
]
const rank = (bands: [number, string][], v: number) =>
  bands.reduce((best, [from, name], i) => (i && v >= from ? name : best), bands[0][1])

const playTime = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`

type Row = (string | number | React.ReactNode)[]

function Table({ heads, rows, empty }: { heads: string[]; rows: Row[]; empty: string }) {
  if (!rows.length) return <div className="ovdesc">{empty}</div>
  return (
    <div className="ovtab">
      <div className="ovrow">{heads.map((h) => <div key={h} className="ovwhite">{up(h)}</div>)}</div>
      {rows.map((r, i) => (
        <div key={i} className="ovrow ovsmall">
          {r.map((c, j) => <div key={j}>{React.isValidElement(c) ? c : up(c as string | number)}</div>)}
        </div>
      ))}
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const p = sv.objs[PROGRESS] as AmfObject
  const extra = sv.objs[EXTRA] as AmfObject
  const karma = view(extra, KARMA).getInt8(0)
  const arena = view(extra, ARENA).getUint8(0)

  const reputation = vec(p, REPUTATION).map((r) => {
    const o = r as AmfObject
    return [
      extUtf(o, 0),
      n(f64(o, 1)),
      <Wand
        key="w" atBest={reputationAtBest(o)} what={extUtf(o, 0)}
        onSet={() => { setReputationBest(o); redraw() }}
      />,
    ]
  })
  const fines = vec(p, FINES).map((r) => {
    const o = r as AmfObject
    return [extUtf(o, 0), `${n(f64(o, 1))} CR`]
  })
  // `Voucher` is `PirateName`, `Bounty`, `SystemName` (`system/Missions/Voucher.as`).
  const bounty = vec(p, BOUNTY).map((r) => {
    const o = r as AmfObject
    return [extUtf(o, 0), extUtf(o, 2), `${n(f64(o, 1))} CR`]
  })

  return (
    <div className="ovcols">
      <div>
        <div className="ovbar">RECORD</div>
        <Table
          heads={['Property', 'Value', '']}
          empty=""
          rows={[
            ['Main job', i32(p, STORY_QUEST) < 0 ? 'Not started' : n(i32(p, STORY_QUEST))],
            ['Play time', playTime(i32(p, PLAY_TIME))],
            ['Karma Points', n(karma), <Wand key="k" atBest={karma >= KARMA_MAX} what="Karma" onSet={() => { setKarmaBest(sv); redraw() }} />],
            ['Karma Level', morality(karma)],
            ['Rating battles level', `${arena} / ${ARENA_MAX}`, <Wand key="a" atBest={arena >= ARENA_MAX} what="Rating battles level" onSet={() => { setArenaBest(sv); redraw() }} />],
          ]}
        />
        <div className="ovbar">RANKS</div>
        <Table
          heads={['Rank', 'Title', 'Points']}
          empty=""
          rows={[
            ['Trade', rank(TRADER, f64(p, TRADE)), n(f64(p, TRADE))],
            ['Combat', rank(COMBAT, f64(p, BATTLE)), n(f64(p, BATTLE))],
            ['Exploration', rank(EXPLORATION, f64(p, DISCOVERY)), n(f64(p, DISCOVERY))],
          ]}
        />
        <div className="ovbar">FINES</div>
        <Table heads={['System', 'Fine']} rows={fines} empty="No fines." />
      </div>
      <div>
        <div className="ovbar">REPUTATION</div>
        <Table heads={['Station', `Reputation / ${REPUTATION_MAX}`, '']} rows={reputation} empty="No reputation yet." />
        <div className="ovbar">BOUNTY CLAIMS</div>
        <Table heads={['Pirate', 'System', 'Bounty']} rows={bounty} empty="No bounty claims." />
      </div>
    </div>
  )
}

/** The player's record: object 5 `ProgressData` (`system/Save/ProgressData.as:322-332`) plus
 * object 6 `karma` and `arenaLVL` (`system/Save/ExtraData.as:201-204`).
 *
 * Every figure here is one the save holds, so every figure here is typed in place, and the wand
 * sits beside the ones with a settled best. The rank beside each total is the game's own
 * `GetRank` over the ladders `save-data.json` carries.
 */
import * as React from 'react'
import { AmfObject, AmfVector } from '../../../lib/save/codec'
import { extUtf } from '../../../lib/save/safety'
import {
  ARENA_LEVELS, BATTLE, BOUNTY, DISCOVERY, FINES, REPUTATION_MAX, TRADE,
  arena, f64, getRank, karma, mainJob, moralityRank, playTime, progressOf, reputationOf,
  setArena, setKarma, setMainJob, setPlayTime, setProgress, setReputation, stationRows,
  type Ladder,
} from '../../../lib/save/record'
import {
  arenaAtBest, rankAtBest, reputationAtBest, setArenaBest, setRankBest, setReputationBest,
} from '../../../lib/save/best'
import { NumberField } from '../field'
import { Wand } from '../wand'
import type { ScreenProps } from './types'
import '../overview.css'

interface Ladders { trade: Ladder; combat: Ladder; exploration: Ladder; morality: Ladder }

function useLadders() {
  const [ranks, setRanks] = React.useState<Ladders | null>(null)
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: { ranks: Ladders }) => setRanks(d.ranks))
      .catch(() => setRanks(null))
  }, [])
  return ranks
}

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const up = (s: string | number) => String(s).toUpperCase()

/** `ShipInfoScreen.as:150` prints the play time as hours and minutes. */
const asTime = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`

type Cell = string | number | React.ReactNode

function Table({ heads, rows, empty }: { heads: string[]; rows: Cell[][]; empty: string }) {
  if (!rows.length) return <div className="ovdesc">{empty}</div>
  return (
    <div className="ovtab">
      <div className="ovrow">{heads.map((h, i) => <div key={i} className="ovwhite">{up(h)}</div>)}</div>
      {rows.map((r, i) => (
        <div key={i} className="ovrow ovsmall">
          {r.map((c, j) => <div key={j}>{React.isValidElement(c) ? c : up(c as string | number)}</div>)}
        </div>
      ))}
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const ranks = useLadders()
  const [, tick] = React.useReducer((k: number) => k + 1, 0)
  const changed = () => { tick(); redraw() }

  if (!ranks) return null

  const p = sv.objs[5] as AmfObject
  const vec = (i: number) => (p.raw[i][1] as AmfVector).items.filter((r): r is AmfObject => r instanceof AmfObject)

  /** One rank ladder: the points typed in place, the game's title for them, and the wand. */
  const rankRow = (label: string, field: number, ladder: Ladder): Cell[] => [
    label,
    getRank(ladder, progressOf(sv, field)),
    <NumberField
      key="v" label={`${label} points`} value={Math.round(progressOf(sv, field))}
      onSet={(v) => { setProgress(sv, field, v); changed() }}
    />,
    <Wand
      key="w" atBest={rankAtBest(sv, field)} what={label}
      onSet={() => { setRankBest(sv, field); changed() }}
    />,
  ]

  const reputation = stationRows(sv).map((row) => [
    extUtf(row, 0),
    <NumberField
      key="v" label={`${extUtf(row, 0)} reputation`} value={Math.round(reputationOf(row))}
      onSet={(v) => { setReputation(row, v); changed() }}
    />,
    <Wand
      key="w" atBest={reputationAtBest(row)} what={extUtf(row, 0)}
      onSet={() => { setReputationBest(row); changed() }}
    />,
  ])

  // `StationProgressData` is a name and a figure; `Voucher` is `PirateName`, `Bounty`,
  // `SystemName` (`system/Missions/Voucher.as`).
  const fines = vec(FINES).map((row) => [
    extUtf(row, 0),
    <NumberField
      key="v" label={`${extUtf(row, 0)} fine`} value={Math.round(f64(row, 1))}
      onSet={(v) => { row.raw[1] = ['D', double(v)]; changed() }}
    />,
  ])
  const bounty = vec(BOUNTY).map((row) => [
    extUtf(row, 0),
    extUtf(row, 2),
    <NumberField
      key="v" label={`${extUtf(row, 0)} bounty`} value={Math.round(f64(row, 1))}
      onSet={(v) => { row.raw[1] = ['D', double(v)]; changed() }}
    />,
  ])

  return (
    <div className="ovcols">
      <div>
        <div className="ovbar">RECORD</div>
        <Table
          heads={['Property', 'Value', '', '']}
          empty=""
          rows={[
            [
              'Main job',
              <NumberField key="v" label="Main job" value={mainJob(sv)} onSet={(v) => { setMainJob(sv, v); changed() }} />,
              mainJob(sv) < 0 ? 'Not started' : '',
              '',
            ],
            [
              'Play time',
              <NumberField key="v" label="Play time in seconds" value={playTime(sv)} onSet={(v) => { setPlayTime(sv, v); changed() }} />,
              asTime(playTime(sv)),
              '',
            ],
            [
              'Karma Points',
              <NumberField key="v" label="Karma points" value={karma(sv)} onSet={(v) => { setKarma(sv, v); changed() }} />,
              moralityRank(ranks.morality, karma(sv)),
              // No wand: a pirate station wants Average or below and high security wants
              // Disliked or above (`ui/screens/MissionsScreen.as:899-909`), so karma has no best.
              '',
            ],
            [
              'Rating battles level',
              <NumberField key="v" label="Rating battles level" value={arena(sv)} onSet={(v) => { setArena(sv, v); changed() }} />,
              `of ${ARENA_LEVELS - 1}`,
              <Wand key="w" atBest={arenaAtBest(sv)} what="Rating battles level" onSet={() => { setArenaBest(sv); changed() }} />,
            ],
          ]}
        />
        <div className="ovbar">RANKS</div>
        <Table
          heads={['Rank', 'Title', 'Points', '']}
          empty=""
          rows={[
            rankRow('Trade', TRADE, ranks.trade),
            rankRow('Combat', BATTLE, ranks.combat),
            rankRow('Exploration', DISCOVERY, ranks.exploration),
          ]}
        />
        <div className="ovbar">FINES</div>
        <Table heads={['System', 'Fine']} rows={fines} empty="No fines." />
      </div>
      <div>
        <div className="ovbar">REPUTATION</div>
        <Table heads={['Station', `Reputation / ${n(REPUTATION_MAX)}`, '']} rows={reputation} empty="No reputation yet." />
        <div className="ovbar">BOUNTY CLAIMS</div>
        <Table heads={['Pirate', 'System', 'Bounty']} rows={bounty} empty="No bounty claims." />
      </div>
    </div>
  )
}

/** A double, as the save writes one. */
function double(v: number) {
  const d = new DataView(new ArrayBuffer(8))
  d.setFloat64(0, Math.max(0, v))
  return new Uint8Array(d.buffer)
}

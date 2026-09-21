/** GALAXY: the save's place on the map (`BTN_Map`, `lang_en.json`).
 *
 * The map and the system list are the mod editor's station selector, `PlacePicker` with
 * `kind="system"`: the same `StarMap` in pick mode over the same catalogue, in the save editor's
 * frame. Picking a system writes `PlayerInfo.secXf`/`secYf`, which is what the game reads its
 * position from (`Game.as:1578`).
 */
import * as React from 'react'
import { StarMap } from '@/features/map/StarMap'
import { type SystemRow, loadGalaxy, useGalaxy } from '@/features/map/galaxy'
import { LY_PER_PIXEL, cellOf, getPosition, scannedCount, visitedCells, setPosition, type Position } from '../../../lib/save/position'
import type { ScreenProps } from './types'
import './galaxy.css'

const ROWS = 60

const distance = (s: SystemRow, at: Position) => Math.hypot(s[1] - at.x, s[2] - at.z)
const norm = (s: string) => s.toLowerCase().replace(/[\s\-'’]/g, '')

export default function Screen({ sv, redraw }: ScreenProps) {
  const { galaxy } = useGalaxy()
  const [query, setQuery] = React.useState('')
  React.useEffect(() => { loadGalaxy().catch(() => {}) }, [])

  const at = getPosition(sv)
  const visited = visitedCells(sv)
  const systems = galaxy?.reachable ?? []

  const here = systems.length
    ? systems.reduce((best, s) => (distance(s, at) < distance(best, at) ? s : best))
    : null

  const rows = React.useMemo(() => {
    const q = norm(query)
    return systems
      .filter((s) => !q || norm(s[0]).includes(q))
      .sort((a, b) => distance(a, at) - distance(b, at))
      .slice(0, ROWS)
  // The list re-sorts on every pick, so the position it sorts around is part of the key.
  }, [systems, query, at.x, at.z]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (name: string) => {
    const row = galaxy?.byName.get(name)
    if (!row) return
    setPosition(sv, { x: row[1], z: row[2] })
    redraw()
  }

  return (
    <div className="gggal">
      <div className="gggalside">
        <div className="ovrow">
          <div className="ovwhite">SYSTEM</div>
          <div className="ovwhite">EXPLORED SYSTEMS</div>
        </div>
        <div className="ovrow">
          <div className="ovval">{here ? here[0].toUpperCase() : '-'}</div>
          <div className="ovval">{scannedCount(sv).toLocaleString('en-US')}</div>
        </div>
        <div className="gggalhint">
          Select any star system at the galaxy map.
          <span> Scan data is held per map cell, {LY_PER_PIXEL} ly across, so every system in a scanned cell reads as discovered.</span>
        </div>
        <input
          className="gggalsearch"
          value={query}
          placeholder="System"
          aria-label="System"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="gggallist">
          {rows.map((s) => (
            <button
              key={s[0]}
              type="button"
              className={`gggalrow${here && s[0] === here[0] ? ' on' : ''}`}
              onClick={() => pick(s[0])}
            >
              <span className="gggalname">{s[0]}</span>
              <span className="gggalmeta">
                {s[4] ?? '-'} · {distance(s, at).toFixed(1)} ly · {visited.has(cellOf({ x: s[1], z: s[2] })) ? 'Discovered' : 'Undiscovered'}
              </span>
            </button>
          ))}
          {!rows.length && <p className="gggalempty">{galaxy ? 'No system' : 'Loading'}</p>}
        </div>
      </div>
      <StarMap
        className="gggalmap"
        mode="pick"
        stars={[]}
        focus={{ x: at.x, y: at.z }}
        selectedPin={here?.[0]}
        overlay={{ areas: [], lines: [], pins: [{ id: here?.[0] ?? '', x: at.x, y: at.z, text: '', colour: '#35e0f5', label: here?.[0], ring: true }] }}
        onPick={pick}
      />
    </div>
  )
}

/** The quest list, with a completed checkbox per quest.
 *
 * The rows are the mods library's game-quest list: name, character, station, one per quest
 * (`editor/src/features/start/LibraryPage.tsx`). The checkbox writes object 9 `QuestsSave`.
 */
import * as React from 'react'
import { GAME_QUEST_NAMES } from '@/lib/reference'
import { activeQuestIds, questRows, setQuestCompleted } from '../../../lib/save/quests'
import type { ScreenProps } from './types'
import '../overview.css'
import './quests.css'

const up = (s: string) => s.toUpperCase()

interface Entry { id: number; name: string; who: string; where: string }

export default function Screen({ sv, redraw }: ScreenProps) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  const rows = new Map(questRows(sv).map((r) => [r.id, r]))
  const active = new Set(activeQuestIds(sv))

  const known = new Set(GAME_QUEST_NAMES.map((g) => g.id))
  const list: Entry[] = [
    ...GAME_QUEST_NAMES.map((g) => ({
      id: g.id,
      name: g.name,
      who: g.charName,
      // A quest with no station is offered in deep space (`LibraryPage.tsx` startsInSpace).
      where: g.randomSpace ? 'Deep space' : g.station,
    })),
    ...[...rows.keys()].filter((id) => !known.has(id)).sort((a, b) => a - b)
      .map((id) => ({ id, name: `Quest ${id}`, who: '', where: '' })),
  ]

  const toggle = (id: number, on: boolean) => {
    setQuestCompleted(sv, id, on)
    tick()
    redraw()
  }

  const done = list.filter((q) => rows.get(q.id)?.completed).length

  return (
    <div className="qwrap">
      <div className="ovrow">
        {['Side jobs', 'Completed', 'Active'].map((h) => <div key={h} className="ovgold">{up(h)}</div>)}
      </div>
      <div className="ovrow">
        {[list.length, done, active.size].map((v, i) => <div key={i} className="ovval">{v}</div>)}
      </div>
      <div className="ovbar">QUESTS</div>
      <div className="qrow qhead">
        {['Done', 'Quest', 'Character', 'Station', 'Step'].map((h) => <div key={h} className="ovwhite">{up(h)}</div>)}
      </div>
      {list.map((q) => {
        const row = rows.get(q.id)
        return (
          <label key={q.id} className={`qrow${active.has(q.id) ? ' qactive' : ''}`}>
            <input
              type="checkbox"
              className="qbox"
              checked={!!row?.completed}
              onChange={(e) => toggle(q.id, e.target.checked)}
            />
            <span className="qname">{q.name}</span>
            <span>{q.who}</span>
            <span>{q.where}</span>
            <span className="qstep">{row ? row.step : ''}</span>
          </label>
        )
      })}
    </div>
  )
}

/** The screen a loaded save opens on: nine cards, three across by three down.
 *
 * Card order, names and sprites are `homeCards` in `public/data/save-data.json`; the figures
 * beside them are read out of the save on every render, so an edit anywhere shows up on return.
 */
import * as React from 'react'
import { decode, getCredits, setCredits, type Save } from '../../lib/save/codec'
import { cardFigures } from '../../lib/save/home'
import type { ScreenProps } from './screens/types'
import { SaveUnsafe, prepareDownload } from '../../lib/save/safety'
import { SaveFrame, ScreenHeader, StartScreen } from './shell'
import { askPersist, drop, keep, kept } from '../../lib/save/kept'
import en from '../../i18n/en/start'
import { Wand } from './wand'
import {
  creditsAtBest, fitShip, materialsAtBest, recordAtBest, setCreditsBest, setMaterialsBest,
  setRecordBest, setSystemBest, shipAtBest, systemAtBest, tablesOf,
} from '../../lib/save/best'
import { shipData, shipKey, type ModuleRec, type ShipRec } from '../../lib/save/rules'
import { makePriorities, makeUpgrades, materialCounts, type ModuleUpgrade } from '../../lib/save/engineer'
import { getPosition } from '../../lib/save/position'
import './overview.css'

/** One sub-screen per card, keyed by the card key in `homeCards`. Each is its own chunk. */
const SCREENS: Record<string, React.LazyExoticComponent<React.ComponentType<ScreenProps>>> = {
  ship: React.lazy(() => import('./screens/ship')),
  hangar: React.lazy(() => import('./screens/hangar')),
  storage: React.lazy(() => import('./screens/storage')),
  cargo: React.lazy(() => import('./screens/cargo')),
  materials: React.lazy(() => import('./screens/materials')),
  galaxy: React.lazy(() => import('./screens/galaxy')),
  quests: React.lazy(() => import('./screens/quests')),
  station: React.lazy(() => import('./screens/station')),
  record: React.lazy(() => import('./screens/record')),
}

interface CardMeta { key: string; name: string; sprite: string }
interface SaveData {
  homeCards: CardMeta[]
  modules: ModuleRec[]
  ships: ShipRec[]
  upgrades: ModuleUpgrade[]
  priorities: Record<string, number>
}

const sprite = (name: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(name)}.svg`

function useSaveData() {
  const [data, setData] = React.useState<SaveData | null>(null)
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: SaveData) => { makeUpgrades(d.upgrades); makePriorities(d.priorities); setData(d) })
      .catch(() => setData(null))
  }, [])
  return data
}

/** A card's wand, where its subject has a settled best. The cards with none, the hangar, storage,
 * the quest list and the station, are the ones where the reader chooses. */
function cardWand(key: string, sv: Save, data: SaveData | null): { atBest: boolean; set: () => void } | null {
  if (key === 'cargo') return { atBest: creditsAtBest(sv), set: () => setCreditsBest(sv) }
  if (key === 'materials') return { atBest: materialsAtBest(materialCounts(sv)), set: () => setMaterialsBest(sv) }
  if (key === 'record') return { atBest: recordAtBest(sv), set: () => setRecordBest(sv) }
  if (key === 'galaxy') {
    const at = getPosition(sv)
    return { atBest: systemAtBest(sv, at), set: () => { setSystemBest(sv, at) } }
  }
  if (key === 'ship' && data) {
    const ship = data.ships.find((s) => s.key === shipKey(sv))
    if (!ship) return null
    const tables = tablesOf(data.modules)
    return {
      atBest: shipAtBest(shipData(sv), ship, tables),
      set: () => fitShip(shipData(sv), ship, tables),
    }
  }
  return null
}

function Card({ meta, stats, credits, wand, onOpen }: {
  meta: CardMeta; stats: [string, string][]; credits?: React.ReactNode
  wand?: React.ReactNode; onOpen?: () => void
}) {
  return (
    <div className="ggcard" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen}>
      <img className="ggcardart" src={sprite(meta.sprite)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="ggcardtext">
        <div className="ovbar ggcardtitle">{meta.name.toUpperCase()}{wand}</div>
        <div className="ovgold ggrule" aria-hidden />
        <div className="ovrow">{stats.map(([l]) => <div key={l} className="ovwhite ggcardlabel">{l.toUpperCase()}</div>)}</div>
        <div className="ovrow">
          {stats.map(([l, v], i) => (
            <div key={l} className="ovval ggcardval">{i === 0 && credits ? credits : v.toUpperCase()}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Home({ sv, file, open, setOpen, onEdit, onClose }: {
  sv: Save; file: string; open: string
  setOpen: (key: string) => void; onEdit: () => void; onClose: () => void
}) {
  const data = useSaveData()
  const meta = data?.homeCards ?? []
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  const [error, setError] = React.useState('')
  const cards = cardFigures(sv)

  // Every edit redraws and is kept, so a refresh finds the save exactly as the reader left it.
  const redraw = () => { bump(); onEdit() }

  const edit = (text: string) => {
    const v = Number(text.replace(/\D/g, ''))
    if (!Number.isSafeInteger(v)) return
    setCredits(sv, Math.min(v, 0xffffffff))
    redraw()
  }

  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([prepareDownload(sv) as BlobPart], { type: 'application/octet-stream' }))
      const a = document.createElement('a')
      a.href = url
      a.download = file.replace(/(\.\w+)?$/, '-edited$1')
      a.click()
      URL.revokeObjectURL(url)
      setError('')
    } catch (e) {
      setError(e instanceof SaveUnsafe ? `${e.field}: ${e.message}` : String(e))
    }
  }

  const credits = (
    <input
      className="ggcredits"
      inputMode="numeric"
      value={getCredits(sv).toLocaleString('en-US')}
      onChange={(e) => edit(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Credits"
    />
  )

  if (open) {
    const Screen = SCREENS[open]
    const card = meta.find((m) => m.key === open)
    return (
      <>
        <ScreenHeader title={card?.name ?? ''} onReturn={() => setOpen('')} />
        <div className="ggbody">
          <React.Suspense fallback={null}>
            <Screen sv={sv} onReturn={() => setOpen('')} redraw={redraw} />
          </React.Suspense>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="gghead">
        <button type="button" className="ggdl" onClick={download}>Download</button>
        <div className="ggtitle">{error || file}</div>
        <button type="button" className="ggclose2" onClick={onClose}>Close</button>
      </div>
      <div className="ggbody ggcards">
        {cards.map((c) => {
          const m = meta.find((x) => x.key === c.key)
          const w = cardWand(c.key, sv, data)
          return m
            ? (
              <Card
                key={c.key} meta={m} stats={c.stats}
                credits={c.key === 'cargo' ? credits : undefined}
                wand={w && <Wand atBest={w.atBest} what={m.name} onSet={() => { w.set(); redraw() }} />}
                onOpen={() => setOpen(c.key)}
              />
            )
            : null
        })}
      </div>
    </>
  )
}

export default function HomePage() {
  const [loaded, setLoaded] = React.useState<{ sv: Save; file: string } | null>(null)
  const [open, setOpen] = React.useState('')
  const [edited, setEdited] = React.useState(false)
  const [error, setError] = React.useState('')
  const [asking, setAsking] = React.useState(false)
  const [refused, setRefused] = React.useState(false)

  // The save kept last comes back on its own; a file is asked for only when there is none.
  React.useEffect(() => {
    const held = kept()
    if (!held) return
    setLoaded({ sv: held.sv, file: held.name })
    setOpen(held.open)
    setEdited(held.edited)
  }, [])

  const store = React.useCallback((sv: Save, file: string, where: string, dirty: boolean) => {
    keep(sv, file, where, dirty)
  }, [])

  const pick = (f: File) => {
    void f.arrayBuffer().then((b) => {
      try {
        const sv = decode(new Uint8Array(b))
        setLoaded({ sv, file: f.name })
        setOpen('')
        setEdited(false)
        store(sv, f.name, '', false)
        setError('')
        void askPersist().then((ok) => setRefused(!ok))
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  const close = () => {
    if (edited) { setAsking(true); return }
    drop()
    setLoaded(null)
    setOpen('')
  }

  const discard = () => {
    drop()
    setLoaded(null)
    setOpen('')
    setEdited(false)
    setAsking(false)
  }

  return (
    <SaveFrame>
      {loaded
        ? (
          <>
            <Home
              sv={loaded.sv}
              file={loaded.file}
              open={open}
              setOpen={(key) => { setOpen(key); store(loaded.sv, loaded.file, key, edited) }}
              onEdit={() => { setEdited(true); store(loaded.sv, loaded.file, open, true) }}
              onClose={close}
            />
            {asking && (
              <div className="ggask">
                <div className="ggaskbox">
                  <div className="ovhead">Close this save</div>
                  <p>{loaded.file} has edits that have not been downloaded. Closing it drops them.</p>
                  <div className="ggaskbtns">
                    <button type="button" className="ggbutton" onClick={discard}>Close and drop the edits</button>
                    <button type="button" className="ggbutton" onClick={() => setAsking(false)}>Keep editing</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )
        : (
          <>
            <StartScreen onPick={pick} />
            {error && <div className="ggtitle">{error}</div>}
          </>
        )}
      {refused && (
        // `src/i18n/en/start.ts:28-29`, the words the editor already uses for a refused request.
        <div className="ggpersist">
          <b>{en.persistRefused}</b> {en.persistRefusedHelp}
          <button type="button" className="ggbutton" onClick={() => setRefused(false)}>{en.dismiss}</button>
        </div>
      )}
    </SaveFrame>
  )
}

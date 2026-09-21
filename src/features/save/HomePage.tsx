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

const sprite = (name: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(name)}.svg`

function useCardMeta() {
  const [meta, setMeta] = React.useState<CardMeta[]>([])
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: { homeCards: CardMeta[] }) => setMeta(d.homeCards))
      .catch(() => setMeta([]))
  }, [])
  return meta
}

function Card({ meta, stats, credits, onOpen }: { meta: CardMeta; stats: [string, string][]; credits?: React.ReactNode; onOpen?: () => void }) {
  return (
    <div className="ggcard" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen}>
      <img className="ggcardart" src={sprite(meta.sprite)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="ggcardtext">
        <div className="ovbar ggcardtitle">{meta.name.toUpperCase()}</div>
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

function Home({ sv, file, onClose }: { sv: Save; file: string; onClose: () => void }) {
  const meta = useCardMeta()
  const [, redraw] = React.useReducer((n: number) => n + 1, 0)
  const [error, setError] = React.useState('')
  const [open, setOpen] = React.useState('')
  const cards = cardFigures(sv)

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
          return m ? <Card key={c.key} meta={m} stats={c.stats} credits={c.key === 'cargo' ? credits : undefined} onOpen={() => setOpen(c.key)} /> : null
        })}
      </div>
    </>
  )
}

export default function HomePage() {
  const [loaded, setLoaded] = React.useState<{ sv: Save; file: string } | null>(null)
  const [error, setError] = React.useState('')

  const pick = (f: File) => {
    void f.arrayBuffer().then((b) => {
      try {
        setLoaded({ sv: decode(new Uint8Array(b)), file: f.name })
        setError('')
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <SaveFrame>
      {loaded
        ? <Home sv={loaded.sv} file={loaded.file} onClose={() => setLoaded(null)} />
        : <><StartScreen onPick={pick} />{error && <div className="ggtitle">{error}</div>}</>}
    </SaveFrame>
  )
}

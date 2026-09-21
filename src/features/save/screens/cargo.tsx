/** Market and Trade, the station's goods screens.
 *
 * Market lists every good the game shows on a market (`system/Goods/GoodsType.as:154,:166`)
 * under its market section (`system/Goods/MarketType.as:9-31`), with the cargo held, the
 * generator's reference price and its demand. Trade grants or removes goods and moves the
 * balance with them; a station's real stock is generated, not saved
 * (`system/Goods/MarketGenerator.as:43`).
 */
import * as React from 'react'
import { getCredits, type Save } from '../../../lib/save/codec'
import { cargoTotal, demandAt, heldGoods, priceOf, profitOf, trade } from '../../../lib/save/trade'
import type { ScreenProps } from './types'
import './cargo.css'

interface Good { key: string; market: string; basicCost: number; showOnMarket: boolean; name: string }

/** `MarketType.enum`, in declaration order (`system/Goods/MarketType.as:9-31`); `Other` is kept
 * out of the enum (`MarketType.as:56-59`) but holds goods a save can carry. */
const SECTIONS = ['Medicines', 'Weapons', 'Food', 'Technology', 'Minerals', 'Metals', 'Textiles',
  'ConsumerItems', 'Chemicals', 'NonLegal', 'Other']

/** `MarketType.Name` (`lang_en.json`, `MarketType*`). */
const SECTION_NAME: Record<string, string> = {
  Medicines: 'Medicines', Weapons: 'Weapons', Food: 'Food', Technology: 'Technology',
  Minerals: 'Minerals', Metals: 'Metals', Textiles: 'Textiles', ConsumerItems: 'Consumer items',
  Chemicals: 'Chemicals', NonLegal: 'Black market', Other: 'Other',
}

const cr = (n: number) => `${n.toLocaleString('en-US')} CR`

function useGoods() {
  const [goods, setGoods] = React.useState<Good[]>([])
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: { goods: Good[] }) => setGoods(d.goods))
      .catch(() => setGoods([]))
  }, [])
  return goods
}

/** Six cells either side of the centre, filled outwards, as the game draws demand. */
function Demand({ level }: { level: number }) {
  return (
    <div className="mkdemand">
      {[3, 2, 1].map((n) => <i key={`l${n}`} className={level >= n ? 'on' : ''} />)}
      <b />
      {[1, 2, 3].map((n) => <i key={`r${n}`} className={-level >= n ? 'on' : ''} />)}
    </div>
  )
}

/** One row per good, priced and ranked by its position in its section. */
interface Row { good: Good; index: number; price: number; demand: number; held: number }

function Market({ rows, onPick }: { rows: (Row | string)[]; onPick: (r: Row) => void }) {
  return (
    <div className="mklist">
      <div className="ovrow mkrow mkhead">
        <div className="ovwhite">RESOURCE</div>
        <div className="ovwhite">CARGO</div>
        <div className="ovwhite">PRICE</div>
        <div className="ovwhite">DEMAND</div>
      </div>
      {rows.map((r) => typeof r === 'string'
        ? <div key={r} className="ovbar mksection">{SECTION_NAME[r] ?? r}</div>
        : (
          <button key={r.good.key} type="button" className="ovrow mkrow mkgood" onClick={() => onPick(r)}>
            <div>{r.good.name}</div>
            <div>{r.held || '-'}</div>
            <div>{r.price.toLocaleString('en-US')}CR</div>
            <Demand level={r.demand} />
          </button>
        ))}
    </div>
  )
}

function Trade({ sv, row, onBack, redraw }: { sv: Save; row: Row; onBack: () => void; redraw: () => void }) {
  const [side, setSide] = React.useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = React.useState(1)
  // A price is information, so only a sale has a ceiling: what the hold carries.
  const cap = side === 'sell' ? row.held : Infinity
  const n = Math.min(qty, cap)
  const profit = side === 'buy' ? profitOf(row.index) : -profitOf(row.index)

  const apply = () => {
    trade(sv, row.good.key, n, side)
    setQty(1)
    redraw()
  }

  return (
    <div className="mktrade">
      <div className="mktabs">
        <button type="button" className="mkback" onClick={onBack} aria-label="Market">‹</button>
        <button type="button" className={side === 'buy' ? 'on' : ''} onClick={() => { setSide('buy'); setQty(1) }}>BUY</button>
        <button type="button" className={side === 'sell' ? 'on' : ''} onClick={() => { setSide('sell'); setQty(1) }}>SELL</button>
      </div>
      <div className="ovrow mktrow">
        <div className="ovwhite">NAME</div>
        <div className="ovwhite">PRICE</div>
        <div className="ovwhite">PROFIT</div>
      </div>
      <div className="ovrow mktrow mktval">
        <div>{row.good.name.toUpperCase()}</div>
        <div>{cr(row.price)}</div>
        <div>{profit}%</div>
      </div>
      <div className="ovrow mktrow">
        <div className="ovwhite">BALANCE</div>
        <div className="ovwhite">CARGO SPACE</div>
        <div className="ovwhite">{side === 'buy' ? 'BUY PRICE' : 'SALE PRICE'}</div>
      </div>
      <div className="ovrow mktrow mktval">
        <div>{cr(getCredits(sv))}</div>
        <div>{cargoTotal(sv).toLocaleString('en-US')}</div>
        <div>{cr(n * row.price)}</div>
      </div>
      <div className="mkbar">
        <button type="button" className="mkstep" onClick={() => setQty(Math.max(1, n - 1))} aria-label="Less">-</button>
        <div className="mkqty">{n}</div>
        <button type="button" className="mkstep" onClick={() => setQty(Math.min(cap, n + 1))} aria-label="More">+</button>
        <button type="button" className="mkapply" disabled={n <= 0} onClick={apply}>{side === 'buy' ? 'BUY' : 'SELL'}</button>
      </div>
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const goods = useGoods()
  const [picked, setPicked] = React.useState('')
  const [, tick] = React.useReducer((k: number) => k + 1, 0)
  const held = heldGoods(sv)

  const rows: (Row | string)[] = []
  const byKey = new Map<string, Row>()
  for (const section of SECTIONS) {
    const list = goods.filter((g) => g.market === section && (g.showOnMarket || held.has(g.key)))
    if (!list.length) continue
    rows.push(section)
    list.forEach((good, index) => {
      const row = { good, index, price: priceOf(good.basicCost, index), demand: demandAt(index), held: held.get(good.key) ?? 0 }
      rows.push(row)
      byKey.set(good.key, row)
    })
  }

  const row = byKey.get(picked)
  const redrawBoth = () => { tick(); redraw() }
  return row
    ? <Trade sv={sv} row={row} onBack={() => setPicked('')} redraw={redrawBoth} />
    : <Market rows={rows} onPick={(r) => setPicked(r.good.key)} />
}

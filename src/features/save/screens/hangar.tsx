/** The hangar: the ships you own, the ship shop, a ship's overview and the purchase modal.
 *
 * The ship in use is object 8 and the hangar is object 4 (`system/Save/Save.as:30`). Buying puts
 * the old ship in the hangar and spends the price, or trades it in, which are the game's two
 * buttons (`ui/screens/ShipShopDetailsScreen.as:483-525`). Every write goes through
 * `lib/save/ships.ts`, so a hangar entry always carries a station name.
 */
import * as React from 'react'
import { getCredits } from '../../../lib/save/codec'
import { extUtf } from '../../../lib/save/safety'
import { bySaveName, shipData, type ModuleRec } from '../../../lib/save/rules'
import {
  addToHangar, buyShip, currentShip, fakeStation, hangarShips, hangarValue, sellShip, shipPrice,
  shopShips, useShip, type ShipItem,
} from '../../../lib/save/ships'
import { OverviewPanel, type ShipOverview } from '../panels'
import { Wand } from '../wand'
import { fitShip, shipAtBest, tablesOf } from '../../../lib/save/best'
import { makePriorities, makeUpgrades, type ModuleUpgrade } from '../../../lib/save/engineer'
import type { ScreenProps } from './types'
import './hangar.css'

type ShopShip = ShipItem & { overview: ShipOverview }
interface Data {
  modules: ModuleRec[]
  ships: ShopShip[]
  upgrades: ModuleUpgrade[]
  priorities: Record<string, number>
}

function useSaveData() {
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}data/save-data.json`)
      .then((r) => r.json())
      .then((d: Data) => { makeUpgrades(d.upgrades); makePriorities(d.priorities); setData(d) })
      .catch(() => setData(null))
  }, [])
  return data
}

const sprite = (icon: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(icon)}.svg`
const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = 'hidden' }
const cr = (n: number) => `${n.toLocaleString('en-US')} CR`
const spec = (ship: ShopShip, name: string) => String(ship.overview.specs.find((s) => s[0] === name)?.[1] ?? '')

/** One card of the shop grid: artwork, the name and purpose, the cost, then Hull, Speed and
 * Steering (`shipyard-new-main.png`). */
function ShipCard({ ship, cost, wand, children, onOpen }: {
  ship: ShopShip; cost: string; wand?: React.ReactNode
  children?: React.ReactNode; onOpen?: () => void
}) {
  const stats: [string, string][] = [['Hull', spec(ship, 'Hull')], ['Speed', spec(ship, 'Speed')], ['Steering', spec(ship, 'Steering')]]
  return (
    <div className="hgcard" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen}>
      <img className="hgart" src={sprite(ship.overview.icon)} alt="" onError={hide} />
      <div className="hgcardtext">
        <div className="hgname">{`${ship.overview.name} [${ship.overview.purpose}]`}{wand}</div>
        <div className="hgcost">{cost}</div>
        <div className="ovrow">{stats.map(([l]) => <div key={l} className="ovgold hglabel">{l}</div>)}</div>
        <div className="ovrow">{stats.map(([l, v]) => <div key={l} className="ovgold hgval">{v}</div>)}</div>
        {children}
      </div>
    </div>
  )
}

/** The confirm modal (`shipyard-new-subpage-purchase-modal.png`), asking what becomes of the ship
 * being left behind. The prices are the game's own figures, shown as information
 * (`lang_en.json`: `BuyShipHeader`, `BuyNewShipSellOldQuestion`, `NewShipCostText`). */
function Purchase({ ship, value, onBuy, onCancel }: {
  ship: ShopShip; value: number; onBuy: (keep: boolean) => void; onCancel: () => void
}) {
  const cost = shipPrice(ship)
  return (
    <div className="hgmodal">
      <div className="hgmodalbox">
        <div className="ovhead">Ship purchase</div>
        <p>
          Do you want to keep the current ship or trade it in? The cost of the current ship: {cr(value)}<br />
          New ship price: {cr(cost)}<br />
          Trade-in price: {cr(Math.max(0, cost - value))}
        </p>
        <div className="hgmodalbtns">
          <button type="button" className="ggbutton" onClick={() => onBuy(true)}>Keep</button>
          <button type="button" className="ggbutton" onClick={() => onBuy(false)}>Trade in</button>
          <button type="button" className="ggbutton" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Screen({ sv, redraw }: ScreenProps) {
  const data = useSaveData()
  const [shop, setShop] = React.useState(false)
  const [open, setOpen] = React.useState<ShopShip | null>(null)
  const [modal, setModal] = React.useState<ShopShip | null>(null)
  const [note, setNote] = React.useState('')

  if (!data) return null
  const { modules, ships } = data
  const tables = tablesOf(modules)
  const names = bySaveName(modules)
  const mine = currentShip(sv, ships) as ShopShip | null
  const owned = hangarShips(sv)
  const balance = getCredits(sv)
  const value = mine ? hangarValue(shipData(sv), ships, modules, names) : 0

  const finish = (text: string) => {
    setNote(text)
    setModal(null)
    setOpen(null)
    setShop(false)
    redraw()
  }

  const purchase = (ship: ShopShip, keep: boolean) => {
    buyShip(sv, ship, modules, keep)
    finish(keep ? `${ship.overview.name} in use, ${mine?.overview.name ?? 'the old ship'} is in the hangar`
      : `${ship.overview.name} in use, ${mine?.overview.name ?? 'the old ship'} traded in`)
  }

  if (open) {
    return (
      <div className="hgdetail">
        <div className="hgdetailhead">
          <button type="button" className="ggbutton" onClick={() => setOpen(null)}>Back</button>
          <div className="hgcredits">Available credits {cr(balance)}</div>
          <button
            type="button"
            className="ggbutton"
            onClick={() => { addToHangar(sv, open, modules); finish(`${open.overview.name} added to the hangar`) }}
          >
            Add to hangar
          </button>
          <button type="button" className="ggbutton" onClick={() => setModal(open)}>Purchase</button>
        </div>
        <OverviewPanel ship={{ ...open.overview, icon: open.overview.icon }} />
        {modal && (
          <Purchase ship={modal} value={value} onBuy={(keep) => purchase(modal, keep)} onCancel={() => setModal(null)} />
        )}
      </div>
    )
  }

  if (shop) {
    return (
      <div className="hgbody">
        <div className="hgtop">
          <button type="button" className="ggbutton" onClick={() => setShop(false)}>Your ships</button>
          <div className="hgcredits">Available credits {cr(balance)}</div>
        </div>
        <div className="hggrid">
          {shopShips(ships).map((s) => (
            <ShipCard key={s.key} ship={s as ShopShip} cost={`Cost: ${cr(shipPrice(s))}`} onOpen={() => setOpen(s as ShopShip)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="hgbody">
      <div className="hgtop">
        <button type="button" className="ggbutton" onClick={() => setShop(true)}>Ships</button>
        <div className="hgcredits">
          {mine ? `In use: ${mine.overview.name}` : 'In use: unknown ship'} · Available credits {cr(balance)}
        </div>
      </div>
      {note && <div className="hgnote">{note}</div>}
      <div className="hggrid">
        {owned.map((entry, i) => {
          const rec = ships.find((s) => s.key === extUtf(entry, 0))
          const worth = hangarValue(entry, ships, modules, names)
          if (!rec) return null
          return (
            <ShipCard
              key={i} ship={rec} cost={`Cost: ${cr(worth)}`}
              wand={(
                // The wand fits a ship where it lies: a hangar entry carries its own modules.
                <Wand
                  atBest={shipAtBest(entry, rec, tables)}
                  what={rec.overview.name}
                  onSet={() => { fitShip(entry, rec, tables); finish(`${rec.overview.name} is at its best`) }}
                />
              )}
            >
              <div className="hgstation">{extUtf(entry, 1) || fakeStation(sv)}</div>
              <div className="hgactions">
                <button
                  type="button"
                  className="ggbutton"
                  onClick={() => { useShip(sv, i); finish(`${rec.overview.name} is now your ship`) }}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="ggbutton"
                  onClick={() => { sellShip(sv, i); finish(`${rec.overview.name} left the hangar`) }}
                >
                  Discard
                </button>
              </div>
            </ShipCard>
          )
        })}
        {owned.length === 0 && <div className="hgempty">No ships are stored at this station.</div>}
      </div>
    </div>
  )
}

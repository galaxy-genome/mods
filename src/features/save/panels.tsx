import './overview.css'

export type Cell = string | number

export interface ShipOverview {
  name: string
  icon: string
  sold?: boolean
  price: number
  purpose: string
  ability?: string
  faction?: string
  influence?: Cell
  specs: [string, Cell][]
  core: Cell[][]
  optional: Cell[][]
}

export interface ModuleVariant { rows: Cell[][]; params: Cell[][] }

export interface ModuleCard {
  title: string
  icon: string
  description: string
  default: string
  variants: Record<string, ModuleVariant>
}

const up = (v: Cell) => String(v).toUpperCase()
const sprite = (icon: string) => `${import.meta.env.BASE_URL}sprites/${encodeURIComponent(icon)}`
const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = 'hidden' }

const Bar = ({ children }: { children: Cell }) => <div className="ovbar">{up(children)}</div>

function Pair({ cls, heads, vals }: { cls: string; heads: Cell[]; vals: Cell[] }) {
  return (
    <>
      <div className="ovrow">{heads.map((h, i) => <div key={i} className={cls}>{up(h)}</div>)}</div>
      <div className="ovrow">{vals.map((v, i) => <div key={i} className="ovval">{up(v)}</div>)}</div>
    </>
  )
}

function Rows({ heads, list }: { heads: string[]; list: Cell[][] }) {
  return (
    <div className="ovtab">
      <div className="ovrow">{heads.map((h) => <div key={h} className="ovwhite">{up(h)}</div>)}</div>
      {list.map((r, i) => (
        <div key={i} className="ovrow ovsmall">{r.map((c, j) => <div key={j}>{up(c)}</div>)}</div>
      ))}
    </div>
  )
}

/** The shop's Ship Overview screen (ShipShopDetailsScreen.as). */
export function OverviewPanel({ ship }: { ship: ShipOverview }) {
  return (
    <div className="ovcols">
      <div>
        <Bar>{ship.name}</Bar>
        <div className="ovship"><img src={sprite(ship.icon)} alt="" onError={hide} /></div>
        <Pair
          cls="ovgold"
          heads={['Price', 'Purpose']}
          vals={[ship.sold === false ? 'Not for sale' : `${ship.price.toLocaleString('en-US')} CR`, ship.purpose]}
        />
        {ship.ability && <div className="ovplain"><span>Unique abilities</span><span>{ship.ability}</span></div>}
        {ship.faction && (
          <>
            <Bar>Required influence</Bar>
            <Pair cls="ovgold" heads={['Faction', 'Influence']} vals={[ship.faction, ship.influence ?? '']} />
          </>
        )}
        <Bar>Ship specs</Bar>
        <Pair cls="ovwhite" heads={ship.specs.slice(0, 3).map((s) => s[0])} vals={ship.specs.slice(0, 3).map((s) => s[1])} />
        <Pair cls="ovwhite" heads={ship.specs.slice(3).map((s) => s[0])} vals={ship.specs.slice(3).map((s) => s[1])} />
      </div>
      <div>
        <Bar>Core modules</Bar>
        <Rows heads={['Module', 'Class', 'Default']} list={ship.core} />
        <Bar>Optional modules</Bar>
        <Rows heads={['Type', 'Class', 'Default']} list={ship.optional} />
      </div>
    </div>
  )
}

/** The module purchase screen with nothing fitted to compare (BuySellModuleScreen.as).
    The grade tiles are the Available Modules screen's class and grade picker. */
export function ModulePanel({ card, grade, onGrade }: { card: ModuleCard; grade: string; onGrade?: (grade: string) => void }) {
  const v = card.variants[grade]
  return (
    <div className="ovcols ovnohead">
      <div>
        <Bar>{card.title}</Bar>
        <div className="ovship"><img className="ovicon" src={sprite(card.icon)} alt="" onError={hide} /></div>
        <div className="ovdesc">{card.description}</div>
        <div className="ovgrades">
          {Object.entries(card.variants).map(([g, x]) => (
            <button
              key={g}
              type="button"
              className={`ovgrade${g === grade ? ' on' : ''}`}
              aria-pressed={g === grade}
              onClick={() => onGrade?.(g)}
            >
              <b>{g}</b><span>{x.rows[2][1]}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="ovrow"><div /><div className="ovgold">NEW MODULE</div></div>
        {v.rows.map((r, i) => (
          <div key={i} className="ovrow ovmid">{r.map((c, j) => <div key={j}>{up(c)}</div>)}</div>
        ))}
        <Bar>Parameters</Bar>
        <div className="ovrow"><div className="ovwhite">PROPERTY</div><div className="ovwhite">VALUE</div></div>
        {v.params.map((p, i) => (
          <div key={i} className="ovrow ovparam">{p.map((c, j) => <div key={j}>{up(c)}</div>)}</div>
        ))}
      </div>
    </div>
  )
}

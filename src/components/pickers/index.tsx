/**
 * Shared pickers. Every picker is a Sheet (bottom sheet on phones) with search and recent picks, offering only values
 * the game or a mod on this device provides.
 */
import { Home, MapPinned } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui/feedback'
import { Chip, SearchInput } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/surfaces'
import { useOpenMap } from '@/features/map/MapRoute'
import { loadGalaxy, useGalaxy } from '@/features/map/galaxy'
import { useT } from '@/i18n'
import {
  BEHAVIOURS, GAME_QUEST_ID_MAX, GAME_QUEST_ID_MIN, GAME_QUESTS, GOODS, PORTRAIT_GROUPS, SHIP_MODELS, STATION_FACTIONS, humanize,
} from '@/lib/reference'
import { type PlaceOption, placeOptions, requirementOf, satisfies } from '@/lib/dependencies'
import { splitViewId, viewId } from '@/lib/mods'
import type { Mod } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateMod, updateWithUndo, useEditor } from '@/store/editor'
import { FactionDot, GoodsIcon, KeyNav, OptionRow, PortraitTile, RecentRow, ShipSilhouette, factionName, matches, useRecent } from './common'

export { FactionDot, GoodsIcon, PortraitTile, ShipSilhouette, factionName } from './common'

interface Base { open: boolean; onOpenChange: (v: boolean) => void; nested?: boolean }

const MAP_URL = 'https://galaxy-genome.github.io/map/'

function useQuery(open: boolean) {
  const [q, setQ] = React.useState('')
  React.useEffect(() => { if (open) setQ('') }, [open])
  return [q, setQ] as const
}

/** Portrait grid (CharImage / character). */
export function PortraitPicker({ open, onOpenChange, nested, value, onSelect }: Base & { value: string; onSelect: (portrait: string) => void }) {
  const t = useT()
  const [q, setQ] = useQuery(open)
  const [recent, pushRecent] = useRecent('portrait')
  const pick = (v: string) => { pushRecent(v); onSelect(v); onOpenChange(false) }
  const groups = PORTRAIT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => matches(q, i)) })).filter((g) => g.items.length)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={t('pickers.portrait')} full>
      <KeyNav>
        <div className="sticky top-0 z-10 bg-deep pb-1"><SearchInput value={q} onChange={setQ} placeholder={t('pickers.searchPortraits')} /></div>
        <RecentRow items={recent} onPick={pick} />
        {groups.map((g) => (
          <div key={g.name} className="mt-4">
            <div className="section-label mb-2">{g.name}</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.items.map((name) => (
                <button key={name} type="button" data-opt aria-label={name} aria-pressed={value === name} onClick={() => pick(name)}
                  className={cn('flex flex-col items-center gap-1.5 rounded-[2px] border p-2 hover:border-grid-strong',
                    value === name ? 'border-cyan bg-cyan/10' : 'border-edge bg-chip')}>
                  <PortraitTile name={name} size={72} className="h-auto w-full max-w-[88px]" />
                  <span className={cn('w-full truncate text-center text-[12px]', value === name ? 'text-cyan' : 'text-ink')}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="mt-6 text-center text-[14px] text-dim">{t('pickers.noPortrait', { q })}</p>}
      </KeyNav>
    </Sheet>
  )
}

/** Ship picker. mode "model" returns shipModel keys, "internal" returns TargetShipType names. */
export function ShipPicker({ open, onOpenChange, nested, value, mode, onSelect }: Base & { value: string; mode: 'model' | 'internal'; onSelect: (value: string) => void }) {
  const [q, setQ] = useQuery(open)
  const t = useT()
  const [size, setSize] = React.useState<'' | 'Small' | 'Medium' | 'Large'>('')
  const [recent, pushRecent] = useRecent(`ship-${mode}`)
  const valOf = (s: (typeof SHIP_MODELS)[number]) => (mode === 'model' ? s.key : s.internal)
  const pick = (v: string) => { pushRecent(v); onSelect(v); onOpenChange(false) }
  const nameOf = (v: string) => SHIP_MODELS.find((s) => valOf(s) === v)?.name ?? v
  const ships = SHIP_MODELS.filter((s) => (!size || s.size === size) && matches(q, s.name, s.key, s.internal))
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={t('pickers.ship')} full>
      <KeyNav>
        <div className="sticky top-0 z-10 space-y-2 bg-deep pb-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('pickers.searchShips')} />
          <div className="flex gap-2" role="group" aria-label={t('pickers.size')}>
            {(['Small', 'Medium', 'Large'] as const).map((s) => (
              <Chip key={s} selected={size === s} onClick={() => setSize(size === s ? '' : s)}>{t(`pickers.size${s}`)}</Chip>
            ))}
          </div>
        </div>
        <RecentRow items={recent} render={nameOf} onPick={pick} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ships.map((s) => {
            const sel = valOf(s) === value || (mode === 'model' && s.key === value.toLowerCase())
            return (
              <button key={s.key} type="button" data-opt aria-pressed={sel} onClick={() => pick(valOf(s))}
                className={cn('flex min-h-[120px] flex-col items-start gap-1 rounded-[2px] border p-3 text-left hover:border-grid-strong',
                  sel ? 'border-cyan bg-cyan/10' : 'border-edge bg-chip')}>
                <ShipSilhouette size={s.size} name={s.key} className={cn('self-center', sel ? 'text-cyan' : 'text-grid-strong')} />
                <span className={cn('text-[15px] font-medium', sel ? 'text-cyan' : 'text-white')}>{s.name}</span>
                <span className="font-mono text-[11px] text-dim">{valOf(s)}</span>
                <span className="text-[12px] text-ink">{t('pickers.sizeClass', { size: t(`pickers.size${s.size}`) })}</span>
                {s.alwaysHostile && <Badge tone="danger">{t('pickers.alwaysHostile')}</Badge>}
              </button>
            )
          })}
        </div>
        {!ships.length && <p className="mt-6 text-center text-[14px] text-dim">{t('pickers.noShip')}</p>}
      </KeyNav>
    </Sheet>
  )
}

export function BehaviourPicker({ open, onOpenChange, nested, value, onSelect }: Base & { value: string; onSelect: (behaviour: string) => void }) {
  const [q, setQ] = useQuery(open)
  const t = useT()
  const [recent, pushRecent] = useRecent('behaviour')
  const pick = (v: string) => { pushRecent(v); onSelect(v); onOpenChange(false) }
  const groups = (['Friendly', 'Neutral', 'Hostile', 'Special'] as const)
    .map((g) => ({ g, items: BEHAVIOURS.filter((b) => b.group === g && matches(q, b.key, b.description)) }))
    .filter((x) => x.items.length)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={t('pickers.behaviour')}>
      <KeyNav>
        <SearchInput value={q} onChange={setQ} placeholder={t('pickers.searchBehaviours')} />
        <RecentRow items={recent} onPick={pick} />
        {groups.map(({ g, items }) => (
          <div key={g} className="mt-4">
            <div className="section-label mb-1.5">{t(`pickers.group${g}`)}</div>
            <div className="rounded-[2px] border border-edge bg-panel">
              {items.map((b) => (
                <OptionRow key={b.key} selected={value === b.key} onClick={() => pick(b.key)}>
                  <span className={cn('block text-[15px]', value === b.key ? 'text-cyan' : 'text-white')}>{b.key}</span>
                  <span className="block text-[12px] text-dim">{b.description}</span>
                </OptionRow>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="mt-6 text-center text-[14px] text-dim">{t('pickers.noBehaviour')}</p>}
        <p className="mt-4 text-[12px] text-dim">{t('pickers.alwaysHostileNote')}</p>
      </KeyNav>
    </Sheet>
  )
}

/** Systems, stations (optionally within a system) or planets of a system: the game's, this mod's, and other mods' as required mods. */
export function PlacePicker({ open, onOpenChange, nested, kind, value, onSelect, system, title, allowOwnStation, generated }: Base & {
  kind: 'system' | 'station' | 'planet'
  value: string
  onSelect: (name: string) => void
  system?: string
  title?: string
  /** Pinned first for docking conditions: "Your own station" returns "OWN". */
  allowOwnStation?: boolean
  /** Systems: Pick on map may return a generated system (arrival conditions). */
  generated?: boolean
}) {
  const [q, setQ] = useQuery(open)
  const t = useT()
  const [faction, setFaction] = React.useState('')
  const [hasStation, setHasStation] = React.useState(false)
  const [security, setSecurity] = React.useState('')
  const [confirm, setConfirm] = React.useState<PlaceOption | null>(null)
  const [recent, pushRecent] = useRecent(`place-${kind}`)
  const route = splitViewId(useParams().modId ?? '')
  const mods = useEditor((s) => s.mods)
  const mod = mods.find((m) => m.meta.id === route.modId) ?? null
  // Places from other mods count only for quests; a stars mod's own file must hold its systems.
  const questPart = !!mod && mod.quests.some((x) => x.id === route.partId)
  const pick = (v: string) => { pushRecent(v); onSelect(v); onOpenChange(false) }
  const pickOther = (o: PlaceOption) => {
    if (mod?.meta.requires?.some((r) => satisfies(r, o.mod!))) return pick(o.name)
    setConfirm(o)
  }
  const acceptRequirement = () => {
    const o = confirm!
    const req = requirementOf(o.mod!)
    setConfirm(null)
    updateWithUndo(mod!.meta.id, t('pickers.requiredAdded', { mod: req.title }), () => {
      updateMod(mod!.meta.id, (d) => { d.meta.requires = [...(d.meta.requires ?? []), req] })
      pick(o.name)
    })
  }
  const openMap = useOpenMap()
  const { galaxy } = useGalaxy()
  React.useEffect(() => { if (open && kind === 'system') loadGalaxy().catch(() => {}) }, [open, kind])
  // Every system on the game's map, nearest Sol first; the reference list until the galaxy loads.
  const catalogue = React.useMemo(() => galaxy?.reachable.map((s) => ({ name: s[0], x: s[1], y: s[2], security: s[4] as string | null })).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)), [galaxy])
  const limit = 80
  const { game, own, others } = placeOptions(kind, mod, questPart ? mods : [], { catalogue, system: kind === 'system' ? undefined : system })
  const factionKey = (f = '') => STATION_FACTIONS.find((x) => x.name === f)?.key ?? f
  const mapLink = (sys: string) => (
    <ExternalLink href={`${MAP_URL}?system=${encodeURIComponent(sys)}`} className="inline-flex h-12 shrink-0 items-center whitespace-nowrap px-3 text-[12px] [&>span+span]:hidden">
      {t('pickers.viewOnMap')}
    </ExternalLink>
  )
  const stationSystems = kind === 'system' ? placeOptions('station', mod, mods) : null
  const factionOf = new Map<string, string>()
  if (stationSystems) for (const s of [...stationSystems.game, ...stationSystems.own, ...stationSystems.others.flatMap((x) => x.options)]) if (!factionOf.has(s.system!)) factionOf.set(s.system!, factionKey(s.faction))
  const securities = kind === 'system' ? [...new Set([...game, ...own].map((s) => s.security).filter((s): s is string => !!s))] : []

  const keep = (o: PlaceOption) => kind === 'system'
    ? (!hasStation || factionOf.has(o.name)) && (!security || o.security === security) && matches(q, o.name)
    : kind === 'station' ? (!faction || factionKey(o.faction) === faction) && matches(q, o.name, o.system) : matches(q, o.name, o.type)
  const row = (o: PlaceOption, onPick: () => void, badge?: string) => (
    <OptionRow key={`${o.mod?.meta.id ?? ''}:${o.name}`} selected={value === o.name} onClick={onPick} trailing={kind !== 'planet' ? mapLink(o.system ?? o.name) : undefined}>
      <span className="flex items-center gap-2">
        {kind === 'station' && <FactionDot faction={factionKey(o.faction)} />}
        {kind === 'system' && factionOf.has(o.name) && <FactionDot faction={factionOf.get(o.name)!} />}
        <span className={cn('truncate text-[15px]', value === o.name ? 'text-cyan' : 'text-white')}>{o.name}</span>
        {badge && <Badge tone="cyan">{badge}</Badge>}
      </span>
      <span className="block truncate font-mono text-[11px] text-dim">
        {kind === 'system' ? `${o.security ?? t('pickers.unknownSecurity')} · ${t('pickers.lyFromSol', { ly: Math.round(Math.hypot(o.x ?? 0, o.y ?? 0)).toLocaleString('en-US') })}`
          : kind === 'station' ? `${o.system} · ${factionName(factionKey(o.faction))}` : humanize(o.type ?? '')}
      </span>
    </OptionRow>
  )
  const all = [...own, ...game].filter(keep)
  const rows: React.ReactNode[] = all.slice(0, limit).map((o) => row(o, () => pick(o.name), o.mod ? t('pickers.thisMod') : undefined))
  if (kind === 'station' && allowOwnStation && matches(q, t('pickers.ownStation'), 'OWN')) {
    rows.unshift(
      <OptionRow key="OWN" selected={value === 'OWN'} onClick={() => pick('OWN')}>
        <span className="flex items-center gap-2 text-[15px] text-white"><Home className="size-4 text-cyan" />{t('pickers.ownStation')}</span>
        <span className="block text-[11px] text-dim">{t('pickers.ownStationHelp')}</span>
      </OptionRow>,
    )
  }
  const otherRows = others.map((x) => ({ mod: x.mod, options: x.options.filter(keep) })).filter((x) => x.options.length)

  const heading = title ?? t(`pickers.${kind}`)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={heading} full
      description={kind !== 'system' && system ? t('pickers.inSystem', { system }) : undefined}>
      <KeyNav>
        <div className="sticky top-0 z-10 space-y-2 bg-deep pb-2">
          <SearchInput value={q} onChange={setQ} placeholder={t(`pickers.search${kind[0].toUpperCase()}${kind.slice(1)}`)} />
          {kind === 'system' && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('pickers.filters')}>
              <Chip onClick={() => openMap({ mode: 'pick', system: value, generated }, ({ name }) => pick(name))} className="shrink-0"><MapPinned className="size-4 text-cyan" />{t('map.pickOnMap')}</Chip>
              <Chip selected={hasStation} onClick={() => setHasStation(!hasStation)} className="shrink-0">{t('pickers.hasStation')}</Chip>
              {securities.map((sec) => (
                <Chip key={sec} selected={security === sec} onClick={() => setSecurity(security === sec ? '' : sec)} className="shrink-0">{sec}</Chip>
              ))}
            </div>
          )}
          {kind === 'station' && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('pickers.faction')}>
              {STATION_FACTIONS.map((f) => (
                <Chip key={f.key} selected={faction === f.key} onClick={() => setFaction(faction === f.key ? '' : f.key)} className="shrink-0">
                  <FactionDot faction={f.key} />{f.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <RecentRow items={recent} render={(v) => (v === 'OWN' ? t('pickers.ownStation') : v)} onPick={pick} />
        {rows.length > 0 && <div className="mt-3 rounded-[2px] border border-edge bg-panel">{rows}</div>}
        {all.length > limit && <p className="mt-2 text-center text-[12px] text-dim">{t('pickers.showing', { limit, total: all.length })}</p>}
        {!rows.length && !otherRows.length && (
          <p className="mt-6 text-center text-[14px] text-dim">
            {kind === 'planet' && !system ? t('pickers.chooseSystemFirst') : t(`pickers.no${kind[0].toUpperCase()}${kind.slice(1)}`)}
          </p>
        )}
        {otherRows.length > 0 && (
          <div className="mt-5">
            <div className="section-label mb-1">{t('pickers.fromOtherMods')}</div>
            <p className="mb-2 text-[12px] text-dim">{t('pickers.fromOtherModsHelp')}</p>
            {otherRows.map((x) => (
              <div key={x.mod.meta.id} className="mb-3">
                <div className="mb-1 font-mono text-[11px] text-ink">{x.mod.meta.title}{x.mod.meta.version && ` v${x.mod.meta.version}`}</div>
                <div className="rounded-[2px] border border-edge bg-panel">
                  {x.options.slice(0, limit).map((o) => row(o, () => pickOther(o), mod?.meta.requires?.some((r) => satisfies(r, x.mod)) ? t('pickers.required') : undefined))}
                </div>
              </div>
            ))}
          </div>
        )}
      </KeyNav>
      <Sheet open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)} nested title={t('pickers.requireTitle', { mod: confirm?.mod?.meta.title ?? '' })}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={acceptRequirement}>{t('pickers.requireAccept')}</Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          </div>
        }>
        <p className="text-[14px] leading-relaxed text-ink">{t('pickers.requireBody', { name: confirm?.name ?? '', mod: confirm?.mod?.meta.title ?? '' })}</p>
      </Sheet>
    </Sheet>
  )
}

/** Multi-select of quests: main story (0), the game's side quests, this mod's quests and other mods' as required mods. */
export function QuestPicker({ open, onOpenChange, nested, value, onChange, excludeModId }: Base & { value: number[]; onChange: (ids: number[]) => void; excludeModId?: string }) {
  const [q, setQ] = useQuery(open)
  const t = useT()
  const [sel, setSel] = React.useState<number[]>(value)
  const [confirm, setConfirm] = React.useState<{ id: number; mod: Mod } | null>(null)
  React.useEffect(() => { if (open) setSel(value) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const mods = useEditor((s) => s.mods)
  const ownId = splitViewId(excludeModId ?? '').modId
  const own = mods.find((m) => m.meta.id === ownId)
  const questsOf = (m: Mod) => m.quests.map((x) => ({ id: x.id, c: x.versions[x.primaryLang]! })).filter((x) => x.c && viewId(m.meta.id, x.id) !== excludeModId)
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const gameName = (id: number) => GAME_QUESTS.find((g) => g.id === id)?.name ?? t('pickers.gameQuestN', { id })
  const otherMods = mods.filter((m) => m.meta.id !== ownId && m.meta.origin !== 'game')
  const labelOf = (id: number) =>
    id === 0 ? t('pickers.mainStory')
      : id >= GAME_QUEST_ID_MIN && id <= GAME_QUEST_ID_MAX ? gameName(id)
      : mods.flatMap(questsOf).find((x) => x.c.settings.questId === id)?.c.settings.questName ?? `#${id}`
  const required = (m: Mod) => !!own?.meta.requires?.some((r) => satisfies(r, m))
  const pickOther = (id: number, m: Mod) => (sel.includes(id) || required(m) ? toggle(id) : setConfirm({ id, mod: m }))
  const acceptRequirement = () => {
    const { id, mod } = confirm!
    const req = requirementOf(mod)
    setConfirm(null)
    if (own) updateWithUndo(own.meta.id, t('pickers.requiredAdded', { mod: req.title }), () => updateMod(own.meta.id, (d) => { d.meta.requires = [...(d.meta.requires ?? []), req] }))
    toggle(id)
  }
  const gameIds = Array.from({ length: GAME_QUEST_ID_MAX - GAME_QUEST_ID_MIN + 1 }, (_, i) => GAME_QUEST_ID_MIN + i)
  const game = gameIds.map((id) => ({ id, g: GAME_QUESTS.find((x) => x.id === id) })).filter(({ id, g }) => matches(q, gameName(id), id, g?.charName, g?.station))
  const mine = own ? questsOf(own).filter((x) => matches(q, x.c.settings.questName, x.c.settings.questId)) : []
  const others = otherMods.map((m) => ({ m, list: questsOf(m).filter((x) => matches(q, x.c.settings.questName, m.meta.title, x.c.settings.questId)) })).filter((x) => x.list.length)

  const row = (id: number, title: React.ReactNode, sub: React.ReactNode, key: React.Key, onClick = () => toggle(id)) => (
    <OptionRow key={key} selected={sel.includes(id)} onClick={onClick}>
      <span className={cn('block truncate text-[15px]', sel.includes(id) ? 'text-cyan' : 'text-white')}>{title}</span>
      <span className="block truncate font-mono text-[11px] text-dim">{sub}</span>
    </OptionRow>
  )
  const questSub = (c: { settings: { charName: string; stationName: string; questId: number } }) => [c.settings.charName, c.settings.stationName, c.settings.questId].filter((x) => x !== '').join(' · ')
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={t('pickers.finishedQuests')} full
      footer={<Button variant="primary" className="w-full" onClick={() => { onChange(sel); onOpenChange(false) }}>{sel.length ? t('pickers.doneCount', { count: sel.length }) : t('pickers.done')}</Button>}>
      <KeyNav>
        <div className="sticky top-0 z-10 space-y-2 bg-deep pb-2">
          {sel.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sel.map((id) => <Chip key={id} selected onRemove={() => toggle(id)}>{labelOf(id)}</Chip>)}
            </div>
          )}
          <SearchInput value={q} onChange={setQ} placeholder={t('pickers.searchQuests')} />
        </div>
        {mine.length > 0 && (
          <>
            <div className="section-label mb-1.5 mt-3">{t('pickers.thisModQuests')}</div>
            <div className="rounded-[2px] border border-edge bg-panel">
              {mine.map(({ id, c }) => row(c.settings.questId, c.settings.questName || t('pickers.untitledQuest'), questSub(c), id))}
            </div>
          </>
        )}
        {matches(q, t('pickers.mainStory'), t('pickers.pastStep68'), 0) && (
          <>
            <div className="section-label mb-1.5 mt-3">{t('pickers.mainStory')}</div>
            <div className="rounded-[2px] border border-edge bg-panel">{row(0, t('pickers.pastStep68'), t('pickers.idN', { id: 0 }), 0)}</div>
          </>
        )}
        {game.length > 0 && (
          <>
            <div className="section-label mb-1.5 mt-4">{t('pickers.gameSideQuests')}</div>
            <div className="rounded-[2px] border border-edge bg-panel">
              {game.map(({ id, g }) => row(id, gameName(id), g ? `${g.charName} · ${g.randomSpace ? t('pickers.inSpace') : g.station} · ${id}` : t('pickers.idN', { id }), id))}
            </div>
          </>
        )}
        {others.length > 0 && (
          <div className="mt-5">
            <div className="section-label mb-1">{t('pickers.fromOtherMods')}</div>
            <p className="mb-2 text-[12px] text-dim">{t('pickers.fromOtherModsHelp')}</p>
            {others.map(({ m, list }) => (
              <div key={m.meta.id} className="mb-3">
                <div className="mb-1 font-mono text-[11px] text-ink">{m.meta.title}{m.meta.version && ` v${m.meta.version}`}{required(m) && ` · ${t('pickers.required')}`}</div>
                <div className="rounded-[2px] border border-edge bg-panel">
                  {list.slice(0, 80).map(({ id, c }) => row(c.settings.questId, c.settings.questName || t('pickers.untitledQuest'), questSub(c), `${m.meta.id}:${id}`, () => pickOther(c.settings.questId, m)))}
                </div>
              </div>
            ))}
          </div>
        )}
      </KeyNav>
      <Sheet open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)} nested title={t('pickers.requireTitle', { mod: confirm?.mod.meta.title ?? '' })}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={acceptRequirement}>{t('pickers.requireAccept')}</Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          </div>
        }>
        <p className="text-[14px] leading-relaxed text-ink">{t('pickers.requireBody', { name: confirm ? labelOf(confirm.id) : '', mod: confirm?.mod.meta.title ?? '' })}</p>
      </Sheet>
    </Sheet>
  )
}

export function GoodsPicker({ open, onOpenChange, nested, value, onSelect, title }: Base & { value: string; onSelect: (goods: string) => void; title?: string }) {
  const [q, setQ] = useQuery(open)
  const t = useT()
  const [recent, pushRecent] = useRecent('goods')
  const pick = (v: string) => { pushRecent(v); onSelect(v); onOpenChange(false) }
  const goods = GOODS.filter((g) => matches(q, g, humanize(g)))
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} title={title ?? t('pickers.cargo')} full>
      <KeyNav>
        <div className="sticky top-0 z-10 bg-deep pb-1"><SearchInput value={q} onChange={setQ} placeholder={t('pickers.searchGoods')} /></div>
        <RecentRow items={recent} render={humanize} onPick={pick} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {goods.map((g) => (
            <button key={g} type="button" data-opt aria-pressed={value === g} onClick={() => pick(g)}
              className={cn('flex min-h-12 items-center gap-2 rounded-[2px] border px-3 text-left hover:border-grid-strong',
                value === g ? 'border-cyan bg-cyan/10' : 'border-edge bg-chip')}>
              <GoodsIcon goods={g} className={value === g ? 'text-cyan' : 'text-grid-strong'} />
              <span className={cn('min-w-0 text-[14px] leading-tight', value === g ? 'text-cyan' : 'text-white')}>{humanize(g)}</span>
            </button>
          ))}
        </div>
        {!goods.length && <p className="mt-6 text-center text-[14px] text-dim">{t('pickers.noGoods')}</p>}
      </KeyNav>
    </Sheet>
  )
}

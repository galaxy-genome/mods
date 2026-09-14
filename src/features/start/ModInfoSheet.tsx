import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { Badge, SectionLabel } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { parseCondition } from '@/lib/conditions'
import { LANGS } from '@/lib/reference'
import { partsOf } from '@/lib/mods'
import { chainSummary } from '@/lib/questChain'
import type { Mod, ModPart, QuestView, StarsView } from '@/lib/types'
import { timeAgo } from '@/lib/utils'

/** Counts that describe what a mod contains, for its info sheet and card. */
export function modStats(parts: ModPart[]) {
  const quests = parts.filter((m) => m.meta.type === 'quest') as QuestView[]
  const stars = parts.filter((m) => m.meta.type === 'stars') as StarsView[]
  const contents = quests.map((q) => q.versions[q.primaryLang]!)
  const steps = contents.flatMap((c) => c.steps)
  const systems = new Set<string>()
  for (const c of contents) {
    for (const s of c.steps) {
      for (const raw of [s.finishWhen, ...s.failWhen]) {
        if (!raw) continue
        const { def, param } = parseCondition(raw)
        if (def?.param === 'system' && param) systems.add(param)
      }
      if (s.mission?.targetSystem) systems.add(s.mission.targetSystem)
    }
  }
  stars.forEach((m) => m.stars.forEach((s) => systems.add(s.name)))
  return {
    quests: quests.length,
    languages: [...new Set(quests.flatMap((q) => Object.keys(q.versions)))],
    steps: steps.length,
    lines: steps.reduce((n, s) => n + s.dialogue.length, 0),
    choices: steps.reduce((n, s) => n + s.dialogue.reduce((k, l) => k + l.choices.length, 0), 0),
    ships: steps.reduce((n, s) => n + s.ships.length, 0),
    missions: steps.filter((s) => s.mission).length,
    rumors: contents.reduce((n, c) => n + c.rumors.length, 0),
    systems: systems.size,
    stars: stars.reduce((n, m) => n + m.stars.length, 0),
    planets: stars.reduce((n, m) => n + m.planets.length, 0),
    stations: stars.reduce((n, m) => n + m.stations.length, 0),
    textures: 0,
    updatedAt: Math.max(...parts.map((m) => m.meta.updatedAt)),
  }
}

/** "Requires: Trappist-1 & neighbours v2.0" for a mod with required mods; nothing otherwise. */
export function RequiresLine({ mod, className }: { mod: Mod; className?: string }) {
  const t = useT()
  const list = mod.meta.requires ?? []
  if (!list.length) return null
  return <p className={className ?? 'text-[13px] text-ink'}>{t('start.requires', { mods: list.map((r) => (r.version ? `${r.title} v${r.version}` : r.title)).join(', ') })}</p>
}

const formatDate = (ts: number) => new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ModInfoSheet({ open, onOpenChange, mod }: { open: boolean; onOpenChange: (v: boolean) => void; mod: Mod }) {
  const t = useT()
  const stats = { ...modStats(partsOf(mod)), textures: mod.textures.length, updatedAt: mod.meta.updatedAt }
  const meta = mod.meta
  const chain = chainSummary(partsOf(mod).filter((v) => v.meta.type === 'quest') as QuestView[])
  const title = meta.title
  const source = meta.community
    ? t(meta.modified ? 'start.sourceCommunityModified' : 'start.sourceCommunityEntry', { entry: meta.community.entryTitle })
    : { local: t('start.sourceLocal'), import: t('start.sourceImport'), game: t('start.sourceGame'), community: t('start.sourceCommunity') }[meta.origin]
  const counts: [string, number][] = [
    [t('start.statQuests'), stats.quests], [t('start.statSteps'), stats.steps], [t('start.statLines'), stats.lines], [t('start.statChoices'), stats.choices],
    [t('start.statShips'), stats.ships], [t('start.statMissions'), stats.missions], [t('start.statRumors'), stats.rumors], [t('start.statSystems'), stats.systems],
    [t('start.statStars'), stats.stars], [t('start.statPlanets'), stats.planets], [t('start.statStations'), stats.stations], [t('start.statTextures'), stats.textures],
  ]
  const copyId = (id: string) => { navigator.clipboard?.writeText(id).then(() => toast(t('start.modIdCopied')), () => toast.error(t('start.copyFailed'))) }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={source}>
      <div className="flex flex-col gap-5 pt-1">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
          <dt className="text-dim">{t('start.version')}</dt>
          <dd className="font-mono text-white">{meta.version}</dd>
          <dt className="text-dim">{t('start.lastModified')}</dt>
          <dd className="text-white">{formatDate(stats.updatedAt)} <span className="font-mono text-[12px] text-dim">{timeAgo(stats.updatedAt)}</span></dd>
          <dt className="text-dim">{t('start.created')}</dt>
          <dd className="text-white">{formatDate(meta.createdAt)}</dd>
          <dt className="text-dim">{t('start.author')}</dt>
          <dd className="text-white">{(meta.community ?? meta.credit)?.author ?? (meta.author || t('start.you'))}</dd>
          {(meta.community ?? meta.credit) && (
            <>
              <dt className="text-dim">{t('start.licence')}</dt>
              <dd className="text-white">{(meta.community ?? meta.credit)!.licence}</dd>
            </>
          )}
          {stats.languages.length > 0 && (
            <>
              <dt className="text-dim">{t('start.languages')}</dt>
              <dd className="flex flex-wrap gap-1">{stats.languages.map((l) => <Badge key={l}>{LANGS.find((x) => x.key === l)?.label}</Badge>)}</dd>
            </>
          )}
          {!!meta.requires?.length && (
            <>
              <dt className="text-dim">{t('start.requiredMods')}</dt>
              <dd className="text-white">{meta.requires.map((r) => (r.version ? `${r.title} v${r.version}` : r.title)).join(', ')}</dd>
            </>
          )}
          <dt className="text-dim">{t('common.favorite')}</dt>
          <dd className="text-white">{meta.favorite ? t('start.yes') : t('start.no')}</dd>
        </dl>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t('start.contents')}</SectionLabel>
          {chain && <p className="text-[13px] text-ink">{chain}</p>}
          <div className="grid grid-cols-3 gap-2">
            {counts.filter(([, n]) => n > 0).map(([label, n]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-[4px] border border-edge bg-panel px-2.5 py-2">
                <span className="font-mono text-[18px] text-white">{n}</span>
                <span className="text-[11px] leading-tight text-dim">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {(
          <div className="flex flex-col gap-1.5">
            <SectionLabel>{t('start.modId')}</SectionLabel>
            <button onClick={() => copyId(meta.id)} aria-label={t('start.copyModId')} className="flex min-h-11 items-center gap-2 rounded-[2px] border border-edge bg-field px-3 text-left font-mono text-[12px] text-ink hover:border-cyan">
              <span className="flex-1 break-all">{meta.id}</span><Copy className="size-4 shrink-0 text-dim" />
            </button>
            <p className="text-[12px] text-ink/70">{t('start.modIdHelp')}</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}

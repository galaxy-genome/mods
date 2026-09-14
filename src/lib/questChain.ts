import { t } from '@/i18n'
import { STATIONS } from './reference.ts'
import type { Mod, QuestView } from './types.ts'

export interface ChainItem { view: QuestView; after?: string; n?: number; depth: number; tree?: number; last?: boolean }

const content = (v: QuestView) => v.versions[v.primaryLang]!

/**
 * A mod's quests as their requirement tree: each quest under the first quest in the mod it requires, trees before
 * independent quests, file order otherwise. A straight chain sits one step in under its first quest; each branch of a
 * fork indents a level, and a chain continuing a branch one more. Quests in a tree are numbered in play order.
 */
export function questChain(views: QuestView[]): ChainItem[] {
  const byId = new Map(views.map((v) => [content(v).settings.questId, v]))
  const parent = new Map<QuestView, QuestView>()
  for (const v of views) {
    const p = content(v).settings.requiredQuestIds.map((id) => byId.get(id)).find((x) => x && x !== v)
    if (p) parent.set(v, p)
  }
  // A requirement loop has no root; break it at its first quest in file order.
  for (const v of views) {
    const seen = new Set<QuestView>()
    for (let x: QuestView | undefined = v; x && parent.has(x); x = parent.get(x)) {
      if (seen.has(x)) { parent.delete(x); break }
      seen.add(x)
    }
  }
  const children = (v: QuestView) => views.filter((c) => parent.get(c) === v)
  const roots = views.filter((v) => !parent.has(v))
  const out: ChainItem[] = []
  let tree = 0
  const walk = (v: QuestView, depth: number, t0: number | undefined, n: { i: number }) => {
    const p = parent.get(v)
    const pn = p && out.find((o) => o.view === p)?.n
    out.push({ view: v, depth, tree: t0, ...(t0 !== undefined ? { n: ++n.i } : {}), ...(p ? { after: t('start.unlocksAfter', { name: pn ? `${pn} · ${p.meta.title}` : p.meta.title }) } : {}) })
    const kids = children(v)
    for (const c of kids) walk(c, depth + (kids.length > 1 || !p || (p && children(p).length > 1) ? 1 : 0), t0, n)
  }
  for (const r of roots.filter((r) => children(r).length)) walk(r, 0, tree++, { i: 0 })
  for (const r of roots.filter((r) => !children(r).length)) walk(r, 0, undefined, { i: 0 })
  out.forEach((o, i) => { if (o.tree !== undefined && out[i + 1]?.tree !== o.tree) o.last = true })
  return out
}

/** True when every quest is one link of a single straight chain. */
export const isSingleChain = (items: ChainItem[]) => items.length > 1 && items.every((o, i) => o.tree === 0 && o.depth === Math.min(i, 1) && (i === 0 || o.after))

/** Where a quest is offered, in the player's words. */
export function startPlace(v: QuestView, mod?: Mod) {
  const s = content(v).settings
  if (s.startMode === 'space') return t('start.startsInSpace')
  if (s.startMode === 'nearPoint') return t('start.startsNear', { radius: s.radius, x: s.pointX, y: s.pointY })
  if (!s.stationName) return t('start.noStation')
  const system = STATIONS.find((x) => x.name === s.stationName)?.system ?? mod?.stars?.stations.find((x) => x.name === s.stationName)?.system
  return system ? t('start.barAtIn', { station: s.stationName, system }) : t('start.barAt', { station: s.stationName })
}

/** "4 quests, played in order · starts at Manson Orbital", or '' for a mod with fewer than two quests. */
export function chainSummary(views: QuestView[]) {
  if (views.length < 2) return ''
  const items = questChain(views)
  if (!isSingleChain(items)) return ''
  const s = content(items[0].view).settings
  const where = s.startMode === 'bar' && s.stationName ? t('start.chainStartsAt', { station: s.stationName }) : s.startMode === 'space' ? t('start.startsInSpace') : ''
  return [t('start.playedInOrder', { count: items.length }), where].filter(Boolean).join(' · ')
}

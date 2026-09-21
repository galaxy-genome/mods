import { Maximize2, Minus, Network, Plus } from 'lucide-react'
import * as React from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/surfaces'
import { DAG_SIZE, MAIN_STORY, type Dag, type DagInput, type DagNode, questDag } from '@/lib/questDag'
import { GAME_QUEST_NAMES } from '@/lib/reference'
import { resolveQuest } from '@/lib/rules'
import type { ModPart, QuestView } from '@/lib/types'
import { questOf, useEditor } from '@/store/editor'
import { t, useT } from '@/i18n'
import { usePanZoom } from './panZoom'

const { nodeW: NODE_W, nodeH: NODE_H } = DAG_SIZE

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const parseRequires = (s: string | undefined) =>
  String(s ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number)

/** The stroke each kind of node is drawn in; the focus overrides all of them. */
const STROKE = {
  game: 'var(--color-edge)',
  story: 'var(--color-amber)',
  mine: 'var(--color-edge)',
  favorite: 'var(--color-success)',
  unknown: 'var(--color-dim)',
} as const

const KIND_KEY = {
  game: 'output.qgKindGame',
  story: 'output.qgKindStory',
  mine: 'output.qgKindMine',
  favorite: 'output.qgKindFavorite',
  unknown: 'output.qgKindUnknown',
} as const

const LEGEND = [['game', undefined], ['story', 'amber'], ['favorite', 'success'], ['mine', undefined], ['unknown', 'dim']] as const

/**
 * Every quest the graph may draw: the game's own side quests, the quests of favorited mods, and the quest being
 * viewed whether or not its mod is favorited. A mod that takes a game quest's ID replaces it.
 */
function universe(parts: ModPart[], viewedModId?: string): DagInput[] {
  const out = new Map<number, DagInput>()
  for (const g of GAME_QUEST_NAMES) out.set(g.id, { id: g.id, label: g.name, source: 'game', requires: parseRequires(g.requires) })
  for (const m of parts) {
    if (m.meta.type !== 'quest') continue
    if (!m.meta.favorite && m.meta.id !== viewedModId) continue
    const q = questOf(m)
    if (!q) continue
    out.set(q.settings.questId, {
      id: q.settings.questId,
      label: q.settings.questName || m.meta.title,
      source: m.meta.favorite ? 'favorite' : 'mine',
      requires: q.settings.requiredQuestIds,
    })
  }
  return [...out.values()]
}

function Graph({ dag, focus, onOpen }: { dag: Dag; focus: number; onOpen: (n: DagNode) => void }) {
  const { box, view, setView, zoom, handlers, tapped } = usePanZoom()
  const at = new Map(dag.nodes.map((n) => [n.id, n]))

  // The whole ancestry is the answer, so it starts scaled to fit rather than at the top of a graph taller than the box.
  const fit = React.useCallback(() => {
    const el = box.current
    if (!el) return
    const k = Math.min(1, (el.clientWidth - 16) / dag.width, (el.clientHeight - 16) / dag.height)
    setView({ k, x: 0, y: (el.clientHeight - dag.height * k) / 2 })
  }, [box, dag.width, dag.height, setView])
  React.useEffect(fit, [fit])
  return (
    <div className="relative">
      <div
        ref={box}
        {...handlers}
        className="grid-texture relative h-[70dvh] min-h-[360px] touch-none overflow-hidden rounded-[4px] border border-edge bg-deep"
      >
        <svg
          width={dag.width}
          height={dag.height}
          role="group"
          aria-label={t('output.qgGraph')}
          style={{ overflow: 'visible', marginLeft: -dag.width / 2, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: 'top center' }}
          className="absolute left-1/2 top-0 select-none"
        >
          <defs>
            <marker id="qg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--color-cyan)" />
            </marker>
          </defs>

          {dag.edges.map((e) => {
            const a = at.get(e.from)
            const b = at.get(e.to)
            if (!a || !b) return null
            const x1 = a.x + NODE_W / 2
            const x2 = b.x + NODE_W / 2
            const y1 = a.y + NODE_H
            const y2 = b.y - 2
            const mid = (y1 + y2) / 2
            return <path key={`${e.from}-${e.to}`} d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke="var(--color-cyan)" strokeWidth={1.5} markerEnd="url(#qg-arrow)" />
          })}

          {dag.nodes.map((n) => {
            const isFocus = n.id === focus
            const label = n.label || (n.id === MAIN_STORY ? t('output.qgMainStory') : t('output.flUnknownQuest', { id: n.id }))
            return (
              <g
                key={n.id}
                role="link"
                tabIndex={0}
                aria-label={t('output.qgNodeLabel', { name: label, kind: t(KIND_KEY[n.source]) })}
                transform={`translate(${n.x},${n.y})`}
                aria-current={isFocus || undefined}
                onClick={() => { if (tapped()) onOpen(n) }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-white"
                opacity={n.source === 'unknown' ? 0.45 : 1}
              >
                <rect width={NODE_W} height={NODE_H} rx={4} fill="var(--color-panel)" stroke={isFocus ? 'var(--color-cyan)' : STROKE[n.source]} strokeWidth={isFocus ? 2 : 1} strokeDasharray={n.source === 'unknown' ? '5 4' : undefined} />
                <text x={12} y={26} fontSize={13} fontWeight={600} className="fill-white">{clip(label, 24)}</text>
                <text x={12} y={46} fontSize={11} className="fill-dim font-mono">{n.id ? n.id : ''} {t(KIND_KEY[n.source])}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flZoomIn')} onClick={() => zoom(1.2)}><Plus className="size-4" /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flZoomOut')} onClick={() => zoom(1 / 1.2)}><Minus className="size-4" /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flReset')} onClick={fit}><Maximize2 className="size-4" /></Button>
      </div>
    </div>
  )
}

/** What a quest needs before it is offered, back to the quests that need nothing. */
export function QuestGraphPage() {
  const t = useT()
  const { questId = '' } = useParams()
  const navigate = useNavigate()
  const parts = useEditor((s) => s.parts)

  const viewed = parts.find((m) => m.meta.id === questId) as QuestView | undefined
  const focus = viewed ? questOf(viewed)?.settings.questId : Number(questId)
  const all = React.useMemo(() => universe(parts, viewed?.meta.id), [parts, viewed])
  const dag = React.useMemo(() => (focus === undefined ? null : questDag(all, focus)), [all, focus])

  if (focus === undefined || Number.isNaN(focus)) return <Navigate to="/library" replace />
  const me = all.find((q) => q.id === focus)
  const title = me?.label ?? resolveQuest(focus, parts).label

  const open = (n: DagNode) => {
    if (n.id === MAIN_STORY || n.source === 'unknown' || n.id === focus) return
    const mod = parts.find((m) => m.meta.type === 'quest' && questOf(m)?.settings.questId === n.id)
    navigate(`/library/${mod ? mod.meta.id : n.id}/graph`, { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <AppBar back={viewed ? `/mod/${viewed.meta.id}/flow?view=deps` : `/library/${focus}`} title={title} subtitle={t('output.qgSubtitle')} />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-3 px-4 py-4">
        {!dag || dag.nodes.length <= 1 ? (
          <EmptyState icon={<Network />} title={t('output.qgNothing')} body={t('output.qgNothingBody')} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="cyan">{t('output.qgThisQuest')}</Badge>
              {LEGEND.filter(([kind]) => dag.nodes.some((n) => n.id !== focus && n.source === kind)).map(([kind, tone]) => (
                <Badge key={kind} tone={tone}>{t(KIND_KEY[kind])}</Badge>
              ))}
            </div>
            <Graph dag={dag} focus={focus} onOpen={open} />
            <p className="text-[13px] text-dim">{t('output.qgHint')}</p>
          </>
        )}
      </main>
    </div>
  )
}

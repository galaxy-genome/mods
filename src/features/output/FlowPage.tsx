import { AlertTriangle, ArrowDown, GitBranch, List, Maximize2, Minus, Network, Plus } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Page } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { QuestOverviewMap } from '@/features/map/QuestMaps'
import { useListParam, useSelectionNav } from '@/components/pickers/common'
import { Segmented } from '@/components/ui/inputs'
import { Badge, Card, EmptyState, RowGroup, SectionLabel } from '@/components/ui/surfaces'
import { describeCondition } from '@/lib/conditions'
import { newLine, uid } from '@/lib/factory'
import { gameQuest } from '@/lib/reference'
import { fallThroughs, MAX_CHOICES, stepGraph } from '@/lib/rules'
import type { QuestContent, QuestView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { questOf, updateQuest, useEditor, usePart } from '@/store/editor'
import { t, useT } from '@/i18n'
import { type Cubic, placeLabels } from './flowLabels'

const NODE_W = 190
const NODE_H = 64
const ROW = 118
const LANE_X = 36
const LEFT = 56
const TOP = 20

type Edge = ReturnType<typeof stepGraph>['edges'][number]

/** Lanes indent branches: a step reached only by a jump opens the next lane; a step many paths reach returns to lane 0. */
function lanes(q: QuestContent, edges: Edge[]) {
  const out: number[] = []
  q.steps.forEach((_, i) => {
    const incoming = edges.filter((e) => e.to === i)
    if (i === 0 || new Set(incoming.map((e) => e.from)).size > 1) out.push(0)
    else if (incoming.some((e) => e.kind === 'next' && e.from === i - 1)) out.push(out[i - 1])
    else out.push(Math.min(2, out[i - 1] + 1))
  })
  return out
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function addJumpChoice(modId: string, from: number, to: number) {
  updateQuest(modId, (q) => {
    const step = q.steps[from]
    const target = q.steps[to]
    let line = step.dialogue[step.dialogue.length - 1]
    if (!line || line.choices.length >= MAX_CHOICES) {
      line = newLine({ speaker: q.settings.charName, portrait: q.settings.charImage, text: '' })
      step.dialogue.push(line)
    }
    line.choices.push({ id: uid('ch'), text: t('output.goToStep', { name: target.name || t('output.stepLower', { n: to + 1 }) }).replace(/[;=]/g, ''), targetStepId: target.id })
  })
  toast.success(t('output.flChoiceAdded'), { description: t('output.flChoiceAddedHint') })
}

function Graph({ q, selected, onSelect, onOpen }: { q: QuestContent; selected: number | null; onSelect: (i: number) => void; onOpen: (i: number) => void }) {
  const { edges, reachable } = stepGraph(q.steps)
  const lane = lanes(q, edges)
  const falls = new Set(fallThroughs(edges).map((e) => `${e.from}-${e.to}`))
  const width = LEFT + LANE_X * 2 + NODE_W + 90
  const height = TOP * 2 + (q.steps.length - 1) * ROW + NODE_H

  const [view, setView] = React.useState({ k: 1, x: 0, y: 0 })
  const box = React.useRef<HTMLDivElement>(null)
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const moved = React.useRef(0)
  const pinch = React.useRef<number | null>(null)

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * factor)) }))
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = 0
    pinch.current = null
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinch.current) zoom(d / pinch.current)
      pinch.current = d
      moved.current += 10
      return
    }
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    moved.current += Math.abs(dx) + Math.abs(dy)
    if (moved.current > 6) {
      if (!box.current?.hasPointerCapture(e.pointerId)) box.current?.setPointerCapture(e.pointerId)
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const nx = (i: number) => LEFT + lane[i] * LANE_X
  const ny = (i: number) => TOP + i * ROW

  // Keep the selected node in view.
  React.useEffect(() => {
    const H = box.current?.clientHeight
    if (selected === null || !H) return
    setView((v) => {
      const top = v.y + ny(selected) * v.k
      return top >= 0 && top + NODE_H * v.k <= H ? v : { ...v, y: H / 2 - (ny(selected) + NODE_H / 2) * v.k }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const choiceEdges = edges.filter((e) => e.kind === 'choice')
  const choices = choiceEdges.map((e) => {
    const back = e.to <= e.from
    const bulge = 28 + choiceEdges.filter((x) => (x.to <= x.from) === back).indexOf(e) * 14
    const x1 = back ? nx(e.from) : nx(e.from) + NODE_W
    const x2 = back ? nx(e.to) : nx(e.to) + NODE_W
    const y1 = ny(e.from) + NODE_H / 2 + (back ? -8 : 8)
    const y2 = ny(e.to) + NODE_H / 2 + (back ? 8 : -8)
    const cx = back ? Math.min(x1, x2) - bulge : Math.max(x1, x2) + bulge
    const text = `${back ? '↻ ' : ''}${clip(e.label || t('output.flChoice'), 18)}`
    return { back, text, curve: [x1, y1, cx, y1, cx, y2, x2, y2] as Cubic }
  })
  // Monospace at 10px is 6px a character.
  const labelAt = placeLabels(q.steps.map((_, i) => ({ x: nx(i), y: ny(i), w: NODE_W, h: NODE_H })), choices.map((c) => ({ curve: c.curve, w: c.text.length * 6 + 8, h: 15, side: c.back ? -1 : 1 })))
  return (
    <div className="relative">
      <div
        ref={box}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="grid-texture relative h-[62dvh] min-h-[360px] touch-none overflow-hidden rounded-[4px] border border-edge bg-deep"
      >
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={t('output.flGraph')}
          style={{ overflow: 'visible', marginLeft: -width / 2, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: 'top center' }}
          className="absolute left-1/2 top-0 select-none"
        >
          <defs>
            {[['next', 'var(--color-grid-strong)'], ['choice', 'var(--color-cyan)'], ['problem', 'var(--color-amber)']].map(([id, c]) => (
              <marker key={id} id={`arrow-${id}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill={c} />
              </marker>
            ))}
          </defs>

          {edges.filter((e) => e.kind === 'next').map((e) => {
            const problem = falls.has(`${e.from}-${e.to}`)
            const x1 = nx(e.from) + NODE_W / 2
            const x2 = nx(e.to) + NODE_W / 2
            const y1 = ny(e.from) + NODE_H
            const y2 = ny(e.to) - 2
            const mid = (y1 + y2) / 2
            return (
              <path
                key={`n${e.from}`}
                d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                fill="none"
                stroke={problem ? 'var(--color-amber)' : 'var(--color-grid-strong)'}
                strokeWidth={1.5}
                strokeDasharray={problem ? '5 4' : undefined}
                markerEnd={`url(#arrow-${problem ? 'problem' : 'next'})`}
              />
            )
          })}

          {choices.map(({ curve: [x1, y1, cx, , , y2, x2] }, i) => (
            <path key={`c${i}`} d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`} fill="none" stroke="var(--color-cyan)" strokeWidth={1.5} markerEnd="url(#arrow-choice)" />
          ))}

          {q.steps.map((s, i) => {
            const unreachable = i > 0 && !reachable.has(i)
            return (
              <g
                key={s.id}
                role="link"
                tabIndex={0}
                aria-label={t(unreachable ? 'output.flNodeUnreachable' : 'output.flNodeLabel', { n: i + 1, name: s.name || t('output.untitled') })}
                transform={`translate(${nx(i)},${ny(i)})`}
                aria-current={selected === i || undefined}
                onClick={() => { if (moved.current <= 6) (selected === i ? onOpen : onSelect)(i) }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-white"
                opacity={unreachable ? 0.45 : 1}
              >
                <rect width={NODE_W} height={NODE_H} rx={4} fill="var(--color-panel)" stroke={selected === i ? 'var(--color-cyan)' : unreachable ? 'var(--color-dim)' : 'var(--color-edge)'} strokeWidth={selected === i ? 2 : 1} strokeDasharray={unreachable && selected !== i ? '5 4' : undefined} />
                <text x={12} y={24} fontSize={13} className="fill-white">
                  <tspan className="fill-dim font-mono">{i + 1}</tspan>
                  <tspan dx={8} fontWeight={600}>{clip(s.name || t('output.untitled'), s.checkpoint ? 16 : 22)}</tspan>
                </text>
                <text x={12} y={46} fontSize={11} className="fill-ink">{clip(describeCondition(s.finishWhen), 32)}</text>
                {s.checkpoint && (
                  <g transform={`translate(${NODE_W - 30},10)`}>
                    <rect width={20} height={18} rx={2} fill="none" stroke="var(--color-success)" />
                    <path d="M6 14 V4 L14 7 L6 10" fill="none" stroke="var(--color-success)" strokeWidth={1.3} />
                  </g>
                )}
              </g>
            )
          })}
          {choices.map(({ text }, i) => (
            <g key={`l${i}`} pointerEvents="none">
              <rect x={labelAt[i].x} y={labelAt[i].y} width={labelAt[i].w} height={labelAt[i].h} rx={2} fill="var(--color-deep)" fillOpacity={0.9} />
              <text x={labelAt[i].x + labelAt[i].w / 2} y={labelAt[i].y + 11} textAnchor="middle" className="fill-cyan font-mono" fontSize={10}>{text}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flZoomIn')} onClick={() => zoom(1.2)}><Plus className="size-4" /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flZoomOut')} onClick={() => zoom(1 / 1.2)}><Minus className="size-4" /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={t('output.flReset')} onClick={() => setView({ k: 1, x: 0, y: 0 })}><Maximize2 className="size-4" /></Button>
      </div>
    </div>
  )
}

function StepList({ q, modId }: { q: QuestContent; modId: string }) {
  const navigate = useNavigate()
  const { edges, reachable } = stepGraph(q.steps)
  return (
    <RowGroup>
      {q.steps.map((s, i) => {
        const out = edges.filter((e) => e.from === i)
        return (
          <button key={s.id} type="button" onClick={() => navigate(`/mod/${modId}/steps/${s.id}`)} className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-white/[0.03]">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-dim">{i + 1}</span>
              <span className="text-[15px] text-white">{s.name || t('output.untitled')}</span>
              {s.checkpoint && <Badge tone="success">{t('output.checkpoint')}</Badge>}
              {i > 0 && !reachable.has(i) && <Badge tone="amber">{t('output.flNothingLeads')}</Badge>}
            </span>
            {out.length === 0 && <span className="pl-5 text-[13px] text-dim">{t('output.flQuestEnds')}</span>}
            {out.map((e, k) => (
              <span key={k} className="flex items-center gap-1.5 pl-5 text-[13px] text-ink">
                {e.kind === 'next' ? <ArrowDown className="size-3.5 text-grid-strong" /> : <GitBranch className="size-3.5 text-cyan" />}
                {t(e.kind === 'choice' ? 'output.flGoesTo' : 'output.flThen', { label: e.label ?? '', n: e.to + 1, name: q.steps[e.to].name || t('output.untitled') })}
              </span>
            ))}
          </button>
        )
      })}
    </RowGroup>
  )
}

function DependsOn({ mod }: { mod: QuestView }) {
  const parts = useEditor((s) => s.parts)
  const q = questOf(mod)!
  const nameOf = (id: number) => {
    if (id === 0) return t('output.flMainStory')
    const local = parts.find((m) => m.meta.type === 'quest' && questOf(m)?.settings.questId === id)
    return gameQuest(id)?.name ?? (local ? local.meta.title : t('output.flUnknownQuest', { id }))
  }
  const dependents = parts.filter((m) => m.meta.id !== mod.meta.id && questOf(m)?.settings.requiredQuestIds.includes(q.settings.questId))
  const Node = ({ children, tone }: { children: React.ReactNode; tone?: 'cyan' }) => (
    <Card tone={tone} className="px-3 py-2.5 text-[14px] text-white">{children}</Card>
  )
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>{t('output.flRequires')}</SectionLabel>
      {q.settings.requiredQuestIds.length === 0 ? <p className="text-[13px] text-dim">{t('output.flNoRequired')}</p> : (
        <div className="flex flex-col gap-2">{q.settings.requiredQuestIds.map((id) => <Node key={id}>{nameOf(id)} <span className="font-mono text-[12px] text-dim">{id || ''}</span></Node>)}</div>
      )}
      <ArrowDown className="mx-auto size-4 text-grid-strong" />
      <Node tone="cyan">{q.settings.questName || mod.meta.title} <span className="font-mono text-[12px] text-dim">{q.settings.questId}</span></Node>
      <ArrowDown className="mx-auto size-4 text-grid-strong" />
      <SectionLabel>{t('output.flRequiredBy')}</SectionLabel>
      {dependents.length === 0 ? <p className="text-[13px] text-dim">{t('output.flNoDependents')}</p> : (
        <div className="flex flex-col gap-2">{dependents.map((m) => <Node key={m.meta.id}>{m.meta.title}</Node>)}</div>
      )}
    </div>
  )
}

export function FlowPage() {
  const { modId = '' } = useParams()
  const navigate = useNavigate()
  useT()
  const mod = usePart(modId) as QuestView | undefined
  const q = questOf(mod)
  const [params, setParams] = useSearchParams()
  const tab = (['map', 'deps'].includes(params.get('view') ?? '') ? params.get('view') : 'flow') as 'flow' | 'map' | 'deps'
  const setTab = (v: 'flow' | 'map' | 'deps') => setParams((p) => { if (v === 'flow') p.delete('view'); else p.set('view', v); return p }, { replace: true })
  const [asList, setAsList] = React.useState(false)
  const count = q?.steps.length ?? 0
  const [selected, select] = useListParam('step', count)
  const open = (i: number) => q && navigate(`/mod/${modId}/steps/${q.steps[i].id}`)
  useSelectionNav(tab === 'deps' ? 0 : count, selected, select, open)
  if (!mod || !q) return null

  const { edges } = stepGraph(q.steps)
  const falls = fallThroughs(edges)

  return (
    <Page>
      <Segmented ariaLabel={t('output.flView')} value={tab} onChange={setTab} options={[{ value: 'flow', label: t('output.flFlow') }, { value: 'map', label: t('output.flMap') }, { value: 'deps', label: t('output.flDepends') }]} />
      {tab === 'deps' ? <DependsOn mod={mod} /> : q.steps.length === 0 ? (
        <EmptyState icon={<Network />} title={t('output.flNoSteps')} body={t('output.flNoStepsBody')} />
      ) : tab === 'map' ? <QuestOverviewMap q={q} modId={modId} selected={selected} onSelect={select} /> : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge icon={<span className="block h-px w-3 bg-grid-strong" />}>{t('output.flNext')}</Badge>
            <Badge tone="cyan" icon={<GitBranch />}>{t('output.flChoice')}</Badge>
            <Badge tone="amber" icon={<span className="block w-3 border-t border-dashed border-amber" />}>{t('output.flProblem')}</Badge>
            <Badge tone="success">{t('output.checkpoint')}</Badge>
            <Button variant="ghost" size="sm" className="ml-auto" aria-pressed={asList} onClick={() => setAsList(!asList)}>
              {asList ? <Network className="size-4" /> : <List className="size-4" />}{t(asList ? 'output.flAsGraph' : 'output.flAsList')}
            </Button>
          </div>
          {asList ? (
            <>
              <SectionLabel>{t('output.flListTitle')}</SectionLabel>
              <StepList q={q} modId={modId} />
            </>
          ) : (
            <Graph q={q} selected={selected} onSelect={select} onOpen={open} />
          )}
          {falls.map((e) => (
            <Card key={`${e.from}-${e.to}`} tone="amber" className={cn('flex flex-col gap-2 p-3')}>
              <p className="flex items-start gap-2 text-[14px] text-white">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />
                {t('output.flFallThrough', { from: q.steps[e.from].name, to: q.steps[e.to].name })}
              </p>
              <Button variant="warning" size="sm" className="self-start" onClick={() => addJumpChoice(modId, e.from, e.to)}>
                {t('output.flFix', { to: q.steps[e.to].name })}
              </Button>
            </Card>
          ))}
        </>
      )}
    </Page>
  )
}

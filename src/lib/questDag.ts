import dagre from '@dagrejs/dagre'

/** The requirement id that stands for the main story rather than a quest. */
export const MAIN_STORY = 0

/** Which list a node came from, which is all the graph colours it. */
export type QuestSource = 'game' | 'story' | 'mine' | 'favorite' | 'unknown'

export interface DagInput {
  id: number
  label: string
  source: QuestSource
  requires: number[]
}

export interface DagNode extends DagInput {
  x: number
  y: number
  /** Rows from the top, counting from 0. */
  rank: number
  /** Position within the row, left to right, counting from 0. */
  order: number
}

export interface DagEdge { from: number; to: number }

export interface Dag {
  nodes: DagNode[]
  edges: DagEdge[]
  width: number
  height: number
}

export interface DagSize { nodeW: number; nodeH: number; rankSep: number; nodeSep: number }

export const DAG_SIZE: DagSize = { nodeW: 190, nodeH: 64, rankSep: 54, nodeSep: 24 }

/**
 * The requirements the game actually checks, from QuestSettings.isReqQuestsCompleted
 * (decompiled-all/scripts/system/mods/QuestSettings.as:159-184). The loop breaks on requirement 0, so a list
 * holding 0 is a main story requirement and nothing else; every other list is an AND of all its ids.
 */
export function requirementEdges(requires: number[]): number[] {
  if (requires.includes(MAIN_STORY)) return [MAIN_STORY]
  return [...new Set(requires)]
}

/** True when a list names the main story alongside quests the game will never reach. */
export const mixesMainStory = (requires: number[]) => requires.includes(MAIN_STORY) && requires.some((id) => id !== MAIN_STORY)

/**
 * Lays the quests out as a requirement graph, each quest below everything it requires. `focus` keeps only that
 * quest and the quests it transitively requires, with the focus as the single sink. A requirement naming nothing
 * in `quests` becomes an `unknown` node, so a missing quest shows as a gap in the graph rather than no edge.
 */
export function questDag(quests: DagInput[], focus?: number, size: DagSize = DAG_SIZE): Dag {
  const byId = new Map(quests.map((q) => [q.id, q]))
  const need = (q: DagInput) => requirementEdges(q.requires)

  let kept = quests
  if (focus !== undefined) {
    const seen = new Set<number>()
    const walk = (id: number) => {
      if (seen.has(id)) return
      seen.add(id)
      for (const r of need(byId.get(id) ?? { id, label: '', source: 'unknown', requires: [] })) walk(r)
    }
    walk(focus)
    kept = quests.filter((q) => seen.has(q.id))
    if (!byId.has(focus)) kept = []
  }

  const nodes = new Map<number, DagInput>(kept.map((q) => [q.id, q]))
  const edges: DagEdge[] = []
  for (const q of kept) {
    for (const r of need(q)) {
      if (!nodes.has(r)) nodes.set(r, { id: r, label: '', source: r === MAIN_STORY ? 'story' : 'unknown', requires: [] })
      edges.push({ from: r, to: q.id })
    }
  }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: size.rankSep, nodesep: size.nodeSep, marginx: 12, marginy: 12 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const id of nodes.keys()) g.setNode(String(id), { width: size.nodeW, height: size.nodeH })
  for (const e of edges) g.setEdge(String(e.from), String(e.to))
  dagre.layout(g)

  // dagre reports a node's centre; the renderers draw from the top left corner.
  const placed = [...nodes.values()].map((q) => {
    const p = g.node(String(q.id))
    return { ...q, x: p.x - size.nodeW / 2, y: p.y - size.nodeH / 2 }
  })
  const rows = [...new Set(placed.map((p) => p.y))].sort((a, b) => a - b)
  const out: DagNode[] = placed
    .map((p) => ({ ...p, rank: rows.indexOf(p.y), order: 0 }))
    .sort((a, b) => a.rank - b.rank || a.x - b.x)
  let rank = -1
  let order = 0
  for (const n of out) {
    if (n.rank !== rank) { rank = n.rank; order = 0 }
    n.order = order++
  }
  const { width, height } = g.graph()
  return { nodes: out, edges, width: width ?? 0, height: height ?? 0 }
}

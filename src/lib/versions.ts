import type { DialogLine, Kept, QuestContent } from './types'

/**
 * Matches an item of the primary's list to the same item in a version. Ids decide; a version whose list shares no
 * id with the primary but has the same length (separately imported files) matches by position instead.
 */
function matcher<T extends { id: string }>(primary: T[], other: T[] | undefined) {
  const list = other ?? []
  const byId = new Map(list.map((x) => [x.id, x]))
  const byPosition = list.length === primary.length && !primary.some((x) => byId.has(x.id))
  return (item: T, i: number): T | undefined => (byPosition ? list[i] : byId.get(item.id))
}

/** A version's objects keep their own file layout, unmodelled keys and kept values (§23), not the primary's. */
function own(target: Kept, source: Kept | undefined) {
  for (const k of ['_extra', '_layout', '_kept'] as const) {
    if (source?.[k]) (target as Record<string, unknown>)[k] = source[k]
    else delete target[k]
  }
}

/**
 * A language version rebuilt on the primary's structure: every step, line, choice, ship and rumor comes from the
 * primary, and only the version's own text is kept. Objects the version lacks get empty text.
 */
export function syncVersion(primary: QuestContent, other: QuestContent): QuestContent {
  const out = structuredClone(primary)
  out.settings.lang = other.settings.lang
  out.settings.questName = other.settings.questName ?? ''
  out.settings.description = other.settings.description ?? ''
  out.settings.charName = other.settings.charName ?? ''
  own(out, other)
  own(out.settings, other.settings)

  const lines = (mine: DialogLine[], theirs: DialogLine[] | undefined) => {
    const line = matcher(mine, theirs)
    mine.forEach((l, i) => {
      const o = line(l, i)
      own(l, o)
      l.speaker = o?.speaker ?? ''
      l.text = o?.text ?? ''
      const choice = matcher(l.choices, o?.choices)
      l.choices.forEach((c, ci) => { c.text = choice(c, ci)?.text ?? '' })
    })
  }

  const step = matcher(out.steps, other.steps)
  out.steps.forEach((s, i) => {
    const o = step(s, i)
    own(s, o)
    const ship = matcher(s.ships, o?.ships)
    s.ships.forEach((x, si) => own(x, ship(x, si)))
    const order = matcher(s.orders, o?.orders)
    s.orders.forEach((x, oi) => own(x, order(x, oi)))
    if (s.mission) own(s.mission, o?.mission ?? undefined)
    s.name = o?.name ?? ''
    s.journal = o?.journal ?? ''
    lines(s.dialogue, o?.dialogue)
    lines(s.reminder, o?.reminder)
    if (s.mission) s.mission.targetShipName = o?.mission?.targetShipName ?? ''
  })

  const rumor = matcher(out.rumors, other.rumors)
  out.rumors.forEach((r, i) => { const o = rumor(r, i); own(r, o); r.text = o?.text ?? '' })
  return out
}

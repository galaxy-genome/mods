import * as React from 'react'
import { StarMap } from '@/features/map/StarMap'
import { useProblems } from '@/hooks/use-problems'
import { uid } from '@/lib/factory'
import type { StarsView } from '@/lib/types'
import { useEditor, updateStars } from '@/store/editor'
import { useT } from '@/i18n'
import { useStarsView } from './common'

const MAP_RULE = /^(soutside|soverlap|shides|sname-exists)-/

function fit(mod: StarsView) {
  if (!mod.stars.length) return undefined
  const xs = mod.stars.map((s) => s.x), ys = mod.stars.map((s) => s.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, ly: Math.max(75, (x1 - x0) * 1.6, (y1 - y0) * 1.6) }
}

export function StarsMapPage() {
  const t = useT()
  const { modId, mod, go } = useStarsView()
  const parts = useEditor((s) => s.parts)
  const { list } = useProblems(modId)
  const [focus] = React.useState(() => (mod ? fit(mod) : undefined))
  const otherStars = React.useMemo(() => parts.filter((m): m is StarsView => m.meta.type === 'stars' && m.meta.favorite && m.meta.id !== modId).flatMap((m) => m.stars), [parts, modId])
  const problems = React.useMemo(() => list.filter((p) => MAP_RULE.test(p.id)).map((p) => ({ id: p.id, severity: p.severity, starId: p.location.path.slice('stars/'.length) })), [list])
  if (!mod) return null
  const readOnly = mod.meta.origin === 'game'

  const add = (x: number, y: number) => {
    const names = new Set(mod.stars.map((s) => s.name))
    let n = 1
    while (names.has(t('map.newStar', { n }))) n++
    const id = uid('star')
    updateStars(modId, (m) => { m.stars.push({ id, name: t('map.newStar', { n }), x, y, z: 0, security: 'Anarchy', type: 'M-RedDwarf' }) })
    go(`stars/${id}`)
  }

  return (
    <div className="flex flex-col">
      <StarMap
        className="h-[calc(100dvh-56px-68px-env(safe-area-inset-bottom)-64px)] min-h-[320px] border-b border-edge lg:h-[calc(100dvh-56px-80px)]"
        mode="edit"
        stars={mod.stars}
        otherStars={otherStars}
        focus={focus}
        problems={problems}
        readOnly={readOnly}
        onAdd={add}
        onOpen={(id) => go(`stars/${id}`)}
        onMove={(id, x, y) => updateStars(modId, (m) => { const s = m.stars.find((i) => i.id === id); if (s) { s.x = x; s.y = y } })}
        onProblem={(id) => {
          const p = list.find((i) => i.id === id)
          if (p) go(`${p.location.path}?${new URLSearchParams({ sev: p.severity, field: p.location.field ?? '' })}`)
        }}
      />
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="flex-1 text-[13px] text-dim">{readOnly ? t('stars.mapSummary', { stars: mod.stars.length, planets: mod.planets.length, stations: mod.stations.length }) : t('map.editHint')}</p>
      </div>
    </div>
  )
}

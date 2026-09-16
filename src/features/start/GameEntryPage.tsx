import * as React from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { parseCommunityPath } from '@/lib/community'
import { viewId } from '@/lib/mods'
import type { Mod } from '@/lib/types'
import { openGameQuest, useEditor } from '@/store/editor'

/** `/built-in/<n>/[part/]<in-mod path>` (quest 100000 + n) opens one of the game's own quests read-only; without the local data file it goes to the Library. */
export function GameEntryPage() {
  const { questId: token = '', '*': rest = '' } = useParams()
  const questId = Number(token) < 100000 ? String(Number(token) + 100000) : token
  const { search, hash } = useLocation()
  // Boot replaces the whole store when it finishes, so the quest opens after it.
  const loading = useEditor((s) => s.loading)
  const [mod, setMod] = React.useState<Mod | null | undefined>()
  React.useEffect(() => { if (!loading) void openGameQuest(questId).then(setMod) }, [loading, questId])

  if (mod === undefined) return null
  if (!mod) return <Navigate to="/library?tab=game" replace />
  const { partId, path } = parseCommunityPath(mod, rest)
  if (!partId) return <Navigate to="/library?tab=game" replace />
  return <Navigate to={`/mod/${viewId(mod.meta.id, partId)}/${path || 'overview'}${search}${hash}`} replace />
}

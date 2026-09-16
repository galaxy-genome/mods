import * as React from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { communityEntry, parseCommunityPath } from '@/lib/community'
import { viewId } from '@/lib/mods'
import { addCommunityEntry, useEditor } from '@/store/editor'

/**
 * Links to a library entry open that mod on this device: `/community/<entry>` its contents, and
 * `/community/<entry>/[part/]<in-mod path>` any screen of it. The entry is added when it isn't here yet.
 */
export function CommunityEntryPage() {
  const { entryId, '*': rest } = useParams()
  const { search, hash } = useLocation()
  // Boot replaces the whole mod list when it finishes, so nothing added or read before then survives.
  const loading = useEditor((s) => s.loading)
  const mod = useEditor((s) => {
    const copies = s.mods.filter((b) => b.meta.community?.entryId === entryId)
    const current = communityEntry(entryId ?? '')
    return copies.find((b) => !b.meta.modified && b.meta.version === current?.version) ?? (current ? undefined : copies[0])
  })
  React.useEffect(() => {
    if (loading || mod || !entryId) return
    void addCommunityEntry(entryId)
  }, [loading, mod, entryId])

  if (loading) return null
  if (!mod) return communityEntry(entryId ?? '') ? null : <Navigate to="/library" replace />

  const contents = <Navigate to={`/mod/${mod.meta.id}`} state={{ contents: true }} replace />
  if (!rest) return contents
  const { partId, path } = parseCommunityPath(mod, rest)
  if (!partId || !path) return contents
  return <Navigate to={`/mod/${viewId(mod.meta.id, partId)}/${path}${search}${hash}`} replace />
}

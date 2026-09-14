import { Navigate, useParams } from 'react-router-dom'
import { useEditor } from '@/store/editor'

/** Old links to a community entry open that mod's contents, or the library when it isn't on this device. */
export function CommunityEntryPage() {
  const { entryId } = useParams()
  const mod = useEditor((s) => {
    const copies = s.mods.filter((b) => b.meta.community?.entryId === entryId)
    return copies.find((b) => !b.meta.modified) ?? copies[0]
  })
  return mod ? <Navigate to={`/mod/${mod.meta.id}`} state={{ contents: true }} replace /> : <Navigate to="/library" replace />
}

import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/surfaces'
import { useT } from '@/i18n'
import { communityEntry } from '@/lib/community'
import type { Mod } from '@/lib/types'
import { addCommunityEntry, hasUnmodifiedCopy, useEditor } from '@/store/editor'

/** Where a community mod came from; once edited, a Modified badge and a way to add the original again. */
export function CommunityBanner({ mod }: { mod: Mod }) {
  const t = useT()
  const community = mod.meta.community
  const hasOriginal = useEditor(() => !!community && hasUnmodifiedCopy(community.entryId))
  if (!community) return null
  const vars = { entry: community.entryTitle, version: communityEntry(community.entryId)?.version ?? mod.meta.version }
  if (!mod.meta.modified) {
    return (
      <p className="flex items-center gap-2 text-[13px] leading-snug text-dim">
        <Users className="size-4 shrink-0 text-cyan" />
        {community.author !== 'Unknown' ? t('start.fromLibraryBy', { ...vars, author: community.author }) : t('start.fromLibrary', vars)}
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[4px] border border-amber/60 bg-amber/10 py-2 pl-3 pr-2">
      <Badge tone="amber">{t('start.modified')}</Badge>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{t('start.changedFrom', vars)}</p>
      {!hasOriginal && (
        <button onClick={() => addCommunityEntry(community.entryId)} className="h-9 shrink-0 rounded-[2px] border border-cyan px-3 text-[13px] font-semibold text-cyan hover:bg-cyan/10">{t('start.addOriginal')}</button>
      )}
    </div>
  )
}

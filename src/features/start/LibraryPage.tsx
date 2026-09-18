import { BookOpen, Check, Library, Orbit, Plus, SearchX, Users } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { SearchInput, Segmented } from '@/components/ui/inputs'
import { Badge, EmptyState, ListRow, RowGroup, TipCard } from '@/components/ui/surfaces'
import { COMMUNITY, entryMod } from '@/lib/community'
import { partsOf } from '@/lib/mods'
import { chainSummary } from '@/lib/questChain'
import type { QuestView } from '@/lib/types'
import { GAME_QUESTS, gameQuest, type GameQuest } from '@/lib/reference'
import { addCommunityEntry, isEntryAdded, removeCommunityEntry, setFavorite, useEditor } from '@/store/editor'
import { t, useT } from '@/i18n'
import { OfflineChip } from './common'

/** "After Pathfinder, Trap" from the requirement string of IDs. */
export function requirementText(q: GameQuest) {
  const ids = q.requires.split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number)
  if (!ids.length) return ''
  return t('startLib.after', { list: ids.map((id) => (id === 0 ? t('startLib.mainStory') : gameQuest(id)?.name ?? t('startLib.questN', { id }))).join(', ') })
}

export function LibraryPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const gameQuests = useEditor((s) => s.gameQuests)
  const tab = gameQuests && params.get('tab') === 'game' ? 'game' : 'community'
  const [query, setQuery] = React.useState('')
  return (
    <div className="min-h-dvh bg-void">
      <AppBar back="/" title={t('startLib.title')} subtitle={tab === 'game' ? t('startLib.gameSubtitle', { count: GAME_QUESTS.length }) : t('startLib.communitySubtitle', { count: COMMUNITY.length })}><OfflineChip /></AppBar>
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-4 pb-10">
        {gameQuests && (
        <Segmented
            ariaLabel={t('startLib.tabs')}
            value={tab}
            onChange={(v) => setParams(v === 'game' ? { tab: 'game' } : {}, { replace: true })}
            options={[{ value: 'community', label: <span className="flex items-center gap-1.5"><Users className="size-4" />{t('startLib.community')}</span> }, { value: 'game', label: <span className="flex items-center gap-1.5"><BookOpen className="size-4" />{t('startLib.gameQuests')}</span> }]}
          />
        )}
        <SearchInput value={query} onChange={setQuery} placeholder={tab === 'game' ? t('startLib.searchGame') : t('startLib.searchCommunity')} />
        {tab === 'game' ? <GameQuests query={query} /> : <CommunityList query={query} />}
      </main>
    </div>
  )
}

function CommunityList({ query }: { query: string }) {
  const t = useT()
  const navigate = useNavigate()
  const mods = useEditor((s) => s.mods)
  const chains = React.useMemo(() => new Map(COMMUNITY.map((e) => [e.id, chainSummary(partsOf(entryMod(e)).filter((v) => v.meta.type === 'quest') as QuestView[])])), [])
  const q = query.trim().toLowerCase()
  const shown = COMMUNITY.filter((e) => !q || [e.title, e.author, e.summary, ...e.tags].some((x) => x.toLowerCase().includes(q)))
  return (
    <>
      <TipCard tipKey="community-library">{t('startLib.communityTip')}</TipCard>
      {shown.length === 0 ? (
        <EmptyState icon={<SearchX />} title={t('startLib.noModsMatch')} body={q ? t('startLib.nothingMatches', { query }) : t('startLib.libraryEmpty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((e, i) => {
            const copies = mods.filter((b) => b.meta.community?.entryId === e.id)
            const mod = copies.find((b) => !b.meta.modified)
            const modified = copies.find((b) => b.meta.modified)
            const added = !!mod
            const fav = !!mod?.meta.favorite
            const quests = e.files.filter((f) => f.name !== 'StarsStations.json').length
            return (
              <li key={e.id} className="flex flex-col gap-2 rounded-[4px] border border-edge bg-panel p-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[2px] border border-edge font-mono text-[13px] text-cyan">#{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-semibold text-white">{e.title}</span>
                      {e.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                    </span>
                    <span className="text-[13px] leading-snug text-ink/85">{e.summary}</span>
                    {chains.get(e.id) && <span className="text-[13px] text-ink">{chains.get(e.id)}</span>}
                    {!!e.requires?.length && <span className="text-[13px] text-amber">{t('startLib.requiresList', { mods: e.requires.map((r) => (r.version ? `${r.title} v${r.version}` : r.title)).join(', ') })}</span>}
                    <span className="font-mono text-[12px] text-dim">{[quests && t('startLib.questFiles', { count: e.files.length }), e.files.some((f) => f.name === 'StarsStations.json') && t('startLib.starsStations'), e.textures?.length && t('startLib.textures', { count: e.textures.length })].filter(Boolean).join(' · ')} · {e.author} · {t('startLib.licence', { licence: e.licence })}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-12">
                  {added ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/mod/${mod!.meta.id}`)}><Library className="size-4" />{t('startLib.open')}</Button>
                      <Button size="sm" variant={fav ? 'warning' : 'ghost'} onClick={() => setFavorite([mod!.meta.id], !fav)}>{fav ? t('startLib.favorited') : t('startLib.favorite')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeCommunityEntry(e.id)}><Check className="size-4 text-success" />{t('startLib.onHomeRemove')}</Button>
                    </>
                  ) : modified ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/mod/${modified.meta.id}`)}><Library className="size-4" />{t('startLib.modifiedOnHome')}</Button>
                      <Button size="sm" variant="primary" onClick={() => addCommunityEntry(e.id)}><Plus className="size-4" />{t('startLib.addOriginal')}</Button>
                    </>
                  ) : (
                    <>
                      {e.requires?.some((r) => r.entryId && !isEntryAdded(r.entryId))
                        ? <Button size="sm" variant="primary" onClick={async () => { for (const r of e.requires!) if (r.entryId && !isEntryAdded(r.entryId)) await addCommunityEntry(r.entryId); await addCommunityEntry(e.id) }}><Plus className="size-4" />{t('startLib.addWithRequired')}</Button>
                        : <Button size="sm" variant="primary" onClick={() => addCommunityEntry(e.id)}><Plus className="size-4" />{t('startLib.addToHome')}</Button>}
                      <Button size="sm" variant="ghost" onClick={async () => { for (const r of e.requires ?? []) if (r.entryId && !isEntryAdded(r.entryId)) await addCommunityEntry(r.entryId); await addCommunityEntry(e.id, true) }}>{t('startLib.addAndFavorite')}</Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function GameQuests({ query }: { query: string }) {
  const t = useT()
  const navigate = useNavigate()
  const q = query.trim().toLowerCase()
  const shown = GAME_QUESTS.filter((g) => !q || [g.name, g.charName, g.station, String(g.id)].some((x) => x.toLowerCase().includes(q)))
  return (
    <>
      <TipCard tipKey="library">{t('startLib.gameTip')}</TipCard>
      {shown.length === 0 ? (
        <EmptyState icon={<SearchX />} title={t('startLib.noQuestsMatch')} body={t('startLib.nothingMatchesGame', { query })} />
      ) : (
        <RowGroup>
          {shown.map((g) => {
            const req = requirementText(g)
            return (
              <ListRow
                nav={`quest:${g.id}`}
                key={g.id}
                icon={g.randomSpace ? <Orbit /> : <BookOpen />}
                title={g.name}
                subtitle={[g.charName, g.randomSpace ? t('startLib.startsInSpace') : g.station, req].filter(Boolean).join(' · ')}
                value={t('startLib.steps', { count: g.steps.length })}
                onClick={() => navigate(`/library/${g.id}`)}
              />
            )
          })}
        </RowGroup>
      )}
    </>
  )
}

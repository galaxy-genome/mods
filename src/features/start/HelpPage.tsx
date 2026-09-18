import { FileText, SearchX } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useInPanel } from '@/components/layout/panel'
import { AppBar } from '@/components/layout/shell'
import { SearchInput } from '@/components/ui/inputs'
import { EmptyState, ListRow, RowGroup, SectionLabel } from '@/components/ui/surfaces'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { HelpArticleView } from './HelpArticlePage'
import { OfflineChip } from './common'
import { ARTICLES, TERMS, termDefinition, termLabel } from './help-content'
import { searchArticles } from './helpSearch'

/** List scroll and search survive switching articles, which remounts the page. */
let menuScroll = 0
let menuQuery = ''

export function HelpPage() {
  const t = useT()
  const inPanel = useInPanel()
  const wide = useMediaQuery('(min-width: 900px)')
  if (wide) return <HelpArticleView slug={ARTICLES[0]!.slug} />
  return (
    <div className={inPanel ? 'bg-void' : 'min-h-dvh bg-void'}>
      {!inPanel && <AppBar back="/" title={t('startHelp.help')}><OfflineChip /></AppBar>}
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-4 pb-10">
        <HelpMenu />
      </main>
    </div>
  )
}

/** Search and article list. With `active`, it is the sticky side column of the wide layout. */
export function HelpMenu({ active }: { active?: string }) {
  const t = useT()
  const navigate = useNavigate()
  const [query, setQueryState] = React.useState(menuQuery)
  const setQuery = (v: string) => { menuQuery = v; setQueryState(v) }
  const scroller = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => { if (active !== undefined && scroller.current) scroller.current.scrollTop = menuScroll }, [active])
  const q = query.trim().toLowerCase()
  const candidates = ARTICLES.filter((a) => a.slug !== 'older-files' || q || a.slug === active)
  const shown = q ? searchArticles(candidates, q) : candidates.map((article) => ({ article, snippet: undefined }))
  const terms = q ? TERMS.filter((k) => termLabel(k).toLowerCase().includes(q)) : []
  const body = (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder={t('startHelp.searchHelp')} />
      {shown.length === 0 && terms.length === 0 ? (
        <EmptyState icon={<SearchX />} title={t('startHelp.noMatchTitle')} body={t('startHelp.noMatchBody', { query })} />
      ) : (
        <>
          <SectionLabel>{t('startHelp.articles')}</SectionLabel>
          <RowGroup>
            {shown.map(({ article: a, snippet }) => (
              <div key={a.slug} aria-current={a.slug === active ? 'page' : undefined} className={cn(a.slug === active && 'bg-cyan/10 shadow-[inset_2px_0_0_var(--color-cyan)] [&_*]:text-cyan')}>
                <ListRow nav={`article:${a.slug}`} icon={<FileText />} title={a.title} subtitle={snippet} onClick={() => navigate(`/help/${a.slug}`)} />
              </div>
            ))}
            {terms.map((id) => <ListRow nav={`term:${id}`} key={id} muted title={termLabel(id)} subtitle={termDefinition(id)} onClick={() => navigate('/help/glossary')} />)}
          </RowGroup>
        </>
      )}
    </>
  )
  if (active === undefined) return body
  return (
    <nav aria-label={t('startHelp.articles')} className="sticky top-14 h-[calc(100dvh-3.5rem)] w-[300px] shrink-0 border-r border-edge">
      <div ref={scroller} onScroll={(e) => { menuScroll = e.currentTarget.scrollTop }} className="flex h-full flex-col gap-4 overflow-y-auto p-4 [&>*]:shrink-0">
        {body}
      </div>
    </nav>
  )
}

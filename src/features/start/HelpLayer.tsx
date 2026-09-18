import * as React from 'react'
import { type Location, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Panel } from '@/components/layout/panel'
import { useT } from '@/i18n'
import { ARTICLES } from './help-content'
import { HelpArticlePage } from './HelpArticlePage'
import { HelpPage } from './HelpPage'

/** Help as a panel over the page that opened it; each article is its own history entry, so Back walks them. */
export function HelpLayer({ background, fresh }: { background: Location; fresh: boolean }) {
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()
  // The history entries this panel holds: the one that opened it plus each article opened from inside it.
  const stack = React.useRef<string[]>([location.key])
  const keys = stack.current
  if (keys[keys.length - 1] !== location.key) {
    if (keys[keys.length - 2] === location.key) keys.pop()
    else keys.push(location.key)
  }
  const depth = keys.length - 1

  const slug = location.pathname.split('/')[2]
  const article = ARTICLES.find((a) => a.slug === slug)
  const close = () => {
    if (fresh) navigate(background.pathname + background.search, { replace: true })
    else navigate(-(depth + 1))
  }
  return (
    <Panel
      label={t('startHelp.help')}
      title={article?.title ?? t('startHelp.help')}
      onBack={depth > 0 ? () => navigate(-1) : undefined}
      onClose={close}
    >
      <Routes>
        <Route path="/help" element={<HelpPage />} />
        <Route path="/help/:slug" element={<HelpArticlePage />} />
      </Routes>
    </Panel>
  )
}

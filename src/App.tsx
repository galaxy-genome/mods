import * as React from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { CommandLayer } from '@/components/layout/command'
import { ModShell, ScrollRestore } from '@/components/layout/shell'
import { t } from '@/i18n'
import { DialoguePage } from '@/features/steps/DialoguePage'
import { FlowPage } from '@/features/output/FlowPage'
import { JsonPage } from '@/features/output/JsonPage'
import { RumorsPage } from '@/features/output/RumorsPage'
import { AllHistoryPage, HistoryPage } from '@/features/output/HistoryPage'
import { TestPage } from '@/features/output/TestPage'
import { TranslatePage } from '@/features/output/TranslatePage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { MissionPage } from '@/features/ships/MissionPage'
import { OrdersPage } from '@/features/ships/OrdersPage'
import { ShipsPage } from '@/features/ships/ShipsPage'
import { CommunityEntryPage } from '@/features/start/CommunityEntryPage'
import { HelpArticlePage } from '@/features/start/HelpArticlePage'
import { HelpPage } from '@/features/start/HelpPage'
import { HomePage } from '@/features/start/HomePage'
import { ImportReviewPage } from '@/features/start/ImportReviewPage'
import { InstallGuidePage } from '@/features/start/InstallGuidePage'
import { LibraryPage } from '@/features/start/LibraryPage'
import { LibraryQuestPage } from '@/features/start/LibraryQuestPage'
import { QuickSetupPage } from '@/features/start/QuickSetupPage'
import { SettingsPage } from '@/features/start/SettingsPage'
import { PlanetsPage } from '@/features/stars/PlanetsPage'
import { StarsListPage } from '@/features/stars/StarsListPage'
import { StarsMapPage } from '@/features/stars/StarsMapPage'
import { StarsOverviewPage } from '@/features/stars/StarsOverviewPage'
import { StationsPage } from '@/features/stars/StationsPage'
import { MapLayer, MapRoute, mapBackground } from '@/features/map/MapRoute'
import { SeriesMapPage } from '@/features/map/QuestMaps'
import { ReminderPage } from '@/features/steps/ReminderPage'
import { StepEditorPage } from '@/features/steps/StepEditorPage'
import { StepsPage } from '@/features/steps/StepsPage'
import { local, usePart } from '@/store/editor'

function ModOverview() {
  const { modId } = useParams()
  const mod = usePart(modId)
  return mod?.meta.type === 'stars' ? <StarsOverviewPage /> : <OverviewPage />
}

/** Files shared to the installed app arrive here; opening them goes through the Open button. */
function SharedFile() {
  React.useEffect(() => { toast(t('shell.sharedFile')) }, [])
  return <Navigate to="/" replace />
}

/** Remembers the screen in gg.last; the installed app reopens it on launch. */
function RouteMemory() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  React.useEffect(() => {
    const last = local.get<{ path: string; at: number }>('gg.last')
    if (pathname === '/' && last?.path.startsWith('/mod/') && matchMedia('(display-mode: standalone)').matches) navigate(last.path, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  React.useEffect(() => { local.set('gg.last', { path: pathname + search, at: Date.now() }) }, [pathname, search])
  return null
}

/** A map route opened from a page draws over that page, which stays mounted underneath with its sheets. */
function AppRoutes() {
  const location = useLocation()
  const background = mapBackground(location)
  return (
    <>
      <Routes location={background ?? location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<QuickSetupPage />} />
        <Route path="/import" element={<ImportReviewPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:questId" element={<LibraryQuestPage />} />
        <Route path="/community/:entryId" element={<CommunityEntryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<AllHistoryPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/help/:slug" element={<HelpArticlePage />} />
        <Route path="/install" element={<InstallGuidePage />} />
        <Route path="/mod/:modId" element={<ModShell />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ModOverview />} />
          {/* quest */}
          <Route path="steps" element={<StepsPage />} />
          <Route path="steps/:stepId" element={<StepEditorPage />} />
          <Route path="steps/:stepId/dialogue/:lineId?" element={<DialoguePage />} />
          <Route path="steps/:stepId/ships/:shipId?" element={<ShipsPage />} />
          <Route path="steps/:stepId/orders/:orderId?" element={<OrdersPage />} />
          <Route path="steps/:stepId/mission" element={<MissionPage />} />
          <Route path="steps/:stepId/reminder" element={<ReminderPage />} />
          <Route path="flow" element={<FlowPage />} />
          <Route path="rumors" element={<RumorsPage />} />
          <Route path="test" element={<TestPage />} />
          <Route path="translate/:lang" element={<TranslatePage />} />
          <Route path="json" element={<JsonPage />} />
          <Route path="history" element={<HistoryPage />} />
          {/* stars & stations */}
          <Route path="stars/:itemId?" element={<StarsListPage />} />
          <Route path="planets/:itemId?" element={<PlanetsPage />} />
          <Route path="stations/:itemId?" element={<StationsPage />} />
          <Route path="map" element={<StarsMapPage />} />
        </Route>
        <Route path="/map/:mode" element={<MapRoute />} />
        <Route path="/series/:modId?" element={<SeriesMapPage />} />
        <Route path="/share" element={<SharedFile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {background && <MapLayer />}
    </>
  )
}

export default function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppRoutes />
      <ScrollRestore />
      <RouteMemory />
      <CommandLayer />
      <Toaster
        position="bottom-center"
        offset={84}
        mobileOffset={{ bottom: 84 }}
        toastOptions={{
          classNames: {
            toast: '!bg-deep !border !border-edge !text-ink !rounded-[4px] !font-ui',
            title: '!text-white',
            description: '!text-ink/75',
            actionButton: '!bg-transparent !text-cyan !border !border-cyan !rounded-[2px] !font-semibold',
          },
        }}
      />
    </Router>
  )
}

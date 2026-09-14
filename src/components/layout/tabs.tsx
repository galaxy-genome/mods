import { Globe2, Info, Landmark, ListOrdered, Map, MessageSquareText, Play, Sparkle, Workflow } from 'lucide-react'

/** `label` is a UI string key. */
export const QUEST_TABS = [
  { path: 'overview', label: 'shell.tabOverview', icon: 'info' },
  { path: 'steps', label: 'shell.tabSteps', icon: 'steps' },
  { path: 'flow', label: 'shell.tabFlow', icon: 'flow' },
  { path: 'rumors', label: 'shell.tabRumors', icon: 'rumors' },
  { path: 'test', label: 'shell.tabTest', icon: 'test' },
] as const

export const STARS_TABS = [
  { path: 'overview', label: 'shell.tabOverview', icon: 'info' },
  { path: 'stars', label: 'shell.tabStars', icon: 'star' },
  { path: 'planets', label: 'shell.tabPlanets', icon: 'planet' },
  { path: 'stations', label: 'shell.tabStations', icon: 'station' },
  { path: 'map', label: 'shell.tabMap', icon: 'map' },
] as const

const ICONS = {
  info: Info, steps: ListOrdered, flow: Workflow, rumors: MessageSquareText, test: Play,
  star: Sparkle, planet: Globe2, station: Landmark, map: Map,
}

export function TabIcon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[name]
  return <Icon className={className} strokeWidth={1.5} />
}

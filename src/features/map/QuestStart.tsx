import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '@/i18n'
import { splitViewId } from '@/lib/mods'
import { FACTION_SHORT, SECURITY_NAMES } from '@/lib/reference'
import { cn } from '@/lib/utils'
import { useResolver, useStarsMods } from './PlaceContext'
import { type QuestStart, questStart } from './places'

/** The info panel's colours, as the galaxy map writes them (`GalaxyMap.as`). */
const SIDE_QUEST = '#ffe553'
const LABEL = '#ffb14b'
const VALUE = '#fff4d1'
const SECURITY_LABEL = '#7dd9ff'
const SECURITY_VALUE = '#d1f1ff'
const STATIONS_LABEL = '#998af5'
const STATION_LINE = '#d2daff'

function Line({ label, value, labelColour = LABEL, valueColour = VALUE }: { label: string; value: string; labelColour?: string; valueColour?: string }) {
  return <p><span style={{ color: labelColour }}>{label}</span><span style={{ color: valueColour }}>{value}</span></p>
}

/** The panel alone, over the game's black background. */
export function QuestStartPanel({ start, className }: { start: QuestStart; className?: string }) {
  const t = useT()
  return (
    <div className={cn('min-w-0 overflow-x-auto whitespace-nowrap border-2 bg-[#05070d] px-2.5 py-2 font-mono text-[13px] leading-[1.45]', className)} style={{ borderColor: '#1187c7' }}>
      <p style={{ color: SIDE_QUEST }}>{t('map.gmSideQuest')}</p>
      <Line label={t('map.gmType')} value={start.type} />
      <Line label={t('map.gmFuel')} value={t(start.fuel ? 'map.gmYes' : 'map.gmNo')} />
      <Line label={t('map.gmExplored')} value={t(start.explored ? 'map.gmYes' : 'map.gmNo')} />
      {start.security && start.stations.length > 0 && (
        <Line label={t('map.gmSecurity')} value={(SECURITY_NAMES[start.security] ?? start.security).toUpperCase()} labelColour={SECURITY_LABEL} valueColour={SECURITY_VALUE} />
      )}
      {start.stations.length > 0 && (
        <>
          <p>&nbsp;</p>
          <p style={{ color: STATIONS_LABEL }}>{t('map.gmStations')}</p>
          {start.stations.map((s) => (
            <p key={s.name} style={{ color: STATION_LINE }}>
              {s.name} [{FACTION_SHORT[s.faction] ?? s.faction}] 0%{s.ls === null ? '' : ` ${s.ls} ls`}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

/**
 * How the game's galaxy map shows a quest offered in a bar: a white "!" on the start system and its info panel beside
 * it. Nothing at all for a quest the map does not mark, or a station that names no known system.
 */
export function QuestStartInfo({ station, modId, className }: { station: string; modId?: string; className?: string }) {
  const t = useT()
  const params = useParams()
  const own = splitViewId(modId ?? params.modId ?? '').modId
  const resolve = useResolver(own)
  const stars = useStarsMods(own)
  const start = React.useMemo(() => {
    const at = station ? resolve?.station(station) : null
    return at ? questStart(at, stars) : null
  }, [station, resolve, stars])
  if (!start) return null
  return (
    <div className={cn('flex min-w-0 items-start gap-2', className)} aria-label={t('map.gmMarker', { system: start.system })}>
      <span aria-hidden className="pt-0.5 font-mono text-[22px] font-bold leading-none text-white">!</span>
      <QuestStartPanel start={start} className="min-w-0" />
    </div>
  )
}

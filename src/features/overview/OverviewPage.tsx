import { PortraitTile as SharedPortraitTile } from '@/components/pickers'
import { AlertTriangle, ChevronRight, FileArchive, Info, Layers, MapPin, Plus, Store, X } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Page, useShellHeader } from '@/components/layout/shell'
import { useOpenMap } from '@/features/map/MapRoute'
import { PlaceContextView, useStationLabel } from '@/features/map/PlaceContext'
import { QuestStartInfo } from '@/features/map/QuestStart'
import { PlacePicker, PortraitPicker, QuestPicker } from '@/components/pickers'
import { RequiresLine } from '@/features/start/ModInfoSheet'
import { Button } from '@/components/ui/button'
import { Field, InfoPopover } from '@/components/ui/field'
import { Chip, Input, Segmented, Slider, Stepper, SwitchRow, Textarea } from '@/components/ui/inputs'
import { Card, Section, SentenceCard, TipCard } from '@/components/ui/surfaces'
import { useProblems } from '@/hooks/use-problems'
import { usePulseField } from '@/hooks/use-pulse-field'
import { t, useT } from '@/i18n'
import { gameQuest, LANGS, LICENCES, MOD_TAGS, PORTRAITS, QUEST_FACTIONS, STATIONS } from '@/lib/reference'
import { rewardEstimate } from '@/lib/rules'
import type { Lang, ModMeta, QuestView, QuestSettings, StarsView } from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'
import { updatePart, updateQuest, useMod, useEditor, usePart } from '@/store/editor'
import { IdStatus, QuestIdSheet } from './QuestIdSheet'

const selectCls = 'h-11 w-full rounded-[2px] border border-edge bg-field px-3 font-mono text-[15px] text-ink outline-none focus:border-cyan'

/** Settings that are not translated apply to every language version. */
export function setShared(modId: string, recipe: (s: QuestSettings) => void) {
  updatePart(modId, (m) => Object.values((m as QuestView).versions).forEach((v) => v && recipe(v.settings)))
}

export function questNameById(id: number, parts: QuestView[]) {
  if (id === 0) return t('overview.mainStoryPast68')
  const g = gameQuest(id)
  if (g) return g.name
  const m = parts.find((x) => x.versions[x.primaryLang]?.settings.questId === id)
  return m ? m.meta.title : null
}

/** The station the rules suggest in their "Did you mean" message, recovered from the translated template. */
function suggestedStation(message: string | undefined, name: string) {
  if (!message) return null
  const [pre, post] = t('rules.stationUnknownGuess', { name, guess: '\n' }).split('\n')
  return message.startsWith(pre) && message.endsWith(post) ? message.slice(pre.length, message.length - post.length) || null : null
}

const ReadOnly = React.createContext(false)

/** A section whose inputs are shown disabled when the mod is read-only, so nothing invites typing. */
function Sec({ children, ...props }: React.ComponentProps<typeof Section>) {
  const readOnly = React.useContext(ReadOnly)
  return (
    <Section {...props}>
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5 disabled:opacity-60 disabled:[&_*]:pointer-events-none">{children}</fieldset>
    </Section>
  )
}

export function OverviewPage() {
  const t = useT()
  const stationLabel = useStationLabel()
  const { modId = '' } = useParams()
  const mod = usePart(modId) as QuestView | undefined
  const owner = useMod(modId)
  const advanced = useEditor((s) => s.settings.advanced)
  const parts = useEditor((s) => s.parts)
  const problems = useProblems(modId)
  const quests = React.useMemo(() => parts.filter((m): m is QuestView => m.meta.type === 'quest'), [parts])
  const modStations = React.useMemo(() => parts.flatMap((m) => (m.meta.type === 'stars' ? (m as StarsView).stations.map((x) => x.name) : [])), [parts])
  const navigate = useNavigate()
  usePulseField()
  const langLabel = LANGS.find((l) => l.key === mod?.primaryLang)?.label ?? 'EN'
  useShellHeader({ title: mod?.meta.title || t('overview.untitledQuest'), subtitle: t('overview.subtitle', { lang: langLabel }) }, [mod?.meta.title, langLabel, t])

  const [idOpen, setIdOpen] = React.useState(false)
  const [portraitOpen, setPortraitOpen] = React.useState(false)
  const [params] = useSearchParams()
  const [stationOpen, setStationOpen] = React.useState(false)
  // A "Choose a station" or "Choose a quest" fix links here with ?pick=1.
  const [questsOpen, setQuestsOpen] = React.useState(false)
  React.useEffect(() => {
    if (!params.get('pick')) return
    if (params.get('field') === 'stationName') setStationOpen(true)
    if (params.get('field') === 'requiredQuestIds') setQuestsOpen(true)
  }, [params])
  const openMap = useOpenMap()
  const [adding, setAdding] = React.useState<string[]>([])

  const q = mod?.versions[mod.primaryLang]
  if (!mod || !q || !owner) return null
  const s = q.settings
  const readOnly = owner.meta.origin === 'game'
  const set = (recipe: (s: QuestSettings) => void) => updateQuest(modId, (c) => recipe(c.settings))
  const shared = (recipe: (s: QuestSettings) => void) => setShared(modId, recipe)
  const meta = (recipe: (m: ModMeta) => void) => updatePart(modId, (m) => recipe(m.meta))

  const setLang = (lang: Lang) => updatePart(modId, (m) => {
    const qm = m as QuestView
    if (qm.versions[lang]) return
    const content = qm.versions[qm.primaryLang]!
    delete qm.versions[qm.primaryLang]
    content.settings.lang = lang
    qm.versions[lang] = content
    qm.primaryLang = lang
  })
  const multiVersion = Object.keys(mod.versions).length > 1

  const stationKnown = !s.stationName || STATIONS.some((x) => x.name === s.stationName) || modStations.includes(s.stationName)
  const stationProblem = problems.list.find((p) => p.id === 'station-unknown' && p.location.field === 'stationName')
  const spaceReqProblem = problems.list.find((p) => p.id === 'space-req')
  const nearOwnProblem = problems.list.find((p) => p.id === 'near-own')
  const stationGuess = suggestedStation(stationProblem?.message, s.stationName)
  const reward = rewardEstimate(q)

  const hasReq = {
    quests: s.requiredQuestIds.length > 0 || adding.includes('quests'),
    karma: s.minKarma !== null || s.maxKarma !== null || adding.includes('karma'),
    faction: s.faction !== 'none' || adding.includes('faction'),
    own: s.ownStationRequired || adding.includes('own'),
  }
  const remove = (key: keyof typeof hasReq, recipe: (s: QuestSettings) => void) => {
    setAdding((a) => a.filter((x) => x !== key))
    shared(recipe)
  }
  const reqCount = [s.requiredQuestIds.length > 0, s.minKarma !== null || s.maxKarma !== null, s.faction !== 'none', s.ownStationRequired].filter(Boolean).length
  const unknownReqs = s.requiredQuestIds.filter((id) => questNameById(id, quests) === null)

  const startSummary = s.startMode === 'bar'
    ? s.charName
      ? t('overview.summaryBarBy', { station: s.stationName || t('overview.noStation'), name: s.charName })
      : t('overview.summaryBar', { station: s.stationName || t('overview.noStation') })
    : s.startMode === 'nearPoint' ? t('overview.summaryNear', { radius: s.radius, x: s.pointX, y: s.pointY })
      : t(s.trigger === 'warp' ? 'overview.summarySpaceWarp' : 'overview.summarySpaceScan', { chance: Math.round(s.chance * 100) })
  const karmaText = (v: number | null) => (v === null ? t('overview.noLimit') : String(v))

  return (
    <ReadOnly.Provider value={readOnly}>
    <Page className="px-0 py-0 pb-8">
      {!readOnly && (
        <div className="px-4 pt-4">
          <TipCard tipKey="overview-intro">
            {t('overview.tipNext')}{' '}
            <Link to={`/mod/${modId}/steps`} className="text-cyan underline-offset-2 hover:underline">{t('overview.openSteps')}</Link>
          </TipCard>
        </div>
      )}
      <div>
        <Sec title={t('overview.sectionQuest')} summary={`${s.questName || t('overview.untitled')} · ${langLabel}`}>
          <Field label={t('overview.questName')} htmlFor="questName" fieldKey="questName" advancedKey="QuestName" help={t('overview.questNameHelp')} warning={!s.questName.trim() ? t('overview.questNameRequired') : undefined}>
            <div className="relative">
              <Input id="questName" value={s.questName} warn={!s.questName.trim()} onChange={(e) => set((x) => { x.questName = e.target.value })} className="pr-16" />
              <span className={cn('pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px]', s.questName.length > 60 ? 'text-amber' : 'text-dim')}>{s.questName.length}/60</span>
            </div>
          </Field>
          <Field label={t('overview.description')} htmlFor="description" fieldKey="description" advancedKey="QuestDescription" help={t('overview.descriptionHelp')} warning={!s.description.trim() ? t('overview.descriptionRequired') : undefined}>
            <Textarea id="description" value={s.description} onChange={(v) => set((x) => { x.description = v })} max={400} warnAt={320} />
          </Field>
          <Field label={t('overview.language')} fieldKey="lang" advancedKey="Lang" help={t('overview.languageHelp')} learnMore="/help/translating">
            <Segmented<Lang>
              ariaLabel={t('overview.language')}
              value={mod.primaryLang}
              onChange={setLang}
              options={LANGS.map((l) => ({ value: l.key, label: l.label, disabled: multiVersion && l.key !== mod.primaryLang && !!mod.versions[l.key] }))}
            />
          </Field>
        </Sec>

        <Sec title={t('overview.questId')} summary={<span className="font-mono">{s.questId}</span>}>
          <Field label={t('overview.questId')} fieldKey="questId" advancedKey="ID" help={t('overview.questIdHelp')} learnMore="/help/requirements">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-11 items-center rounded-[2px] border border-edge bg-chip px-3 font-mono text-[15px] text-white">{s.questId}</span>
              <Button variant="text" onClick={() => setIdOpen(true)}>{t('overview.change')}</Button>
            </div>
            <IdStatus id={s.questId} modId={modId} />
          </Field>
        </Sec>

        {s.startMode !== 'space' && <Sec title={t('overview.sectionContact')} summary={s.charName ? `${s.charName} · ${s.charImage}` : t('overview.noContactName')}>
          <Field label={t('overview.name')} htmlFor="charName" fieldKey="charName" advancedKey="CharName" help={t('overview.nameHelp')} warning={s.startMode === 'bar' && !s.charName.trim() ? t('overview.nameRequired') : undefined}>
            <Input id="charName" value={s.charName} onChange={(e) => set((x) => { x.charName = e.target.value })} />
          </Field>
          <Field label={t('overview.portrait')} fieldKey="charImage" advancedKey="CharImage" help={t('overview.portraitHelp')} warning={!PORTRAITS.includes(s.charImage) ? t('overview.portraitUnknown', { name: s.charImage }) : undefined}>
            <button type="button" onClick={() => setPortraitOpen(true)} className="grid-texture flex items-center gap-3 rounded-[4px] border border-edge bg-panel p-3 text-left hover:border-cyan">
              <div className="flex shrink-0 flex-col items-center gap-1">
                <PortraitTile name={s.charImage} size="lg" />
                <span className="font-mono text-[11px] text-dim">{s.charImage}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-[12px] uppercase tracking-wider text-cyan">{s.charName || t('overview.unnamed')}</span>
                <span className="text-[15px] font-semibold text-white">{s.questName || t('overview.untitledQuest')}</span>
                <p className="line-clamp-3 text-[13px] leading-snug text-ink">{s.description || t('overview.noDescription')}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-dim" />
            </button>
          </Field>
        </Sec>}

        <Sec title={t('overview.sectionStart')} summary={startSummary}>
          <div className="flex flex-col gap-2">
            <Segmented<QuestSettings['startMode']>
              ariaLabel={t('overview.sectionStart')}
              value={s.startMode}
              onChange={(v) => shared((x) => { x.startMode = v })}
              options={[{ value: 'bar', label: t('overview.modeBar') }, { value: 'nearPoint', label: t('overview.modeNear') }, { value: 'space', label: t('overview.modeSpace') }]}
            />
            <p className="text-[13px] leading-snug text-ink">
              {t(s.startMode === 'bar' ? 'overview.modeBarHelp' : s.startMode === 'nearPoint' ? 'overview.modeNearHelp' : 'overview.modeSpaceHelp')}
            </p>
          </div>
          {s.startMode === 'bar' && (
            <Field label={t('overview.station')} fieldKey="stationName" advancedKey="StationName" help={t('overview.stationHelp')} learnMore="/help/stars-and-stations"
              error={!s.stationName ? t('overview.stationMissing') : undefined}
              warning={!stationKnown ? stationProblem?.message ?? t('rules.stationUnknown', { name: s.stationName }) : undefined}>
              <SentenceCard icon={<Store className={s.stationName ? 'text-cyan' : 'text-danger'} />} tone={!s.stationName ? 'danger' : !stationKnown ? 'amber' : undefined} onClick={() => setStationOpen(true)} trailing={<ChevronRight className="size-4 text-dim" />}>
                {s.stationName ? <span className="font-mono">{stationLabel(s.stationName)}</span> : <span className="text-dim">{t('overview.chooseStation')}</span>}
              </SentenceCard>
              <PlaceContextView kind="station" name={s.stationName} />
              <QuestStartInfo station={s.stationName} />
              {stationGuess && (
                <div><Chip tone="amber" onClick={() => shared((x) => { x.stationName = stationGuess })}>{t('overview.didYouMean', { name: stationGuess })}</Chip></div>
              )}
            </Field>
          )}
          {s.startMode === 'space' && (
            <>
              <Field label={t('overview.trigger')} fieldKey="trigger" advancedKey="RandomSpaceQuestTrigger" learnMore="/help/space-quests">
                <Segmented ariaLabel={t('overview.trigger')} value={s.trigger} onChange={(v) => shared((x) => { x.trigger = v })} options={[{ value: 'warp', label: t('overview.triggerWarp') }, { value: 'planetScan', label: t('overview.triggerScan') }]} />
              </Field>
              <Field label={t('overview.chance')} fieldKey="chance" advancedKey="RandomSpaceQuestChance" help={t('overview.chanceHelp')} learnMore="/help/space-quests" error={s.chance <= 0 ? t('overview.chanceZero') : undefined}>
                <div className="flex items-center gap-3">
                  <Slider ariaLabel={t('overview.chance')} value={[Math.round(s.chance * 100)]} onChange={([v]) => shared((x) => { x.chance = v / 100 })} tone={s.chance <= 0 ? 'amber' : 'cyan'} />
                  <div className="relative w-24 shrink-0">
                    <Input aria-label={t('overview.chancePercent')} inputMode="numeric" value={Math.round(s.chance * 100)} invalid={s.chance <= 0}
                      onChange={(e) => { const n = Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0)); shared((x) => { x.chance = n / 100 }) }} className="pr-7 text-right" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-dim">%</span>
                  </div>
                </div>
              </Field>
            </>
          )}
          {s.startMode !== 'bar' && (
            <Field label={t('overview.pointRadius')} fieldKey="location" advancedKey="RandomQuestX · RandomQuestY · RandomQuestRadius" help={t('overview.pointRadiusHelp')} learnMore="/help/space-quests">
              <SentenceCard icon={<MapPin className="text-cyan" />} onClick={() => openMap({ mode: 'circle', x: s.pointX, y: s.pointY, r: s.radius }, (v) => shared((x) => { x.pointX = v.x; x.pointY = v.y; x.radius = v.r }))} trailing={<ChevronRight className="size-4 text-dim" />}>
                {t('overview.within')} <span className="font-mono text-cyan">{formatNumber(s.radius)} ly</span> {t('overview.of')} <span className="font-mono text-cyan">{s.pointX}, {s.pointY}</span>
              </SentenceCard>
            </Field>
          )}
          {s.startMode === 'nearPoint' && (
            <Card tone="cyan" className="flex gap-2.5 p-3 text-[13px] leading-snug text-ink">
              <Info className="mt-px size-4 shrink-0 text-cyan" />
              <p>{t('overview.nearPointNote')}</p>
            </Card>
          )}
          {s.startMode === 'space' && (
            <Card tone="cyan" className="flex gap-2.5 p-3 text-[13px] leading-snug text-ink">
              <Info className="mt-px size-4 shrink-0 text-cyan" />
              <p>{t('overview.spaceInfo')}</p>
            </Card>
          )}
        </Sec>

        <Sec title={t('overview.sectionRequirements')} summary={reqCount ? t('overview.requirements', { count: reqCount }) : t('overview.anyone')}>
          {(spaceReqProblem || nearOwnProblem) && (
            <Card tone="amber" className="flex flex-col gap-2 p-3">
              <p className="flex gap-2 text-[14px] leading-snug text-ink"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />{(spaceReqProblem ?? nearOwnProblem)!.message}</p>
              {spaceReqProblem?.fix && !readOnly && <Button variant="secondary" size="sm" className="self-start" onClick={() => spaceReqProblem.fix!.apply()}>{spaceReqProblem.fix.label}</Button>}
            </Card>
          )}
          {!hasReq.quests && !hasReq.karma && !hasReq.faction && !hasReq.own && (
            <p className="text-[14px] text-ink">{t('overview.noRequirements')}</p>
          )}
          {hasReq.quests && (
            <Field label={t('overview.finishedFirst')} fieldKey="requiredQuestIds" advancedKey="RequestedQuestIDCompleted" help={t('overview.finishedFirstHelp')} learnMore="/help/requirements"
              warning={unknownReqs.length ? t('overview.unknownRequirement') : undefined}
              action={<RemoveReq label={t('overview.removeFinished')} onClick={() => remove('quests', (x) => { x.requiredQuestIds = [] })} />}>
              <div className="flex flex-wrap gap-2">
                {s.requiredQuestIds.map((id) => {
                  const name = questNameById(id, quests)
                  return (
                    <Chip key={id} tone={name === null ? 'amber' : undefined} onRemove={() => shared((x) => { x.requiredQuestIds = x.requiredQuestIds.filter((y) => y !== id) })}>
                      {name === null && <AlertTriangle className="size-3.5" />}
                      {name ?? id}
                    </Chip>
                  )
                })}
                <Button variant="secondary" size="sm" onClick={() => setQuestsOpen(true)}><Plus className="size-4" />{t('overview.chooseQuests')}</Button>
              </div>
            </Field>
          )}
          {hasReq.karma && (
            <Field label={t('overview.karma')} fieldKey="karma" advancedKey="MinKarma · MaxKarma" help={t('overview.karmaHelp')} learnMore="/help/requirements"
              action={<RemoveReq label={t('overview.removeKarma')} onClick={() => remove('karma', (x) => { x.minKarma = null; x.maxKarma = null })} />}>
              <div className="flex justify-between font-mono text-[13px] text-cyan">
                <span>{karmaText(s.minKarma)}</span>
                <span>{karmaText(s.maxKarma)}</span>
              </div>
              <div className="relative px-3">
                {/* -101 and 101 are the "No limit" stops, stored as null. */}
                <span aria-hidden className="absolute left-3 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-dim" />
                <span aria-hidden className="absolute right-3 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-dim" />
                <Slider ariaLabel={t('overview.karmaRange')} min={-101} max={101} value={[s.minKarma ?? -101, s.maxKarma ?? 101]}
                  onChange={([a, b]) => shared((x) => { x.minKarma = a <= -101 ? null : a; x.maxKarma = b >= 101 ? null : b })} />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-dim"><span>{t('overview.noLimit')}</span><span>0</span><span>{t('overview.noLimit')}</span></div>
            </Field>
          )}
          {hasReq.faction && (
            <Field label={t('overview.faction')} fieldKey="faction" advancedKey="Faction · FactionMinRep" help={t('overview.factionHelp')} learnMore="/help/requirements"
              action={<RemoveReq label={t('overview.removeFaction')} onClick={() => remove('faction', (x) => { x.faction = 'none'; x.factionMinRep = 0 })} />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <select aria-label={t('overview.factionSelect')} className={selectCls} value={s.faction} onChange={(e) => shared((x) => { x.faction = e.target.value as QuestSettings['faction'] })}>
                  <option value="none">{t('overview.chooseFaction')}</option>
                  {QUEST_FACTIONS.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                </select>
                <Stepper value={s.factionMinRep} min={-1000} max={1000} onChange={(v) => shared((x) => { x.factionMinRep = v })} />
              </div>
            </Field>
          )}
          {hasReq.own && (
            <div className="flex items-start gap-1">
              <div className="flex-1">
                <SwitchRow fieldKey="ownStationRequired" label={t('overview.ownStation')} help={t('overview.ownStationHelp')} checked={s.ownStationRequired} onCheckedChange={(v) => shared((x) => { x.ownStationRequired = v })} />
              </div>
              <RemoveReq label={t('overview.removeOwn')} onClick={() => remove('own', (x) => { x.ownStationRequired = false })} />
            </div>
          )}
          {!readOnly && (!hasReq.quests || !hasReq.karma || !hasReq.faction || !hasReq.own) && (
            <div className="flex flex-col gap-2">
              <span className="section-label">{t('overview.addRequirement')}</span>
              <div className="flex flex-wrap gap-2">
                {!hasReq.quests && <Chip onClick={() => setQuestsOpen(true)}><Plus className="size-3.5" />{t('overview.finishedQuests')}</Chip>}
                {!hasReq.karma && <Chip onClick={() => setAdding((a) => [...a, 'karma'])}><Plus className="size-3.5" />{t('overview.karma')}</Chip>}
                {!hasReq.faction && <Chip onClick={() => setAdding((a) => [...a, 'faction'])}><Plus className="size-3.5" />{t('overview.faction')}</Chip>}
                {!hasReq.own && <Chip onClick={() => { setAdding((a) => [...a, 'own']); shared((x) => { x.ownStationRequired = true }) }}><Plus className="size-3.5" />{t('overview.ownStation')}</Chip>}
              </div>
            </div>
          )}
        </Sec>

        <Section title={t('overview.sectionReward')} summary={t('overview.rewardSummary', { total: reward.total })}>
          <Card className="flex flex-col gap-2 p-3">
            <span className="section-label">{t('overview.rewardEstimate')}</span>
            <span className="font-mono text-[24px] text-white">{reward.total} CR</span>
            {reward.lines.length ? (
              <ul className="flex flex-col gap-1">
                {reward.lines.map((l, i) => (
                  <li key={i} className="flex gap-3 font-mono text-[13px]">
                    <span className="w-12 shrink-0 text-right text-cyan">{i ? '+' : ''}{l.amount}</span>
                    <span className="text-ink">{l.reason}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-dim">{t('overview.noReward')}</p>}
            {reward.capped && <p className="text-[13px] text-amber">{t('overview.capped')}</p>}
            <div className="flex items-end gap-2 border-t border-edge pt-2">
              <p className="flex-1 text-[12px] leading-snug text-ink/75">{t('overview.rewardNote')}</p>
              <span className="flex items-center gap-1 text-[13px] text-cyan">
                <button type="button" className="hover:underline" onClick={() => navigate('/help/rewards')}>{t('overview.why')}</button>
                <InfoPopover label={t('overview.whyLabel')} learnMore="/help/rewards">{t('overview.whyBody')}</InfoPopover>
              </span>
            </div>
          </Card>
          {advanced && (
            <fieldset disabled={readOnly} className="grid min-w-0 gap-4 disabled:opacity-60 disabled:[&_*]:pointer-events-none sm:grid-cols-2">
              <Field label={t('overview.reward')} advancedKey="Reward" help={t('overview.ignoredByGame')} learnMore="/help/rewards">
                <Stepper value={s.reward} step={10} onChange={(v) => shared((x) => { x.reward = v })} unit="CR" />
              </Field>
              <Field label={t('overview.karmaReward')} advancedKey="KarmaReward" help={t('overview.ignoredByGame')} learnMore="/help/rewards">
                <Stepper value={s.karmaReward} min={-100} max={100} onChange={(v) => shared((x) => { x.karmaReward = v })} />
              </Field>
            </fieldset>
          )}
        </Section>

        <Section title={t('overview.sectionAbout')} summary={[owner.meta.author || t('overview.noAuthor'), `v${owner.meta.version}`, owner.meta.licence].join(' · ')}>
          <p className="text-[13px] text-ink/75">{t('overview.aboutIntro')}</p>
          <RequiresLine mod={owner} />
          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5 disabled:opacity-60 disabled:[&_*]:pointer-events-none">
            <Field label={t('overview.author')} htmlFor="author">
              <Input id="author" value={owner.meta.author} onChange={(e) => meta((m) => { m.author = e.target.value })} />
            </Field>
            <Field label={t('overview.version')} htmlFor="version" fieldKey="version" help={t('overview.versionHelp')}>
              <Input id="version" value={owner.meta.version} onChange={(e) => meta((m) => { m.version = e.target.value })} />
            </Field>
            <Field label={t('overview.summary')} htmlFor="summary">
              <Textarea id="summary" value={owner.meta.summary} max={200} rows={2} onChange={(v) => meta((m) => { m.summary = v })} />
            </Field>
            <Field label={t('overview.licence')} htmlFor="licence">
              <select id="licence" className={selectCls} value={owner.meta.licence} onChange={(e) => meta((m) => { m.licence = e.target.value as ModMeta['licence'] })}>
                {LICENCES.map((l) => <option key={l} value={l}>{l.replace(/-/g, ' ').replace('BY SA', 'BY-SA')}</option>)}
              </select>
            </Field>
            <Field label={t('overview.link')} htmlFor="link">
              <Input id="link" type="url" placeholder="https://" value={owner.meta.link} onChange={(e) => meta((m) => { m.link = e.target.value })} />
            </Field>
            <Field label={t('overview.tags')}>
              <div className="flex flex-wrap gap-2">
                {MOD_TAGS.map((tag) => (
                  <Chip key={tag} selected={owner.meta.tags.includes(tag)} onClick={() => meta((m) => { m.tags = m.tags.includes(tag) ? m.tags.filter((x) => x !== tag) : [...m.tags, tag] })}>{tag}</Chip>
                ))}
              </div>
            </Field>
          </fieldset>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => navigate(`/mod/${owner.meta.id}`, { state: { contents: true } })}>
            <Layers className="size-4" />{t('shell.modSettings')}
          </Button>
          {!readOnly && (
            <Card tone="cyan" className="flex flex-col items-start gap-2 p-3">
              <p className="text-[13px] leading-snug text-ink">{t('overview.contributeHelp')}</p>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/mod/${owner.meta.id}`, { state: { contents: true, submit: true } })}>
                <FileArchive className="size-4" />{t('overview.submitToLibrary')}
              </Button>
            </Card>
          )}
        </Section>
      </div>

      <QuestIdSheet modId={modId} open={idOpen} onOpenChange={setIdOpen} />
      <PortraitPicker open={portraitOpen} onOpenChange={setPortraitOpen} value={s.charImage} onSelect={(v) => { shared((x) => { x.charImage = v }); setPortraitOpen(false) }} />
      <PlacePicker open={stationOpen} onOpenChange={setStationOpen} kind="station" title={t('overview.station')} value={s.stationName} onSelect={(v) => { shared((x) => { x.stationName = v }); setStationOpen(false) }} />
      <QuestPicker open={questsOpen} onOpenChange={setQuestsOpen} value={s.requiredQuestIds} excludeModId={modId} onChange={(ids) => shared((x) => { x.requiredQuestIds = ids })} />
    </Page>
    </ReadOnly.Provider>
  )
}

function RemoveReq({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="-my-2 grid size-10 place-items-center text-dim hover:text-white">
      <X className="size-4" />
    </button>
  )
}

export function PortraitTile({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return <SharedPortraitTile name={name} size={size === 'lg' ? 64 : 44} className="shrink-0" />
}

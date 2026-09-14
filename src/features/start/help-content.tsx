import * as Popover from '@radix-ui/react-popover'
import { ArrowRight } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink } from '@/components/ui/feedback'
import { t } from '@/i18n'
import { CATEGORY_INFO, CONDITIONS } from '@/lib/conditions'
import { BEHAVIOURS, MISSION_TYPES } from '@/lib/reference'
import { getState, loadSamples } from '@/store/editor'

export const TERMS = ['step', 'checkpoint', 'journal', 'condition', 'choice', 'contact', 'pilot', 'behaviour', 'mission', 'version'] as const
export type TermId = (typeof TERMS)[number]
export const termLabel = (id: TermId) => t(`startHelp.term.${id}`)
export const termDefinition = (id: TermId) => t(`startHelp.def.${id}`)

export function Term({ children, term }: { children?: React.ReactNode; term: TermId }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="cursor-help text-white underline decoration-cyan decoration-dotted underline-offset-4 hover:text-cyan">{children ?? termLabel(term)}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={12} className="z-[80] max-w-[300px] rounded-[4px] border border-edge bg-deep p-3 text-[13px] leading-relaxed text-ink">
          <span className="section-label mb-1 block">{termLabel(term)}</span>
          {termDefinition(term)}
          <Popover.Arrow className="fill-edge" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Opens a sample mod, loading the samples first when they were deleted. */
export function TryIt({ to, children }: { to: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  const go = () => {
    const modId = /^\/mod\/([^/]+)/.exec(to)?.[1]
    if (modId && !getState().parts.some((m) => m.meta.id === modId)) loadSamples()
    navigate(to)
  }
  return (
    <button onClick={go} className="flex min-h-11 w-full items-center gap-2 rounded-[4px] border border-grid-strong bg-cyan/[0.06] px-3 text-left text-[14px] text-cyan hover:bg-cyan/15">
      <span className="font-semibold">{t('startHelp.tryIt')}</span><span className="flex-1 text-white">{children}</span><ArrowRight className="size-4" />
    </button>
  )
}

/** Translated text with the first mention of each listed glossary term made tappable. */
function rich(key: string, terms: TermId[] = []): React.ReactNode {
  let parts: React.ReactNode[] = [t(key)]
  for (const id of terms) {
    const label = termLabel(id).toLowerCase()
    let done = false
    parts = parts.flatMap((p): React.ReactNode[] => {
      if (done || typeof p !== 'string') return [p]
      const i = p.toLowerCase().indexOf(label)
      if (i < 0) return [p]
      done = true
      return [p.slice(0, i), <Term key={id} term={id}>{p.slice(i, i + label.length)}</Term>, p.slice(i + label.length)]
    })
  }
  return parts
}

const k = (key: string) => `startHelp.${key}`
const H = ({ id }: { id: string }) => <h2 className="section-label mt-2">{t(k(id))}</h2>
const P = ({ id, terms, children }: { id?: string; terms?: TermId[]; children?: React.ReactNode }) => <p className="text-[15px] leading-relaxed text-ink">{id ? rich(k(id), terms) : children}</p>
const UL = ({ children }: { children: React.ReactNode }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-grid-strong">{children}</ul>
const LI = ({ ids, terms }: { ids: string[]; terms?: TermId[] }) => <UL>{ids.map((id) => <li key={id}>{rich(k(id), terms)}</li>)}</UL>
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

export type HelpGroup = 'Start' | 'Build' | 'Publish' | 'Reference'
export const groupLabel = (g: HelpGroup) => t(`startHelp.group.${g}`)

export interface Article {
  slug: string
  readonly title: string
  group: HelpGroup
  readonly keywords: string
  body?: () => React.ReactNode
}

const article = (slug: string, group: HelpGroup, body?: () => React.ReactNode): Article => ({
  slug, group, body,
  get title() { return t(`startHelp.title.${slug}`) },
  get keywords() { return t(`startHelp.kw.${slug}`) },
})

export const ARTICLES: Article[] = [
  article('getting-started', 'Start', () => <>
    <P id="gsIntro" terms={['step']} />
    <LI ids={range('gs', 5)} terms={['journal']} />
    <TryIt to="/mod/sample-parcel/steps">{t(k('gsTry'))}</TryIt>
  </>),
  article('mods-and-files', 'Start', () => <>
    <P id="mfIntro" />
    <H id="mfContents" />
    <P id="mfContentsBody" />
    <LI ids={range('mf', 4)} />
    <P id="mfIds" />
  </>),
  article('steps-and-choices', 'Build', () => <>
    <P id="scIntro" />
    <H id="scChoices" />
    <P id="scChoicesBody" terms={['choice']} />
    <H id="scRejoin" />
    <P id="scRejoinBody" />
    <P id="scOnly" />
    <TryIt to="/mod/sample-choice/flow">{t(k('scTry'))}</TryIt>
  </>),
  article('conditions', 'Build', () => <>
    <P id="cIntro" terms={['condition']} />
    <P id="cButton" />
    {CATEGORY_INFO.map((c) => {
      const items = CONDITIONS.filter((d) => d.category === c.name)
      if (!items.length) return null
      return (
        <React.Fragment key={c.name}>
          <h2 className="section-label mt-2">{c.label}</h2>
          <UL>{items.slice(0, 12).map((d) => <li key={d.action}>{t(k('cItem'), { label: d.label, sentence: d.sentence.replace('{p}', '…') })}</li>)}</UL>
          {items.length > 12 && <P>{t(k('cMore'), { count: items.length - 12 })}</P>}
        </React.Fragment>
      )
    })}
  </>),
  article('ships-and-orders', 'Build', () => <>
    <P id="soIntro" terms={['pilot']} />
    <LI ids={range('so', 4)} terms={['behaviour', 'checkpoint']} />
    <H id="soBehaviours" />
    <UL>{BEHAVIOURS.map((b) => <li key={b.key}><span className="text-white">{b.key}</span> ({b.group}): {b.description}</li>)}</UL>
    <TryIt to="/mod/sample-choice/steps">{t(k('soTry'))}</TryIt>
  </>),
  article('station-missions', 'Build', () => <>
    <P id="smIntro" terms={['mission']} />
    <LI ids={range('sm', 3)} />
    <H id="smTypes" />
    <UL>{MISSION_TYPES.map((m) => <li key={m.key}><span className="text-white">{m.name}</span>: {m.description}</li>)}</UL>
  </>),
  article('rewards', 'Build', () => <>
    <P id="rwIntro" />
    <LI ids={range('rw', 4)} />
    <P id="rwNote" />
  </>),
  article('space-quests', 'Build', () => <>
    <P id="sqIntro" />
    <LI ids={range('sq', 5)} />
  </>),
  article('requirements', 'Build', () => <>
    <P id="rqIntro" />
    <LI ids={range('rq', 5)} />
  </>),
  article('translating', 'Publish', () => <>
    <P id="trIntro" terms={['version']} />
    <LI ids={range('tr', 3)} />
  </>),
  article('stars-and-stations', 'Build', () => <>
    <P id="ssIntro" />
    <LI ids={range('ss', 4)} />
  </>),
  article('textures', 'Build', () => <>
    <P id="txIntro" />
    <LI ids={range('tx', 4)} />
  </>),
  article('favorites-and-download', 'Publish', () => <>
    <P id="fdIntro" />
    <H id="fdZip" />
    <P id="fdZipBody" />
    <LI ids={range('fd', 2)} />
    <H id="fdLang" />
    <P id="fdLangBody" />
    <P id="fdFixes" />
    <Link to="/install" className="text-cyan underline">{t(k('ckInstallGuide'))}</Link>
  </>),
  article('installing', 'Publish'),
  article('not-showing', 'Publish'),
  article('opening-files', 'Publish', () => <>
    <P id="ofIntro" />
    <LI ids={range('of', 4)} />
    <Link to="/help/older-files" className="text-cyan underline">{t(k('title.older-files'))}</Link>
  </>),
  article('community-library', 'Publish', () => <>
    <P id="clIntro" />
    <LI ids={['cl1', 'cl2']} />
    <H id="clShare" />
    <P id="clShareBody" />
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-cyan">
      {['clStep1', 'clStep2', 'clStep3'].map((id) => <li key={id}>{t(k(id))}</li>)}
    </ol>
    <P id="clDiscord" />
    <p className="flex gap-4 text-[15px]">
      <ExternalLink href="https://github.com/galaxy-genome/mods">{t(k('clGithub'))}</ExternalLink>
      <ExternalLink href="https://discord.gg/7zKeYt2SwU">{t(k('clDiscordLink'))}</ExternalLink>
      <ExternalLink href="https://www.reddit.com/r/galaxygenome">{t(k('clRedditLink'))}</ExternalLink>
    </p>
    <P id="clVersions" />
  </>),
  article('glossary', 'Reference', () => (
    <dl className="flex flex-col gap-3">
      {TERMS.map((id) => (
        <div key={id} className="flex flex-col gap-0.5 border-b border-edge pb-3">
          <dt className="text-[15px] font-semibold text-white">{termLabel(id)}</dt>
          <dd className="text-[14px] leading-relaxed text-ink">{termDefinition(id)}</dd>
        </div>
      ))}
    </dl>
  )),
  article('older-files', 'Reference', () => <>
    <P id="olderIntro" />
    <P id="olderList" />
    <P id="olderRepair" />
    <Link to="/" className="text-cyan underline">{t(k('backHome'))}</Link>
  </>),
]

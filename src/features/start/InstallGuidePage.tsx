import * as React from 'react'
import { Link } from 'react-router-dom'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { AppBar } from '@/components/layout/shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/surfaces'
import { t, useT } from '@/i18n'
import { OfflineChip } from './common'

const MOD_FOLDER = 'Android/data/com.skvgames.GalaxyGenome/files/'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(t('startHelp.igCopied'))
  } catch {
    toast(t('startHelp.igCopyBlocked'), { description: text })
  }
}

/** Renders a string's **bold**, `code` and [label](url) markup. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('**')) return <b key={i} className="font-semibold text-white">{inline(part.slice(2, -2))}</b>
    if (part.startsWith('`')) return <code key={i} className="rounded-[2px] bg-field px-1 font-mono [overflow-wrap:anywhere] text-[0.9em] text-cyan">{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-cyan underline">{link[1]}</a>
    return part
  })
}

const k = (id: string) => t(`install.${id}`)

/** A translated line; "\n- " lines become sub-points. */
function Text({ id }: { id: string }) {
  const [head, ...subs] = k(id).split('\n- ')
  return <>{inline(head)}{subs.length > 0 && <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 marker:text-grid-strong">{subs.map((s) => <li key={s}>{inline(s)}</li>)}</ul>}</>
}

const P = ({ id }: { id: string }) => <p className="text-[15px] leading-relaxed text-ink"><Text id={id} /></p>
const H2 = ({ id }: { id: string }) => <h2 className="text-[18px] font-semibold leading-snug text-white">{k(id)}</h2>
const H3 = ({ id }: { id: string }) => <h3 className="section-label mt-2">{k(id)}</h3>
const OL = ({ ids }: { ids: string[] }) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-cyan">{ids.map((id) => <li key={id}><Text id={id} /></li>)}</ol>
const UL = ({ ids }: { ids: string[] }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-grid-strong">{ids.map((id) => <li key={id}><Text id={id} /></li>)}</ul>
const ids = (prefix: string, suffixes: string) => [...suffixes].map((s) => prefix + s)

function Code({ id, label }: { id: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[14px] text-ink">{k(label)}</span>}
      <div className="flex items-start gap-2 rounded-[2px] border border-edge bg-void py-1 pl-3 pr-1">
        <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] text-white"><code>{k(id)}</code></pre>
        <Button size="icon-sm" variant="ghost" aria-label={t('startHelp.igCopy')} onClick={() => copyText(k(id))}><Copy className="size-4" /></Button>
      </div>
    </div>
  )
}

const Problems = ({ list }: { list: string[] }) => <><H3 id="problems" /><UL ids={list} /></>

function Section({ children }: { children: React.ReactNode }) {
  return <Card className="flex flex-col gap-3 p-4">{children}</Card>
}

export function InstallGuide() {
  useT()
  return (
    <div className="flex flex-col gap-4">
      <Section>
        <P id="intro1" />
        <P id="intro2" />
        <div className="flex items-center gap-2 rounded-[2px] border border-edge bg-field py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 font-mono text-[13px] text-white [overflow-wrap:anywhere]">{k('folder')}</span>
          <Button size="sm" variant="secondary" onClick={() => copyText(MOD_FOLDER)}><Copy className="size-4" />{t('startHelp.igCopyPath')}</Button>
        </div>
        <P id="intro3" />
        <P id="intro4" />
      </Section>

      <Section>
        <H2 id="m1Title" />
        <P id="m1Need" />
        <H3 id="m1S1" /><P id="m1S1Body" />
        <H3 id="m1S2" /><OL ids={ids('m1S2', 'abcd')} /><P id="m1S2Note" />
        <H3 id="m1S3" /><OL ids={ids('m1S3', 'ab')} />
        <Problems list={ids('m1P', '12345')} />
      </Section>

      <Section>
        <H2 id="m2Title" />
        <P id="m2Intro" />
        <P id="m2Need" />
        <H3 id="m2S1" /><OL ids={ids('m2S1', 'ab')} />
        <H3 id="m2S2" /><OL ids={ids('m2S2', 'abcde')} />
        <H3 id="m2S3" /><UL ids={['m2S3Win', 'm2S3Mac']} />
        <H3 id="m2S4" /><Code label="windows" id="m2S4Win" /><Code label="mac" id="m2S4Mac" /><P id="m2S4Body" />
        <H3 id="m2S5" /><P id="m2S5a" /><P id="m2S5b" />
        <Code label="m2S5WinLabel" id="m2S5Win" /><Code label="mac" id="m2S5Mac" /><P id="m2S5c" />
        <H3 id="m2S6" /><Code label="windows" id="m2S6Win" /><Code label="mac" id="m2S6Mac" /><P id="m2S6a" /><P id="m2S6b" />
        <Problems list={ids('m2P', '123456')} />
      </Section>

      <Section>
        <H2 id="m3Title" />
        <P id="m3Intro" />
        <H3 id="m3Check" /><OL ids={ids('m3C', 'abc')} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px] leading-snug text-ink">
            <thead><tr className="border-b border-edge text-white">{['m3ThVersion', 'm3ThCan'].map((id) => <th key={id} className="py-2 pr-3 font-semibold">{k(id)}</th>)}</tr></thead>
            <tbody>{['m3R1', 'm3R2', 'm3R3'].map((r) => <tr key={r} className="border-b border-edge"><td className="whitespace-nowrap py-2 pr-3 text-white">{k(`${r}a`)}</td><td className="py-2"><Text id={`${r}b`} /></td></tr>)}</tbody>
          </table>
        </div>
        <P id="m3Uncertain" />
        <H3 id="m3Steps" /><OL ids={ids('m3S', '1234567')} />
        <Problems list={['m3P1']} />
      </Section>

      <Section>
        <H2 id="swTitle" />
        <OL ids={ids('sw', '12345')} />
        <figure className="flex flex-col gap-2">
          <a href={`${import.meta.env.BASE_URL}help/modifications-activated.jpg`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[2px] border border-edge">
            <img src={`${import.meta.env.BASE_URL}help/modifications-activated.jpg`} alt={t('startHelp.ig3Alt')} className="w-full" loading="lazy" width={1400} height={630} />
          </a>
          <figcaption className="text-[12px] leading-snug text-ink/75">{t('startHelp.ig3Caption')}</figcaption>
        </figure>
        <P id="swUpdate" />
        <Problems list={ids('swP', '123')} />
      </Section>
    </div>
  )
}

/** The short version for the help article: the three methods, pointing at /install for the steps. */
export function InstallSummary() {
  useT()
  return (
    <>
      <P id="summary" />
      <UL ids={ids('sum', '123')} />
      <Link to="/install" className="text-[15px] text-cyan underline">{k('openGuide')}</Link>
    </>
  )
}

export function InstallGuidePage() {
  useT()
  return (
    <div className="min-h-dvh bg-void">
      <AppBar back={() => history.back()} title={t('startHelp.igTitle')} subtitle={t('startHelp.igSubtitle')}><OfflineChip /></AppBar>
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-4 pb-12">
        <InstallGuide />
      </main>
    </div>
  )
}

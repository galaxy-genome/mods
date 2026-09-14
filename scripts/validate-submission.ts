// Checks a "Submit to library" zip with the editor's own importer and rules, and writes the library entry it makes.
//   validate-submission.ts <zip> <report.md>          report only; exit 1 when the zip has errors
//   validate-submission.ts --event <event.json> <report.md> [--write]
//     reads the issue from a GitHub event, downloads its last attached zip, and with --write adds community/<id>.json
// Parses only: nothing from the zip or the issue is ever run or passed to a shell.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { CommunityEntry } from '../src/lib/community.ts'
import type { ModPart, QuestView } from '../src/lib/types.ts'

// The rules reach the store only for quick-fix buttons, and i18n only to follow the UI language.
registerHooks({
  resolve: (specifier, context, next) => specifier === '@/store/editor' ? { url: 'stub:store', shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => url === 'stub:store'
    ? { format: 'module', source: 'export const updateQuest = () => {}; export const useEditor = () => "en"', shortCircuit: true }
    : next(url, context),
})
const { importText } = await import('../src/features/start/importer.ts')
const { modProblems } = await import('../src/lib/rules.ts')
const { COMMUNITY, entryMod } = await import('../src/lib/community.ts')
const { partsOf } = await import('../src/lib/mods.ts')
const { LANGS } = await import('../src/lib/reference.ts')

const ROOT = new URL('../', import.meta.url)
export const LIMITS = { zipBytes: 5_000_000, unzippedBytes: 10_000_000, files: 250 }
const LANG_KEYS = LANGS.map((l) => l.key).join('|')
const NAME = new RegExp(`^(?:(${LANG_KEYS})/Quest\\d{1,3}\\.json|StarsStations\\.json|textures/txtr_[A-Za-z0-9_-]{1,60}\\.(?:png|xml)|catalogue-entry\\.json)$`)
const ATTACHMENT = /https:\/\/github\.com\/user-attachments\/files\/\d+\/[A-Za-z0-9._-]+\.zip/g

export interface Result { errors: string[]; warnings: string[]; entry?: CommunityEntry; textures: { name: string; bytes: Uint8Array }[] }

/** Stored or deflated entries, read from the central directory; inflating stops at the size cap. */
async function readZip(buf: Uint8Array, errors: string[]) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = buf.length - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--
  if (eocd < 0) { errors.push('The attachment is not a zip file.'); return [] }
  const count = view.getUint16(eocd + 10, true)
  if (count > LIMITS.files) { errors.push(`The zip holds ${count} files; the limit is ${LIMITS.files}.`); return [] }
  const dec = new TextDecoder()
  const out: { name: string; bytes: Uint8Array }[] = []
  let total = 0
  for (let i = 0, p = view.getUint32(eocd + 16, true); i < count; i++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) { errors.push('The zip file is damaged.'); return [] }
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
    if (name.endsWith('/')) continue
    if (!NAME.test(name)) { errors.push(`Unexpected file in the zip: \`${name.slice(0, 80).replace(/`/g, '')}\`. Upload the zip the editor downloaded.`); continue }
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const raw = buf.subarray(start, start + compSize)
    let bytes: Uint8Array
    if (method === 0) bytes = raw
    else if (method === 8) {
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const chunk of new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))) {
        size += chunk.length
        if (total + size > LIMITS.unzippedBytes) break
        chunks.push(chunk)
      }
      bytes = Buffer.concat(chunks)
    } else { errors.push(`\`${name}\` uses an unsupported compression.`); continue }
    total += bytes.length
    if (total > LIMITS.unzippedBytes) { errors.push(`The unzipped files pass the ${LIMITS.unzippedBytes / 1e6} MB limit.`); return [] }
    out.push({ name, bytes })
  }
  return out
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function validateZip(buf: Uint8Array, library: CommunityEntry[] = COMMUNITY): Promise<Result> {
  const errors: string[] = []
  const warnings: string[] = []
  const textures: Result['textures'] = []
  if (buf.length > LIMITS.zipBytes) return { errors: [`The zip is larger than ${LIMITS.zipBytes / 1e6} MB.`], warnings, textures }
  const files = await readZip(buf, errors)
  if (!files.length && errors.length) return { errors, warnings, textures }
  const dec = new TextDecoder('utf-8', { fatal: true })
  const decode = (bytes: Uint8Array) => { try { return dec.decode(bytes) } catch { return null } }

  const catalogueFile = files.find((f) => f.name === 'catalogue-entry.json')
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(decode(catalogueFile?.bytes ?? new Uint8Array()) ?? '') } catch { errors.push('catalogue-entry.json is missing or is not valid JSON.') }
  const title = text(meta.title, 80)
  const version = text(meta.version, 20) || '1.0'
  if (catalogueFile && !title) errors.push('The mod has no name. Fill in its name and download the zip again.')
  const id = `${slug(title) || 'mod'}-${slug(version) || '1'}`
  if (library.some((e) => e.id === id) || existsSync(new URL(`community/${id}.json`, ROOT))) errors.push(`The library already has \`${id}\`. Raise the mod's version for a new release.`)

  const entryFiles: CommunityEntry['files'] = []
  const parts: { label: string; part: ModPart }[] = []
  for (const f of files) {
    if (f.name.startsWith('textures/')) { textures.push({ name: f.name.slice(9), bytes: f.bytes }); continue }
    if (f.name === 'catalogue-entry.json') continue
    const content = decode(f.bytes)
    const result = content === null ? null : importText(content)
    if (!result || result.kind !== 'ok') { errors.push(`\`${f.name}\` does not open in the editor.`); continue }
    const [lang, name] = f.name.includes('/') ? f.name.split('/') : ['auto', f.name]
    entryFiles.push({ name, lang, text: content! })
    parts.push({ label: f.name, part: result.mod })
    for (const note of result.look) warnings.push(`${f.name}: ${note}`)
  }
  if (!parts.length && catalogueFile) errors.push('The zip holds no quest or stars & stations files.')
  const names = new Set(textures.map((x) => x.name))
  for (const n of names) if (!names.has(n.replace(/\.png$/, '.xml')) || !names.has(n.replace(/\.xml$/, '.png'))) errors.push(`Texture \`${n}\` is missing its .png or .xml partner.`)

  const libraryParts = library.flatMap((e) => partsOf(entryMod(e)))
  const all = [...parts.map((p) => p.part), ...libraryParts]
  for (const { label, part } of parts) {
    for (const p of modProblems(part, all)) (p.severity === 'error' ? errors : p.severity === 'warning' ? warnings : []).push(`${label} · ${p.location.label}: ${p.message}`)
    if (part.meta.type === 'quest') {
      const qid = (part as QuestView).versions[(part as QuestView).primaryLang]?.settings.questId
      const clash = library.find((e) => partsOf(entryMod(e)).some((o) => o.meta.type === 'quest' && Object.values((o as QuestView).versions).some((c) => c?.settings.questId === qid)))
      if (clash) warnings.push(`${label}: quest ID ${qid} is also used by library mod "${clash.title}". Download renumbers it for players.`)
    }
  }

  const tags = Array.isArray(meta.tags) ? meta.tags.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 30)).slice(0, 10) : []
  const updated = Date.parse(text(meta.updated, 40))
  const entry: CommunityEntry = {
    id, title, author: text(meta.author, 80), summary: text(meta.summary, 500), tags, popularity: 0, version,
    updated: Number.isFinite(updated) ? updated : Date.now(), licence: text(meta.licence, 80), source: '', role: 'library',
    files: entryFiles,
    ...(textures.length ? { textures: [...names].filter((n) => n.endsWith('.png')).map((n) => n.slice(0, -4)), textureBase: `community/${id}/` } : {}),
    ...(Array.isArray(meta.requires) && meta.requires.length ? { requires: meta.requires as CommunityEntry['requires'] } : {}),
  }
  return { errors, warnings, entry: errors.length ? undefined : entry, textures }
}

/** The issue form's answers: `### Label` headings, each followed by its value. */
export function formFields(body: string) {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/^### (.+)\n+([\s\S]*?)(?=\n### |$(?![\s\S]))/gm)) out[m[1].trim()] = m[2].trim() === '_No response_' ? '' : m[2].trim()
  return out
}

export function report({ errors, warnings, entry }: Result) {
  const list = (items: string[]) => items.map((x) => `- ${x.replace(/[<>@]/g, (c) => `&#${c.charCodeAt(0)};`)}`).join('\n')
  return [
    errors.length ? `### ❌ ${errors.length} error${errors.length === 1 ? '' : 's'}\n\nFix these in the editor, download the zip again and attach it by editing this issue.\n\n${list(errors)}` : `### ✅ Checks passed\n\n\`${entry?.id}\` is ready for a maintainer to review.`,
    warnings.length ? `### ⚠️ ${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n\n${list(warnings)}` : '',
  ].filter(Boolean).join('\n\n') + '\n'
}

async function download(url: string) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Could not download the attachment (${res.status}).`)
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.length
    if (size > LIMITS.zipBytes) throw new Error(`The zip is larger than ${LIMITS.zipBytes / 1e6} MB.`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const [first, second, third] = args.filter((a) => a !== '--write')
  const eventMode = first === '--event'
  const reportPath = eventMode ? third : second
  let result: Result
  let issue: { html_url: string; created_at: string; body: string | null; user: { login: string } } | undefined
  try {
    if (eventMode) {
      issue = JSON.parse(readFileSync(second, 'utf8')).issue
      const url = [...(issue!.body ?? '').matchAll(ATTACHMENT)].at(-1)?.[0]
      if (!url) throw new Error('No zip is attached. Drag the zip the editor downloaded into the form, then save.')
      result = await validateZip(await download(url))
    } else result = await validateZip(readFileSync(first))
  } catch (e) {
    result = { errors: [(e as Error).message], warnings: [], textures: [] }
  }
  writeFileSync(reportPath, report(result))
  if (write && result.entry && issue) {
    const form = formFields(issue.body ?? '')
    const entry = result.entry
    entry.author = form['Author name'] || entry.author || issue.user.login
    entry.licence = (form['Licence'] === 'Other' ? form['Other licence'] : form['Licence']) || entry.licence
    entry.summary = form['Summary'] || entry.summary
    if (form['Tags']) entry.tags = form['Tags'].split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 10)
    entry.source = issue.html_url
    entry.posted = issue.created_at.slice(0, 10)
    writeFileSync(new URL(`community/${entry.id}.json`, ROOT), JSON.stringify(entry, null, 2) + '\n')
    if (result.textures.length) {
      const dir = new URL(`public/community/${entry.id}/`, ROOT)
      mkdirSync(dir, { recursive: true })
      for (const t of result.textures) writeFileSync(new URL(t.name, dir), t.bytes)
    }
    console.log(entry.id)
  }
  process.exitCode = result.errors.length ? 1 : 0
}

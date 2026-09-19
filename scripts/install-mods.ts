// Combines mods with the editor's own download planner and installs them on a phone over adb.
//   install-mods.ts <mod> [<mod>...] [--dry-run] [--no-backup] [--force] [--lang en] [--serial <adb serial>]
//   install-mods.ts --list
// <mod> is a library id, a library title, a .zip the editor downloaded, or a folder of mod JSON files.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import type { Mod, ModPart, TexturePart } from '../src/lib/types.ts'

// The rules reach the store only for quick-fix buttons, and i18n only to follow the UI language.
registerHooks({
  resolve: (specifier, context, next) => specifier === '@/store/editor' ? { url: 'stub:store', shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => url === 'stub:store'
    ? { format: 'module', source: 'export const updateQuest = () => {}; export const useEditor = () => "en"', shortCircuit: true }
    : next(url, context),
})
const { importText } = await import('../src/features/start/importer.ts')
const { COMMUNITY, entryMod } = await import('../src/lib/community.ts')
const { modFromParts, pairTextures, partsOf } = await import('../src/lib/mods.ts')
const { planDownload, buildDownload } = await import('../src/lib/download.ts')
const { unzip } = await import('../src/lib/zip.ts')
const { makeGalaxy } = await import('../src/features/map/galaxy.ts')

const ROOT = new URL('../', import.meta.url)
const PHONE = new URL('../../phone/', import.meta.url)
const REMOTE = '/sdcard/Android/data/com.skvgames.GalaxyGenome/files'

const die = (msg: string): never => { console.error(msg); process.exit(1) }

/* ---------- sources ---------- */

function modFromFiles(files: { name: string; text: string; bytes: Uint8Array }[], title: string): Mod {
  const views: ModPart[] = []
  for (const f of files) {
    if (!f.name.endsWith('.json') || f.name.includes('__MACOSX')) continue
    const result = importText(f.text)
    if (result.kind === 'ok') views.push(result.mod)
    else console.warn(`  ! ${f.name} is not a mod file; skipped.`)
  }
  const textures: TexturePart[] = pairTextures(files).textures
  if (!views.length && !textures.length) die(`${title} holds no mod files.`)
  return modFromParts(views, { id: title, title }, textures)
}

async function resolveMod(name: string): Promise<Mod> {
  const entry = COMMUNITY.find((e) => e.id === name)
    ?? (() => {
      const hits = COMMUNITY.filter((e) => e.title.toLowerCase() === name.toLowerCase())
      if (hits.length > 1) die(`"${name}" matches ${hits.length} library mods: ${hits.map((e) => e.id).join(', ')}. Name one by id.`)
      return hits[0]
    })()
  if (entry) return entryMod(entry)
  if (existsSync(name)) {
    if (statSync(name).isDirectory()) {
      const files = readdirSync(name).map((n) => ({ name: n, text: readFileSync(join(name, n), 'utf8'), bytes: readFileSync(join(name, n)) }))
      return modFromFiles(files, basename(name.replace(/\/$/, '')))
    }
    return modFromFiles(await unzip(new Blob([readFileSync(name)])), basename(name, '.zip'))
  }
  return die(`No mod called "${name}". Library ids:\n${COMMUNITY.map((e) => `  ${e.id}  ${e.title}`).join('\n')}`)
}

/* ---------- adb ---------- */

const argv = process.argv.slice(2)
const flag = (f: string) => argv.includes(f)
const value = (f: string) => { const i = argv.indexOf(f); return i < 0 ? undefined : argv[i + 1] }
const serial = value('--serial')
const dry = flag('--dry-run')

const adb = (...args: string[]) => execFileSync('adb', [...(serial ? ['-s', serial] : []), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const run = (label: string, fn: () => string) => { if (dry) { console.log(`  would ${label}`); return '' } return fn() }

/** Every file on the phone, as path (relative to REMOTE) → bytes. */
function remoteFiles(): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of adb('shell', `cd ${REMOTE} && find . -type f -exec stat -c '%s %n' {} +`).split('\n')) {
    const m = line.trim().match(/^(\d+) \.\/(.+)$/)
    if (m) out.set(m[2], Number(m[1]))
  }
  return out
}

/* ---------- main ---------- */

if (flag('--list')) {
  for (const e of COMMUNITY.toSorted((a, b) => a.id.localeCompare(b.id))) console.log(`${e.id}\t${e.title}`)
  process.exit(0)
}

const names = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--serial' && argv[i - 1] !== '--lang')
if (!names.length) die('Name at least one mod. `--list` prints the library.')

const mods: Mod[] = []
for (const n of names) mods.push(await resolveMod(n))

const galaxyData = JSON.parse(readFileSync(new URL('public/data/galaxy.json', ROOT), 'utf8'))
const plan = planDownload(mods, (value('--lang') ?? 'en') as 'en', mods.flatMap(partsOf), mods, makeGalaxy(galaxyData))

console.log(`Combining ${mods.length} mod${mods.length === 1 ? '' : 's'}: ${mods.map((m) => m.meta.title).join(', ')}`)
for (const f of plan.fixes) console.log(`  · ${f}`)
const errors = plan.issues.filter((i) => i.severity === 'error')
for (const i of plan.issues) console.log(`  ${i.severity === 'error' ? '✗' : '⚠'} ${i.message}`)
if (errors.length && !flag('--force')) die(`\n${errors.length} error${errors.length === 1 ? '' : 's'}. These mods do not combine; fix them or pass --force.`)

const files = (await unzip(await buildDownload(plan, null, {}))).filter((f) => f.name.startsWith('mod/')).map((f) => ({ name: f.name.slice(4), bytes: f.bytes }))
const stage = join(tmpdir(), `gg-install-${process.pid}`)
for (const f of files) { mkdirSync(join(stage, dirname(f.name)), { recursive: true }); writeFileSync(join(stage, f.name), f.bytes) }
const quests = files.filter((f) => /^Quest\d+\.json$/.test(f.name)).length
console.log(`\nCombined mod: ${quests} quest file(s)${files.some((f) => f.name === 'StarsStations.json') ? ', StarsStations.json' : ''}${files.some((f) => f.name.startsWith('textures/')) ? `, ${files.filter((f) => f.name.startsWith('textures/')).length} texture file(s)` : ''}`)

const attached = (() => { try { return adb('devices').split('\n').filter((l) => l.endsWith('\tdevice')).length } catch { return 0 } })()
if (!attached || (!serial && attached !== 1)) {
  console.log(attached > 1 ? `${attached} devices are attached; name one with --serial.` : 'No phone attached over adb; nothing installed.')
  process.exit(0)
}

const before = remoteFiles()
const saves = [...before.keys()].filter((n) => n.endsWith('.SOL'))
const modFiles = [...before.keys()].filter((n) => !n.endsWith('.SOL'))
console.log(`\nPhone now holds: ${modFiles.join(', ') || '(no mod files)'}  |  saves: ${saves.join(', ') || '(none)'}`)

if (!flag('--no-backup')) {
  const stamp = Math.floor(Date.now() / 1000)
  const modDir = fileURLToPathish(new URL(`mods/backups/${stamp}-mods/`, PHONE))
  const saveDir = fileURLToPathish(new URL(`saves/backups/${stamp}-saves/`, PHONE))
  for (const [dir, list] of [[modDir, modFiles], [saveDir, saves]] as const) {
    if (!list.length) continue
    if (!dry) mkdirSync(dir, { recursive: true })
    for (const n of list) run(`pull ${n} to ${dir}`, () => { mkdirSync(join(dir, dirname(n)), { recursive: true }); return adb('pull', '-a', `${REMOTE}/${n}`, join(dir, n)) })
  }
  console.log(`Backup: ${modFiles.length} mod file(s) → ${modDir}, ${saves.length} save(s) → ${saveDir}`)
}

for (const n of modFiles) run(`delete ${REMOTE}/${n}`, () => adb('shell', `rm -f '${REMOTE}/${n}'`))
if (dry) console.log(`  would push ${files.length} file(s) from ${stage}`)
else for (const f of files) adb('push', join(stage, f.name), `${REMOTE}/${f.name}`)

if (dry) { console.log('\n--dry-run: the phone was not touched.'); process.exit(0) }

const after = remoteFiles()
const bad = files.filter((f) => after.get(f.name) !== f.bytes.length)
const extra = [...after.keys()].filter((n) => !n.endsWith('.SOL') && !files.some((f) => f.name === n))
if (bad.length || extra.length) die(`Verify failed: ${bad.map((f) => `${f.name} is ${after.get(f.name) ?? 'missing'}, expected ${f.bytes.length}`).join('; ')}${extra.length ? ` unexpected: ${extra.join(', ')}` : ''}`)
console.log(`Installed ${files.length} file(s) from ${mods.length} mod(s); ${saves.length} save(s) left alone.`)

function fileURLToPathish(u: URL) { return decodeURIComponent(u.pathname) }

// node --import ./scripts/test-hooks.mjs src/data/fidelity.test.ts — §9: every mod file imports and writes back as it was.
import { strict as assert } from 'node:assert'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { toGameJson, toStarsJson } from '../features/output/gameJson.ts'
import { importText } from '../features/start/importer.ts'
import { COMMUNITY, entryMod } from '../lib/community.ts'
import { partsOf } from '../lib/mods.ts'
import { syncVersion } from '../lib/versions.ts'
import type { ModPart, QuestView, StarsView } from '../lib/types.ts'

const MODS = join(import.meta.dirname, '../../local')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /^(Quest\d+|StarsStations)\.json$/.test(n) ? [p] : []
  })
}

const write = (part: ModPart, lang?: string) =>
  JSON.stringify(part.meta.type === 'stars' ? toStarsJson(part as StarsView) : toGameJson((part as QuestView).versions[(lang ?? (part as QuestView).primaryLang) as 'en']!))
const parsed = (text: string) => JSON.stringify(JSON.parse(text.replace(/^﻿/, '')))

const files = existsSync(MODS) ? walk(MODS) : []

// local/ holds the maintainers' collection of real mods and is not in the repository, so CI skips this.
test('every quest and stars file under local/ round-trips with key order', { skip: !existsSync(MODS) }, () => {
  assert.ok(files.length > 50, `found ${files.length} files`)
  const failed: string[] = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const r = importText(text)
    if (r.kind !== 'ok' || write(r.mod) !== parsed(text)) failed.push(f)
  }
  assert.deepEqual(failed, [])
})

test('community library entries round-trip, each language version through the mod it joins', () => {
  for (const entry of COMMUNITY) {
    const mod = entryMod(entry)
    for (const file of entry.files) {
      const data = JSON.parse(file.text.replace(/^﻿/, ''))
      if (data.Stars || data.Planets || data.Stations) {
        assert.equal(write(partsOf(mod).find((p) => p.meta.type === 'stars')!), parsed(file.text), `${entry.id} ${file.name}`)
        continue
      }
      const lang = String(data.settings.Lang).toLowerCase()
      const quest = partsOf(mod).find((p) => p.meta.type === 'quest' && (p as QuestView).versions[lang as 'en']?.settings.questId === data.settings.ID)
      assert.ok(quest, `${entry.id} ${file.name}`)
      assert.equal(write(quest!, lang), parsed(file.text), `${entry.id} ${file.name} (${lang})`)
    }
  }
})

test('language versions keep their own layout after a structural edit to the primary', () => {
  const en = importText('{"settings":{"QuestName":"A","ID":7,"Lang":"en"},"questParts":[{"name":"One","zz":1}],"BarRumors":[]}')
  const ru = importText('{"BarRumors":[],"questParts":[{"yy":2,"name":"Один"}],"settings":{"Lang":"ru","ID":7,"QuestName":"А"}}')
  assert.ok(en.kind === 'ok' && ru.kind === 'ok')
  const primary = (en.mod as QuestView).versions.en!
  const version = syncVersion(primary, (ru.mod as QuestView).versions.ru!)
  const out = toGameJson(version) as { questParts: Record<string, unknown>[] }
  assert.deepEqual(Object.keys(out), ['BarRumors', 'questParts', 'settings'])
  assert.deepEqual(out.questParts[0].yy, 2)
  assert.equal('zz' in out.questParts[0], false)
})

test('edits reach the file; kept values stop applying once the model changes', () => {
  const text = '{"settings":{"QuestName":"A","ID":9,"Lang":"en","Faction":"none"},"questParts":[{"name":"One","dialogTextRepeat":null,"customKey":"x"}]}'
  const r = importText(text)
  assert.ok(r.kind === 'ok')
  const content = (r.mod as QuestView).versions.en!
  assert.equal(JSON.stringify(toGameJson(content)), parsed(text))
  content.steps[0].name = 'Renamed'
  content.steps[0].reminder.push({ id: 'l', speaker: 'Bo', portrait: 'Tourist1', text: 'Hi', closeAfterSec: 5, choices: [] })
  content.steps[0].ships.push({ id: 's', pilot: 'P', model: 'hawk', level: 'Novice', behaviour: 'Pirate', autoLvl: false, placement: 'nearPlayer', distance: 200, x: 0, y: 0, tint: null })
  const step = (toGameJson(content) as { questParts: Record<string, unknown>[] }).questParts[0]
  assert.equal(step.name, 'Renamed')
  assert.equal((step.dialogTextRepeat as unknown[]).length, 1)
  assert.equal(step.customKey, 'x')
  assert.equal((step.shipSpawn as unknown[]).length, 1, 'a list the file left out appears once it has items')
  assert.deepEqual(Object.keys(step).slice(0, 3), ['name', 'dialogTextRepeat', 'customKey'])
  const made = toGameJson({ settings: content.settings, steps: [{ ...content.steps[0], _layout: undefined, _extra: undefined, _kept: undefined }], rumors: [] }) as { questParts: Record<string, unknown>[] }
  assert.deepEqual(Object.keys(made.questParts[0]).slice(0, 3), ['name', 'TODO', 'questID'], 'objects made in the editor use the game order')
})

test('start mode writes the bar flags the game reads', () => {
  const r = importText('{"settings":{"QuestName":"A","ID":5,"Lang":"en","StationName":"Hub","isRandomStationQuest":false,"isRandomSpaceQuest":false},"questParts":[]}')
  assert.ok(r.kind === 'ok')
  const content = (r.mod as QuestView).versions.en!
  assert.equal(content.settings.startMode, 'bar')
  const flags = (c: typeof content) => { const s = (toGameJson(c) as { settings: Record<string, unknown> }).settings; return [s.isRandomStationQuest, s.isRandomSpaceQuest, s.StationName] }
  assert.deepEqual(flags(content), [false, false, 'Hub'])
  content.settings.startMode = 'nearPoint'
  assert.deepEqual(flags(content), [true, false, ''])
})

test('a follow order keeps its target', () => {
  const r = importText('{"settings":{"QuestName":"A","ID":6,"Lang":"en"},"questParts":[{"name":"One","shipControl":[{"ShipName":"T","SetTarget":"player","Attack":false,"Destroy":false,"shipBehavior":"TraderNoWeapons"}]}]}')
  assert.ok(r.kind === 'ok')
  const content = (r.mod as QuestView).versions.en!
  assert.equal(content.steps[0].orders[0].target, 'player')
  const made = toGameJson({ ...content, steps: [{ ...content.steps[0], _layout: undefined, _extra: undefined, _kept: undefined }] }) as { questParts: { shipControl: Record<string, unknown>[] }[] }
  assert.equal(made.questParts[0].shipControl[0].SetTarget, 'player')
})

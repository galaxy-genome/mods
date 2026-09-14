// node --import ./scripts/test-hooks.mjs --no-warnings scripts/phone-kit.ts — builds the Android test zips in
// docs/ignored/phone-test/ with the editor's own Download, re-imports each one and prints the editor's problems.
import { strict as assert } from 'node:assert'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../docs/ignored/phone-test/', import.meta.url))
const PUBLIC = new URL('../public/', import.meta.url)
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(String(url).replace(/^\//, ''), PUBLIC)))) as typeof fetch

const { loadGalaxy } = await import('@/features/map/galaxy')
const { buildDownload, planDownload } = await import('@/lib/download')
const { COMMUNITY, entryMod } = await import('@/lib/community')
const { newLine, newMission, newQuestView, newShip, newStarsView, newStep, uid } = await import('@/lib/factory')
const { modFromParts, partsOf } = await import('@/lib/mods')
const { modProblems } = await import('@/lib/rules')
const { importText } = await import('@/features/start/importer')
const { toGameJson } = await import('@/features/output/gameJson')
const { unzip, zip } = await import('@/lib/zip')
const { WAIT_FOR_PLAYER } = await import('@/lib/types')
type Mod = import('@/lib/types').Mod
type Step = import('@/lib/types').Step
type QuestView = import('@/lib/types').QuestView

await loadGalaxy()
mkdirSync(OUT, { recursive: true })

const BAR = 'Thunder Station'
const say = (text: string, choices: { text: string; to: Step | null }[] = []) =>
  newLine({ speaker: 'Probe', portrait: 'Tourist1', text, closeAfterSec: WAIT_FOR_PLAYER, choices: choices.map((c) => ({ id: uid(), text: c.text, targetStepId: c.to?.id ?? null })) })
const talk = (name: string, text: string, extra: Partial<Step> = {}) =>
  newStep({ name, journal: text.slice(0, 80), dialogue: [say(text)], ...extra })
const barQuest = (name: string, id: number, steps: Step[], extra = {}) =>
  newQuestView(name, { settings: { questName: name, description: `Phone test ${name}`, questId: id, stationName: BAR, charName: 'Probe', ...extra }, steps, rumors: [] })
const favorite = (views: import('@/lib/types').ModPart[], title: string, textures: Mod['textures'] = []) => {
  const mod = modFromParts(views, { title, favorite: true, version: '1.0.0' }, textures)
  return mod
}

/* ---------- A: quests ---------- */

const a1 = barQuest('A1 Bar quest EN', 5_100_001, [
  talk('Hello', 'A1 loaded. A bar quest from a mod works. Close this to go on.'),
  talk('Done', 'A1 step 2. Close this and the quest completes.'),
])

// A2: the English version ships through Download; the Russian one is added as Quest0.json below it, so both files
// share the ID and the Russian one loads first.
const a2 = barQuest('A2 Language clash', 5_100_002, [
  talk('Hello', 'A2 ENGLISH file loaded. Write down: English text.'),
  talk('Done', 'A2 English step 2.'),
])
const a2ru = barQuest('A2 Language clash', 5_100_002, [
  talk('Hello', 'A2 RUSSIAN file loaded (Русский). Write down: Russian text.'),
  talk('Done', 'A2 Русский шаг 2.'),
], { lang: 'ru', questName: 'A2 Конфликт языка' })

const a3 = newQuestView('A3 Space quest near Sol', {
  settings: { questName: 'A3 Space quest near Sol', description: 'Phone test A3', questId: 5_100_003, startMode: 'space', trigger: 'warp', chance: 1, pointX: 0, pointY: 0, radius: 30, charName: 'Probe' },
  steps: [talk('Hello', 'A3 loaded. A random space quest started after a warp near Sol.'), talk('Done', 'A3 step 2. Close this and the quest completes.')],
  rumors: [],
})

const a4a = barQuest('A4a ID clash first', 5_100_004, [talk('Hello', 'A4a loaded (kept its ID).'), talk('Done', 'A4a step 2.')])
const a4b = barQuest('A4b ID clash second', 5_100_004, [talk('Hello', 'A4b loaded. Download gave it a new ID, so both quests exist.'), talk('Done', 'A4b step 2.')])

const drone = (pilot: string) => newShip({ pilot, model: 'hawk', level: 'Harmless', behaviour: 'TraderNoWeapons', distance: 300 })
const kill = (pilot: string) => `ACTION_SHIP_DESTROYED_${pilot}`
const a5s = barQuest('A5 Checkpoint STRANDED', 5_100_005, [
  talk('Hello', 'A5 STRANDED. Close this. A drone named Stranded Drone appears. Do NOT shoot it. Save, quit and reload the game.'),
  newStep({ name: 'Drone', journal: 'Destroy Stranded Drone (reload test: save, quit, reload first)', checkpoint: true, ships: [drone('Stranded Drone')], finishWhen: kill('Stranded Drone') }),
  talk('Done', 'A5 STRANDED finished. The drone was there after the reload.'),
])
const a5f = barQuest('A5 Checkpoint SAFE', 5_100_006, [
  talk('Hello', 'A5 SAFE. Close this. Then save, quit and reload the game. After the reload, warp anywhere.'),
  newStep({ name: 'Warp', journal: 'Save, quit, reload, then warp anywhere', checkpoint: true, finishWhen: 'ACTION_WARP_END' }),
  newStep({ name: 'Drone', journal: 'Destroy Safe Drone', dialogue: [say('A5 SAFE: warp seen after reload. Safe Drone is here. Destroy it.')], ships: [drone('Safe Drone')], finishWhen: kill('Safe Drone') }),
  talk('Done', 'A5 SAFE finished.'),
])

const hub = talk('Hub', 'A6 pick a branch')
const left = talk('Left', 'A6 LEFT branch. Close this to jump to the merge step.')
const right = talk('Right', 'A6 RIGHT branch. Close this; the quest runs on into the merge step.')
const merge = talk('Merge', 'A6 MERGE step reached. Close this and the quest completes.')
hub.dialogue = [say('A6 loop and merge. Pick one. "Again" should show this same dialog again.', [{ text: 'Left', to: left }, { text: 'Right', to: right }, { text: 'Again', to: hub }])]
left.dialogue = [say('A6 LEFT branch. Press Merge.', [{ text: 'Merge', to: merge }])]
left.finishWhen = 'ACTION_DIALOG_COMPLETE'
const a6 = barQuest('A6 Loop and merge', 5_100_007, [hub, left, right, merge])

const a7 = barQuest('A7 BOM file', 5_100_008, [talk('Hello', 'A7 loaded. The game accepts a file that starts with a UTF-8 BOM.'), talk('Done', 'A7 step 2.')])

const questMods = [
  favorite([a1], 'A1'), favorite([a2], 'A2'), favorite([a3], 'A3'), favorite([a4a], 'A4a'), favorite([a4b], 'A4b'),
  favorite([a5s], 'A5 stranded'), favorite([a5f], 'A5 safe'), favorite([a6], 'A6'), favorite([a7], 'A7'),
]

/* ---------- B: stars ---------- */

const probe = newStarsView('B Probe')
const star = (name: string, x: number, y: number) => ({ id: uid(), name, x, y, z: 0, security: 'High' as const, type: 'G-WhiteYellow' })
const planet = (name: string, type: string, orbit: number) => ({ id: uid(), name, system: 'GGE Probe', type, orbit, moons: 0, size: 50, rings: 0, material: null })
const station = (name: string, system: string, bodyIndex: number) => ({ id: uid(), name, system, bodyIndex, type: 'OrbitalWhite' as const, faction: 'Independent' as const })
probe.stars = [star('GGE Probe', -12, 24), star('Ross 614', -25, 0)]
probe.planets = [
  planet('P1 Rock d100 should load', 'RockPlanet', 100),
  planet('P2 Asteroids should be skipped', 'Asteroids', 200),
  planet('P3 Star type should be skipped', 'M-RedDwarf', 300),
  planet('P4 Ice d450 should load at 400', 'IcePlanet', 450),
  planet('P5 Gas d420 should be skipped orbit taken', 'GasGiantClassI', 420),
  planet('P6 Water d600 should load', 'WaterWorld', 600),
]
probe.stations = [
  station('Stn1 on P1 Rock should load', 'GGE Probe', 1),
  station('Stn2 on P4 Ice should load', 'GGE Probe', 2),
  station('Stn3 on P6 Water should load', 'GGE Probe', 3),
  station('Stn4 PlanetID 4 should be skipped', 'GGE Probe', 4),
  station('Stn5 in Sol should be skipped', 'Sol', 1),
  station('Gamma Orbital', 'GGE Probe', 1),
]
// A8 lives in zip B because its bar, board and dock are the probe's own Stn1.
const PORT = 'Stn1 on P1 Rock should load'
const a8 = barQuest('A8 Mod station bar and board', 5_100_009, [
  talk('Hello', 'A8 loaded: the bar of a station from a stars mod offers quests. Close this.'),
  newStep({ name: 'Board', journal: 'A8: open the Stn1 mission board and accept the A8 courier job', dialogue: [say('A8: open the mission board here and accept the story mission "A8".')],
    mission: newMission({ type: 'Courier', homeStation: PORT, targetStation: 'Thunder Station', targetSystem: 'Sol', credits: 1000, reputation: 1 }), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }),
  newStep({ name: 'Turn in', journal: 'A8: deliver the courier job and collect the reward', finishWhen: 'GET_STORY_REWARD' }),
  newStep({ name: 'Arrive', journal: 'A8: warp out of GGE Probe and back in', dialogue: [say('A8 reward seen. Now warp out of GGE Probe and back in. Do not dock.')], finishWhen: 'ACTION_WARP_END_SYSTEM_GGE Probe' }),
  newStep({ name: 'Dock', journal: 'A8: dock at Stn1', dialogue: [say('A8 arrival seen. Write: in space or docked? Now dock at Stn1.')], finishWhen: `ACTION_CLICK_STATION_${PORT}` }),
  talk('Done', 'A8 docking seen. Close this and the quest completes.'),
], { stationName: PORT })
const entry = (id: string) => COMMUNITY.find((e) => e.id === id) ?? (console.error(`${id} missing: put it in community/ or community-pending/`), process.exit(1))
const starMods = [entryMod(entry('community-trappist')), entryMod(entry('community-jita-tama')), favorite([probe], 'B Probe'), favorite([a8], 'A8')]
for (const m of starMods) m.meta.favorite = true

/* ---------- build, verify ---------- */

async function build(name: string, mods: Mod[], edit?: (plan: ReturnType<typeof planDownload>) => void, post?: (files: { name: string; text?: string; bytes?: Uint8Array }[]) => void) {
  const all = mods.flatMap(partsOf)
  const plan = planDownload(mods, 'en', all)
  edit?.(plan)
  let blob = await buildDownload(plan, null, {})
  if (post) {
    const files = (await unzip(blob)).map((f) => (f.name.endsWith('.json') || f.name.endsWith('.xml') ? { name: f.name, text: f.text } : { name: f.name, bytes: f.bytes }))
    post(files)
    blob = zip(files.toSorted((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })) as never)
  }
  const path = `${OUT}${name}`
  writeFileSync(path, new Uint8Array(await blob.arrayBuffer()))
  console.log(`\n=== ${name}`)
  console.log(execSync(`unzip -l "${path}"`).toString())
  for (const f of plan.fixes) console.log('fix:', f)
  for (const i of plan.issues) console.log(`${i.severity}:`, i.message)

  const views: import('@/lib/types').ModPart[] = []
  for (const f of await unzip(blob)) {
    if (!f.name.endsWith('.json')) continue
    const result = importText(f.text!)
    assert.equal(result.kind, 'ok', f.name)
    if (result.kind === 'ok') views.push(result.mod)
  }
  for (const v of views) {
    const label = v.meta.type === 'quest' ? (v as QuestView).versions[(v as QuestView).primaryLang]!.settings.questName : 'StarsStations.json'
    const problems = modProblems(v, views)
    console.log(`problems ${label}:`, problems.length ? '' : 'none')
    for (const p of problems) console.log(`  ${p.severity} ${p.id.replace(/-[0-9a-f-]{36}/g, '')}: ${p.message}`)
  }
  return plan
}

await build('A-quests.zip', questMods, (plan) => {
  for (const q of plan.quests) q.slot++
}, (files) => {
  files.push({ name: 'mod/Quest0.json', text: JSON.stringify(toGameJson(a2ru.versions.ru!), null, 2) })
  const bom = files.find((f) => f.text?.includes('"A7 BOM file"'))!
  bom.text = `﻿${bom.text}`
})
await build('B-stars.zip', starMods)
console.log(execSync(`ls -l "${OUT}"`).toString())

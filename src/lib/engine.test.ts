// node src/lib/engine.test.ts — space requirements, joined finishes, station missions.
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

const src = new URL('../', import.meta.url)
const stubs: Record<string, string> = {
  '@/i18n': 'export const t = (key) => key; export const useT = () => t',
  '@/store/editor': 'export const updateQuest = (id, recipe) => globalThis.applyFix(recipe)',
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier in stubs) return { url: `stub:${specifier}`, shortCircuit: true }
    if (specifier.startsWith('@/')) {
      const path = specifier.slice(2)
      return next(new URL(/\.\w+$/.test(path) ? path : `${path}.ts`, src).href, context)
    }
    if (specifier.startsWith('./') && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context)
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: stubs[url.slice(5)], shortCircuit: true }
    if (url.endsWith('.json')) {
      const { source } = next(url, { ...context, format: 'json', importAttributes: { type: 'json' } })
      return { format: 'module', source: `export default ${source}`, shortCircuit: true }
    }
    return next(url, context)
  },
})


const { questProblems } = await import('./rules.ts')
const { newMission, newQuestView, newStep } = await import('./factory.ts')
import type { QuestView } from './types'

const problems = (v: QuestView) => questProblems(v, [v]).filter((p) => /^(space-req|near-own|finish-joined|mission-(first|story|turnin))/.test(p.id))
const ids = (v: QuestView) => problems(v).map((p) => `${p.id.replace(/-[0-9a-f-]{36}.*$/, '')}:${p.severity}`).sort()
const quest = (steps: ReturnType<typeof newStep>[], settings = {}) => newQuestView('T', { settings: { stationName: 'Thunder Station', charName: 'A', ...settings }, steps, rumors: [] })
const two = () => [newStep(), newStep()]

// Space start ignores every requirement; near a point ignores own station only.
const space = quest(two(), { startMode: 'space', chance: 0.5, requiredQuestIds: [100002] })
assert.deepEqual(ids(space), ['space-req:warning'])
assert.deepEqual(ids(quest(two(), { startMode: 'space', chance: 0.5, minKarma: 10 })), ['space-req:warning'])
assert.deepEqual(ids(quest(two(), { startMode: 'space', chance: 0.5, ownStationRequired: true })), ['space-req:warning'])
assert.deepEqual(ids(quest(two(), { startMode: 'space', chance: 0.5 })), [])
assert.deepEqual(ids(quest(two(), { requiredQuestIds: [100002], ownStationRequired: true })), [])
assert.deepEqual(ids(quest(two(), { startMode: 'nearPoint', ownStationRequired: true })), ['near-own:warning'])
;(globalThis as any).applyFix = (recipe: (q: unknown) => void) => recipe(space.versions.en)
problems(space)[0].fix!.apply()
assert.equal(space.versions.en!.settings.startMode, 'bar')

// Finishes when is one action.
assert.deepEqual(ids(quest([newStep({ finishWhen: 'NO_ENEMY;ACTION_WARP_END' }), newStep()])), ['finish-joined:error'])

// Station missions: accept then hand in, Story on, not on step 1.
const mission = (partial = {}) => newMission({ homeStation: 'Thunder Station', ...partial })
const good = quest([newStep(), newStep({ mission: mission(), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }), newStep({ finishWhen: 'GET_STORY_REWARD' })])
assert.deepEqual(ids(good), [])
assert.deepEqual(ids(quest([newStep(), newStep({ mission: mission(), finishWhen: 'ACTION_MissionTypeCourierCOMPLETE' })])), [])
assert.deepEqual(ids(quest([newStep({ mission: mission(), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }), newStep({ finishWhen: 'GET_STORY_REWARD' })])), ['mission-first:warning'])
assert.deepEqual(ids(quest([newStep(), newStep({ mission: mission({ story: false }), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }), newStep({ finishWhen: 'GET_STORY_REWARD' })])), ['mission-story:warning'])
const noTurnIn = quest([newStep(), newStep({ mission: mission(), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }), newStep()])
// The game's Live bait hands in two steps after accepting.
assert.deepEqual(ids(quest([newStep(), newStep({ mission: mission(), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }), newStep({ finishWhen: 'NO_ENEMY' }), newStep({ finishWhen: 'GET_STORY_REWARD' })])), [])
assert.deepEqual(ids(noTurnIn), ['mission-turnin:warning'])
;(globalThis as any).applyFix = (recipe: (q: unknown) => void) => recipe(noTurnIn.versions.en)
problems(noTurnIn)[0].fix!.apply()
assert.deepEqual(noTurnIn.versions.en!.steps.map((s) => s.finishWhen), ['ACTION_DIALOG_COMPLETE', 'CLICK_ACCEPT_STORY_MISSION', 'GET_STORY_REWARD', 'ACTION_DIALOG_COMPLETE'])
assert.deepEqual(ids(noTurnIn), [])
assert.equal(problems(quest([newStep(), newStep({ mission: mission(), finishWhen: 'NO_ENEMY' })]))[0].fix, undefined)

// Survey of the game's quests and the community library, when present locally.
const { importText } = await import('../features/start/importer.ts')
const { COMMUNITY } = await import('./community.ts')
const survey = (label: string, texts: string[]) => {
  const counts: Record<string, number> = {}
  const flagged: string[] = []
  for (const text of texts) {
    const r = importText(text)
    if (r.kind !== 'ok' || r.mod.meta.type !== 'quest') continue
    const v = r.mod as QuestView
    for (const p of problems(v)) {
      const rule = p.id.replace(/-[0-9a-f-]{36}.*$/, '')
      counts[rule] = (counts[rule] ?? 0) + 1
      flagged.push(`${v.versions[v.primaryLang]!.settings.questName}: ${rule}`)
    }
  }
  if (process.env.SURVEY) console.log(label, counts, flagged)
}
const gameDir = new URL('../../../extracted/assets/questsen/', import.meta.url)
try { survey('game', readdirSync(gameDir).filter((f) => f.endsWith('.json')).map((f) => readFileSync(new URL(f, gameDir), 'utf8'))) } catch { /* no local game files */ }
survey('community', COMMUNITY.flatMap((e) => e.files.map((f) => f.text)))
console.log('engine ok')

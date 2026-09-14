// node src/lib/checkpoints.test.ts — checkpoint rules: stranded pilots, step 1, dialogue on reload.
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
const { newLine, newQuestView, newShip, newStep } = await import('./factory.ts')
import type { QuestView, Step } from './types'

const quest = (steps: Step[]) => newQuestView('Q', { settings: { stationName: 'Thunder Station', charName: 'A', description: 'd' }, steps, rumors: [] })
const cp = (q: QuestView) => questProblems(q, [q]).filter((p) => p.id.startsWith('cp-'))
const ids = (q: QuestView) => cp(q).map((p) => p.id.replace(/-[0-9a-f-]{36}/, '')).sort()
const spawn = (pilot: string) => [newShip({ pilot })]
const kill = (pilot: string) => `ACTION_SHIP_DESTROYED_${pilot}`
const warp = 'ACTION_WARP_END_SYSTEM_Sirius'

// Fall-through: Raider spawns in step 2, the checkpoint on step 3 skips it.
const fall = quest([newStep(), newStep({ finishWhen: warp }), newStep({ ships: spawn('Raider'), finishWhen: warp }), newStep({ checkpoint: true, finishWhen: warp }), newStep({ finishWhen: kill('Raider') })])
assert.deepEqual(ids(fall), ['cp-stranded-Raider'])

// The checkpoint step's own spawn does not run on reload.
assert.deepEqual(ids(quest([newStep(), newStep({ checkpoint: true, ships: spawn('Raider'), finishWhen: kill('Raider') })])), ['cp-stranded-Raider'])

// A spawn after the checkpoint runs again: no problem.
assert.deepEqual(ids(quest([newStep(), newStep({ ships: spawn('Raider'), finishWhen: warp }), newStep({ checkpoint: true, finishWhen: warp }), newStep({ ships: spawn('Raider'), finishWhen: kill('Raider') })])), [])

// An order naming a missing ship does nothing, so it does not strand.
const order = { id: 'o', ship: 'Raider', attack: true, target: 'player', changeBehaviour: false, behaviour: '', destroy: false }
assert.deepEqual(ids(quest([newStep(), newStep({ ships: spawn('Raider'), finishWhen: warp }), newStep({ checkpoint: true, finishWhen: warp }), newStep({ orders: [order], finishWhen: warp })])), [])

// Choice jump: one branch respawns, the other does not.
const branch = (respawnBoth: boolean) => {
  const fight = newStep({ name: 'Fight', finishWhen: kill('Raider') })
  const flee = newStep({ name: 'Flee', ships: spawn('Raider'), finishWhen: warp })
  const pick = newStep({ name: 'Pick', ships: respawnBoth ? spawn('Raider') : [], finishWhen: warp })
  const choose = newStep({ checkpoint: true, dialogue: [newLine({ choices: [{ id: 'a', text: 'fight', targetStepId: pick.id }, { id: 'b', text: 'flee', targetStepId: flee.id }] })] })
  return quest([newStep({ ships: spawn('Raider'), finishWhen: warp }), newStep({ finishWhen: warp }), choose, pick, fight, flee])
}
assert.ok(ids(branch(false)).includes('cp-stranded-Raider'))
assert.ok(!ids(branch(true)).includes('cp-stranded-Raider'))

// Loop back past the spawn: step 4 jumps to step 2, which respawns Raider; the first pass still has no Raider.
const loopSpawn = newStep({ ships: spawn('Raider'), finishWhen: warp })
const loop = quest([newStep(), loopSpawn, newStep({ checkpoint: true, finishWhen: warp }),
  newStep({ finishWhen: kill('Raider'), dialogue: [newLine({ choices: [{ id: 'x', text: 'again', targetStepId: loopSpawn.id }] })] })])
assert.ok(ids(loop).includes('cp-stranded-Raider'))

// The next checkpoint ends the walk.
assert.deepEqual(ids(quest([newStep(), newStep({ ships: spawn('Raider'), finishWhen: warp }), newStep({ checkpoint: true, finishWhen: warp }), newStep({ checkpoint: true, finishWhen: warp }), newStep({ finishWhen: kill('Raider') })])),
  ['cp-stranded-Raider'])

// The fix moves the checkpoint to the step before the spawn, and the problem goes away.
const fixable = cp(fall).find((p) => p.id.startsWith('cp-stranded'))!
assert.equal(fixable.location.field, 'checkpoint')
;(globalThis as any).applyFix = (recipe: (q: unknown) => void) => recipe(fall.versions.en)
fixable.fix!.apply()
assert.deepEqual(fall.versions.en!.steps.map((s) => s.checkpoint), [false, true, false, false, false])
assert.deepEqual(ids(fall), [])

// Step 1 never saves.
assert.deepEqual(ids(quest([newStep({ checkpoint: true, finishWhen: warp }), newStep()])), ['cp-first'])
assert.deepEqual(ids(quest([newStep({ finishWhen: warp }), newStep({ finishWhen: warp })])), [])

// Dialogue on a checkpoint step: warning when it waits on the dialogue or offers choices, tip otherwise.
const talk = (finishWhen: string) => cp(quest([newStep(), newStep({ checkpoint: true, dialogue: [newLine({ text: 'hi' })], finishWhen })]))
assert.equal(talk('ACTION_DIALOG_COMPLETE').find((p) => p.id.startsWith('cp-dialog'))?.severity, 'warning')
assert.equal(talk(warp).find((p) => p.id.startsWith('cp-dialog'))?.severity, 'tip')
assert.deepEqual(ids(quest([newStep(), newStep({ checkpoint: true, finishWhen: warp })])), [])

// Survey of the game's quests and the community library, when present locally.
const { importText } = await import('../features/start/importer.ts')
const { COMMUNITY } = await import('./community.ts')
const survey = (label: string, texts: string[]) => {
  const counts: Record<string, number> = {}
  const flagged = new Set<string>()
  for (const text of texts) {
    const r = importText(text)
    if (r.kind !== 'ok' || r.mod.meta.type !== 'quest') continue
    const v = r.mod as QuestView
    for (const p of cp(v)) {
      const rule = p.id.split('-').slice(0, 2).join('-')
      counts[rule] = (counts[rule] ?? 0) + 1
      if (rule === 'cp-stranded') flagged.add(`${v.versions[v.primaryLang]!.settings.questName}: ${p.message}`)
    }
  }
  if (process.env.SURVEY) console.log(label, counts, [...flagged])
}
const gameDir = new URL('../../../extracted/assets/questsen/', import.meta.url)
try { survey('game', readdirSync(gameDir).filter((f) => f.endsWith('.json')).map((f) => readFileSync(new URL(f, gameDir), 'utf8'))) } catch { /* no local game files */ }
survey('community', COMMUNITY.flatMap((e) => e.files.map((f) => f.text)))
console.log('checkpoints ok')

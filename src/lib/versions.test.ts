// node src/lib/versions.test.ts — a version keeps its text and takes the primary's structure.
import { strict as assert } from 'node:assert'
import { syncVersion } from './versions.ts'

const line = (id: string, speaker: string, text: string, choices: { id: string; text: string }[] = []) =>
  ({ id, speaker, portrait: 'Tourist1', text, closeAfterSec: 5, choices: choices.map((c) => ({ ...c, targetStepId: null })) })
const step = (id: string, name: string, journal: string, dialogue: unknown[] = []) =>
  ({ id, name, journal, checkpoint: false, dialogue, ships: [], orders: [], mission: null, finishWhen: 'NO_ENEMY', failWhen: [], reminder: [], reminderEverySec: 5 })
const settings = (lang: string, questName: string) => ({ lang, questName, description: `${questName} desc`, charName: `${questName} char`, questId: 7 })

const primary = {
  settings: settings('en', 'Parcel'),
  steps: [step('s1', 'Go', 'Fly', [line('l1', 'Harry', 'Hi', [{ id: 'c1', text: 'Yes' }])]), step('s2', 'New', 'Dock')],
  rumors: [{ id: 'r1', text: 'Rumor', scope: 'global' }],
}
const es = {
  settings: { ...settings('es', 'Paquete'), questId: 1 },
  steps: [step('s1', 'Ir', 'Vuela', [line('l1', 'Enrique', 'Hola', [{ id: 'c1', text: 'Sí' }])])],
  rumors: [],
}

const out = syncVersion(primary as never, es as never)
assert.equal(out.settings.lang, 'es')
assert.equal(out.settings.questName, 'Paquete')
assert.equal(out.settings.questId, 7)
assert.equal(out.steps.length, 2)
assert.deepEqual([out.steps[0].name, out.steps[0].journal, out.steps[0].dialogue[0].speaker, out.steps[0].dialogue[0].text, out.steps[0].dialogue[0].choices[0].text], ['Ir', 'Vuela', 'Enrique', 'Hola', 'Sí'])
assert.deepEqual([out.steps[1].id, out.steps[1].name, out.steps[1].journal], ['s2', '', ''])
assert.equal(out.steps[1].finishWhen, 'NO_ENEMY')
assert.deepEqual(out.rumors, [{ id: 'r1', text: '', scope: 'global' }])

// Separately imported files share no ids and match by position.
const imported = { ...es, steps: [step('x9', 'Ir', 'Vuela'), step('x8', 'Fin', 'Atraca')] }
assert.equal(syncVersion(primary as never, imported as never).steps[0].journal, 'Vuela')

// Deleting from the primary deletes from the version.
const full = { ...es, steps: [...es.steps, step('s2', 'Nuevo', 'Atraca')] }
const shorter = syncVersion({ ...primary, steps: [primary.steps[1]] } as never, full as never)
assert.deepEqual(shorter.steps.map((s) => [s.id, s.journal]), [['s2', 'Atraca']])
console.log('versions ok')

// Separately imported files: no shared ids, same length. After the first sync the version carries the primary's
// ids, so a later structural edit (a new step at the front) keeps every translation.
const ru = {
  settings: settings('ru', 'Посылка'),
  steps: [step('x1', 'Лети', 'Лети', [line('y1', 'Гарри', 'Привет', [{ id: 'z1', text: 'Да' }])]), step('x2', 'Док', 'Док')],
  rumors: [{ id: 'q1', text: 'Слух', scope: 'global' }],
}
const aligned = syncVersion(primary as never, ru as never)
const edited = structuredClone(primary)
edited.steps.unshift(step('s0', 'Intro', 'Talk'))
const resynced = syncVersion(edited as never, aligned)
assert.deepEqual(resynced.steps.map((s) => s.name), ['', 'Лети', 'Док'])
assert.equal(resynced.steps[1].dialogue[0].text, 'Привет')
assert.equal(resynced.rumors[0].text, 'Слух')

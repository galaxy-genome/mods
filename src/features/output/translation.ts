import type { QuestContent } from '@/lib/types'
import { t } from '@/i18n'

export interface TextField {
  key: string
  group: string
  label: string
  get: (c: QuestContent) => string
  set: (c: QuestContent, v: string) => void
}

/** Every translatable text field, in reading order. Versions share structure, so one list addresses them all. */
export function textFields(c: QuestContent): TextField[] {
  const out: TextField[] = [
    { key: 'name', group: t('output.trGroupQuest'), label: t('output.trQuestName'), get: (x) => x.settings.questName, set: (x, v) => { x.settings.questName = v } },
    { key: 'desc', group: t('output.trGroupQuest'), label: t('output.trDescription'), get: (x) => x.settings.description, set: (x, v) => { x.settings.description = v } },
    { key: 'char', group: t('output.trGroupQuest'), label: t('output.trContact'), get: (x) => x.settings.charName, set: (x, v) => { x.settings.charName = v } },
  ]
  c.steps.forEach((s, i) => {
    const group = t('output.trGroupStep', { n: i + 1, name: s.name || t('output.untitled') })
    out.push({ key: `j${i}`, group, label: t('output.trJournal'), get: (x) => x.steps[i].journal, set: (x, v) => { x.steps[i].journal = v } })
    s.dialogue.forEach((l, li) => {
      out.push({ key: `d${i}-${li}`, group, label: t('output.trLine', { n: li + 1, speaker: l.speaker || t('output.trSpeaker') }), get: (x) => x.steps[i].dialogue[li].text, set: (x, v) => { x.steps[i].dialogue[li].text = v } })
      l.choices.forEach((_, ci) => {
        out.push({ key: `c${i}-${li}-${ci}`, group, label: t('output.trChoice', { n: ci + 1 }), get: (x) => x.steps[i].dialogue[li].choices[ci].text, set: (x, v) => { x.steps[i].dialogue[li].choices[ci].text = v } })
      })
    })
    if (s.mission?.targetShipName) {
      out.push({ key: `m${i}`, group, label: t('output.trPilot'), get: (x) => x.steps[i].mission?.targetShipName ?? '', set: (x, v) => { if (x.steps[i].mission) x.steps[i].mission.targetShipName = v } })
    }
  })
  c.rumors.forEach((_, i) => {
    out.push({ key: `r${i}`, group: t('output.trGroupRumors'), label: t('output.trRumor', { n: i + 1 }), get: (x) => x.rumors[i].text, set: (x, v) => { x.rumors[i].text = v } })
  })
  // Versions can drift apart structurally; a field missing from one version reads as empty and ignores writes.
  return out
    .map((f) => ({ ...f, get: (x: QuestContent) => { try { return f.get(x) ?? '' } catch { return '' } }, set: (x: QuestContent, v: string) => { try { f.set(x, v) } catch { /* absent */ } } }))
    .filter((f) => f.get(c) !== '')
}

/** A copy of the original with every text field emptied, meaning "needs translation". */
export function blankCopy(original: QuestContent, lang: QuestContent['settings']['lang']): QuestContent {
  const copy = structuredClone(original)
  textFields(original).forEach((f) => f.set(copy, ''))
  copy.settings.lang = lang
  return copy
}

export function progress(original: QuestContent, translation: QuestContent) {
  const fields = textFields(original)
  return { done: fields.filter((f) => f.get(translation).trim() !== '').length, total: fields.length }
}

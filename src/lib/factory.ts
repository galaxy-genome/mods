import type { DialogLine, ModPart, ModType, QuestContent, QuestView, QuestSettings, ShipOrder, ShipSpawn, StarsView, StationMission, Step } from './types'
import { WAIT_FOR_PLAYER } from './types'
import { GAME_QUEST_ID_MAX } from './reference'

/** Ids of mods, parts, model objects and history entries. */
export const uid = (_prefix?: string) => crypto.randomUUID()

export function randomQuestId(taken: number[] = []) {
  let id = 0
  do id = 1_000_000 + Math.floor(Math.random() * 3_000_000_000)
  while (taken.includes(id) || id <= GAME_QUEST_ID_MAX)
  return id
}

export function newMeta(type: ModType, title: string): ModPart['meta'] {
  const now = Date.now()
  return {
    id: uid('mod'), type, title, author: '', version: '1.0.0', summary: '', licence: 'CC-BY-4.0', link: '', tags: [],
    createdAt: now, updatedAt: now, origin: 'local', favorite: false,
  }
}

export function newSettings(partial: Partial<QuestSettings> = {}): QuestSettings {
  return {
    questName: '', description: '', questId: randomQuestId(), lang: 'en', stationName: '', charName: '', charImage: 'Tourist1',
    startMode: 'bar', trigger: 'warp', chance: 0.25, pointX: 0, pointY: 0, radius: 50, requiredQuestIds: [], minKarma: null, maxKarma: null,
    faction: 'none', factionMinRep: 0, ownStationRequired: false, reward: 0, karmaReward: 0, ...partial,
  }
}

export function newLine(partial: Partial<DialogLine> = {}): DialogLine {
  return { id: uid('line'), speaker: '', portrait: 'Tourist1', text: '', closeAfterSec: 5, choices: [], ...partial }
}

export function newStep(partial: Partial<Step> = {}): Step {
  return {
    id: uid('step'), name: '', journal: '', checkpoint: false, dialogue: [], ships: [], orders: [], mission: null,
    finishWhen: 'ACTION_DIALOG_COMPLETE', failWhen: [], reminder: [], reminderEverySec: 999999999, ...partial,
  }
}

export function newShip(partial: Partial<ShipSpawn> = {}): ShipSpawn {
  return {
    id: uid('ship'), pilot: '', model: 'hawk', level: 'Competent', behaviour: 'Pirate', autoLvl: false, placement: 'nearPlayer',
    distance: 200, x: 0, y: 0, tint: null, ...partial,
  }
}

export function newOrder(partial: Partial<ShipOrder> = {}): ShipOrder {
  return { id: uid('order'), ship: '', attack: true, target: 'player', changeBehaviour: false, behaviour: 'Enemy', destroy: false, ...partial }
}

export function newMission(partial: Partial<StationMission> = {}): StationMission {
  return {
    type: 'PirateHunt', homeStation: 'Thunder Station', story: true, level: 'Low', targetSystem: 'Sirius', targetStation: '',
    targetShipType: 'Hawk', targetShipName: '', targetShipHull: 0.85, goods: 'Tea', goodsCount: 2, credits: 25000, reputation: 1, ...partial,
  }
}

export function newQuestView(title: string, content: Omit<QuestContent, 'settings'> & { settings: Partial<QuestSettings> }): QuestView {
  const settings = newSettings({ questName: title, ...content.settings })
  return {
    meta: { ...newMeta('quest', title), type: 'quest' },
    primaryLang: settings.lang,
    versions: { [settings.lang]: { settings, steps: content.steps, rumors: content.rumors } },
  }
}

export function newStarsView(title: string): StarsView {
  return { meta: { ...newMeta('stars', title), type: 'stars' }, stars: [], planets: [], stations: [] }
}

export { WAIT_FOR_PLAYER }

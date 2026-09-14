import { newLine, newMission, newOrder, newQuestView, newShip, newStarsView, newStep, uid } from '@/lib/factory'
import { BEHAVIOURS, LANGS, SHIP_LEVELS, shipByInternal, shipByKey } from '@/lib/reference'
import type { Choice, DialogLine, Kept, Lang, ModPart, ModStation, QuestSettings, ShipLevel, Star, StarsView, Step } from '@/lib/types'
import { WAIT_FOR_PLAYER } from '@/lib/types'
import { t } from '@/i18n'
import { toGameJson, toStarsJson } from '@/features/output/gameJson'
import en from '@/i18n/en/startLib'

export type ImportOutcome =
  | { kind: 'ok'; mod: ModPart; fixed: string[]; look: string[]; kept: string[] }
  | { kind: 'rejected' }
  | { kind: 'parse-error'; line: number; column: number; snippet: string[]; errorLine: number; cause: string }

type Obj = Record<string, unknown>

/** The store imports community mods through this file while i18n is still loading, so English fills in until t() is ready. */
function tr(key: keyof typeof en, vars?: Record<string, string | number>) {
  try { return t(`startLib.${key}`, vars) } catch {
    return en[key].replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m))
  }
}
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Outside strings: drops comments and trailing commas, turns curly double quotes into straight ones. Keeps line breaks. */
export function repairJson(text: string, fixed: Set<string>) {
  let out = ''
  let str: '"' | '“' | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (str) {
      if (c === '\\') { out += c + (text[i + 1] ?? ''); i++; continue }
      if (c === '"' || (str === '“' && c === '”')) { out += '"'; str = null; continue }
      out += c
      continue
    }
    if (c === '"') { str = '"'; out += c }
    else if (c === '“' || c === '”') { str = '“'; out += '"'; fixed.add(tr('fixCurly')) }
    else if (c === '/' && text[i + 1] === '/') { while (i + 1 < text.length && text[i + 1] !== '\n') i++; fixed.add(tr('fixComments')) }
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const body = text.slice(i, end < 0 ? text.length : end + 2)
      out += body.replace(/[^\n]/g, '')
      i += body.length - 1
      fixed.add(tr('fixComments'))
    } else if (c === ',' && /^\s*[\]}]/.test(text.slice(i + 1, i + 200))) fixed.add(tr('fixCommas'))
    else out += c
  }
  return out
}

function parseError(text: string, err: unknown): Extract<ImportOutcome, { kind: 'parse-error' }> {
  const msg = err instanceof Error ? err.message : String(err)
  const pos = Math.min(Number(/position (\d+)/.exec(msg)?.[1] ?? text.length), text.length)
  const before = text.slice(0, pos).split('\n')
  const line = before.length
  const column = before[before.length - 1].length + 1
  const lines = text.split('\n')
  const from = Math.max(0, line - 3)
  const near = text.slice(Math.max(0, pos - 40), pos).trimEnd()
  const cause = /end of JSON/i.test(msg) ? tr('causeEnd')
    : /control character/i.test(msg) ? tr('causeLineBreak')
    : text[pos] === "'" ? tr('causeSingle')
    : /["\d\]}el]$/.test(near) && /^\s*["{[]/.test(text.slice(pos)) ? tr('causeComma')
    : tr('causeOther')
  return { kind: 'parse-error', line, column, snippet: lines.slice(from, line + 2), errorLine: line - 1 - from, cause }
}

export function importText(raw: string): ImportOutcome {
  const fixed = new Set<string>()
  const look: string[] = []
  const kept: string[] = []
  let text = raw
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); fixed.add(tr('fixBom')) }
  let data: unknown
  try { data = JSON.parse(text) } catch {
    const repaired = repairJson(text, fixed)
    try { data = JSON.parse(repaired) } catch (e) { return parseError(repaired, e) }
  }
  if (!isObj(data)) return { kind: 'rejected' }

  /** Exact key first, then any case; a case mismatch is noted. */
  const get = (o: Obj, key: string, where = ''): unknown => {
    if (key in o) return o[key]
    const k = Object.keys(o).find((x) => x.toLowerCase() === key.toLowerCase())
    if (k === undefined) return undefined
    fixed.add(tr('fixCase', { found: k + where, key }))
    return o[k]
  }
  const num = (v: unknown, def: number, label: string) => {
    if (v == null || v === '') return def
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && Number.isFinite(Number(v))) { fixed.add(tr('fixNumber', { label, value: v })); return Number(v) }
    if (typeof v === 'boolean') return v ? 1 : 0
    look.push(tr('lookNumber', { label, value: String(v), def }))
    return def
  }
  const bool = (v: unknown, label: string) => {
    if (v == null) return false
    if (typeof v === 'boolean') return v
    if (v === 'true' || v === 1 || v === '1') { fixed.add(tr('fixOn', { label, value: String(v) })); return true }
    if (v === 'false' || v === 0 || v === '0' || v === '') return false
    look.push(tr('lookBool', { label, value: String(v) }))
    return false
  }
  const str = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : [])

  const starsList = get(data, 'Stars') ?? get(data, 'Planets') ?? get(data, 'Stations')
  if (starsList !== undefined && get(data, 'questParts') === undefined && get(data, 'settings') === undefined) {
    const stars = importStars(data, get, num, str, list)
    keepFromFile(stars, data, toStarsJson(stars), STARS_CHILDREN)
    return { kind: 'ok', mod: stars, fixed: [...fixed], look, kept }
  }

  const s = get(data, 'settings')
  if (!isObj(s)) look.push(tr('lookNoSettings'))
  const so = isObj(s) ? s : {}
  const langRaw = str(get(so, 'Lang')).toLowerCase()
  const lang: Lang = langRaw === 'zh' ? 'cn' : (LANGS.find((l) => l.key === langRaw)?.key ?? 'en')
  if (langRaw === 'zh') fixed.add(tr('fixZh'))
  const space = bool(get(so, 'isRandomSpaceQuest'), tr('labelSpace'))
  const nearPoint = bool(get(so, 'isRandomStationQuest'), tr('labelNearPoint'))
  const minK = num(get(so, 'MinKarma'), -101, tr('labelMinKarma'))
  const maxK = num(get(so, 'MaxKarma'), 101, tr('labelMaxKarma'))
  const chance = num(get(so, 'RandomSpaceQuestChance'), 0.25, tr('labelChance'))
  if (chance < 0 || chance > 1) look.push(tr('lookChance', { chance }))
  const faction = str(get(so, 'Faction'))
  const reward = num(get(so, 'Reward'), 0, tr('labelReward'))
  const karmaReward = num(get(so, 'KarmaReward'), 0, tr('labelKarmaReward'))
  if (reward || karmaReward) kept.push(tr('keptReward'))
  const settings: Partial<QuestSettings> = {
    questName: str(get(so, 'QuestName')),
    description: str(get(so, 'QuestDescription')),
    questId: num(get(so, 'ID'), 0, tr('labelQuestId')) || undefined,
    lang,
    stationName: str(get(so, 'StationName')),
    charName: str(get(so, 'CharName')),
    charImage: str(get(so, 'CharImage')) || 'Tourist1',
    startMode: space ? 'space' : nearPoint ? 'nearPoint' : 'bar',
    trigger: str(get(so, 'RandomSpaceQuestTrigger')) === 'planetScan' ? 'planetScan' : 'warp',
    chance,
    pointX: num(get(so, 'RandomQuestX'), 0, tr('labelPointX')),
    pointY: num(get(so, 'RandomQuestY'), 0, tr('labelPointY')),
    radius: num(get(so, 'RandomQuestRadius'), 50, tr('labelRadius')),
    requiredQuestIds: str(get(so, 'RequestedQuestIDCompleted')).split(/[;,]/).map((x) => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite),
    minKarma: minK <= -101 ? null : minK,
    maxKarma: maxK >= 101 ? null : maxK,
    faction: (['GreatEmpire', 'TradeFederation', 'StellarAlliance', 'Independent', 'PirateClan'].includes(faction) ? faction : 'none') as QuestSettings['faction'],
    factionMinRep: num(get(so, 'FactionMinRep'), 0, tr('labelFactionRep')),
    ownStationRequired: bool(get(so, 'OwnStationRequired'), tr('labelOwnStation')),
    reward,
    karmaReward,
  }
  if (!settings.questId) delete settings.questId

  const parts = list(get(data, 'questParts'))
  const labelToStep = new Map<number, string>()
  const steps: Step[] = parts.map((p) => {
    const step = newStep()
    const label = get(p, 'questID')
    if (label != null && Number.isFinite(Number(label)) && !labelToStep.has(Number(label))) labelToStep.set(Number(label), step.id)
    return step
  })

  const lines = (arr: Obj[], where: string, withChoices: boolean): DialogLine[] => arr.map((l, li) => {
    const w = tr('whereLine', { where, n: li + 1 })
    const choices: Choice[] = []
    if (withChoices) {
      str(get(l, 'options')).split(';').filter((x) => x.trim()).forEach((piece) => {
        const bits = piece.split('=')
        if (bits.length !== 2) { look.push(tr('lookChoice', { where: w, piece })); return }
        const n = Number(bits[0].trim())
        choices.push({ id: uid('ch'), text: bits[1], targetStepId: labelToStep.get(n) ?? `missing-${bits[0].trim()}` })
      })
    }
    const closeAfter = num(get(l, 'showTimeSec'), 5, tr('labelCloseTime', { where: w }))
    return newLine({
      speaker: str(get(l, 'Name')),
      portrait: str(get(l, 'character')) || 'Tourist1',
      text: str(get(l, 'text')),
      closeAfterSec: closeAfter >= 999999 ? WAIT_FOR_PLAYER : closeAfter,
      choices,
    })
  })

  const hex = (v: unknown) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/^0x|^#/i, ''), 16)
    if (!Number.isFinite(n) || (n >>> 0) === 0xffffffff) return null
    return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
  }

  parts.forEach((p, i) => {
    const where = tr('whereStep', { n: i + 1 })
    const step = steps[i]
    step.name = str(get(p, 'name')) || where
    step.journal = str(get(p, 'TODO'))
    step.checkpoint = bool(get(p, 'isCheckPoint'), tr('labelCheckpoint', { where }))
    step.dialogue = lines(list(get(p, 'dialogText')), where, true)
    const reminder = list(get(p, 'dialogTextRepeat'))
    if (reminder.length) { step.reminder = lines(reminder, tr('whereReminder', { where }), false); kept.push(tr('keptReminder', { where })) }
    step.reminderEverySec = num(get(p, 'repeatTextTimeSec'), 999999999, tr('labelReminderInterval', { where }))
    let action = str(get(p, 'completeAction')).trim()
    if (action.startsWith('BUTTON_')) { action = action.slice(7); fixed.add(tr('fixButton', { where })) }
    step.finishWhen = action || null
    step.failWhen = str(get(p, 'failureActions')).split(';').map((x) => x.trim().replace(/^BUTTON_/, '')).filter(Boolean)
    step.ships = list(get(p, 'shipSpawn')).map((sh, si) => {
      const w = tr('whereShip', { where, n: si + 1 })
      const model = str(get(sh, 'shipModel')).toLowerCase() || 'ion'
      if (!shipByKey(model)) look.push(tr('lookShip', { where: w, value: model }))
      const behaviour = str(get(sh, 'shipBehavior')) || 'Trader'
      if (!BEHAVIOURS.some((b) => b.key === behaviour)) look.push(tr('lookBehaviour', { where: w, value: behaviour }))
      const level = str(get(sh, 'shipLevel'))
      if (level && !SHIP_LEVELS.includes(level as ShipLevel)) look.push(tr('lookLevel', { where: w, value: level }))
      const distance = num(get(sh, 'distanceFromPlayer'), 0, tr('labelDistance', { where: w }))
      const x = num(get(sh, 'spawnX'), 0, `${w} X`)
      const y = num(get(sh, 'spawnY'), 0, `${w} Y`)
      return newShip({
        pilot: str(get(sh, 'Name')), model, behaviour, level: (SHIP_LEVELS.includes(level as ShipLevel) ? level : 'Harmless') as ShipLevel,
        autoLvl: bool(get(sh, 'autoLVL'), tr('labelAutoLevel', { where: w })), distance, x, y,
        placement: distance > 0 || (!x && !y) ? 'nearPlayer' : 'position', tint: hex(get(sh, 'color')),
      })
    })
    step.orders = list(get(p, 'shipControl')).map((o) => {
      const behaviour = str(get(o, 'shipBehavior'))
      return newOrder({
        ship: str(get(o, 'ShipName')), target: str(get(o, 'SetTarget')), attack: bool(get(o, 'Attack'), tr('labelOrder', { where })),
        destroy: bool(get(o, 'Destroy'), tr('labelOrder', { where })), changeBehaviour: !!behaviour, behaviour: behaviour || 'Enemy',
      })
    })
    const task = get(p, 'task_on_station')
    if (isObj(task)) {
      const w = tr('whereMission', { where })
      let shipType = str(get(task, 'TargetShipType'))
      if (shipType && !shipByInternal(shipType)) {
        const m = shipByKey(shipType)
        if (m) { fixed.add(tr('fixShipType', { where: w, value: shipType, internal: m.internal })); shipType = m.internal }
        else look.push(tr('lookShipType', { where: w, value: shipType }))
      }
      const credits = num(get(task, 'Reward'), 0, tr('labelCredits', { where: w }))
      const reputation = num(get(task, 'Reputation'), 0, tr('labelReputation', { where: w }))
      step.mission = newMission({
        type: str(get(task, 'Type')) || 'PirateHunt', homeStation: str(get(task, 'HomeStation')), story: bool(get(task, 'Story'), w),
        level: (['Low', 'Proven', 'Confidence', 'Ally'].includes(str(get(task, 'Level'))) ? str(get(task, 'Level')) : 'Low') as 'Low',
        targetSystem: str(get(task, 'TargetSystem')), targetStation: str(get(task, 'TargetStation')), targetShipType: shipType || 'Ion',
        targetShipName: str(get(task, 'TargetShipName')), targetShipHull: num(get(task, 'TargetShipHull'), 1, tr('labelHull', { where: w })),
        goods: str(get(task, 'TargetGoods')) || 'Water', goodsCount: num(get(task, 'TargetGoodsCount'), 0, tr('labelCargo', { where: w })), credits, reputation,
      })
    }
    const known = new Set(['name', 'todo', 'questid', 'ischeckpoint', 'dialogtext', 'dialogtextrepeat', 'repeattexttimesec', 'completeaction', 'failureactions', 'shipspawn', 'shipcontrol', 'task_on_station'])
    Object.keys(p).filter((k) => !known.has(k.toLowerCase()) && !k.endsWith('Info')).forEach((k) => kept.push(tr('keptUnknownKey', { key: k, where })))
  })

  const rumors = list(get(data, 'BarRumors')).map((r) => ({ id: uid('rumor'), text: str(get(r, 'text')), scope: (str(get(r, 'type')) === 'global' ? 'global' : 'local') as 'global' | 'local' }))
  const title = settings.questName || tr('importedQuest')
  const mod = newQuestView(title, { settings: { ...settings, questName: settings.questName ?? '' }, steps, rumors })
  mod.meta.origin = 'import'
  const content = mod.versions[mod.primaryLang]!
  keepFromFile(content, data, toGameJson(content), QUEST_CHILDREN)
  return { kind: 'ok', mod, fixed: [...fixed], look, kept }
}

/** Written key → [model key, children of each item]. */
type Children = Record<string, [string, Children]>
const STEP_CHILDREN: Children = { dialogText: ['dialogue', {}], dialogTextRepeat: ['reminder', {}], shipSpawn: ['ships', {}], shipControl: ['orders', {}], task_on_station: ['mission', {}] }
const QUEST_CHILDREN: Children = { settings: ['settings', {}], BarRumors: ['rumors', {}], questParts: ['steps', STEP_CHILDREN] }
const STARS_CHILDREN: Children = { Stars: ['stars', {}], Planets: ['planets', {}], Stations: ['stations', {}] }

/**
 * Records on each model object what export needs to give the file back as it was (§23 Kept from import): the file's
 * key order, keys the editor does not model, and file values that differ from what the writer makes of the model.
 * `written` is the writer's output for the freshly imported model.
 */
function keepFromFile(model: Kept, raw: Obj, written: Obj, children: Children) {
  model._layout = Object.keys(raw)
  const rawKey = (k: string) => (k in raw ? k : Object.keys(raw).find((x) => x.toLowerCase() === k.toLowerCase()))
  const matched = new Set<string>()
  for (const [key, value] of Object.entries(written)) {
    const rk = rawKey(key)
    if (rk !== undefined) matched.add(rk)
    const rv = rk === undefined ? undefined : raw[rk]
    const child = children[key]
    const target = child && (model as Record<string, unknown>)[child[0]]
    if (child && Array.isArray(rv) && Array.isArray(value) && Array.isArray(target)) {
      const items = rv.filter(isObj)
      if (items.length === value.length) {
        items.forEach((item, i) => { if (isObj(value[i]) && target[i]) keepFromFile(target[i], item, value[i] as Obj, child[1]) })
        continue
      }
    }
    if (child && isObj(rv) && isObj(value) && isObj(target)) { keepFromFile(target, rv, value, child[1]); continue }
    if (rv === undefined || JSON.stringify(rv) !== JSON.stringify(value)) (model._kept ??= {})[key] = { written: value, value: rv }
  }
  for (const k of Object.keys(raw)) if (!matched.has(k)) (model._extra ??= {})[k] = raw[k]
}

function importStars(
  data: Obj,
  get: (o: Obj, k: string) => unknown,
  num: (v: unknown, d: number, l: string) => number,
  str: (v: unknown) => string,
  list: (v: unknown) => Obj[],
): StarsView {
  const mod = newStarsView(tr('importedStars'))
  mod.meta.origin = 'import'
  mod.stars = list(get(data, 'Stars')).map((s) => ({
    id: uid('star'), name: str(get(s, 'Name')), x: num(get(s, 'X'), 0, tr('labelStarX')), y: num(get(s, 'Y'), 0, tr('labelStarY')), z: num(get(s, 'Z'), 0, tr('labelStarZ')),
    security: (str(get(s, 'security')) || 'Low') as Star['security'], type: str(get(s, 'type')),
  }))
  mod.planets = list(get(data, 'Planets')).map((p) => ({
    id: uid('planet'), name: str(get(p, 'Name')), system: str(get(p, 'system')), type: str(get(p, 'type')), orbit: num(get(p, 'dist'), 100, tr('labelOrbit')),
    moons: num(get(p, 'sput'), 0, tr('labelMoons')), size: num(get(p, 'size'), 1, tr('labelSize')), rings: num(get(p, 'rings'), 0, tr('labelRings')), material: str(get(p, 'mater1')) || null,
  }))
  mod.stations = list(get(data, 'Stations')).map((s) => ({
    id: uid('station'), name: str(get(s, 'Name')), system: str(get(s, 'StarSystem')), bodyIndex: num(get(s, 'PlanetID'), 1, tr('labelPlanet')),
    type: (str(get(s, 'type')) || 'OrbitalDark') as ModStation['type'], faction: (str(get(s, 'Faction')) || 'Independent') as ModStation['faction'],
  }))
  if (mod.stars[0]?.name) mod.meta.title = mod.stars[0].name
  return mod
}

/** A hand-edited 2022-editor file with the kinds of damage import repairs. */
export const SAMPLE_FILE_NAME = 'Quest150.json'
export const SAMPLE_FILE = `﻿{
  // exported from the 2022 editor, then edited by hand
  "settings": {
    "QuestName": "Smuggler's Run",
    "QuestDescription": "Quiet work, good pay.",
    "ID": 100040,
    "StationName": "Thunder Station",
    "Lang": "en",
    "isRandomStationQuest": false,
    "isRandomSpaceQuest": false,
    "CharName": "Marla",
    "CharImage": "Pirate2",
    "RequestedQuestIDCompleted": "",
    "Reward": 5000,
    "KarmaReward": 0,
  },
  "BarRumors": [ { "text": "Someone at Thunder Station pays well for quiet pilots.", "type": "local" } ],
  "questparts": [
    {
      "name": "Briefing", "TODO": "Talk to Marla.", "questID": 1, "isCheckPoint": true,
      "dialogText": [
        { "Name": "Marla", "character": "Pirate2", "text": "Four ways to do this. Pick one.", "showTimeSec": "99999999",
          "options": "2=Fly direct;3=Take the long way;2=Bribe the patrol;3=Walk away;" }
      ],
      "dialogTextRepeat": [ { "Name": "Marla", "character": "Pirate2", "text": "Still waiting.", "showTimeSec": 5, "options": null } ],
      "completeAction": "BUTTON_ACTION_DIALOG_COMPLETE"
    },
    {
      "name": "Direct", "TODO": "Fly to Sirius.", "questID": 2,
      "shipSpawn": [ { "Name": "Patrol", "shipModel": "Hawk", "shipLevel": "Novice", "shipBehavior": "Police", "distanceFromPlayer": 300, "color": "0xFFFFFFFF" } ],
      "completeAction": "ACTION_WARP_END_SYSTEM_Sirius",
      "task_on_station": { "Type": "PirateHunt", "HomeStation": "Thunder Station", "TargetShipType": "barracuda", "TargetShipName": "Vex", "Reward": 150000, "Reputation": 1, "Level": "Low", "Story": true }
    },
    {
      "name": "The long way", "TODO": "Dock at Cooper City.", "questID": 3,
      "completeAction": "ACTION_CLICK_STATION_Cooper City",
    },
  ]
}`

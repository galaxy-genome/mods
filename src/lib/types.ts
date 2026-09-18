/** The editor's in-memory model. Field comments give the game JSON key each value is written to. */

export type Lang = 'en' | 'ru' | 'es' | 'pt' | 'cn'

export type Id = string

/** Kept from import (§23): keys the editor does not model, and the object's original key order. */
export interface Kept {
  _extra?: Record<string, unknown>
  _layout?: string[]
  /**
   * Modelled keys whose file value differs from what the writer makes of the imported model (`null` for an empty list,
   * a key the file left out). While the writer still produces `written`, it emits the file's `value` instead.
   */
  _kept?: Record<string, { written: unknown; value?: unknown }>
}

export type ModType = 'quest' | 'stars'

export interface ModMeta {
  id: Id
  title: string
  author: string
  version: string
  summary: string
  licence: 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'CC0' | 'All rights reserved'
  link: string
  tags: string[]
  createdAt: number
  updatedAt: number
  origin: 'local' | 'community' | 'import' | 'game'
  /** Favorites are what Download bundles into one game-ready zip. */
  favorite: boolean
  /** Author and licence of a bundled default mod. */
  credit?: { author: string; licence: string }
  /** Set on mods that come from the community library. */
  community?: CommunityRef
  /** A community mod edited on this device; the library can still add an unmodified copy. */
  modified?: boolean
  /** Mods whose places this mod uses and that players need installed too, as the author accepted them. */
  requires?: Requirement[]
}

/** A required mod. `entryId` names a library entry, so the requirement survives reinstalls and new versions. */
export interface Requirement {
  modId: string
  entryId?: string
  title: string
  version?: string
}

export interface CommunityRef {
  entryId: string
  entryTitle: string
  author: string
  licence: string
  popularity: number
}

export type StartMode = 'bar' | 'nearPoint' | 'space'

export interface QuestSettings extends Kept {
  questName: string // QuestName
  description: string // QuestDescription
  questId: number // ID
  lang: Lang // Lang
  stationName: string // StationName
  charName: string // CharName
  charImage: string // CharImage
  startMode: StartMode // isRandomStationQuest / isRandomSpaceQuest
  /** Where the quest begins when no start mode says it: the game's own story starts a new save in Sol. Mods have no such field. */
  startSystem?: string
  trigger: 'warp' | 'planetScan' // RandomSpaceQuestTrigger
  chance: number // RandomSpaceQuestChance, 0..1
  pointX: number // RandomQuestX
  pointY: number // RandomQuestY
  radius: number // RandomQuestRadius
  requiredQuestIds: number[] // RequestedQuestIDCompleted
  minKarma: number | null // MinKarma, null = -101
  maxKarma: number | null // MaxKarma, null = 101
  faction: 'none' | 'GreatEmpire' | 'TradeFederation' | 'StellarAlliance' | 'Independent' | 'PirateClan' // Faction
  factionMinRep: number // FactionMinRep
  ownStationRequired: boolean // OwnStationRequired
  reward: number // Reward, ignored for mods
  karmaReward: number // KarmaReward, ignored for mods
}

export interface Choice {
  id: Id
  text: string
  /** Target step id, or null for "continue to the next step". Written as questID=Text. */
  targetStepId: Id | null
}

export interface DialogLine extends Kept {
  id: Id
  speaker: string // Name
  portrait: string // character
  text: string // text
  closeAfterSec: number // showTimeSec; WAIT_FOR_PLAYER means wait
  choices: Choice[] // options
}

export const WAIT_FOR_PLAYER = 99999999

export type ShipLevel = 'Harmless' | 'Novice' | 'Competent' | 'Expert' | 'Master' | 'Dangerous'

export interface ShipSpawn extends Kept {
  id: Id
  pilot: string // Name
  model: string // shipModel key
  level: ShipLevel // shipLevel
  behaviour: string // shipBehavior
  autoLvl: boolean // autoLVL
  placement: 'nearPlayer' | 'position'
  distance: number // distanceFromPlayer
  x: number // spawnX, light seconds
  y: number // spawnY
  tint: string | null // color, hex in the editor
}

export interface ShipOrder extends Kept {
  id: Id
  ship: string // ShipName, pilot or "player"
  attack: boolean // Attack
  target: string // SetTarget
  changeBehaviour: boolean
  behaviour: string // shipBehavior
  destroy: boolean // Destroy
}

export interface StationMission extends Kept {
  type: string // Type
  homeStation: string // HomeStation
  story: boolean // Story
  level: 'Low' | 'Proven' | 'Confidence' | 'Ally' // Level
  targetSystem: string // TargetSystem
  targetStation: string // TargetStation
  targetShipType: string // TargetShipType, internal name
  targetShipName: string // TargetShipName
  targetShipHull: number // TargetShipHull 0..1
  goods: string // TargetGoods
  goodsCount: number // TargetGoodsCount
  credits: number // Reward
  reputation: number // Reputation
}

export interface Step extends Kept {
  id: Id
  name: string // name
  journal: string // TODO
  checkpoint: boolean // isCheckPoint
  dialogue: DialogLine[] // dialogText
  ships: ShipSpawn[] // shipSpawn
  orders: ShipOrder[] // shipControl
  mission: StationMission | null // task_on_station
  finishWhen: string | null // completeAction, raw action string
  failWhen: string[] // failureActions
  reminder: DialogLine[] // dialogTextRepeat
  reminderEverySec: number // repeatTextTimeSec
  /** Game behaviour the quest format cannot express, shown read-only on the step. Only the game's main story has these. */
  notes?: string[] // notes
  /** Main-story-only mechanics the mod loader ignores (StoryMod.as sets one completion action); read-only, never exported. */
  buttonsTask?: string[] // buttons_task, when more than one action
  buttonsTaskOrder?: false // buttons_task_order
  buttonsTaskHold?: string[] // buttons_task_hold
  moduleOnStation?: string[] // module_on_station
}

export interface Rumor extends Kept {
  id: Id
  text: string // text
  scope: 'global' | 'local' // type
}

export interface QuestContent extends Kept {
  settings: QuestSettings
  steps: Step[]
  rumors: Rumor[]
}

export interface QuestView {
  meta: ModMeta & { type: 'quest' }
  /** One entry per language version; all share the quest ID and structure. */
  versions: Partial<Record<Lang, QuestContent>>
  primaryLang: Lang
}

export interface Star extends Kept {
  id: Id
  name: string // Name
  x: number // X
  y: number // Y (map X/Y on the galaxy map)
  z: number // Z
  security: 'Anarchy' | 'Low' | 'Medium' | 'High' | 'Only' | 'NoOne' | 'Conflict'
  type: string
}

export interface Planet extends Kept {
  id: Id
  name: string
  system: string
  type: string
  orbit: number // dist
  moons: number // sput
  size: number
  rings: number
  material: string | null // mater1
}

export interface ModStation extends Kept {
  id: Id
  name: string
  system: string // StarSystem
  bodyIndex: number // PlanetID, 1-based
  type: 'OrbitalDark' | 'OrbitalWhite' | 'NovaStation' | 'FarmStation' | 'StationHighTech' | 'AsteroidStation'
  faction: 'Russian' | 'USA' | 'China' | 'Independent' | 'Pirates'
}

export interface StarsView extends Kept {
  meta: ModMeta & { type: 'stars' }
  stars: Star[]
  planets: Planet[]
  stations: ModStation[]
}

/**
 * A view of one quest or stars part of a mod. Screens inside the editor work on parts; the store maps every part change
 * back into its mod. A part's `meta.id` is `<modId>~<partId>`.
 */
export type ModPart = QuestView | StarsView

export interface QuestPart {
  id: Id
  primaryLang: Lang
  versions: Partial<Record<Lang, QuestContent>>
}

export interface StarsPart extends Kept {
  id: Id
  stars: Star[]
  planets: Planet[]
  stations: ModStation[]
}

/** A texture atlas pair the game loads from the mod folder's textures/ directory. */
export interface TexturePart {
  id: Id
  /** Atlas name without extension, e.g. txtr_ships1 */
  name: string
  /** PNG as a data: URL */
  png: string
  xml: string
}

/** One user mod: quest, stars & stations and texture files, favorited and downloaded as one. */
export interface Mod {
  meta: ModMeta
  quests: QuestPart[]
  stars: StarsPart | null
  textures: TexturePart[]
}

export type Severity = 'error' | 'warning' | 'tip'

export interface Problem {
  id: string
  severity: Severity
  message: string
  /** Where to go to fix it: a route path relative to the mod, plus a field key to pulse. */
  location: { path: string; field?: string; label: string }
  fix?: { label: string; apply: () => void }
}

/** A texture as mods and history records store it; the image lives once in the `textures` store under its hash. */
export interface TextureRef {
  id: Id
  name: string
  hash: string
}

export type StoredMod = Omit<Mod, 'textures'> & { textures: TextureRef[] }

/** A copy of a mod kept in History. Automatic entries are pruned to the newest 20 per mod; named ones stay. */
export interface HistoryEntry {
  id: Id
  modId: Id
  /** Empty on an automatic entry made after an idle gap. */
  name: string
  auto: boolean
  createdAt: number
  bytes: number
  mod: StoredMod
  revision: number
  schema: number
}

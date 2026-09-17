/** Every action the game reports, as the condition picker presents it. Labels and sentences live in i18n/en/conditions.ts. */
import { t } from '@/i18n'

export type ParamKind =
  | 'none'
  | 'system'
  | 'station'
  | 'planet'
  | 'pilot'
  | 'shipStop'
  | 'planetType'
  | 'seconds'
  | 'distance'
  | 'nebula'
  | 'seismic'
  | 'material'
  | 'cargo'

export type ConditionCategory =
  | 'Travel'
  | 'Stations'
  | 'Planets'
  | 'Ships'
  | 'Combat'
  | 'Mining and cargo'
  | 'Dialogue and time'
  | 'Your own station'
  | 'Screens and buttons'
  | 'Game events'

export interface ConditionDef {
  /** The action string, ending in _ when it takes a parameter. */
  action: string
  label: string
  category: ConditionCategory
  param: ParamKind
  /** Sentence fragment after "when"; {p} is replaced with the parameter. */
  sentence: string
  keywords?: string
}

const CATEGORY_ICONS: [ConditionCategory, string][] = [
  ['Travel', 'compass'], ['Stations', 'landmark'], ['Planets', 'globe'], ['Ships', 'rocket'], ['Combat', 'crosshair'],
  ['Mining and cargo', 'pickaxe'], ['Dialogue and time', 'timer'], ['Your own station', 'home'], ['Screens and buttons', 'smartphone'],
  ['Game events', 'zap'],
]

const categoryKey = (name: ConditionCategory) => `conditions.category_${name.toLowerCase().replace(/\W+/g, '_')}`

/** A category's name in the interface language; `name` stays the English id. */
export const categoryLabel = (name: ConditionCategory) => t(categoryKey(name))

export const CATEGORY_INFO: { name: ConditionCategory; icon: string; readonly label: string; readonly hint: string }[] = CATEGORY_ICONS.map(([name, icon]) => ({
  name,
  icon,
  get label() { return categoryLabel(name) },
  get hint() { return t(`${categoryKey(name)}_hint`) },
}))

const d = (action: string, category: ConditionCategory, param: ParamKind, keywords?: string): ConditionDef => ({
  action, category, param, keywords,
  get label() { return t(`conditions.${action}_label`) },
  get sentence() { return t(`conditions.${action}_sentence`) },
})

/** Mission screen names MissionsScreen fires as ACTION_<name>Start and ACTION_<name>COMPLETE. */
const MISSION_TYPES_FIRED = [
  'MissionTypeMining', 'MissionTypeFindGoods', 'MissionTypeCaravanHunt', 'MissionTypeIntimidate', 'MissionTypeBugHunt',
  'MissionTypeContractMurder', 'MissionTypeTourist', 'MissionTypeCourier', 'MissionTypeMoneyHelp', 'MissionTypePirateHunt',
  'MissionTypeTransferGoods', 'MissionRescue',
]

/** Craft materials (`CraftMaterial._typeName`): what mining and material pickups report. */
export const MATERIALS = [
  'WarpAnalysis', 'ShieldsAnalysis', 'LegacyFirmware', 'AutomatonData', 'SecurityFirmware', 'Sulphur', 'Nickel', 'Iron', 'Manganese',
  'Chromium', 'Phosphorus', 'Carbon', 'Vanadium', 'Selenium', 'Cadmium', 'Polonium', 'Germanium', 'Tellurium', 'WeaponParts',
  'SensorFragment', 'ChemicalProcessors', 'MicroResistors', 'HeatExchanger', 'NanoCapacitors', 'ChemicalManipulators',
  'ConductiveCeramics', 'FocusCrystals', 'MilitaryAlloys', 'ConductivePolymers', 'ShieldEmitters', 'HeatDispersionPlate', 'AutomatonComponent',
]

/**
 * Every string the game dispatches as a button event while a quest runs (`Events.BUTTON_END_TOUCH`), without the
 * BUTTON_ prefix. Completion needs an exact match, so a condition outside this list never fires.
 */
export const CONDITIONS: ConditionDef[] = [
  d('ACTION_WARP_END_SYSTEM_', 'Travel', 'system', 'warp jump reach'),
  d('ACTION_WARP_IN_SYSTEM_', 'Travel', 'system'),
  d('ACTION_WARP_END', 'Travel', 'none'),
  d('ACTION_WARP_BEGIN', 'Travel', 'none'),
  d('SCREEN_ACTION_ROUTE_SYSTEM_', 'Travel', 'system', 'map'),
  d('ACTION_PLAYER_DIST_', 'Travel', 'distance'),
  d('PLAYER_SHIP_STOP', 'Travel', 'none'),
  d('ACTION_NEBULA_', 'Travel', 'nebula'),
  d('ACTION_GATES_REPAIR', 'Travel', 'none'),

  d('ACTION_CLICK_STATION_', 'Stations', 'station', 'open station menu'),
  d('SCREEN_PORT_BAR', 'Stations', 'none'),
  d('CLICK_ACCEPT_STORY_MISSION', 'Stations', 'none'),
  d('GET_STORY_REWARD', 'Stations', 'none'),
  ...MISSION_TYPES_FIRED.flatMap((m) => [d(`ACTION_${m}Start`, 'Stations', 'none'), d(`ACTION_${m}COMPLETE`, 'Stations', 'none')]),
  d('ACTION_MissionTypeIllegal', 'Stations', 'none'),
  d('SCREEN_PORT_SHIPYARD', 'Stations', 'none'),
  d('SCREEN_PORT_MODULES', 'Stations', 'none'),
  d('SCREEN_PORT_MARKET', 'Stations', 'none'),
  d('SCREEN_PORT_MISSIONS', 'Stations', 'none'),
  d('SCREEN_PORT_SERVICE', 'Stations', 'none'),
  d('SCREEN_PORT_DISCOVERIES', 'Stations', 'none'),

  d('ACTION_CLICK_PLANET_', 'Planets', 'planet'),
  d('ACTION_SCAN_PLANET_', 'Planets', 'planet'),
  d('ACTION_SCAN_PLANET_TYPE_', 'Planets', 'planetType'),
  d('LAND_ON_PLANET_', 'Planets', 'planet'),
  d('LEAVE_PLANET', 'Planets', 'none', 'take off'),

  d('ACTION_SHIP_DESTROYED_', 'Ships', 'pilot', 'kill'),
  d('ACTION_SELECT_SHIP_', 'Ships', 'pilot'),
  d('ACTION_SHIP_WARPED_', 'Ships', 'pilot'),
  d('SHIP_STOP_', 'Ships', 'shipStop'),
  d('ACTION_WARP_TRACK_', 'Ships', 'pilot'),

  d('NO_ENEMY', 'Combat', 'none', 'destroy all'),
  d('ACTION_ATTACK', 'Combat', 'none'),
  d('ACTION_CHAFF_LAUNCHER', 'Combat', 'none'),
  d('ACTION_HEATSINK', 'Combat', 'none'),
  d('ACTION_MISSILE_DEF', 'Combat', 'none'),
  d('ACTION_SHIELD_CELL', 'Combat', 'none'),
  d('ACTION_FIGHTERS', 'Combat', 'none'),
  d('ACTION_SILENT_MODE', 'Combat', 'none'),

  d('COLLECT_CARGO_', 'Mining and cargo', 'cargo'),
  d('COLLECT_MATERIAL_', 'Mining and cargo', 'material'),
  d('ACTION_MATERIAL_BELT_', 'Mining and cargo', 'material'),
  d('PLANET_MINING_DONE_', 'Mining and cargo', 'material'),
  d('PLANET_MINING_END', 'Mining and cargo', 'none'),
  d('ACTION_SEISMIC_CHRG_', 'Mining and cargo', 'seismic'),
  d('ACTION_SEISMIC_BOOM_S', 'Mining and cargo', 'none'),

  d('ACTION_DIALOG_COMPLETE', 'Dialogue and time', 'none'),
  d('TIME_TICK_', 'Dialogue and time', 'seconds', 'timer wait'),

  d('OWNSTATION_UPGRADE_BAR', 'Your own station', 'none'),
  d('OWNSTATION_UPGRADE_TRADE', 'Your own station', 'none'),
  d('SCREEN_OWNSTATION', 'Your own station', 'none'),

  ...(
    [
      'SCREEN_GALAXY_MAP', 'SCREEN_ACTION_MAP_ROUTE', 'SCREEN_GALAXY_MAP_FILTERS',
      'SCREEN_MAP_BOOKMARKS', 'SCREEN_MAP_BOOKMARK_ADD', 'SCREEN_MODULES',
      'SCREEN_SYSTEM_OBJECTS', 'SCREEN_SYSTEM_OBJECTS_MAP', 'SCREEN_CARGO',
      'SCREEN_MISSIONS_SHIP', 'SCREEN_REPAIR_SHIP', 'SCREEN_SPECS',
      'SCREEN_FLEET_SHIP', 'SCREEN_PLANET_INFO', 'SCREEN_ACTION_REPAIR_ALL',
      'SCREEN_ACTION_REFUEL', 'SYS_OBJ_SELECT_SHIP', 'SYS_OBJ_SELECT_PLANET',
      'SYS_OBJ_SELECT_STATION', 'SYS_OBJ_SELECT_CARGO', 'ACTION_AUTOPILOT',
      'ACTION_FLIGHT_ASSIST', 'ACTION_WARP_JUMP', 'ACTION_PLANET_SCAN',
      'ACTION_PLANET_LANDING', 'ACTION_SPECTRUM', 'ACTION_POWER_SYS',
      'ACTION_POWER_WEP', 'ACTION_POWER_ENG', 'ACTION_BOOST',
      'ACTION_BRAKE', 'ACTION_FIRE', 'ACTION_QUICKSAVE', 'ACTION_SETTINGS',
      'ACTION_SHOW_SHIP_MENU', 'ACTION_SHOW_STATION_MENU', 'CLICK_BUY_GREEN_GOODS',
      'CLICK_SELL_GOODS_WITH_PROFIT', 'CLICK_SELECT_ENEMY', 'CLICK_TURN_ON_MODULE',
      'CLICK_CHANGE_MODULE_PRIORITY', 'PLANET_MINING', 'PLANET_TAKEOFF',
      'SHIPSHOP', 'MODULESSHOP', 'ENGINEER_SCREEN', 'GARAGE_SCREEN',
      'ENGINE_LEFT', 'ENGINE_RIGHT', 'ACTION_FN1', 'ACTION_FN2', 'ACTION_FN3', 'ACTION_ZOOMSWITCH', 'DRONE_COLLECTORS',
      'SCREEN_ACTION_MAP_ADD_POINT', 'ACTION_SHOW_EXTERNAL', 'ACTION_BOTTOM_MENU', 'ACTION_HELP', 'ACTION_ACHIVES',
      'ACTION_SELECT_PLANET_WITH_STATION', 'shipsObjects', 'planetsObjects', 'RESCUE_SCREEN', 'ACHIVs',
      'LEADER_BOARD_PLANETS', 'LEADER_BOARD_SYSTEMS', 'LEADER_BOARD_BATTLES', 'PLANET_LEFT', 'PLANET_RIGHT',
      'PLANET_ENGINES', 'PLANET_MOTOR_MODE', 'CLICK_GREEN_GOODS', 'CLICK_RED_GOODS', 'CLICK_SELL_GREEN_GOODS',
      'CLICK_SHIPYARD_MODULES_SHIELDS', 'CLICK_SHIPYARD_MODULES_SHIELDS_2D', 'ACTION_SHIPYARD_MODULES_SHIELDS_2D_BUY',
    ] as const
  ).map((a) => d(a, 'Screens and buttons', 'none')),

  ...(
    [
      'ACTION_MISSION_HUNT_COMPLETE',
      'ACTION_MISSION_RESCUE_COMPLETE', 'ACTION_MISSION_BUGHUNT_COMPLETE',
      'ACTION_MISSION_ILLEGAL_COMPLETE', 'ACTION_PIRATE_SPAWN',
      'ACTION_CARAVAN_SPAWN', 'MINING_PIRATE_SPAWN', 'SCANNED_ATTACKED_BY_PIRATE',
      'EVENT_SPAWN_PIRATES', 'EVENT_END_PIRATES', 'EVENT_SPAWN_ZENTARKS',
      'EVENT_END_ZENTARKS', 'EVENT_SPAWN_WRECK', 'EVENT_SPAWN_REPAIR', 'EVENT_SPAWN_REFUEL',
      'EVENT_OWNSTATION_PIRATES', 'EVENT_END_OWNSTATION_PIRATES',
      'EVENT_SPAWN_NPC_KILLTARGET', 'EVENT_SPAWN_PIRATE_MISSION', 'EVENT_SPAWN_PIRATEvsNPC', 'EVENT_SPAWN_PIRATEvsLAW',
      'EVENT_SPAWN_ANGLERvsNPC', 'EVENT_SPAWN_BUGHUNT', 'EVENT_ACTIVATE_PIRATES', 'EVENT_ACTIVATE_PIRATE_MISSION',
      'EVENT_ACTIVATE_REPAIR', 'EVENT_ACTIVATE_REFUEL', 'EVENT_ACTIVATE_WRECK', 'EVENT_ACTIVATE_PIRATEvsNPC',
      'EVENT_ACTIVATE_ANGLERvsNPC', 'EVENT_ACTIVATE_PIRATEvsLAW', 'EVENT_ACTIVATE_MURDERCONTRACT', 'EVENT_ACTIVATE_INTIMIDATE',
      'EVENT_ACTIVATE_ALIENBUGS', 'EVENT_END_PIRATEvsNPC', 'EVENT_END_ANGLERvsNPC', 'EVENT_END_PIRATEvsLAW',
      'WARP_ALIEN_HOOK',
    ] as const
  ).map((a) => d(a, 'Game events', 'none')),
]

export interface ParsedCondition {
  def: ConditionDef | null
  param: string
  raw: string
}

/** Longest action that prefixes the raw string wins, as the game compares whole names. */
export function parseCondition(raw: string): ParsedCondition {
  const clean = raw.startsWith('BUTTON_') ? raw.slice(7) : raw
  let best: ConditionDef | null = null
  for (const c of CONDITIONS) {
    const match = c.param === 'none' ? clean === c.action : clean.startsWith(c.action) && clean.length > c.action.length
    if (match && (!best || c.action.length > best.action.length)) best = c
  }
  return { def: best, param: best && best.param !== 'none' ? clean.slice(best.action.length) : '', raw }
}

export function buildCondition(def: ConditionDef, param: string) {
  return def.param === 'none' ? def.action : def.action + param
}

/** The game's finish condition that never fires: a route to a system named "None", which no route event can send. */
export const NEVER = 'SCREEN_ACTION_ROUTE_SYSTEM_None'

/** A place condition naming "None" matches no real place, so the step ends only by failing. */
export function neverFires(raw: string | null) {
  if (!raw) return false
  const { def, param } = parseCondition(raw)
  return !!def && ['system', 'station', 'planet'].includes(def.param) && param === 'None'
}

/**
 * A shipControl Destroy on "player" zeroes the player's hull (ShipsManager.onShipControl), which is game over whether or
 * not the step can still finish; the destruction raises ACTION_SHIP_DESTROYED_player, which fails the quest when listed.
 */
export const isGameOver = (step: { orders: { ship: string; destroy: boolean }[] }) => step.orders.some((o) => o.ship === 'player' && o.destroy)

/** "the player arrives in Sirius" */
export function describeCondition(raw: string | null): string {
  if (!raw) return t('conditions.notSet')
  if (neverFires(raw)) return t('conditions.never')
  const { def, param } = parseCondition(raw)
  if (!def) return raw
  if (def.param === 'shipStop') {
    const [pilot, place] = param.split('_at_')
    return t('conditions.shipReaches', { pilot: pilot || '?', place: place === 'player' ? t('conditions.thePlayer') : place || '?' })
  }
  const p = def.action === 'ACTION_CLICK_STATION_' && param === 'OWN' ? t('conditions.ownStation') : param
  const s = def.sentence.replace('{p}', p)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type FinishMechanics = { finishWhen: string | null; buttonsTask?: string[]; buttonsTaskOrder?: false; buttonsTaskHold?: string[]; moduleOnStation?: string[] }

/** Steps using main-story-only mechanics (StoryPart fields the mod loader never reads). */
export const hasMechanics = (step: FinishMechanics) => !!(step.buttonsTask || step.buttonsTaskOrder === false || step.buttonsTaskHold || step.moduleOnStation)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** How a step finishes, including the main story's held controls, several actions and shipyard modules. */
export function describeFinish(step: FinishMechanics): string {
  const action = (b: string) => b.replace(/^BUTTON_/, '')
  const hold = step.buttonsTaskHold?.map((b) => { const k = `conditions.control_${action(b)}`; const s = t(k); return s === k ? lowerFirst(describeCondition(action(b))) : s })
  const done = hold
    ? hold.length > 1 ? t('conditions.holdTogether', { controls: hold.join(t('conditions.and')) }) : t('conditions.hold', { control: hold[0] })
    : step.buttonsTask && step.buttonsTask.length > 1
      ? t(step.buttonsTaskOrder === false ? 'conditions.allAnyOrder' : 'conditions.allInOrder', { list: step.buttonsTask.map((b) => lowerFirst(describeCondition(action(b)))).join(step.buttonsTaskOrder === false ? ', ' : t('conditions.then')) })
      : describeCondition(step.finishWhen)
  return step.moduleOnStation ? `${done}. ${t('conditions.shipyardOffers', { modules: step.moduleOnStation.join(', ') })}` : done
}

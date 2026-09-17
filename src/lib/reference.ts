import data from '@/data/reference.json'
import { t } from '@/i18n'
import type { Lang, ShipLevel } from './types'

export interface RefSystem { name: string; x: number; y: number; security: string | null; starType: string }
export interface RefStation { name: string; system: string; type: string; faction: string; planetIndex: number }
export interface RefBody { ordinal: number; name: string; kind: string; type: string }
export interface GameQuest {
  id: number
  name: string
  description: string
  charImage: string
  charName: string
  station: string
  randomSpace: boolean
  requires: string
  steps: { name: string; todo: string; completeAction: string }[]
}

export const SYSTEMS = data.systems as RefSystem[]
export const STATIONS = data.stations as RefStation[]
export const BODIES = data.bodies as Record<string, RefBody[]>
/**
 * The game's own side quests. Filled at startup from data/game-quests.json, which is generated locally and not
 * published; when it is absent the list stays empty and screens fall back to the reserved ID range.
 */
export const GAME_QUESTS: GameQuest[] = []
/** Name, character and station of every game side quest; published, so it works without game-quests.json. */
export const GAME_QUEST_NAMES = data.gameQuests as Pick<GameQuest, 'id' | 'name' | 'charName' | 'station' | 'randomSpace'>[]
export const gameQuest = (id: number) => GAME_QUEST_NAMES.find((g) => g.id === id)

export async function loadGameQuests() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/game-quests.json`)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return false
    GAME_QUESTS.push(...((await res.json()) as GameQuest[]))
    return true
  } catch {
    return false
  }
}

export const GAME_QUEST_ID_MIN = 100002
export const GAME_QUEST_ID_MAX = 100044
export const RESERVED_JUMP_LABELS = [99996, 99997, 99998, 99999, 199981, 199982]

export const LANGS: { key: Lang; label: string; name: string }[] = [
  { key: 'en', label: 'EN', name: 'English' },
  { key: 'ru', label: 'RU', name: 'Русский' },
  { key: 'es', label: 'ES', name: 'Español' },
  { key: 'pt', label: 'PT', name: 'Português' },
  { key: 'cn', label: '中文', name: '中文' },
]

export const PORTRAIT_GROUPS: { name: string; items: string[] }[] = [
  { get name() { return t('reference.portraitCommon') }, items: ['Tourist1', 'Tourist2', 'Tourist3', 'Tourist4', 'Pirate1', 'Pirate2', 'Pirate3', 'Pirate4', 'Pirate5', 'Pirate6'] },
  {
    get name() { return t('reference.portraitStory') },
    items: ['Henry', 'Informant', 'Eva', 'Edmond Anger', 'Police Forces', 'Assistant', 'Marcus', 'David Evans', 'RT-01', 'Dr. Landau', 'G. Hopper', 'Automaton', 'Walker', 'Yuri Grom', 'Kaito', 'Dina', 'Victor', 'Ruby', 'Yana Seest'],
  },
  { get name() { return t('reference.portraitSpecial') }, items: ['Daily Task', 'Expedition', 'None'] },
]
export const PORTRAITS = PORTRAIT_GROUPS.flatMap((g) => g.items)

export interface ShipModel {
  key: string // shipModel key
  name: string // display name
  internal: string // TargetShipType name
  size: 'Small' | 'Medium' | 'Large'
  alwaysHostile?: boolean
  /** Spawned only by the game's own quests: StoryMod's shipModel switch has no key for it. `modFallback` is the closest ship a mod can spawn. */
  gameOnly?: boolean
  modFallback?: string
}

export const SHIP_MODELS: ShipModel[] = [
  { key: 'ion', name: 'Ion', internal: 'Ion', size: 'Small' },
  { key: 'atom', name: 'Atom', internal: 'Atom', size: 'Small' },
  { key: 'zeus', name: 'Zeus', internal: 'Zeus', size: 'Small' },
  { key: 'chaser', name: 'Chaser', internal: 'Chaser', size: 'Small' },
  { key: 'vortex', name: 'Vortex', internal: 'Vertex', size: 'Small' },
  { key: 'hawk', name: 'Hawk', internal: 'Hawk', size: 'Small' },
  { key: 'wasp', name: 'Wasp', internal: 'Wasp', size: 'Small' },
  { key: 'falcon', name: 'Falcon', internal: 'Falcon', size: 'Medium', gameOnly: true, modFallback: 'hawk' },
  { key: 'pangolin', name: 'Pangolin', internal: 'KLA-6', size: 'Medium' },
  { key: 'pangolinmk2', name: 'Pangolin MK2', internal: 'PangolinMK2', size: 'Medium' },
  { key: 'phoenix', name: 'Phoenix', internal: 'Phoenix', size: 'Medium' },
  { key: 'porter', name: 'Porter', internal: 'Porter', size: 'Medium' },
  { key: 'vanger', name: 'Vanger', internal: 'Buran', size: 'Medium' },
  { key: 'viking', name: 'Viking', internal: 'Viking', size: 'Medium' },
  { key: 'valkiria', name: 'Valkyrie', internal: 'Valkiria', size: 'Medium' },
  { key: 'mvalkyrie', name: 'Valkyrie M', internal: 'MValkyrie', size: 'Medium' },
  { key: 'overseer', name: 'Overseer', internal: 'Overseer', size: 'Medium' },
  { key: 'delver', name: 'Delver', internal: 'Delver', size: 'Medium' },
  { key: 'gladiator', name: 'Gladiator', internal: 'Gladiator', size: 'Medium' },
  { key: 'therion', name: 'Therion', internal: 'Therion', size: 'Medium' },
  { key: 'scorpion', name: 'Scorpion', internal: 'Scorpion', size: 'Medium' },
  { key: 'keeper', name: 'Keeper', internal: 'Keeper', size: 'Medium' },
  { key: 'specter', name: 'Specter', internal: 'Specter', size: 'Medium' },
  { key: 'barracuda', name: 'Barracuda', internal: 'Avant', size: 'Medium' },
  { key: 'behemoth', name: 'Behemoth', internal: 'KLA8M', size: 'Large' },
  { key: 'pilgrim', name: 'Pilgrim', internal: 'Pilgrim', size: 'Large' },
  { key: 'goliath', name: 'Goliath', internal: 'Goliath', size: 'Large' },
  { key: 'mantis', name: 'Mantis', internal: 'Mantis', size: 'Large' },
  { key: 'cardinal', name: 'Cardinal', internal: 'Cardinal', size: 'Large' },
  { key: 'leviathan', name: 'Leviathan', internal: 'KLA9', size: 'Large' },
  { key: 'kraken', name: 'Kraken', internal: 'Kraken', size: 'Large' },
  { key: 'grinder', name: 'Grinder', internal: 'Grinder', size: 'Large' },
  { key: 'phasis', name: 'Prometheus', internal: 'Phasis', size: 'Large' },
  { key: 'nemesis', name: 'Nemesis', internal: 'Nemesis', size: 'Large' },
  { key: 'hyperion', name: 'Hyperion', internal: 'Hyperion', size: 'Large' },
  { key: 'titan', name: 'Reaper', internal: 'Titan', size: 'Large' },
  { key: 'discordia', name: 'Discordia', internal: 'Discordia', size: 'Large' },
  { key: 'anglerb', name: 'Angler', internal: 'Angler-B', size: 'Medium', alwaysHostile: true },
  { key: 'anglerm', name: 'Angler-Mother', internal: 'Mother', size: 'Large', alwaysHostile: true },
  { key: 'automaton', name: 'Automaton', internal: 'Automaton', size: 'Medium', alwaysHostile: true },
  { key: 'sarffscout', name: 'Zentarks Scout', internal: 'sarffScout', size: 'Small' },
  { key: 'sarffgiant', name: 'Zentarks Hunter', internal: 'SarffGiant', size: 'Large' },
]
export const shipByKey = (key: string) => SHIP_MODELS.find((s) => s.key === key.toLowerCase())
export const shipByInternal = (name: string) => SHIP_MODELS.find((s) => s.internal === name)

export const SHIP_LEVELS: ShipLevel[] = ['Harmless', 'Novice', 'Competent', 'Expert', 'Master', 'Dangerous']

export interface Behaviour { key: string; group: 'Friendly' | 'Neutral' | 'Hostile' | 'Special'; description: string; hostile: boolean }
/** Labels are getters so they follow the interface language. */
const behaviour = (key: string, group: Behaviour['group'], hostile: boolean): Behaviour => ({ key, group, hostile, get description() { return t(`reference.behaviour${key}`) } })
const missionType = (key: string, focus: 'ship' | 'goods' | 'target') => ({ key, focus, get name() { return t(`reference.mission${key}`) }, get description() { return t(`reference.mission${key}Help`) } })

export const BEHAVIOURS: Behaviour[] = [
  behaviour('Ally', 'Friendly', false),
  behaviour('AllyAFK', 'Friendly', false),
  behaviour('LawForces', 'Friendly', false),
  behaviour('Trader', 'Neutral', false),
  behaviour('TraderNoWeapons', 'Neutral', false),
  behaviour('Miner', 'Neutral', false),
  behaviour('Explorer', 'Neutral', false),
  behaviour('Mercenary', 'Neutral', false),
  behaviour('Pirate', 'Hostile', true),
  behaviour('Enemy', 'Hostile', true),
  behaviour('Fighter', 'Hostile', true),
  behaviour('Automaton', 'Special', true),
  behaviour('Zentarks', 'Special', true),
  behaviour('Angler', 'Special', true),
]

export const MISSION_TYPES: { key: string; name: string; description: string; focus: 'ship' | 'goods' | 'target' }[] = [
  missionType('PirateHunt', 'ship'),
  missionType('FindGoods', 'goods'),
  missionType('TransferGoods', 'goods'),
  missionType('Mining', 'goods'),
  missionType('Courier', 'target'),
  missionType('Tourist', 'target'),
  missionType('MoneyHelp', 'target'),
  missionType('BugHunt', 'target'),
  missionType('RescueMission', 'goods'),
  missionType('CaravanHunt', 'ship'),
  missionType('ContractMurder', 'ship'),
  missionType('Intimidate', 'ship'),
]

export const REPUTATION_LEVELS = ['Low', 'Proven', 'Confidence', 'Ally'] as const

export const QUEST_FACTIONS = [
  { key: 'GreatEmpire', name: 'United Empire' },
  { key: 'TradeFederation', name: 'Trade Federation' },
  { key: 'StellarAlliance', name: 'Interstellar Alliance' },
  { key: 'Independent', name: 'Independent' },
  { key: 'PirateClan', name: 'Pirates' },
] as const

export const STATION_FACTIONS = [
  { key: 'Russian', name: 'United Empire' },
  { key: 'USA', name: 'Trade Federation' },
  { key: 'China', name: 'Interstellar Alliance' },
  { key: 'Independent', name: 'Independent' },
  { key: 'Pirates', name: 'Pirates' },
] as const

export const GOODS = [
  'Narcotics', 'Slaves', 'BasicMedicines', 'NanoMedicines', 'Grain', 'Fish', 'Tea', 'Meat', 'FruitAndVegetables', 'ComputerComponents',
  'Robotics', 'PersonalWeapons', 'BattleWeapons', 'Leather', 'NaturalFabrics', 'SyntheticFabrics', 'MilitaryFabrics', 'Aluminium', 'Gold',
  'Titanium', 'Copper', 'Iron', 'Platinum', 'Thorium', 'Uranium', 'Samarium', 'Hafnium', 'Thallium', 'Tantalum', 'SurvivalEquipment',
  'Clothing', 'DomesticAppliances', 'Oil', 'HydrogenFuel', 'Water', 'LiquidOxygen', 'Diamonds', 'Alexandrite', 'Bouxite', 'Gallite',
  'Coltan', 'Bromellite', 'Rutile', 'Uraninite', 'Monazite', 'Painite', 'Lepidolite', 'LithiumHydroxide', 'MethaneClathrate', 'EscapePod',
  'AnglerEye', 'AnglerFang', 'AutomatonComponent', 'EscapePodRare', 'EscapePodPirate', 'EscapePodRarePirate', 'Zentarks Diamond', 'Drone',
  'VoidOpal', 'Musgravite',
]
/** "FruitAndVegetables" -> "Fruit and vegetables" */
export const humanize = (key: string) => {
  const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export const SECURITY_LEVELS = ['Anarchy', 'Low', 'Medium', 'High', 'Only', 'NoOne', 'Conflict'] as const

export const STAR_TYPE_GROUPS: { name: string; colour: string; items: string[] }[] = [
  { get name() { return t('reference.starMainSequence') }, colour: '#ffd27a', items: ['M-RedDwarf', 'K-YellowOrange', 'G-WhiteYellow', 'F-White', 'A-BlueWhite', 'B-BlueWhite', 'O-BlueWhite'] },
  { get name() { return t('reference.starGiants') }, colour: '#ff9a5a', items: ['K-RedGiant', 'M-RedGiant', 'G-YellowGiant', 'F-YellowGiant', 'M-RedSupergiant', 'F-YellowSupergiant', 'A-BlueWhiteSupergiant', 'B-BlueWhiteSupergiant', 'O-BlueSupergiant', 'O-Hypergiant'] },
  { get name() { return t('reference.starDwarfs') }, colour: '#dfe9ff', items: ['DA-WhiteDwarf', 'DAV-WhiteDwarf', 'DAZ-WhiteDwarf', 'DB-WhiteDwarf', 'DBV-WhiteDwarf', 'DC-WhiteDwarf', 'DCV-WhiteDwarf', 'DO-WhiteDwarf', 'DOV-WhiteDwarf', 'DQ-WhiteDwarf', 'DX-WhiteDwarf', 'L-BrownDwarf', 'T-BrownDwarf', 'Y-BrownDwarf'] },
  { get name() { return t('reference.starWolfRayet') }, colour: '#9ec8ff', items: ['WolfRayetStar', 'WC-WolfRayetStar', 'WN-WolfRayetStar', 'WNC-WolfRayetStar', 'WO-WolfRayetStar'] },
  { get name() { return t('reference.starYoung') }, colour: '#ffe7a8', items: ['HerbigAeStar', 'HerbigBeStar', 'TauriG', 'TauriK', 'TauriF', 'TauriM'] },
  { get name() { return t('reference.starPulsars') }, colour: '#b69cff', items: ['BursterPulsar', 'RadioPulsar', 'MillisecondPulsar', 'SoftGammaRepeaterMagnetar', 'AnomalousX-rayMagnetar'] },
  { get name() { return t('reference.starCarbon') }, colour: '#ff7a6a', items: ['CarbonC-RStar', 'CarbonC-HdStar', 'CarbonC-HStar', 'CarbonC-JStar', 'CarbonC-NStar', 'CarbonC-SStar', 'CarbonM-SStar', 'S-Star'] },
  { get name() { return t('reference.starBlackHole') }, colour: '#5f7f8e', items: ['BlackHole'] },
]

export const PLANET_TYPES = [
  'EarthLikePlanet', 'GasGiantClassI', 'GasGiantClassII', 'GasGiantClassIII', 'GasGiantClassIV', 'GasGiantClassV', 'HeliumRichGasGiant',
  'GasGiantwithAmmoniaLife', 'GasGiantwithWaterLife', 'WaterWorld', 'IcePlanet', 'RockPlanet', 'HighMetalPlanet', 'MetalRichPlanet',
  'AmmoniaPlanet', 'WaterGiant',
]

export const STATION_TYPES = [
  { key: 'OrbitalDark', get name() { return t('reference.stationOrbitalDark') } },
  { key: 'OrbitalWhite', get name() { return t('reference.stationOrbitalWhite') } },
  { key: 'NovaStation', get name() { return t('reference.stationNova') } },
  { key: 'FarmStation', get name() { return t('reference.stationFarm') } },
  { key: 'StationHighTech', get name() { return t('reference.stationHighTech') } },
  { key: 'AsteroidStation', get name() { return t('reference.stationAsteroid') } },
] as const

export const LICENCES = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0', 'All rights reserved'] as const
export const MOD_TAGS = ['Combat', 'Trade', 'Exploration', 'Story', 'Short', 'Long']

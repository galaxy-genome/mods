# Save fields and what the editor reaches

A save is eleven AMF3 objects, written in the order `Save.CreateByteSave` calls `writeObject`
(`save-format.md`, `editor/src/lib/save/codec.ts:313`). This lists every field those objects carry,
transitively, with the declaration it comes from and where a reader changes it today.

Only fields an `writeExternal` puts on the wire are listed. A class member that never reaches the
file is named where its absence is surprising, and marked as such.

Counts: 180 distinct field definitions across 17 serialized classes. The manifest in
`editor/src/lib/save/coverage.test.ts` addresses them as 216 leaf paths, because `ShipData` and
`Module` appear in four places and `ExtraData.materials` is 32 separate bytes.

Status is one of:

* **editable** — a screen writes it.
* **missing** — a reader could reasonably want it and no screen sets it.
* **derived** — the game recomputes it, so an edit is pointless or is overwritten.
* **structural** — wire format, a loader invariant, or a reserved slot nothing reads.

---

## Object 0: `PlayerInfo` (`PlayerInfo.as:7`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `secXf` | Number | `PlayerInfo.as:12` | Ship position, galaxy-map pixels, x | Galaxy, a system row's TRAVEL | editable |
| `secYf` | Number | `PlayerInfo.as:14` | Ship position, galaxy-map pixels, y | Galaxy, a system row's TRAVEL | editable |

`canSave` (`PlayerInfo.as:10`) gates `SaveGame` (`Save.as:504-507`) and is not written.

## Object 1: `ScanData` (`ScanData.as:10`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `Visited` | Vector.\<VisitedStarSystem\> | `ScanData.as:13` | Every map cell the ship has explored | Galaxy, the wand on a system | editable |
| `FreshData` | Vector.\<VisitedStarSystem\> | `ScanData.as:15` | Scan data held but not yet sold | not editable | derived |
| `FreshDataValue` | Vector.\<uint\> | `ScanData.as:17` | Credits each unsold scan is worth | not editable | derived |

`FreshData` and `FreshDataValue` are a parallel pair that `DropData` rewrites whenever data is sold
or discarded (`ScanData.as:27-74`), and `inGameUI.as:3237-3296` accumulates the value as planets are
scanned.

### `VisitedStarSystem` (`VisitedStarSystem.as:7`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `systemId` | uint | `VisitedStarSystem.as:10` | Map cell in the upper bits, planet in the lowest eight (`GalaxyMap.as:252-258`) | editable |
| `discovered` | uint | `VisitedStarSystem.as:12` | Per-planet bit mask, discovered (`inGameUI.as:3237`) | editable |
| `scanned` | uint | `VisitedStarSystem.as:14` | Per-planet bit mask, scanned (`inGameUI.as:3282`) | editable |

## Object 2: `CargoData` (`CargoData.as:10`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `balance` | uint | `CargoData.as:13` | Credits | Home, the Credits field; Cargo's wand | editable |
| `cargoType` | Vector.\<String\> | `CargoData.as:15` | Goods held, by `GoodsType._typeName` | Cargo, BUY and SELL | editable |
| `cargoCount` | Vector.\<int\> | `CargoData.as:17` | Count against each entry of `cargoType` | Cargo, BUY and SELL | editable |
| `materials` | Vector.\<String\> | `CargoData.as:19` | unknown | not editable | missing |
| `materialsCount` | Vector.\<int\> | `CargoData.as:21` | unknown | not editable | missing |

`materials` and `materialsCount` are empty in all three saves and nothing outside `CargoData`
reads them; craft materials live in `ExtraData.materials`.

## Object 3: the hangar, `Vector.<ShipData>` (`Save.as:30`)

Element fields are the `ShipData` table below. A hangar entry's `Station` is what the loader keys
on: an entry with an empty name is taken as the ship in use (`Save.as:387-396`).

## Object 4: `ModulesData`, module storage (`ModulesData.as:8`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `Modules` | Vector.\<Module\> | `ModulesData.as:11` | Modules in storage | Ship, KEEP on a swap; Storage, take in | editable |
| `Station` | Vector.\<String\> | `ModulesData.as:13` | Station each stored module sits at, by position | Ship and Storage, alongside `Modules` | editable |

## Object 5: `ProgressData` (`ProgressData.as:11`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `stationProgress` | Vector.\<StationProgressData\> | `ProgressData.as:14` | Reputation per station | Record, the wand on a reputation row | editable |
| `missions` | Vector.\<MissionCard\> | `ProgressData.as:16` | Missions accepted | not editable | missing |
| `bounty` | Vector.\<Voucher\> | `ProgressData.as:18` | Bounty claims held | Record shows them, read-only | missing |
| `systemProgress` | Vector.\<SystemProgressData\> | `ProgressData.as:20` | Fine owed per system | Record shows them, read-only | missing |
| `timeSpentInGame` | Number, written as int | `ProgressData.as:22` | Play time in seconds; also the mission clock (`MissionCardPanel.as:357`) | Record shows it, read-only | missing |
| `storyQuestID` | int | `ProgressData.as:24` | Main job step | Record shows it, read-only | missing |
| `tradeProgress` | Number | `ProgressData.as:26` | Trade rank points | Record shows the rank, read-only | missing |
| `battleProgress` | Number | `ProgressData.as:28` | Combat rank points | Record shows the rank, read-only | missing |
| `discoveryProgress` | Number | `ProgressData.as:30` | Exploration rank points | Record shows the rank, read-only | missing |

### `StationProgressData` (`StationProgressData.as:7`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `Name` | String | `StationProgressData.as:10` | Station the row belongs to | structural |
| `Reputation` | Number | `StationProgressData.as:12` | Reputation, capped at 100 (`ProgressData.as:283-317`) | editable |

### `SystemProgressData` (`SystemProgressData.as:7`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `Name` | String | `SystemProgressData.as:10` | System the fine belongs to | structural |
| `Fine` | Number | `SystemProgressData.as:12` | Fine owed, in credits | missing |

### `MissionCard` (`MissionCard.as:17`), wire order `MissionCard.as:writeExternal`

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `Type.Name` | String | `MissionCard.as:20` | Mission kind | missing |
| `Reward` | int | `MissionCard.as:22` | Credits paid on completion | missing |
| `Reputation` | Number | `MissionCard.as:24` | Reputation paid on completion | missing |
| `TargetSystem.Name` | String | `MissionCard.as:26` | System to reach | missing |
| `Distance` | Number | `MissionCard.as:28` | Light years to the target | missing |
| `TargetStation.Name` | String | `MissionCard.as:30` | Station to reach | missing |
| `TargetShipName` | String | `MissionCard.as:32` | Ship to find or destroy | missing |
| `TargetShipType` | String | `MissionCard.as:34` | Its hull | missing |
| `TargetGoods` | String | `MissionCard.as:38` | Goods to carry or fetch | missing |
| `TargetGoodsCount` | int | `MissionCard.as:40` | How many | missing |
| `Level.Name` | String | `MissionCard.as:44` | Reputation band the mission was offered at | missing |
| `HomeStation` | String | `MissionCard.as:46` | Station that offered it | missing |
| `Complete` | Boolean | `MissionCard.as:50` | Ready to hand in | missing |
| `TimeStart` | int | `MissionCard.as:52` | `timeSpentInGame` when accepted (`BarScreen.as:702`) | missing |
| `reserv` | int | `MissionCard.as:42` | unknown; nothing outside `MissionCard` reads it | structural |
| `Story` | Boolean | `MissionCard.as:54` | Part of the main job | missing |
| `TargetShipHull` | Number | `MissionCard.as:36` | Target's hull points | missing |

### `Voucher` (`Voucher.as:7`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `PirateName` | String | `Voucher.as:10` | Who the claim is for | missing |
| `Bounty` | int, written as double | `Voucher.as:12` | Credits the claim pays | missing |
| `SystemName` | String | `Voucher.as:14` | System that will pay it | missing |

## Object 6: `ExtraData` (`ExtraData.as:15`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `materials[0..31]` | uint, one byte each | `ExtraData.as:18` | Craft material counts, in `CraftMaterial` declaration order, capped at 50 | Materials, the stepper and the wand | editable |
| `karma` | int, one byte | `ExtraData.as:20` | Karma Points, which set the Karma Level band | Record, the wand | editable |
| `drunk` | uint, one byte | `ExtraData.as:22` | Condition at the bar, 0 to 100 (`BarScreen.as:798-806`) | not editable | missing |
| `fleetMode` | uint, one byte | `ExtraData.as:24` | Fleet attack or defensive mode (`FleetScreen.as:383`) | not editable | missing |
| `arenaLVL` | uint, one byte | `ExtraData.as:26` | Rating battles level | Record, the wand | editable |
| `arenaLastBattleTimeSec` | uint | `ExtraData.as:28` | When the last rating battle ran (`ShipInfoScreen.as:235`) | not editable | missing |
| `saveTime` | Number | `ExtraData.as:30` | Wall clock of the save | not editable | derived (`Save.as:545-546`) |
| `planetsDiscover1` | uint | `ExtraData.as:32` | Bit mask of planet kinds discovered (`ExtraData.as:145-161`) | not editable | missing |
| `starDiscover1` | uint | `ExtraData.as:34` | Bit mask of star kinds discovered, low half (`ExtraData.as:163-190`) | not editable | missing |
| `starDiscover2` | uint | `ExtraData.as:36` | The same mask, high half | not editable | missing |
| `marketCounter` | uint | `ExtraData.as:38` | Drives the market refresh index (`Game.as:291`) | not editable | missing |
| `restoredUnknownSave` | Boolean | `ExtraData.as:48` | Save was restored from the cloud (`inGameUI.as:796`) | not editable | structural |
| `reservedBool2..4` | Boolean | `ExtraData.as:50-54` | Nothing reads them | not editable | structural |
| `lastVisitedSystem` | String | `ExtraData.as:40` | Name of the system last entered (`Universe.as:311`) | not editable | missing |
| `MapBookmarks` | String | `ExtraData.as:42` | Packed map bookmarks (`MAP_BookmarksScreen.as:249`) | not editable | missing |
| `Fleet` | String | `ExtraData.as:44` | Packed fleet | not editable | derived (`Save.as:536-543`) |
| `dailyTaskData` | String | `ExtraData.as:46` | Packed Daily Task (`DailyTaskProcessor.as:41-107`) | not editable | missing |

## Object 7: the ship in use, `ShipData` (`ShipData.as:9`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `Type` | String | `ShipData.as:12` | Hull, by its save key | Hangar, BUY and USE | editable |
| `Station` | String | `ShipData.as:14` | Station the ship sits at; empty marks the ship in use (`Save.as:387-396`) | written by Hangar, not chosen | structural |
| `Modules` | Vector.\<Module\> | `ShipData.as:16` | One entry per slot, `null` for an empty one | Ship, install and remove | editable |
| `color` | uint | `ShipData.as:18` | Hull colour | not editable | missing |

### `Module` (`Module.as:9`), wire order `Module.as:306-321`

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `Type.category._typeName` | String | `Module.as:12` | Module category | Ship and Storage, install | editable |
| `Type.mClassName` | String | `Module.as:12` | Module within its category | Ship and Storage, install | editable |
| `integrity` | Number | `Module.as:14` | Condition; a fresh module is 1e6 | Set on install | editable |
| `ammo` | int | `Module.as:20` | Rounds loaded | Carried over on install | editable |
| `weaponGroups` | uint, written as short | `Module.as:42` | Four bits, below | Carried over on install | editable |
| `totalAmmo` | int, written as short | `Module.as:24` | Rounds in reserve | Carried over on install | editable |
| `needReset` | Boolean | `Module.as:28` | Module needs re-initialising | Cleared on install | editable |
| `fuel` | Number | `Module.as:30` | Fuel in a tank; -1 where the module holds none | Carried over on install | editable |
| `shields` | Number | `Module.as:32` | Shield charge | Carried over on install | editable |
| `shieldsIsBroken` | Boolean | `Module.as:34` | Shield is down | Cleared on install | editable |
| `IsOnManual` | Boolean | `Module.as:38` | Fires on the manual group | Set on install | editable |
| `IsOnAuto` | Boolean | `Module.as:40` | Fires automatically | Set on install | editable |
| `priority_and_level` | uint | `Module.as:44` | Three values, below | Engineer | editable |

`weaponGroups` packs four values (`Module.as:236-273`):

| Value | Bits | Means |
|---|---|---|
| `weaponGroupOne` | 0 | In fire group one |
| `weaponGroupTwo` | 1 | In fire group two |
| `weaponGroupThird` | 2 | In fire group three |
| `weaponGroupsInited` | 3 | Groups have been set once |

`priority_and_level` packs three values (`Module.as:276-303`):

| Value | Bits | Means | Status |
|---|---|---|---|
| `priority` | 0-3 | Power priority | missing |
| `level` | 4-9 | Engineer level, 0 to 25 (`EngineerScreen.as:117`) | editable |
| `upgradeType` | 10-11 | Which modification the engineer applied | editable |

The three share one wire field, so the Engineer writes `priority` back unchanged; no screen offers
power priority.

Members that never reach the file: `integrityMax`, `lastShotTime`, `ammoEndTime`, `ammoPack`,
`upgrade`, and the ten `*Boost` numbers (`Module.as:16-64`). The game recomputes them from the
module's own table and its level (`Module.as:83-195`, `SetExperementalStats` at `Module.as:377`).

## Object 8: `QuestsSave` (`QuestsSave.as:7`)

| Field | Type | Declared | Means | Where a reader changes it | Status |
|---|---|---|---|---|---|
| `balance` | Number | `QuestsSave.as:10` | unknown; set to 0 in the constructor and nothing else reads or writes it | not editable | missing |
| `Quests` | Vector.\<QuestSaveData\> | `QuestsSave.as:12` | One row per quest the save has seen | Quests, the completed switch | editable |
| `questsActiveID` | Vector.\<uint\>, three fixed slots | `QuestsSave.as:14` | Quests in progress; an empty slot holds `uint.MAX_VALUE` (`QuestsSave.as:20-24`) | not editable | missing |

### `QuestSaveData` (`QuestSaveData.as:7`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `ID` | uint | `QuestSaveData.as:10` | Quest identifier | editable |
| `isCompleted` | Boolean | `QuestSaveData.as:12` | Quest is finished | editable |
| `step` | int | `QuestSaveData.as:14` | Step reached; -1 before the quest starts | editable |
| `reserved` | uint | `QuestSaveData.as:16` | Nothing reads it | structural |

## Object 9: `OwnStationData` (`OwnStationData.as:10`)

Read-only throughout. The station screen prints the levels and what each one buys, from the game's
own `SS_*` getters (`OwnStationData.as:402-543`).

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `_systemName` | String | `OwnStationData.as:23` | System the station sits in | missing |
| `_stationName` | String | `OwnStationData.as:35` | Station name | missing |
| `_secX` | Number | `OwnStationData.as:25` | Station position, map pixels, x | missing |
| `_secY` | Number | `OwnStationData.as:27` | Station position, map pixels, y | missing |
| `_stationType` | Number | `OwnStationData.as:29` | One of the six types (`ui/elements/OwnStationChangeType.as:90`) | missing |
| `_planetID` | uint | `OwnStationData.as:37` | Planet it orbits | missing |
| `_distanceFromStar` | uint | `OwnStationData.as:39` | Orbit radius | missing |
| `_progressMessages` | uint | `OwnStationData.as:41` | Bit mask of messages already shown (`OwnStationData.as:670-687`) | structural |
| `_guards` | Vector.\<ShipData\> | `OwnStationData.as:43` | Guard ships, same fields as the hangar | missing |
| `_guardsExp` | Vector.\<Number\> | `OwnStationData.as:45` | Experience per guard | missing |
| `_guardsDamage` | Vector.\<Number\> | `OwnStationData.as:47` | Damage taken per guard | missing |
| `cargoType` | Vector.\<String\> | `OwnStationData.as:49` | Goods in the station's storage | missing |
| `cargoCount` | Vector.\<uint\> | `OwnStationData.as:51` | Count against each entry | missing |
| `cargoForSell` | Vector.\<uint\> | `OwnStationData.as:53` | How much of each is offered to traders | missing |
| `cargoInfoReserved` | Vector.\<uint\> | `OwnStationData.as:55` | Nothing reads it | structural |
| `materials` | Vector.\<uint\> | `OwnStationData.as:57` | Craft materials in the station's storage | missing |
| `_level_modulesStore` | uint | `OwnStationData.as:59` | Module shop level, up to 6 | missing |
| `_level_traders` | uint | `OwnStationData.as:61` | Traders level | missing |
| `_level_storage` | uint | `OwnStationData.as:63` | Storage level | missing |
| `_level_warpJump` | uint | `OwnStationData.as:65` | Warp jump level | missing |
| `_level_guardsControlCenter` | uint | `OwnStationData.as:67` | Guard control centre level | missing |
| `_level_bar` | uint | `OwnStationData.as:69` | Bar level | missing |
| `_level_repairStation` | uint | `OwnStationData.as:71` | Repair station level | missing |
| `_level_shipsShop` | uint | `OwnStationData.as:73` | Ship shop level | missing |
| `_level_reserved1..4` | uint | `OwnStationData.as:75-81` | Nothing reads them | structural |
| `_repair_Bouxite` | uint | `OwnStationData.as:83` | Bouxite still owed for repairs | missing |
| `_repair_Coltan` | uint | `OwnStationData.as:85` | Coltan still owed | missing |
| `_repair_Uraninite` | uint | `OwnStationData.as:87` | Uraninite still owed | missing |
| `_repair_Bromellite` | uint | `OwnStationData.as:89` | Bromellite still owed | missing |
| `_repair_Lepidolite` | uint | `OwnStationData.as:91` | Lepidolite still owed | missing |
| `_repair_reserved` | uint | `OwnStationData.as:93` | Nothing reads it | structural |
| `_lastTimeTradeUpdate` | uint | `OwnStationData.as:105` | When the traders last ran | missing |
| `_tradeExp` | Number | `OwnStationData.as:107` | Trade points, which gate the traders upgrade (`OwnStationSubSystemPanel.as:365`) | missing |
| `_lastEventTime` | Vector.\<Number\> | `OwnStationData.as:109` | When each station event last fired | missing |
| `_lastNextEventTime` | Vector.\<Number\> | `OwnStationData.as:111` | When each is due next | missing |
| `_eventInProcess` | Vector.\<uint\> | `OwnStationData.as:113` | Event running per slot | missing |
| `_eventParam` | Vector.\<uint\> | `OwnStationData.as:115` | That event's parameter | missing |

The `_repair_*_default` members (`OwnStationData.as:95-103`) are the costs a full repair starts
from and are not written.

## Object 10: `ExtraData2` (`ExtraData2.as:8`)

| Field | Type | Declared | Means | Status |
|---|---|---|---|---|
| `expeditionsData` | String | `ExtraData2.as:15` | Packed expeditions (`ExpeditionProcessor.as:103`) | missing |
| `gatesData` | String | `ExtraData2.as:17` | Packed gates: two station names and their repaired flags per gate (`ExtraData2.as:48-118`) | missing |
| `expeditionSave` | String | `ExtraData2.as:19` | Expedition rewards already granted (`MissionsShipScreen.as:684-690`) | missing |
| `reserved3..5` | String | `ExtraData2.as:21-25` | Nothing reads them | structural |
| `experementalModuleRndSeed` | int | `ExtraData2.as:27` | Seed for experimental module stats (`Module.as:377`) | missing |
| `num1_uint` | int | `ExtraData2.as:29` | unknown; nothing outside `ExtraData2` reads it | structural |
| `num2..num6` | Number | `ExtraData2.as:31-39` | unknown; nothing outside `ExtraData2` reads them | structural |

`GatesInfo` (`GatesInfo.as:3`) holds `station1`, `station2`, `repaired1`, `repaired2` but is never
serialized: `SaveGatesData` flattens it into the `gatesData` string (`ExtraData2.as:85-118`).

---

## The missing list, most useful first

1. **Main job step**, `ProgressData.storyQuestID`. The one number that moves the story, and Record
   already prints it.
2. **Trade, Combat and Exploration rank points**, `ProgressData.tradeProgress`, `battleProgress`,
   `discoveryProgress`. Record prints the rank each one buys; nothing sets them.
3. **Fines**, `SystemProgressData.Fine`. Record lists what is owed and offers no way to clear it.
4. **Bounty claims**, the `Voucher` rows. Same screen, same gap.
5. **Own station levels**, the eight `_level_*` fields. The station screen already explains what
   each level buys, which is exactly the screen a reader would expect a stepper on.
6. **Own station repair debt**, the five `_repair_*` fields. A station is unusable until they reach
   zero (`OwnStationData.as:544-551`).
7. **Own station cargo and materials**, `cargoType`, `cargoCount`, `materials`.
8. **Active quests**, `QuestsSave.questsActiveID`. The Quests screen completes a quest but cannot
   put one in progress.
9. **Module power priority**, the low four bits of `Module.priority_and_level`. The Engineer
   already writes the same wire field.
10. **Ship colour**, `ShipData.color`.
11. **Discoveries**, `ExtraData.planetsDiscover1`, `starDiscover1`, `starDiscover2`.
12. **Missions**, the `MissionCard` rows. Seventeen fields with several cross-references to tables
    the editor does not carry, so the largest piece of work on this list.
13. **Fleet**, `ExtraData.Fleet` and `fleetMode`. `Fleet` is rewritten on every save
    (`Save.as:536-543`), so it is only worth setting alongside a live fleet.
14. Smaller ones: `drunk`, `lastVisitedSystem`, `MapBookmarks`, `dailyTaskData`, `marketCounter`,
    `arenaLastBattleTimeSec`, `timeSpentInGame`, the expedition and gate strings.

## The check

`editor/src/lib/save/coverage.test.ts` decodes the three saves in `saves/`, flattens every leaf
path, and asserts each one appears in a manifest carrying these statuses. A field appearing in a
save that the manifest does not know about fails. It then runs every editor action and asserts that
each field the manifest calls editable is one an action writes, and that no action writes a field
the manifest calls derived.

The other direction is weaker on purpose: adding or dropping a vector row touches every field of
that row, including ones no control sets, so a written path alone is not proof of a control.

It is not yet in `npm run test:save`; that line needs a `coverage.test.ts` entry.

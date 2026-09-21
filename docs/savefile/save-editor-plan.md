# Save editor plan

A save-file editor for Galaxy Genome that looks and behaves like the game's own
station screens. The player's ship sits at a fake station and cannot fly; every
other screen that touches the save is reachable from there.

## Constraints

* A save the game cannot load bricks the main menu: Play goes dead and nothing is
  clickable. Every write validates first, backs up first, and changes the minimum
  number of fields.
* Round-trip is a gating test. Decode then encode with no edits produces
  byte-identical output for every file under `saves/` and `saves/history/`, and the
  same bytes as `tools/bin/gg_save.py`. Nothing ships until that passes.
* Every mechanic below carries a `file:line` citation into
  `decompiled-all/scripts`. Anything uncited is an open question, not a feature.
* User-facing text uses the game's words from
  `extracted/assets/assets/lang_en.json`, never internal ids.

## Architecture

The save editor is a route inside the existing editor app at
`editor`, lazy-loaded as its own chunk. That app is
already a React 19 + Vite + Tailwind offline PWA published to GitHub Pages, and it
already owns the galaxy map, the UI kit, the i18n loader and the immer store
pattern. A second app duplicates all of it.

| Layer | Where | Shared across targets |
|---|---|---|
| Save codec (XOR container, SharedObject container, AMF3, externalizable classes) | `editor/src/lib/save/codec.ts` | yes |
| Game data tables (modules, ships, hull slots, grades, materials, goods) | `editor/public/data/save-data.json` | yes |
| Rules (fit, best-module, upgrade, price) | `editor/src/lib/save/rules.ts` | yes |
| Screens | `editor/src/features/save/` | yes |
| Galaxy map | `editor/src/features/map/StarMap.tsx`, `MapRoute.tsx` | yes |
| File source | `editor/src/lib/save/source.ts` | no, one implementation per target |

`SaveSource` is the whole per-platform surface:

```ts
interface SaveSource {
  list(): Promise<{ id: string; label: string }[]>
  read(id: string): Promise<Uint8Array>
  write(id: string, bytes: Uint8Array): Promise<void>   // backs up first
}
```

`BrowserSource` uses an `<input type="file">` and an anchor download, and never
overwrites anything. `AndroidSource` does `fetch` against a helper on
`127.0.0.1` that `tools/bin/gg_save.py` serves under Termux against the real
path `/sdcard/Android/data/com.skvgames.GalaxyGenome/files/`. Target 2 costs one
file plus a `--serve` flag on a script that already reads and writes both
containers.

### Codec

The codec is ported to TypeScript, from `tools/bin/gg_save.py` as the reference.
The app is a static offline PWA with no backend, so a server-side codec ends
offline use and sends players' saves to a host that does not exist. Pyodide adds
about ten megabytes to a bundle whose point is loading on a phone. The AMF3
subset in question is the `Reader`/`Writer` pair at `tools/bin/gg_save.py:52-232`
and the `EXT` externalizable field-order table at `tools/bin/gg_save.py:20-38`,
which is a direct, small port. The Python stays as the oracle the TS is tested
against.

### Data tables

`tools/port/export_save_data.py` writes `editor/public/data/save-data.json` from
the tables that already exist: `MODULES` (`tools/bin/gg_save.py:233`), `SHIPS`
(`tools/bin/gg_save.py:695`), plus the per-hull slot vectors and the goods and
material catalogues read out of `decompiled-all/scripts`. No table is retyped by
hand in TS.

## Game rules, cited

### Hull slots

A ship declares slot counts as vectors indexed by size class minus one:
`objects/Ships/ShipType.as:182` `public var optional:Vector.<uint>;` with
`:184 optionalMilitary`, `:188 weapons`, `:194 external`. Main modules are
scalars at `ShipType.as:174-180` (`maxDSD`, `maxThrusters`, `maxPowerPlant`,
`maxPowerDistributor`, `maxTank`) and `:202-218` (`defaultLifeSupport`,
`defaultSensors`, `defaultShields`, `defaultHull`, `maxFighterHangar`). Example:
`ShipType.as:452` `ION.optional = new <uint>[5,2,0,0,0,0];`.

The game expands those into one flat slot array in the `Modules` constructor,
`system/modules/Modules.as:48`, with parallel vectors `ModulesRestriction`,
`ModulesSizeMin`, `ModulesSizeMax` declared at `Modules.as:34-40`. Slots 0 to 7
are the fixed main modules (`Modules.as:102-116`: Hull, PowerPlant, Thrusters,
PowerDistributor, DSD, LifeSupport, FuelTank, Sensors), then weapons
(`:141-142`), external (`:156-157`), military (`:173-174`) and optional
(`:184-185`). The editor builds the same flat array, from the same vectors, so a
slot index in the editor is the slot index the save stores.

Shields, hull reinforcement and cargo racks are not their own slot class: they
are Optional modules in optional slots (`Modules.as:189`
`this.AddToRandomSlot(param1.defaultShields);`).

### Does this module fit this slot

Two tests, both cited, and nothing else:

1. Size: `ui/screens/BuySellModuleScreen.as:505`
   `if(ShipsManager.player_ship.modules.ModulesSizeMax[SelectedSlot] < NewModule.mClass)`.
   The same test appears at `ui/screens/ModulesAvailableScreen.as:303` and
   `ui/screens/ModulesStorageScreen.as:363`.
2. Type: `system/modules/GetAvailableModules.as:345-352`, where a candidate whose
   `type` differs from the slot's `ModulesRestriction` is skipped, with one
   exception, Military modules also fit Optional slots.

Power is not an install gate. It is a runtime budget only
(`Modules.as:249 get AvailablePower`, `:260 get UsingPower`), and mass affects
speed only (`objects/Ships/ShipInfo.as:670`). Two extra per-module rules apply:
singleton modules (`BuySellModuleScreen.as:510 if(NewModule.singleton)`) and the
fighter hangar cap (`ModulesAvailableScreen.as:316`).

`ModulesSizeMin` is initialised to 1 for every slot (`Modules.as:127-131`); the
only non-trivial minimum is a shop-screen filter (`ModulesShopScreen.as:137`), so
the editor ignores it.

### Grades and the "best module this hull can hold" rule

`mClass` is the size, 1 to 6 (`system/modules/BaseModule.as:21`), and `grade` is
the letter (`BaseModule.as:15`), ordered worst to best at
`system/modules/ModuleGrade.as:6-14`: E=1, D=2, C=3, B=4, A=5. The displayed
class name is the two concatenated (`BaseModule.as:23`).

The game already implements the rule the convenience buttons need:
`universe/Managers/ShipsManager.as:897` `GetModuleByGrade(category, grade, maxClass)`,
which picks the largest `mClass <= maxClass` of that category and grade
(`ShipsManager.as:910` `if(BaseModule.enum[_loc7_].mClass <= param3)`). The editor
ports that function and calls it with `ModulesSizeMax[slot]` and `GradeA`.

So every convenience button is one loop:

* **Max all** (main modules): for each of slots 0 to 7, `GetModuleByGrade(category, GradeA, ModulesSizeMax[slot])`.
* **Max storage**, **Max shield enhancements**, **Max hull enhancements**: the
  same call over the optional slots, restricted to the cargo, shield and hull
  reinforcement categories, filling every empty optional slot.
* **Zentarks** (weapons section): fills weapon slots with `ZenLaserWeapon`
  (`system/modules/ModuleSubType.as:94`, variants `system/modules/ZenLaserWeapon.as:8-22`,
  shown as "Zentarks cannon", `lang_en.json:4382`), and offers the Shadow jump
  module (`system/modules/ZentarksShadowModule.as:8`, "Shadow jump module",
  `lang_en.json:4386`) for an optional slot, since that is the game's other piece
  of Zentark technology.

### Engineer

Level and priority are packed into one `uint` (`system/modules/Module.as:44`):
priority is bits 0-3 (`Module.as:278`), level bits 4-9 (`Module.as:288`),
upgrade type bits 10-11 (`Module.as:298`), serialised whole at `Module.as:320`.

Maximum level is 25 (`ui/screens/EngineerScreen.as:117`
`if(param2.module.level >= 25)`), with a per-engineer cap of
`levels_max * 5` (`EngineerScreen.as:116`, tables at
`system/modules/Engineer.as:62-75`). Applying an upgrade is three statements,
`EngineerScreen.as:186-188`: spend the materials, add one level, set the upgrade
type. Changing upgrade type resets the level to 1 (`EngineerScreen.as:215`).

Materials cost one of each material in the level band
(`system/modules/ModuleUpgrade.as:43 GetMaterialsByLevel`, bands below 6, 11, 16,
21 and above), checked at `ModuleUpgrade.as:65` and spent at `:85`. The editor
skips the check and the spend, which is exactly "the engineer works as if you hold
every required supply", and writes only the level and upgrade type. The material
counts in the save are left alone unless the player edits them on the supplies
screen.

### Credits, cargo, materials

Money is `CargoData.balance`, a `uint` (`system/Save/CargoData.as:13`, default
20000 at `:26`, written at `:153`). The loader resets a negative balance to 20000
(`system/Save/Save.as:321-323`), so the editor clamps to `0 .. 2^32-1`.

Goods are parallel name and count vectors (`CargoData.as:15-21`), catalogued by
`system/Goods/GoodsType.as:154` and `:166`. Engineer materials are a separate
fixed array of 32 bytes (`system/Save/ExtraData.as:18`, written at `:198`), capped
at 50 each (`globalSettings.as:51 materialCountMax`), with ids assigned in
declaration order (`system/CraftMaterials/CraftMaterial.as:128`, enum from `:16`).

Station market stock is generated from the station and a seed
(`system/Goods/MarketGenerator.as:43`), not stored in the save. The editor's
supplies screen therefore grants goods and materials directly rather than
simulating a market, and prices are shown for reference only
(`MarketGenerator.as:11,21,23`, `:64`, `:112`).

### Ships

An owned ship is `Type`, `Station`, `Modules`, `color`
(`system/Save/ShipData.as:12-18`); the hangar is `Save._ships`
(`system/Save/Save.as:30`), and the loader prunes entries with no station
(`Save.as:387-394`), so every hangar entry the editor writes carries the fake
station's name. Ship price is `ShipType.baseCost` (`ShipType.as:222`) and shop
availability is `ShipType.GetAvailableShips` (`ShipType.as:275`). Buying in the
game subtracts the cost and pushes the old ship into `_ships`
(`ui/screens/ShipShopDetailsScreen.as:489-491`); the editor does the same two
writes.

A hull module's integrity is the ship's hull value, and a mismatch loads the ship
damaged (`tools/bin/gg_save.py:695` and the note above it), so swapping ships
rewrites the hull module.

## Screens

Each screen lists the save fields it writes. Object numbers refer to the eleven
AMF3 objects in `save-format.md`.

| Screen | Reached from | Writes |
|---|---|---|
| Station menu | landing screen, click the station | nothing directly; the hub |
| Ship menu | click the ship | nothing directly; the hub |
| Module shop | station menu | object 8 `ShipData.Modules` (fitted), object 5 `ModulesStorage.Modules`/`Station` (bought into storage), object 3 `CargoData.balance` |
| Hangar, add and remove | station menu | object 4 `Vector.<ShipData>`, object 8 `ShipData`, object 5 `ModulesStorage` |
| Ship shop | station menu | object 4 `Vector.<ShipData>`, object 8 `ShipData` (`Type`, `Modules`, `color`), object 3 `balance` |
| Supplies | station menu | object 3 `cargoType`/`cargoCount`, object 7 `ExtraData.materials` |
| Credits | station menu | object 3 `balance` |
| Engineer | station menu | object 8 and object 5 `Module.priority_and_level` |
| Galaxy map | station menu, "set position" | object 1 `PlayerInfo.secXf`/`secYf`, object 7 `ExtraData.lastVisitedSystem` |

The ship menu holds the fitted-module view and the convenience buttons; the
station menu holds everything that involves money or the outside world.

### Viewport

The app renders into a fixed landscape mobile frame, centred and letterboxed on
a dark backdrop, sized from a CSS aspect-ratio box.

The page renders landscape while the device is held vertically, because the
device rotates it: `orientation: landscape` in the manifest, and
`screen.orientation.lock('landscape')` on the first interaction in a browser.
The OS does the rotating, so pointer coordinates, the on-screen keyboard,
scrolling and focus all stay correct.

Where a browser refuses the lock, the same landscape frame letterboxes into the
portrait viewport: smaller, complete, and fully usable. There is no rotate
prompt, no CSS rotation and no portrait layout.

The lock is held by the save editor's own route, not by the manifest, because
the manifest governs the whole installed app and the quest editor is a portrait
layout.

Sizes inside the frame come from container query units on the frame, never from
`vw` or `vh`, so the frame is the only thing that has to know how big it is.

## Visual system

The look comes from the wiki's overview modals, not from a new design. The
`.ov*` rules and the `overviewHtml` and `moduleHtml` builders in
`tools/port/wiki_shell.html` already render the game's panel grammar: the cyan
centred section bar, the gold underlined heading row, the white underlined
column headers, the artwork block, the grade tiles, and the label/value rows.
The save editor reuses those class names and those builders' structure.

### The home page

The screen after a save loads is nine cards, three across by three down, in the
style of the wiki's ship list: artwork at the left, a cyan title, a gold line,
and white-labelled stat columns beneath. Three by three gives each card 2.2:1 in
the 20:9 frame, the proportion the wiki card already uses.

| # | Card | Objects | Opens |
|---|---|---|---|
| 1 | Your ship | 8 `ShipData` | Fitted modules, module shop, engineer |
| 2 | Hangar | 4 `Vector.<ShipData>` | Ship list, ship shop, add and remove |
| 3 | Module storage | 5 `ModulesStorage` | Storage list, install to a slot |
| 4 | Credits and cargo | 3 `CargoData` | Trade |
| 5 | Craft materials | 7 `ExtraData.materials` | Materials list |
| 6 | Galaxy | 1 `PlayerInfo.secXf`/`secYf`, 2 `ScanData` | Station selector with the map |
| 7 | Quests | 9 `QuestsSave` | Quest list with a completed checkbox |
| 8 | Your station | 10 `OwnStationData` | Station services, guards, cargo |
| 9 | Record | 6 `ProgressData`, 7 `karma` and `arenaLVL` | Reputation, bounty, fines, karma, arena |

Each card's figures are read from the save every time the home page opens, so an
edit made on any screen shows up on return. Object 11 `ExtraData2` has no card
and is re-encoded unchanged.

The home page is the only screen with no original in the game. Every other
screen is a reconstruction of the real one.

### Every other screen

A screen below the home page reproduces the game's own screen, built from the
wiki's renderers and the game's own sprites. The references are in
`screenshots/saveeditor-examples/qemu-screenshots/`.

| Screen | Reference | Built from |
|---|---|---|
| Market | `market-main-1.png`, `market-main-2.png` | `.ovbar` section rows (Food, Medicines), `.ovwhite` headers (RESOURCE, CARGO, PRICE, DEMAND), per-row tint and demand bars |
| Trade | `market-subpage-buy.png`, `market-subpage-sell.png` | BUY and SELL tabs, NAME/PRICE/PROFIT and BALANCE/CARGO SPACE/BUY PRICE rows, minus, quantity, plus, and the BUY bar |
| Ship shop | `shipyard-new-main.png` | The wiki ship card grid, two columns |
| Ship detail | `shipyard-new-subpage-*.png` | `overviewHtml` |
| Ship purchase | `shipyard-new-subpage-purchase-modal.png` | The game's confirm modal |
| Fitted modules | `shipyard-modules-main.png` | The specs strip (HULL, SHIELDS, JUMP RANGE, TOTAL MASS, SPEED) over Main, Weapon, External and Optional sections, each row an icon, a class number and a name |
| Module detail | `shipyard-modules-subpage-powerplant*.png` | `moduleHtml` |
| Module purchase | `shipyard-modules-subpage-powerplant-purchase-modal.png` | Put in storage, Sell, Cancel |
| Position | the mod editor's station selector | The existing selector and its map |
| Quests | the mods interface | The quest list, with a completed checkbox per quest |

A screen with no reference yet gets one captured before it is built.

### Nothing is bought or sold

The screens wear the game's shop chrome, and none of them move money. A price is
shown because the game shows it, and it is information, never a cost.

* Buying a ship, a module or goods adds it. The balance does not change.
* Selling or discarding removes it. The balance does not change.
* The purchase modal's two outcomes are about the old item, not about money.
  Keeping the old ship puts it in the hangar. Trading it in deletes it, and pays
  nothing. A module kept goes to storage, a module sold is discarded.
* Nothing is refused for being unaffordable, and no screen ever reports a
  shortfall.

The balance changes on the credits screen, where the reader types a number, and
nowhere else.

### The loaded save persists

A save loaded once stays loaded. A refresh, a closed tab or a return tomorrow
finds the same save, the same screen and every edit made so far, and the reader
is asked to open a file only when there is no save yet.

This reuses what the editor already has rather than inventing storage: the
store in `editor/src/store/editor.ts` persists through the throw-safe
`localStorage` wrapper at `:87-93`, tracks `storage.persisted`, and asks for
persistent storage through `navigator.storage.persist()` at `:344-348`. Where
the browser refuses, the editor already says what to do, in
`src/i18n/en/start.ts:29`: install it as an app or bookmark it, and download a
backup meanwhile. The save editor says the same thing in the same words.

The state kept is the decoded save, its filename and the screen in view. The
reader can drop the loaded save and open another at any time, and a save with
edits warns before it is replaced.

### The magic wand

`editor/src/features/save/magic.svg` is the wand, drawn in `currentColor`. It
means one thing everywhere it appears: **set this to the best there is**. It sits
wherever a value is below that best, and disappears once the value is there.

* On a home card, for the whole card's subject.
* Beside a module that is not the top class its slot takes, or is not fully
  upgraded.
* Beside a weapon slot holding anything other than a Zentark cannon.
* Beside a system that is not yet explored.
* Beside a reputation or arena level below its maximum.
* On credits, where best is 2,000,000,000. That is below the `uint` ceiling on
  purpose: a balance near 2^31 goes negative as soon as the player earns more.

The wand only appears where the best is settled and nothing trades against it.
Where two options are each better at something, there is no wand and the reader
chooses.

**What the wand may change is what it sits beside.** A wand on a module row
improves that slot and touches nothing else, so a class 4 slot gets the best
class 4 module. A wand on the ship improves the whole ship, and may move a
module to a different slot: a singleton like shields goes to the largest slot
that takes it, which is how a ship with a class 6 slot free ends up carrying
6A shields rather than the 4A its old slot allowed.

Ship level reassigns and upgrades the categories the ship already carries. It
does not fill an empty slot with a category the ship does not have, because
cargo, shields and hull reinforcement are each better at something and that
choice is the reader's.

**A module never lands in a slot smaller than the one it came from**, so the
ship-level wand only ever improves and never trades one figure for another. The
exception is filler: cargo racks, hull reinforcement and shields boosters exist
to occupy whatever room is left rather than to hold a particular slot, so they
yield to a module that can use their slot and may end up smaller. A ship whose
class 6 slot held hull reinforcement therefore comes out carrying 6A shields,
with fewer hull points and the reinforcement further down.

**Karma has no wand.** A pirate station refuses an Idolized or Liked pilot and
an anarchy system refuses an Idolized one, while a high security system refuses
a Despised one (`ui/screens/MissionsScreen.as:899-909`, bands at
`system/Ranks/MoralityRanks.as:8-16`). Each end of that ladder is better at
something, which is this section's own test for when there is no wand. Karma is
typed like every other figure the save holds.

### The engineer, on the module panel

Engineer levels work the way the grade tiles do. A module the engineer has never
touched opens with every improvement already applied, because that is what a
reader almost always wants. A control on the panel sets a lower level, or none,
and what the reader chooses is what the next visit shows: a module that carries
a modification opens at the level the save holds and the panel writes nothing.
Nothing is spent, and no material is consumed.

### Craft materials

The materials screen is the game's own, from `materials.png` and
`materials-2.png`: the Cargo and Materials tabs, each row a name, a count out of
50, and the fill bar. Each row carries the minus and plus buttons the Trade
screen uses, and the wand, which sets that material to 50.

### Sprites

`extracted/sprites/` holds all 540 named sprites from the game's atlas as SVG,
exported by `tools/port/export_sprites.py`. Ships, module icons, station art and
the 83 `icon_*` HUD glyphs are all there, so no screen uses a substitute icon.
Two sprites differ only by case, `bg_purple` and `BG_Purple`; the second carries
its character id in its filename, because this filesystem does not distinguish
them.

## Screenshots

Visual fidelity comes from real captures. `screenshots/` already holds usable
references for several screens: `hud-1-station-menu.png`, `hud-3-ship-menu.png`,
`shipyard-list.png`, `objects-ships-list-a.png`, `objects-ships-list-b.png`,
`module-purchase-cannon-2d.png`, `module-purchase-fragment-cannon-2d.png`,
`module-purchase-repair-module-1d.png`, `falcon-modules-main.png`,
`falcon-modules-weapon.png`, `falcon-modules-external-optional.png`,
`falcon-modules-optional-tail.png`, `available-modules-cannon-grades.png`,
`available-modules-shields-grades.png`, `galaxy-map-wolf359-side-quest.png`.
Those are not re-captured.

A Sonnet subagent captures the rest into
`screenshots/saveeditor-examples/qemu-screenshots/`, one PNG per row, named
exactly as given:

| File | Screen | How to reach it | Required state |
|---|---|---|---|
| `engineer-list.png` | Engineer, module list | Station menu at a station with an engineer, then Engineer | At least one upgradeable module fitted, materials visible |
| `engineer-upgrade.png` | Engineer, upgrade detail | From the list, select one module | The material cost row and the level number both on screen |
| `engineer-full.png` | Engineer, capped module | Same, on a module already at its cap | The cap message visible |
| `market-buy.png` | Market, buy tab | Station menu, Market | Stock listed with prices, balance visible |
| `market-sell.png` | Market, sell tab | Same, switch tab | Cargo held, so rows are not empty |
| `materials-list.png` | Craft materials inventory | Wherever the game lists the 32 materials | At least six different materials held |
| `storage-list.png` | Module storage | Station menu, module storage | At least three modules in storage |
| `storage-install.png` | Module storage, install | Select a stored module and target a slot | The slot picker open |
| `hangar-list.png` | Hangar, owned ships | Station menu, hangar | At least two ships owned |
| `hangar-swap.png` | Hangar, switch ship confirm | Select the other ship | The confirmation state |
| `credits-hud.png` | Balance readout | Any station screen | Balance clearly legible, for font and colour |
| `station-menu-full.png` | Station menu, every button enabled | A large station with all services | No greyed buttons |
| `ship-menu-full.png` | Ship menu, all sections | Ship with main, weapon, external and optional modules fitted | Sections visible, scrolled to top |

Rules the subagent follows, from `CLAUDE.md`:

* Never force-stop Galaxy Genome.
* Every snapshot it saves gets an entry in `emulator/snapshots.md` at save time:
  name, who saved it, why, and the verified state.
* Emulators run at `nice -n 19`.
* Only this Sonnet agent reads screenshots. It works from the existing runbook
  style in `emulator/runbooks/` and writes one for this capture run.
* It searches only inside this project, never from the filesystem root or the home directory.
* Scope is settled before it starts; a mid-run change goes to a fresh agent.

## Milestones

Milestones 1 and 2 are done. Everything built above them is replaced, because it
was built before the visual system was settled.

1. **Codec.** `editor/src/lib/save/codec.ts`. Done.
   Check: `npm run test:save` decodes and re-encodes every file in `saves/` and
   `saves/history/` to identical bytes, and to the same bytes as
   `python3 tools/bin/gg_save.py selftest` on each.
2. **Data export.** `tools/port/export_save_data.py` writes
   `editor/public/data/save-data.json`. Done, and extended in milestone 3.
3. **Card and panel data.** `export_save_data.py` also carries what the wiki's
   renderers need: for a ship, its display name, sprite, purpose, ability,
   faction, influence and all six specs; for a module, its description, price,
   durability and parameter table; the sprite name for every card. Import
   `overview` and `module_cards` from `tools/port/ship_overview.py` rather than
   restating any of it. Sprites are copied from `extracted/sprites/` into
   `editor/public/sprites/` by the same script.
   Check: every ship in the table renders an `overviewHtml` panel with no empty
   field, and every module a `moduleHtml` panel, asserted over the whole table.
4. **Panel kit.** `editor/src/features/save/overview.css`, the `.ov*` rules
   copied from `tools/port/wiki_shell.html` with their class names intact, plus
   the landscape frame, the start screen and the Return and Close headers the
   game uses.
   Check: a ship panel and a module panel render in the browser beside
   `shipyard-new-subpage-gladiator-1.png` and
   `shipyard-modules-subpage-powerplant.png` and match.
5. **Home page.** The nine cards, three by three, each reading its figures from
   the loaded save, plus download.
   Check: load a save, every card shows the figure `gg_save.py` reports for the
   same file; change credits, return to the home page, the card has followed.
6. **Trade and market.** `market-main-*.png` and `market-subpage-*.png`.
   Check: buy goods in the editor, the game shows the cargo and the balance the
   editor wrote.
7. **Modules.** The fitted-module screen, the module detail panel, the purchase
   modal, storage, and the Max buttons.
   Check: Max all on a starter hull produces only modules whose `mClass` is at or
   below that slot's `ModulesSizeMax`, asserted in a unit test over every ship in
   the table; then one emulator load to confirm the ship is undamaged.
8. **Ships and hangar.** The ship grid, the ship detail panel, the purchase
   modal, hangar add and remove.
   Check: buy a ship in the editor, the game shows it in the hangar with the old
   ship still present.
9. **Engineer and materials.**
   Check: set a module to level 25, the game shows level 25 and the engineer
   offers no further upgrade; grant a material, the count matches and stays at or
   below 50.
10. **Galaxy.** The mod editor's station selector sets the save's position, and
    the card reports what has been visited.
    Check: pick a named system, load, the game reports that system.
11. **Quests, station and record.** The quest list with its completed checkbox,
    the station screen, the record screen.
    Check: mark a quest completed, the game's journal agrees.
12. **Native app.** The map, mods, save editor and wiki in one Android shell with
    native file access.
    Check: the app lists the three slots, edits credits, the game loads the
    change, and the backup file exists.

## Safety

Before any write the editor re-decodes the bytes it is about to hand over and
asserts: eleven objects read cleanly to the end of the buffer, the owner id is
unchanged, the balance is within `uint`, every fitted module passes the size and
type tests above, every hangar entry has a station name, and the SharedObject
container ends in the closing `00` byte (`save-format.md`). A failed assertion
blocks the write and names the field.

The browser target never overwrites: the download is a new file. The Android
target copies the current file to
`saves/history/<slot>/<timestamp>-<md5>.SOL`, matching what is already in the
repo, before writing. Rollback is copying that file back.

## Decisions

Milestones 1 to 7 are browser only. A save arrives by upload and leaves by
download; moving it to a device is the existing adb scripts. Native file access
arrives with the app in milestone 8, not through a localhost server.

The current system is set from `PlayerInfo.secXf` and `secYf`. Whether
`ExtraData.lastVisitedSystem` also matters is on the punchlist, not the build.

The route is `/mods/savefile`, inside the existing editor, which is the same
shell the app wraps.

The opening screen requires either a save file or a full `mods/` state bundle as
downloaded from `mods/`. The owner id is never rewritten.

## Punchlist

- The ship level wand offers the loadout tool's goal presets, so a reader picks
  the goal and the fit follows: `loadouts/` already scores a fit against one.

- Does `ExtraData.lastVisitedSystem` need to agree with `PlayerInfo.secXf`/`secYf`?
- The map, wiki, mods, loader and save editor become one app. The quest editor
  needs a landscape layout before the manifest can carry `orientation:
  landscape`.
- `editor/src/features/save/PanelDemoPage.tsx` is a milestone check, not a
  screen. It goes before release.

# Star map

The editor's galaxy map: a self-contained canvas component under `src/features/map/`, copied from the published
map's renderer (`~/code/galaxy-genome/tools/port/*.js`). The published map is not imported, embedded or changed; the
parity tests below keep the copy honest. UI placement is in [quest-editor.md](quest-editor.md) §17.5, §17.6.

## Coordinates

All positions are light years on the flat map, Sol at 0, 0, +Y toward the top. Evidence:
[mod-loading-rules.md](../ignored/mod-loading-rules.md#coordinates).

| Editor | Mod file | `galaxy.db` | Published map |
|---|---|---|---|
| `Star.x` | `X` | `map_x` | `X` |
| `Star.y` | `Y` | `map_z` | `Z` |
| `Star.z` | `Z` (height, not drawn) | `height_y` | not drawn |
| `pointX`, `pointY`, `radius` | `RandomQuestX`, `RandomQuestY`, `RandomQuestRadius` (int) | `map_x`, `map_z` | `X`, `Z` |

Cell of a point: `[floor(x / 43.74 + 1025), floor(-y / 43.74 + 1591)]`. Distances use `x` and `y` only.

## Scope

| In | Out |
|---|---|
| Camera: pan, pinch, wheel, fly-to, scale and centre clamping | Sidebar, filters, search box |
| Grid with power-of-two cell steps and axis labels | Value, ore and scan hunts, rich layer |
| Galaxy outline | Routes, jump calculator |
| Catalogue systems as dots coloured by star type, names by zoom | Wiki links, presets, spoilers |
| Generated systems when zoomed in (ported generator) | Tooltips beyond a small name label |
| Picking: nearest system, catalogue, generated or mod; world coordinates of a tap | Language switching (names are the game's own strings) |
| Editor layers (below) | |

### Editor layers

Drawn over the galaxy in this order.

| Layer | Look | Interaction |
|---|---|---|
| Other favorite stars mods' stars | Dimmed dot, name when zoomed in | Tap selects (read-only) |
| This mod's stars | Bright dot with cyan ring, always labelled | Drag moves; tap opens the star editor |
| Moved catalogue system | Dashed line from the catalogue position to the mod star | None |
| Quest start circle | Centre handle and radius ring | Drag centre moves, drag ring resizes |
| Selection | Pulsing ring | None |
| Problem marker | Amber or cyan badge on the star | Tap opens the problem |

## Modes

`StarMap` takes a `mode` and draws only what that mode needs.

| Mode | Layers | Tap empty | Tap system | Drag |
|---|---|---|---|---|
| `edit` | All star layers | `onAdd(x, y)` | `onOpen(starId)` for a mod star | Mod star: `onMove` |
| `point` | All star layers, one editable point | `onPoint(x, y)` | Snaps to the system's position | Point |
| `circle` | Circle, mod stars dimmed | `onCircle(x, y, r)` keeps `r` | Centres on it | Centre or ring |
| `pick` | All star layers, no handles | Nothing | `onPick(name)` | Pans only |
| `view` | Galaxy and `overlay` | `onPin(null)` | `onPin(id)` on a pin, else selects the system | Pans only |

A drag starts only on a handle or a mod star within the pick radius; anything else pans.

## Module layout

| File | Owns | Copied from |
|---|---|---|
| `camera.ts` | View state `{cx, cz, scale, W, H}`, `sx`, `sy`, `wxOf`, `wzOf`, `clampScale` (W / 200,000 to 40 px per ly), `clampView` to the 2048-cell world, `zoomAt`, `panBy`, `pinchTo`, `flyStep` (the published map's critically damped spring, zoom in log space; a jump under reduced motion), home view 75 ly across on touch, 150 on desktop | `starmap_js.js` L100-225, L1474-1500, L1715-1760 |
| `galaxy.ts` | Data load shared by the map and the checks (`loadGalaxy`, `loadGeneration`, `useGalaxy`), `drawGrid`, `drawOutline`, `drawSystems` (one path per colour), `Labels` (rank, collision grid, held until the view moves a fifth of itself), `insideOutline` | `starmap_js.js` L272-300, L531-600, L706-715 |
| `generator.ts` | `Generator` class (instance cache capped at 20,000 cells): `Rndm`, `starByZone`, `sectorName`, `cellStars`, `catalogueInCell`, generation-map decoding; `StarMap` draws generated systems only below 10,000 ly across, thinned by the same share rule | `galaxygrid.js`, `generated.js` L1-285, `starmap_js.js` L382-452, L2864-2960 |
| `picking.ts` | `pick`: nearest within 24 px on touch, 14 px otherwise, mod stars first, then other favorites, catalogue, generated (generated only while the field is unthinned); `worldAt`; mode logic as pure functions: `grabAt`, `tapAction`, `dragTo` | `starmap_js.js` L1296-1360 |
| `checks.ts` | Map-derived star problems (below), pure functions over data and stars | New |
| `StarMap.tsx` | Canvas, resize with `devicePixelRatio` capped at 2, pointer and wheel handling, drag state, redraw on `requestAnimationFrame` | `starmap_js.js` L1525-1690 |
| `places.ts` | Place resolver, `questPlaces`, `placeRoutes`, `seriesPlaces`, `sharedPlaces` | New |
| `QuestMaps.tsx` | `QuestOverviewMap`, `SeriesMapPage` | New |
| `MapRoute.tsx` | Full-screen route for `point`, `circle`, `pick`: header with Cancel and Done, "Centre on a system" search, numeric inputs for `point` and `circle`, "Open in full map" with the circle drawn; `useOpenMap`, `MapLayer` | New |

`StarMap` props: `mode`, `stars` (this mod), `otherStars` (favorites), `circle`, `selected`, `focus` (`{x, y, ly}`),
and the callbacks in Modes. It holds no store access; pages pass data in and write results out.

### Routes

| Route | Mode | Returns to |
|---|---|---|
| `/mod/:id/map` | `edit` | Stays |
| `/map/point?return=…` | `point` | Star editor, `X`, `Y` |
| `/map/circle?return=…` | `circle` | Start settings, point and radius |
| `/map/pick?return=…` | `pick` | System picker or condition parameter |

`useOpenMap()(request, onResult)` pushes the route with the request and the opening location (`mapBackground`) in router
state. `App` renders its routes at `mapBackground`, so the opening page and any open sheets stay mounted, and `MapLayer`
portals the map over them; the layer stops pointer, focus and key events so a sheet underneath neither closes nor takes
focus. Done (or a pick) runs `onResult` and goes back; Cancel goes back with nothing. Loaded directly, `/map/:mode`
renders alone and Done returns to `?return=` without a result.

## Quest views

Two read-only views draw quests over the map in `view` mode (tap a pin selects it; nothing drags). UI placement:
[quest-editor.md](quest-editor.md) §13.

| View | Route | Opened from |
|---|---|---|
| Quest overview | `/mod/:id/flow?view=map`, the Flow tab's third segment | Flow tab |
| Quest series | `/series/:modId` | "Map" on a mod's Contents page when it holds more than one quest |
| Favorites series | `/series` | Home ⋯ → Map of favorites |

The overview lives in the Flow tab because it is the same step graph projected onto the galaxy, and the phone tab bar
already holds five tabs.

### Places

`places.ts` is pure and tested in `places.test.ts` (`SURVEY=1` prints coverage on the community library and the game's
quests).

| Name | Resolved by |
|---|---|
| System | Stars mods (the open mod's first, then favorites), catalogue (all 14,906), generated names decoded from zone, sector pair and quadrant to their cell: the exact star once the generation maps are loaded, the cell centre before |
| Station | `reference.json` stations, then stars mods' stations; drawn at its system |
| Planet | Stars mods' planets, then `reference.json` bodies; a name several systems share resolves only among the systems the quest visits |
| Start | `bar`: the quest's station. `space`, `nearPoint`: the start circle |

Places per step: the finish and fail conditions' system, station and planet parameters, mission home and target
station and target system (when the loader reads it), ship-stop and order targets that name a known place. Ship spawns
are positioned around the player and have no galaxy position. Unknown system and station names are problems (the same
names `rules.ts` flags) and show as an amber badge on the step's pins; unknown planets are listed as not on the map.

`placeRoutes` joins steps along `stepGraph` edges; an edge into a step without places continues to the next placed
steps and keeps its kind and label. `seriesPlaces` turns each quest into beats (places in step order, repeats merged)
and gates from `requiredQuestIds` to quests in the same set. `sharedPlaces` marks systems used by more than one mod.

### Drawing

`StarMap` takes `overlay: { areas, lines, pins }`, `selectedPin` and `onPin`, drawn after the mod stars in the same
canvas pass.

| Element | Overview | Series |
|---|---|---|
| Pin | Step numbers at one place (`1·4`), place names beside it, amber `!` for an unknown name | Quest numbers, or "N quests" past three; white when shared, white ring when used by two mods |
| Line | Next step grey; choice cyan labelled with its text; loop dashed with `↻`; forks bent apart; a step's several places joined by a thin dashed line | Quest colour, arrow, distance in ly (2D); dashed past 150 ly, the most a ship jumps before boosters (`ShipInfo.CalcJump`) |
| Gate | | White dashed arrow "unlocks" from a quest's last beat to the next quest's first |
| Area | Start circle, amber | Once per shared circle, grey when several quests own it |

The camera frames the bounding box of every place and start circle with 64 px side and 44 px top and bottom margins,
never narrower than 8 ly and within the camera's scale limits (`fitView` in `declutter.ts`). It re-frames when the
places change, not when quests are toggled in the legend, and the Fit button under the zoom buttons returns to it.

Steps at one place share a pin (`1·4`). Distinct places whose pins overlap on screen fan out on a circle around their
centroid, each keeping its side (`fanPins`), and draw a thin leader to a dot at the true position; every place always
keeps that dot. The layout runs each frame, so zooming in collapses a fan once the pins have room. Lines join the
displayed pins, and taps hit the displayed pins.

Quest-layer items claim label ground before system names: pins first, then line labels (drawn on a dark plate at the
curve's midpoint), then pin names ahead of catalogue names in the shared label grid. A name that does not fit is
dropped. A route through steps without places passes a small hollow pin per such step, numbered and tappable, spaced
along the route or lifted above the place when both ends share it, so a round trip never reads as a loop; only a
backward jump draws the dashed loop. Two steps at one place joined by "next" draw no line. Steps without places on no
route sit in a strip under the overview map; the series map draws no line between beats at one point; tapping a pin opens a card with Open step, and repeated taps on a shared pin walk its steps.

## Data

`scripts/build-galaxy.py` writes the editor's copy of the galaxy. It reads the map pipeline's outputs and changes
none of them, so the map pipeline order (`export_map.py`, `build_site.py`, then `build_wiki.py`) is unaffected; run it
after `build_site.py`.

| Output | Contents | Source | Size |
|---|---|---|---|
| `public/data/galaxy.json` | `systems`: `[name, x, y, typeIndex, security, reachable]` for all 14,906 catalogue systems, one decimal; `types`: raw name and colour; `outline`; generator tables `starTable`, `sectorAnchors` | `tools/port/galaxy.db` `system`, `star_type`; `map/docs/data/galaxy.json` | 554 KB, 141 KB gzipped |
| `public/data/side.webp`, `zones.webp` | Stars per side and zone gate per cell | Copied from `map/docs/data/` | 1.17 MB, fetched when a stars mod opens or the map first zooms in |

- Drawn and picked: the 5,340 `reachable` systems, the set the published map draws and the generator's
  `catalogueInCell` uses. All of them are drawn at every zoom: the editor has no value layer, so the published map's
  "only the valuable ones" rule for wide views does not apply. Generated names are always full names (no cell grid).
- Name checks: all 14,906, because a mod star with any catalogue name moves that system.
- Generator inputs in the editor: the catalogue plus every favorite stars mod's stars, with a moved catalogue system at
  its mod position, because the game suppresses generated stars near real stars.
- `src/data/reference.json` (`build-reference.py`) stays the source for pickers' station and body lists.

## Map-derived checks

Rules from `checks.ts`, shown as badges on the map and in Problems. The game loads a star at any position, so none is
an error.

| Rule | Severity | Test | Message |
|---|---|---|---|
| `soutside-*` | Warning | Point outside `outline` polygon | "*Nova Prime* is outside the galaxy. Players may not be able to jump there." |
| `soverlap-*` | Tip | Within 4.37 ly (the closest generated spacing, one tenth of a cell) of another reachable catalogue system or star of this mod | "*Nova Prime* sits on top of *Wolf 359* on the game's map." |
| `shides-*` | Tip | A generated star in the same cell within `43.74 / (side × √2)` ly (names the nearest; needs the generation maps) | "*Nova Prime* hides the generated system *Caelia AB3*." |
| `sname-exists-*` (§17.2) | Tip (Problems has no info level) | Name equals a catalogue name | "Moves *Wolf 359* from 2,241, -1,106." |

## Edits and undo

- A drag previews locally in `StarMap` and calls the callback once on pointerup; the page writes one
  `updateStars` (or `updateQuest`) then, so a drag is one undo step. Pointercancel drops the preview.
- Tap to add creates a star named "New star N" at the tapped point with `Z` 0 and opens its editor.
- Quest circle values round to whole light years on commit.

## Offline and performance

- `sw.js` serves `data/` cache-first. Opening a stars mod loads `galaxy.json` and then the webp files (the checks need
  both), so all three are cached before the Map tab is first used. Map checks join Problems once they arrive.
- Targets on a mid-range phone: 60 fps pan and pinch with 5,340 catalogue dots and 100 mod stars; generated systems
  only below 10,000 ly across, with the generator cache capped at 20,000 cells; first draw within 300 ms of the data
  arriving.
- Dots are drawn in batches by colour; labels are placed once per settled view.

## Tests

`src/features/map/map.test.ts`, run by `npm test`, needs only the editor repo: camera math, the generator against
`fixtures/cells.json`, picking and mode logic, labels and checks.

`src/features/map/parity.test.ts`, run by `npm run test:parity`, reads the parent repo. Each test fails when its source
file or pattern is missing.

| Test | Method |
|---|---|
| Generator | Load `../tools/port/galaxygrid.js` and `generated.js` in `node:vm` with `D` from `map/docs/data/galaxy.json`; stub `GEN.side` and `GEN.zones` with a fixture of decoded bytes for 12 fixed cells (dense core, sparse edge, Sol's cell, a cell with catalogue systems). `cellStars` output from both must be identical: names, positions, types, seeds. |
| Projection | Extract the `sx`, `sy`, `wxOf`, `wzOf` lines from `starmap_js.js` by pattern, evaluate them for three cameras, and compare with `camera.ts` for Sol, Alpha Centauri and five far systems. |
| Constants | Zoom limits, home view, dot sizes, `SYSTEM_LY`, `GEN_MAX_LY` and the cell budget match `starmap_js.js`. |
| Export round trip | Read `galaxy.db` with `node:sqlite`; every row in `public/data/galaxy.json` matches `name`, `map_x`, `map_z`, `reachable`; every published system matches position and colour. |
| Checks | A star placed on a published generated system in each fixture cell hides exactly that system. |

The fixture (`src/features/map/fixtures/cells.json`) is written by `build-galaxy.py`: decoded bytes for 12 cells and the
published `cellStars` output for them at shares 1, 0.5 and 0.1, produced by running `galaxygrid.js` and `generated.js` in
node. The generator parity test also fails when the fixture is stale.

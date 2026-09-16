# Quest Editor: UI/UX design

A mobile-first web app for writing Galaxy Genome mods without touching JSON, and for installing them. A **mod** is a
set of files: any number of quests (each `QuestN.json`, one file per language), at most one `StarsStations.json`,
and texture sheets (`txtr_*.png` with its `.xml`). Players favorite any mods, yours or the community's, and one Download turns them into a single mod for the
game plus a backup of everything in the editor.

This document is the handoff for implementation. It specifies every screen, component, field, message and state.

---

## 1. Principles

1. **Phone first.** Every screen is designed at 360×740 first. Larger layouts add columns; they never add features
   a phone lacks.
2. **The game's words, not JSON keys.** "Step", "Finishes when", "Contact", "Station mission". Raw keys appear only in
   the Advanced view.
3. **Impossible to make a broken file by accident.** Pickers instead of free text wherever the game has a list;
   limits enforced where the game enforces them; everything else explained before it bites.
4. **Explain what the game will actually do.** Every field states its effect in one sentence, and every warning says
   what the player will see ("This quest will never appear in a bar").
5. **Never lose work.** Autosave on every change, undo/redo, History, and offline operation.
6. **Forgiving in, strict out.** Import accepts anything from 2022 onward and explains its fixes; export always
   produces a file the game loads.

---

## 2. Visual language

Same theme as the Galaxy Genome map (`tools/port/starmap_head.html`), which follows the game's own HUD.

### 2.1 Colour tokens

| Token | Value | Use |
|---|---|---|
| `--void` | `#04060e` | App background |
| `--deep` | `#080f1e` | Bars, sheets, sidebars |
| `--panel` | `rgba(8,18,34,.92)` | Cards, dialogs, overlays |
| `--field` | `rgba(4,12,22,.9)` | Input backgrounds |
| `--chip` | `rgba(10,24,40,.6)` | Chips, list rows |
| `--edge` | `#16455a` | Borders, dividers |
| `--grid` | `#177180` | Secondary lines, inactive graph edges |
| `--grid-strong` | `#1e93a6` | Hover borders, active graph edges |
| `--cyan` | `#35e0f5` | Primary accent, focus, selected, links |
| `--amber` | `#ffab3d` | Warnings, "attention", unsaved |
| `--danger` | `#ff5a5a` | Errors, destructive actions |
| `--ink` | `#bcdbe6` | Body text |
| `--dim` | `#5f7f8e` | Captions, placeholders, disabled |
| `--white` | `#ffffff` | Headings, the game name in the brand |

Add `--success: #4fe08a` for "valid" states (the map has no success colour). Check contrast in implementation:
`--dim` on `--void` is for 12px+ captions only; helper text under fields uses `--ink` at 80% opacity if `--dim`
fails 4.5:1.

### 2.2 Type

| Token | Stack | Use |
|---|---|---|
| `--ui` | Oxanium, Noto Sans SC, Segoe UI, system-ui | Headings, labels, buttons |
| `--mono` | JetBrains Mono, Noto Sans SC, ui-monospace | Values, inputs, IDs, codes, chips |

Scale (mobile / desktop): Display 22/26 700 uppercase letter-spacing .12em; Title 17/19 600; Body 15/15 400;
Label 13/13 600; Caption 12/12 400; Section header 11/11 600 uppercase letter-spacing .18em in `--dim` (the map's
`.grp h2`). Inputs are 16px on phones so iOS does not zoom on focus.

### 2.3 Shape, depth, motion

- Radius 2px on chips and inputs, 4px on cards and sheets, full on avatars and the FAB. Sharp corners are part of
  the HUD look.
- No drop shadows. Depth comes from `--panel` over `--void`, a 1px `--edge` border, and a 1px inner top highlight
  `rgba(53,224,245,.08)` on raised surfaces.
- Selected and focused: 1px `--cyan` border plus `outline: 2px solid var(--cyan); outline-offset: 2px` for keyboard
  focus.
- Motion 120ms for colour and border, 200ms for sheets and panels, ease-out. All disabled under
  `prefers-reduced-motion`.
- A faint star-field or grid texture (the map's `--grid` at 6% opacity) behind empty states only, never behind forms.

### 2.4 Iconography

Line icons at 1.5px stroke (Lucide). Game art where it exists: ship icons (`wiki/docs/img`, produced by
`ship_art.py`) and character portraits from the game's character atlas.

### 2.5 Branding

App bar brand as on the map: **GALAXY GENOME** in white, **QUEST EDITOR** in `--cyan`, uppercase, letter-spaced. A
small cross-link chip to the sister tool (**BUNDLER ↗**) in the same style as the map's wiki link.

---

## 3. Platform and layout

### 3.1 Breakpoints

| Name | Width | Layout |
|---|---|---|
| Phone | < 600 | One column, bottom tab bar, sheets from the bottom |
| Tablet | 600–1023 | One column with wider cards; side sheet for pickers; bottom tabs become a top segmented bar |
| Desktop | ≥ 1024 | Left rail (mod sections), centre content, right inspector (help and problems) |

Safe areas respected (`env(safe-area-inset-*)`). The bottom bar sits above the home indicator. Nothing important is
placed in the top 20% of the screen on phones except the app bar; primary actions live in the thumb zone.

### 3.2 Touch

- Minimum target 44×44px; 8px between adjacent targets.
- Swipe left on a list row reveals Duplicate and Delete; the same actions are in the row's ⋯ menu (swipes are never
  the only path).
- Long-press a step or item to enter reorder mode; drag handles also visible in reorder mode.
- No hover-only information. Every tooltip is a tap-to-open popover.

### 3.3 App shell (phone)

```
┌──────────────────────────────────┐
│ ←  Parcel for Sirius     ●  ⚠2  ⋯ │  app bar: back, mod name, save dot, problems, menu
├──────────────────────────────────┤
│                                  │
│          screen content          │
│                                  │
│                          ( + )   │  FAB: context add (step, ship, line…)
├──────────────────────────────────┤
│ Overview  Steps  Flow  Rumors  Test│  bottom tabs inside a mod
└──────────────────────────────────┘
```

- **Save dot:** `--success` "Saved", pulsing `--amber` "Saving…", `--danger` "Not saved: storage full" (tappable).
- **Problems badge:** count of errors (red) or warnings (amber); tapping opens the Problems sheet (§9).
- **★ Favorite** toggle in the app bar (§22), then the **⋯ menu:** Export, Language versions, History, Advanced view, Duplicate mod, Delete mod, Help.

### 3.4 App shell (desktop)

```
┌───────────────┬─────────────────────────────────────┬──────────────────┐
│ GALAXY GENOME │ Parcel for Sirius · Steps     Saved │ HELP  PROBLEMS 2 │
│ QUEST EDITOR  ├─────────────────────────────────────┼──────────────────┤
│               │                                     │ contextual help  │
│ ▸ Overview    │          content                    │ for the focused  │
│ ▸ Steps (7)   │                                     │ field, or the    │
│ ▸ Flow        │                                     │ problems list    │
│ ▸ Rumors (2)  │                                     │                  │
│ ▸ Test        │                                     │                  │
│ ─────────     │                                     │                  │
│ My mods       │                                     │                  │
└───────────────┴─────────────────────────────────────┴──────────────────┘
```

Keyboard: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo, `Ctrl/Cmd+K` command palette (jump to step, field, action),
`?` shortcut list, `Esc` closes the top sheet.

---

## 4. Storage, persistence and offline

- **IndexedDB** holds each mod as one document, texture images once by content hash, and History. Details in
  [data-layer.md](data-layer.md).
- **localStorage** holds preferences and a pointer to the last-open mod and screen: UI language, theme density,
  dismissed tips, onboarding done, advanced view on/off. A draft of the field being edited is mirrored there on
  every keystroke and cleared on commit, so a crash mid-typing loses nothing.
- **Autosave** writes 400ms after the last change. Other open tabs pick up the change live; the last save wins.
- **Undo for just now, History for anything older.** Undo (200 steps) is per mod for the session. History keeps
  automatic copies (after a pause in editing, before destructive actions, on import), copies the user names, and
  deleted mods for 30 days. Restore saves the current state to History first.
- **Storage health:** if persistent storage is not granted, a one-time banner explains that the browser may clear
  data and offers "Keep my mods safe" (`navigator.storage.persist()`) and "Download a backup".
- **PWA:** installable, works offline after first load. Reference data (systems, stations, planets, enums) ships as
  a versioned JSON bundle built from `game.db`, cached by the service worker.
- **No account, no server.** Everything stays on the device until the user downloads or exports. The community library ships with the app as static files.

---

## 5. Information architecture

```
Home
├── My mods ─► Mod contents ─► Quest editor · Stars & stations editor · textures
├── Top community mods ─► Mod contents ─► …
│     (a mod with exactly one file skips Contents and opens its editor)
├── New mod ─► Choose type ─► Choose template ─► Quick setup ─► Mod
├── Open ─► zip: restore backup (add or replace) · zip of mod files: import all · json: Review changes ─► Mod
├── Download ─► Download sheet ─► zip (favorites as a game mod + editor backup)
├── Mod library ─► Community tab (add to home, favorite) · Game quests tab (local only, §18) ─► Quest viewer ─► "Make a copy"
├── Help centre
└── Settings

Mod contents
├── Details       name, version, author, summary (own mods)
├── Quests        list with languages, steps, where it starts, quest ID, problems ─► Quest editor · Add quest
├── Stars & stations ─► Stars & stations editor · Add stars & stations
└── Textures      sheet previews with sprite counts · Add textures (png + xml pairs) · Remove

Quest (inside a mod)
├── Overview      identity, contact, how it starts, requirements, reward estimate
├── Steps         ordered list ─► Step editor
│                  ├── Journal and checkpoint
│                  ├── Dialogue ─► Line editor ─► Choice editor
│                  ├── Ships appear ─► Ship editor
│                  ├── Ship orders ─► Order editor
│                  ├── Station mission ─► Mission editor
│                  ├── Finishes when ─► Condition picker
│                  ├── Fails when ─► Condition picker
│                  └── Reminder
├── Flow          branch graph
├── Rumors        list ─► Rumor editor
├── Test          play-through simulator
└── (menu)        Export, Language versions, History, Advanced view

Stars & stations (inside a mod)
├── Overview
├── Stars ─► Star editor
├── Planets ─► Planet editor
├── Stations ─► Station editor
└── Map preview
```

URLs are addressable for every screen: `/mod/:modId` is the contents page, `/mod/:modId~:partId/steps/:stepId/dialogue/:lineId` is inside one file, so the back button, reload and
shared links on the same device land where expected.

---

## 6. First run and empty states

### 6.1 First visit (no localStorage, no database)

There is no separate welcome screen. Home (§7) opens with the most popular community mods already on it, so a new
visitor sees real mods, a way to write their own, and the Download button at once.

- The first tip card explains favorites and Download in one sentence (§7.1).
- *My mods* shows a single dashed call-to-action card: **Write your own quest** · "No code. About 2 minutes with a
  template."
- The interface language is preselected from `navigator.language` (en, ru, es, pt, zh), changeable from the home ⋯ menu.
- Nothing is written to storage until the user acts; the preloaded community mods come from the library, not storage.

### 6.2 Returning with no mods of their own

Same as the first visit, with any community mods the user added or removed and their favorites kept.

### 6.3 Empty states inside a mod

Each empty list has an illustration line icon, one sentence, and one primary button:

| Screen | Text | Button |
|---|---|---|
| Steps | "A quest is a chain of steps. Each step shows dialogue, spawns ships, then waits for something to happen." | Add first step |
| Dialogue | "Lines appear in order when the step starts. The last line can offer choices." | Add a line |
| Ships appear | "Ships spawn when this step starts. Later steps can give them orders." | Add a ship |
| Ship orders | "Tell ships that already exist to attack, change behaviour or vanish." | Add an order |
| Station mission | "Offer a mission card at a station while this step is active." | Add a mission |
| Rumors | "Gossip players hear in station bars. Optional, but it makes a quest feel alive." | Add a rumor |
| Flow | "Add choices to dialogue to branch your quest. The map of branches appears here." | Go to steps |

---

## 7. Home

Editor-first for everyone: the user's own mods at the top, the community below, and the one Download action always in
reach.

### 7.1 Layout

```
┌──────────────────────────────────┐
│ GALAXY GENOME       ⇪ Open    ⋯  │  ⋯: Mod library, Game quests, Language, Help, Settings
│ QUEST EDITOR                     │
├──────────────────────────────────┤
│ 💡 Tap ☆ to favorite a mod.       │  tip card, dismissible
│    Download bundles your         │
│    favorites into one mod…       │
│ 🔍 Search mods                    │
│ [All][Favorites 3][Mine][Community][Problems]
│                                  │
│ MY MODS                   + New  │
│ ┌──────────────────────────────┐ │
│ │☆ Parcel for Sirius       EN ⋯│ │
│ │  Quest · 3 steps · ID 5000…  │ │
│ │  ⚠ 1 warning   edited 3m ago │ │
│ └──────────────────────────────┘ │
│                                  │
│ TOP COMMUNITY MODS    Mod library
│ ┌──────────────────────────────┐ │
│ │★ Old Friend    EN PT RU     ⋯│ │
│ │  A familiar face turns up…   │ │
│ │  #1 · 1 quest · author       │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │◐ Random Encounters  EN      ⋯│ │  half star: some of its quests favorited
│ │  #2 · 96 quests · 12 favorited│ │
│ └──────────────────────────────┘ │
│ [ Browse the mod library ]       │
├──────────────────────────────────┤
│ ★ 3 favorites           Download │  sticky bottom bar, thumb zone
│   Bundled into your download     │
└──────────────────────────────────┘
```

- **Favorite star** on every card (44px target, spring pop, haptic tick). Favoriting is not an edit: it never marks a
  community mod Modified and never enters undo history.
- **My mods card:** star, title, language badges, type and counts, status (✓ Ready / ⚠ n warnings / ✕ n errors),
  version and time since last change, ⓘ info (§7.4), ⋯ menu (Open, Duplicate, Favorite/Unfavorite, Delete with a 10-second undo toast), swipe left
  for Duplicate and Delete.
- **Multi-select** (long press on my mods): bottom bar with Favorite, Unfavorite, Delete (one undo toast for all).
- **Every card is one mod** (never one file): star, title, languages across its quests, contents ("96 quests ·
  Stars & stations · 2 textures"), status summed over its files, version and time since last change, ⓘ info (§7.4),
  ⋯ menu. Tapping opens the contents page (§7.2), or the only file's editor when the mod holds exactly one.
- **Community card:** as above plus summary, author and a Community marker; ⋯ Open, Contents, Favorite, Duplicate,
  Remove from home. A modified community mod (§22) shows an amber **Modified** badge, swipes like my mods, and its ⋯
  offers Add original from library (when no unmodified copy is on home) and Delete with undo. Both copies of an entry
  sit together under Top community mods with the same rank, the modified copy first.
- **Filters:** All, Favorites (with count), Mine, Community, Problems. Search matches mod titles, stations and entry
  titles. Sort (my mods): Recently edited, Name, Status.
- **Bottom bar:** "★ n favorites · Bundled into your download" (or "No favorites yet · Star mods to put them in the
  game"), tapping the text toggles the Favorites filter; **Download** opens the Download sheet (§20).
- **Storage banner** (once the user has a mod of their own and persistent storage isn't granted): "Keep my mods safe"
  and "Download a backup".

### 7.2 Mod contents page

`/mod/:modId`, between home and the editors. Opens directly from a card when the mod holds more than one file, and
from ⋯ → Mod contents inside any editor.

- **App bar:** back to home, mod name with "Mod · 96 quests · Stars & stations · 2 textures", favorite star, ⓘ info,
  ⋯ (Duplicate, Download for submission; Delete, or Remove from home for an unmodified community mod).
- **Community banner** for community mods (§22), also shown at the top of every editor of the mod.
- **Details:** mod name, version, author, summary, last changed.
- **Requires:** "Requires: Trappist-1 & neighbours v2.0" under the banner when the mod has required mods (§12.7).
- **Quests (n):** search when there are more than 8 (name, quest ID or dialogue); each row shows start icon, quest
  name, language badges, first dialogue line, steps, station or "Starts in space", quest ID, problem icon; ⋯ Remove
  quest. **Add quest** opens the template sheet and lands in the new quest's Overview.
- **Stars & stations:** one row with star, planet and station counts, or **Add stars & stations**.
- **Textures (n):** tiles with the sheet on a checkerboard, atlas name, size and sprite count; remove. **Add
  textures** takes several files at once and pairs each `txtr_<sheet>.png` with its `.xml`; a file missing its
  partner is named in an error toast.
- **Inside an editor** of a multi-file mod, the back arrow returns here and the app bar subtitle names the mod.

### 7.3 Mod library

`/library`, a segmented control between **Community** and **Game quests**.

- **Community:** every shared mod by popularity: rank, title, tags, summary, contents (quest files, stars &
  stations, textures), author, licence. Actions:
  **Add to home**, **Add and favorite**; once added: **Open**, **Favorite/Favorited**, **On your home · Remove**.
- **Game quests:** the game's side quests, read-only, as §18. The tab exists only when the local game quest file loads.

### 7.4 Mod info sheet

The ⓘ on any card, and on the contents page, opens a sheet about the whole mod:

- **Source** under the title: Made here, Opened from a file, the game's own quest, or Community library · entry.
- **Details:** version (or "n versions"), last modified with date, time and "3m ago", created, author, licence,
  languages, required mods, favorite (yes, no, or n of m).
- **Contents:** tiles for each non-zero count: quests, steps, dialogue lines, choices, ships, station missions,
  rumors, systems used, stars, planets, stations.
- **Contents** also counts textures.
- **Mod ID:** the unique id with copy. Mods are identified by this id, never by name, so several versions of the same
  mod sit side by side, each with its own card.

### 7.5 New mod flow

1. **Type sheet:** "Side quest" (most people) or "Stars & stations".
2. **Template sheet** (quests), each with a one-line description and a tiny step diagram:
   - *Blank*: two empty steps.
   - *Delivery*: talk, fly to a system, open the station menu, done.
   - *Ambush*: fly somewhere, pirates spawn and attack, destroy them.
   - *A hard choice*: dialogue with two choices that rejoin.
   - *Space encounter*: starts by itself when the player arrives near a point.
   - *Station job*: a station mission card with a story reward.
3. **Quick setup** (one screen, three fields, all changeable later): Quest name, Language, Where it's offered
   (station picker, or "Starts in space" for the encounter template). Contact name and portrait are prefilled from
   the template.
4. Lands on **Overview** with a dismissible tip card: "Next: open Steps to write what happens."

The ID is assigned automatically (§8.2).

---

## 8. Quest: Overview

A single scrolling page of collapsible sections. Each section header shows a one-line summary when collapsed
("Offered at Thunder Station by Harry"), so the collapsed page reads as a description of the quest.

### 8.1 Section: Quest

| Field (label) | Control | Help text | Validation |
|---|---|---|---|
| Quest name (`QuestName`) | Text, 60-char soft limit with counter | "Shown in the bar and in the Quest complete message." | Required |
| Description (`QuestDescription`) | Multiline, auto-grow, counter | "What the contact says when the player looks at the quest in the bar." | Required |
| Language (`Lang`) | Segmented: EN RU ES PT 中文 | "The quest is only offered to players whose game is set to this language. To translate, use Language versions." | Required |

### 8.2 Section: Quest ID

- Shows the ID as a read-only mono chip with "Change" link.
- **Auto-assigned** on creation: a random unused number in 1,000,000–4,000,000,000, checked against the game's own
  quests and every mod in the local database.
- Change sheet: number input with live check. States:
  - ✓ "Free to use."
  - ✕ "Used by the game's quest *Trade tycoon*. The game will skip your file." (100002–100044)
  - ⚠ "Also used by your mod *Old Friend*. Only one of them will load."
- Help: "The game identifies quests by this number in saves and in other quests' requirements. Changing it after
  players have started your quest resets their progress."
- Changing the ID offers to update every mod here that requires this quest.

### 8.3 Section: Contact

| Field | Control | Help | Validation |
|---|---|---|---|
| Name (`CharName`) | Text | "The name shown for the person offering the quest." | Required when offered in a bar |
| Portrait (`CharImage`) | Portrait grid sheet (§12.3) | "Their picture in the bar and in dialogue." | Unknown value: warning "Shows as Tourist1" |

A live **bar card preview** under the section: portrait, name, quest name, description, styled like the game's bar
listing.

### 8.4 Section: How it starts

A three-option segmented control with a sentence under each, then only the fields for the chosen mode.

**A. In a station bar** (`isRandomStationQuest=false`, `isRandomSpaceQuest=false`)
- Station (`StationName`): searchable station picker (§12.1). Help: "The bar where the contact waits." Error if
  empty; warning if the name matches no station in the game or in a stars & stations mod here.

**B. In any bar near a point** (`isRandomStationQuest=true`)
- Point and radius (`RandomQuestX`, `RandomQuestY`, `RandomQuestRadius`): location picker (§12.5).
- Amber note: "None of the game's own quests use this, so how the game measures the radius is untested. *Starts in
  space* is the proven route."

**C. Starts in space** (`isRandomSpaceQuest=true`)
- Trigger (`RandomSpaceQuestTrigger`): segmented "Arriving in a system" (`warp`) / "Scanning a planet"
  (`planetScan`).
- Chance (`RandomSpaceQuestChance`): slider 0–100% with numeric entry, stored as 0.0–1.0. Help: "The chance each
  time the trigger happens inside the area."
- Point and radius: location picker (§12.5). Help: "Galaxy map coordinates in light years. Sol is 0, 0."
- Info note: "Starts only when one of the player's three quest slots is free, and never again once finished."
- A space start checks none of the requirements (§8.5).
- Station, contact and bar preview are hidden in this mode (still stored).

### 8.5 Section: Requirements

Each requirement is an "Add requirement" chip that expands into its control, so an unrestricted quest shows only
"No requirements. Anyone can take this quest."

| Requirement | Control | Help | Stored as |
|---|---|---|---|
| Finished quests first (`RequestedQuestIDCompleted`) | Multi-select quest picker: game quests by name, your mods by name, "Main story past step 68", or a raw ID | "All of these must be finished. Until then the quest is not listed at all." | `"100030;100003"` |
| Karma (`MinKarma`, `MaxKarma`) | Dual-thumb range -100…100 with "No limit" end stops | "Checked when the player taps Accept." | Ends map to -101 / 101 |
| Faction reputation (`Faction`, `FactionMinRep`) | Faction picker (game names: United Empire, Trade Federation, Interstellar Alliance, Independent, Pirates) + number | "Total reputation across that faction's stations. Checked on Accept." | `GreatEmpire` … `PirateClan` |
| Own station repaired (`OwnStationRequired`) | Switch | "Only offered once the player's own station is repaired." | bool |

Start mode limits which requirements the game checks: a bar quest at a named station checks all four; a quest
offered in any bar near a point checks all but own station; a space start checks none. When the chosen mode ignores
a set requirement, an amber notice leads the section with the problem's message, and for a space start a **Start in a
bar instead** button (problems `space-req`, `near-own`).

Dependency hint: a required ID that is neither a game quest nor a local mod shows ⚠ "No quest with this ID here. If
it isn't installed, this quest never appears."

### 8.6 Section: Reward

Read-only **estimate card**:

```
┌ REWARD ─────────────────────────┐
│ 70 CR                           │
│ 50  a ship attacks the player   │
│ +20 step 3 ends on arrival      │
│ Mods are paid by the game, max  │
│ 250 CR. Reward fields in the    │
│ file are ignored.         Why? ›│
└─────────────────────────────────┘
```

Recomputed live from ships, orders, missions and conditions (formula in `mod-json-formats.md`). "Why?" opens the
help article. `Reward` and `KarmaReward` are editable only in Advanced view, with the note that the game ignores
them for mods.

---

## 9. Problems

A persistent, live list. Every problem has severity, a sentence in player terms, the location, and a **Fix** or
**Go to** action.

| Severity | Meaning | Style |
|---|---|---|
| Error | The game skips the file or the quest can never run | `--danger`, ✕ |
| Warning | Loads, but part of it will not work as written | `--amber`, ⚠ |
| Tip | Works; could be better | `--cyan`, ✦ |

Rules (each links to its help article):

| Rule | Severity | Message |
|---|---|---|
| Fewer than 2 steps | Error | "A quest needs at least 2 steps or the game skips it." |
| ID in 100002–100044 | Error | "This ID belongs to one of the game's quests. The game will skip your file." |
| ID used by another local mod | Warning | "Only one of these will load: *Old Friend*." |
| Bar quest with no station | Error | "No station chosen. Nobody will offer this quest." |
| Station name not found | Warning | "No station called *Thunder Statoin*. Did you mean *Thunder Station*?" |
| A step with no Finishes when | Error | "Step 4 never finishes. The quest gets stuck here." |
| Finishes when joins conditions with `;` | Error | "Finishes when takes one condition. The game reads “A;B” as one name that never happens, so the step never finishes." |
| Space start with requirements | Warning (fix: start in a bar) | "A quest that starts in space ignores its requirements…" |
| Near-a-point start requires own station | Warning | "A quest offered in bars near a point ignores the own station requirement." |
| Station mission on step 1 | Warning | "The mission board never shows a mission from step 1. Add a step before it." |
| Station mission with Story off | Warning (fix: turn on Story) | "Story is off, so accepting and handing in this mission raise no quest events, and the mission can time out." |
| Station mission with no hand-in | Warning (fix: add a hand-in step, when the step finishes on accept) | "This step has a station mission but no hand-in…" |
| More than 3 choices on a line | Error (prevented in UI; appears after import) | "Only the first 3 choices show." |
| Choice goes to a missing step | Warning | "Choice *Check Ross 720* goes nowhere, so it continues to the next step." |
| Branch falls into another branch | Warning | "After *Sneak* ends, the quest continues into *Fight*. Add a choice to jump to the ending." |
| Unreachable step | Warning | "Nothing leads to step 6." |
| Reloading at a checkpoint strands a ship the next steps wait on | Warning (fix: move checkpoint) | "Reloading at *Ambush* gets stuck: *Raider* is spawned in step 3, which reloading skips." |
| Checkpoint on a step with dialogue | Warning with choices or when it finishes on the dialogue, else Tip | "Reloading at this step skips its dialogue and choices." |
| Checkpoint on step 1 | Tip (fix: turn off) | "The game never saves at step 1, so this checkpoint does nothing." |
| Order names a pilot not spawned earlier | Warning | "No ship called *Hunter* exists by this step." |
| Two ships with the same pilot name in one step | Warning | "The second *Hunter* is not spawned." |
| Condition names a system/station/planet not found | Warning | as station |
| Condition starts with `BUTTON_` | Warning (auto-fixable) | "The game adds BUTTON_ itself. Remove it?" Fix |
| Failure conditions listed | Tip | "The quest fails only when all of these have happened in this step." |
| Reminder present | Warning | "The game doesn't show reminders from mods." |
| Dialogue line over 320 characters | Warning | "Long lines get cut off on small screens." |
| Mission reward over 100,000 / reputation over 3 | Warning | "The game caps this at 100,000 CR." |
| Angler/Automaton set to a friendly behaviour | Tip | "These ships are always hostile in mods." |
| Unknown portrait, ship, behaviour, cargo value | Warning | "The game doesn't know *Pirate9*; it will show Tourist1." |
| Random space quest chance 0 | Warning | "Chance is 0%, so it never starts." |
| Text contains curly quotes in keys or broken characters | Error (import only) | "Fixed during import." |

Phone: Problems is a bottom sheet with tabs Errors / Warnings / Tips. Desktop: right inspector tab. Tapping a problem
navigates to the field and briefly pulses its border in the severity colour.

---

## 10. Quest: Steps

### 10.1 Step list

```
┌──────────────────────────────────┐
│ STEPS                  Reorder ⇅ │
│ ┌──────────────────────────────┐ │
│ │ 1  Briefing            ◆ CP  │ │  ◆ checkpoint badge
│ │ 💬3  ⮕ Dialogue closed        │ │  icons: lines, ships, orders, mission
│ │ ↳ choices: 2 · 3             │ │  branch targets
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 2  To Wolf 359               │ │
│ │ 💬1  ⮕ Arrive in Wolf 359     │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 3  Ambush            ⚠       │ │
│ │ 🚀2 ⚔1  ⮕ No enemies left     │ │
│ └──────────────────────────────┘ │
│            ( + Add step )        │
└──────────────────────────────────┘
```

- Each card: number, step name, badges (checkpoint, problem), content icons with counts, the Finishes-when summary
  in words, and branch targets.
- Arrows between cards show fall-through; a card that is only reached by a jump shows "Reached by a choice" instead
  of the arrow.
- Add step: FAB or inline "+" between cards (insert here). New step prefilled: *Finishes when: Dialogue closed*.
- Add station mission: secondary button below the list; appends a mission step and its hand-in step (§11.8).
- Reorder: long-press or Reorder button. Because jumps target steps rather than positions (§11.4), reordering never
  breaks choices; the list re-renders fall-through arrows and the Problems list updates.
- Row menu: Duplicate, Insert before, Insert after, Delete (undo toast).

### 10.2 Step editor

Full-screen page on phones, centre pane on desktop. Header: step number, editable name, prev/next step arrows,
⋯ menu. Sections in the order the game runs them, each a card with a summary line when collapsed:

```
┌──────────────────────────────────┐
│ ←  Step 3 of 7   Ambush      ‹ › │
├──────────────────────────────────┤
│ JOURNAL                          │
│ [ Destroy the pirates.        ]  │
│ ◆ Save checkpoint here    [ ○ ]  │
├──────────────────────────────────┤
│ WHEN THIS STEP STARTS            │
│ 💬 Dialogue            2 lines › │
│ 🚀 Ships appear        2 ships › │
│ ⚔ Ship orders         1 order › │
│ 🏛 Station mission        none › │
├──────────────────────────────────┤
│ FINISHES WHEN                    │
│ ⮕ No enemies are left        ✎  │
├──────────────────────────────────┤
│ FAILS WHEN (optional)            │
│ ✕ Ship "Olivia" is destroyed  ✎  │
│ + Add failure condition          │
├──────────────────────────────────┤
│ REMINDER                    ⚠  › │
└──────────────────────────────────┘
```

| Field | Control | Help | Validation |
|---|---|---|---|
| Step name (`name`) | Inline text in header | "For you only; players never see it." | Defaults to "Step n" |
| Journal (`TODO`) | Text | "The line in the player's journal while this step is active. Write it as an instruction." | Tip if empty |
| Save checkpoint (`isCheckPoint`) | Switch | "Saves the quest when this step begins. Reloading resumes here without this step’s dialogue, ships or orders, and ships from earlier steps are gone." | Checkpoint problems |
| Finishes when (`completeAction`) | One condition card → picker (§11.6) | "One condition. When it happens the next step begins; steps only advance when no dialogue is open. To let the player pick a path, end the step before it with choices." | Required |
| Fails when (`failureActions`) | List of condition cards joined by "and" | "Failing ends the whole quest; it never branches. It fails only when every one of these has happened during this step, and can then be taken again. For a risky moment with two outcomes, offer choices before it instead." | none |
| Reminder (`dialogTextRepeat`, `repeatTextTimeSec`) | Collapsed card with amber badge; opens a line list and "Every n seconds" | Banner: "The game currently ignores reminders in mods. They're kept in your file in case that changes." | Warning if present |

`questID` is not shown here (§11.4).

---

## 11. Step content editors

### 11.1 Dialogue list

- Rendered as a **chat preview**: game-styled message bubbles in order, each with portrait, speaker name and text.
  Tap a bubble to edit; drag to reorder; swipe to delete.
- Add line: prefilled with the previous line's speaker and portrait (or the quest contact for the first line).
- "Preview in game style" toggle shows the dialogue board as the game draws it, typing effect and all.

### 11.2 Line editor (sheet)

| Field | Control | Help | Validation |
|---|---|---|---|
| Speaker (`Name`) | Text with suggestions: contact name, pilot names in this quest, recent speakers | "Name shown above the message." | Tip if empty |
| Portrait (`character`) | Portrait grid (§12.3) | "Picture beside the message." | Unknown: warning |
| Message (`text`) | Multiline, counter turning amber at 280 and red at 320 | "Keep it under about 320 characters." | Warning > 320 |
| Closes after (`showTimeSec`) | Stepper with presets 3s / 5s / 10s / "Wait for the player" | "Seconds before the message closes by itself. Lines with choices usually wait." | ≥ 1 |
| Choices (`options`) | Choice list (§11.3), only on the line's editor | "Buttons under the message. Up to 3." | ≤ 3 |

"Wait for the player" stores a large value (99999999) and is the default when the line has choices.

### 11.3 Choices

```
┌ CHOICES (2 of 3) ───────────────┐
│ ① Head straight for Wolf 359    │
│    Goes to › Step 2 To Wolf 359 │
│ ② Check Ross 720 first          │
│    Goes to › Step 5 Ross 720    │
│ + Add choice                    │
└─────────────────────────────────┘
```

- Button text input blocks `;` and `=` as you type, with an inline note "; and = can't be used in choice text."
- **Goes to** opens a step picker: every step by number and name, plus "Continue to the next step" and "+ New step
  at the end". Choosing "New step" creates it and returns here.
- Add choice is disabled at 3 with the reason shown: "The game shows at most 3 choices. Chain another line for more."
- Choices on a line that is not the last in its step show a tip: "The step's later lines still show after a choice
  is tapped."

### 11.4 Jump labels (`questID`) are automatic

- The editor assigns each step that is a choice target a unique label (1, 2, 3…) and leaves others at 0. Users pick
  steps, never numbers.
- Stored options are rewritten to those labels on save. Reordering, deleting and duplicating keep targets correct.
- Reserved numbers (99996–99999, 199981, 199982) are never assigned.
- Advanced view shows and allows editing the raw label per step, with collision checks.
- Import maps existing labels to step links; a choice whose number matches no step becomes "Continue to the next
  step" with a problem entry.

### 11.5 Ships appear (`shipSpawn[]`)

List of **ship cards**: ship art, pilot name, model, level, behaviour chip, position summary ("Near player, 200"),
hostile badge.

Ship editor (sheet, sections):

| Field | Control | Help | Validation |
|---|---|---|---|
| Pilot name (`Name`) | Text | "Other steps refer to this ship by its pilot name. Must be unique while the ship exists." | Required; duplicate in step: warning |
| Auto-match player (`autoLVL`) | Switch at top | "Picks a combat ship worth 70–130% of the player's, at Master level. Model and level below are ignored." | Disables the next two |
| Ship (`shipModel`) | Visual ship picker (§12.4) | "Which ship appears." | Unknown: warning, becomes Ion |
| Equipment (`shipLevel`) | Segmented 6-step: Harmless · Novice · Competent · Expert · Master · Dangerous | "How well equipped it is." | |
| Behaviour (`shipBehavior`) | Behaviour picker (§12.6) | "How it acts." | Default Trader |
| Where (`spawnX`, `spawnY`, `distanceFromPlayer`) | Segmented "Near the player" / "At a position" | see below | |
| Tint (`color`) | Swatch row (none, red, amber, green, cyan, blue, violet) + custom colour | "Tints the ship." | Stored as a number |

**Where:**
- *Near the player*: slider 0–2000 with numeric entry for `distanceFromPlayer`; X and Y are stored as 0. Help: "In a
  random direction. 0 is about half a screen."
- *At a position*: a small square radar diagram (system centre at the middle) with a draggable pin, plus X and Y
  numeric inputs in light seconds. Help: "Measured from the system's centre." Pin at 0,0 shows a note that 0, 0
  means "near the player".

Angler, Angler-Mother and Automaton show a fixed "Always hostile in mods" chip and hide friendly behaviours' help.

### 11.6 Condition picker (Finishes when / Fails when)

A full-height sheet designed to be browsable, searchable and self-explaining. It picks exactly one condition:
`completeAction` is a single action (a `;`-joined value never matches), and `failureActions` is a list the game
requires in full. Failure ends the quest and forgets its progress; it never branches.

```
┌──────────────────────────────────┐
│ Finishes when…              ✕    │
│ 🔍 Search: arrive, station, destroy │
│ SUGGESTED FOR THIS STEP          │
│ [Dialogue closed] [No enemies]   │
│ ─────────────────────────────── │
│ 🧭 Travel                      › │
│ 🏛 Stations                    › │
│ 🪐 Planets                     › │
│ 🚀 Ships                       › │
│ ⚔ Combat                      › │
│ ⛏ Mining and cargo            › │
│ 💬 Dialogue and time           › │
│ 🏠 Your own station            › │
│ 📱 Screens and buttons         › │
│ ⚡ Game events                 › │
└──────────────────────────────────┘
```

Suggestions come from the step's content: dialogue present → "Dialogue closed"; hostile ships → "No enemies left",
"Ship destroyed: <pilot>"; mission present → "Story mission reward collected".

The catalogue (`CONDITIONS` in `src/lib/conditions.ts`) holds every string the game dispatches as a button event while a quest runs, and nothing else: completion needs an exact match, so a string outside it never fires. There is no free-text entry; an imported unknown action is a warning with fix **Choose a condition**, and the Advanced JSON view still shows raw values.

Categories and entries (label shown to users; action in Advanced view):

| Category | Entries |
|---|---|
| Travel | Arrive in a system (in space) `ACTION_WARP_END_SYSTEM_<system>`, raised when the warp ends, before any docking · Jump toward a system `ACTION_WARP_IN_SYSTEM_<system>` · Any warp ends `ACTION_WARP_END` · Warp starts `ACTION_WARP_BEGIN` · Plot a route to a system `SCREEN_ACTION_ROUTE_SYSTEM_<system>` · Fly a distance from the system centre `ACTION_PLAYER_DIST_<ls>` · Ship stops `PLAYER_SHIP_STOP` · In a system with a nebula `ACTION_NEBULA_<nebula>` · Warp gate repaired `ACTION_GATES_REPAIR` |
| Stations | Dock at a station `ACTION_CLICK_STATION_<station>` (with "Your own station" = `OWN`) · Open the bar `SCREEN_PORT_BAR` · Accept a story mission `CLICK_ACCEPT_STORY_MISSION` · Collect a story mission reward `GET_STORY_REWARD` · Board mission taken / handed in `ACTION_MissionType<type>Start` / `COMPLETE` (Mining, FindGoods, CaravanHunt, Intimidate, BugHunt, ContractMurder, Tourist, Courier, MoneyHelp, PirateHunt, TransferGoods; `ACTION_MissionRescueStart` / `COMPLETE`) · Illegal bar job taken `ACTION_MissionTypeIllegal` · Open shipyard/modules/market/missions/service/discoveries `SCREEN_PORT_*` |
| Planets | Select a planet `ACTION_CLICK_PLANET_<planet>` · Scan a planet `ACTION_SCAN_PLANET_<planet>` · Scan a planet or star type `ACTION_SCAN_PLANET_TYPE_<type>` · Land on a planet `LAND_ON_PLANET_<planet>` · Leave a planet `LEAVE_PLANET` |
| Ships | Ship destroyed `ACTION_SHIP_DESTROYED_<pilot>` · Select a ship `ACTION_SELECT_SHIP_<pilot>` · Ship warps away `ACTION_SHIP_WARPED_<pilot>` · Ship reaches a place `SHIP_STOP_<pilot>_at_<place>` · Obtain a ship's warp trail `ACTION_WARP_TRACK_<pilot>` |
| Combat | No enemies left `NO_ENEMY` · Attack pressed `ACTION_ATTACK` · Chaff, heat sink, missile defence, shield cell, fighters, silent running `ACTION_*` |
| Mining and cargo | Collect cargo `COLLECT_CARGO_<goods or material>` · Mine a material in space `COLLECT_MATERIAL_<material>` · Find an ore with the spectrometer `ACTION_MATERIAL_BELT_<material>` · Finish mining a material on a planet `PLANET_MINING_DONE_<material>` · Planet mining ends `PLANET_MINING_END` · Seismic charge reaches 0/33/66/100% `ACTION_SEISMIC_CHRG_<n>` · Seismic charge succeeds `ACTION_SEISMIC_BOOM_S` |
| Dialogue and time | Dialogue closed `ACTION_DIALOG_COMPLETE` · Seconds into the step `TIME_TICK_<seconds>` |
| Your own station | Upgrade the bar `OWNSTATION_UPGRADE_BAR` · Upgrade the trade port `OWNSTATION_UPGRADE_TRADE` · Open own station `SCREEN_OWNSTATION` |
| Screens and buttons | Every remaining `SCREEN_*`, `SYS_OBJ_*`, `CLICK_*`, `ACTION_*` UI event, including steering (`ENGINE_LEFT`/`RIGHT`), function keys `ACTION_FN1`–`3`, planet rover controls `PLANET_*`, system-object tabs (`shipsObjects`, `planetsObjects`), leaderboards, market and module-shop taps |
| Game events | `EVENT_SPAWN_*`, `EVENT_ACTIVATE_*`, `EVENT_END_*`, `ACTION_MISSION_*_COMPLETE`, `ACTION_PIRATE_SPAWN`, `ACTION_CARAVAN_SPAWN`, `MINING_PIRATE_SPAWN`, `SCANNED_ATTACKED_BY_PIRATE`, `WARP_ALIEN_HOOK` |

Selecting an entry with a parameter opens its **parameter step** with the right control:

| Parameter | Control |
|---|---|
| System | System picker (§12.1), with nearby/popular and systems from local star mods; "Pick on map" (§17.6) |
| Station | Station picker; "Your own station" pinned first for docking |
| Planet | Planet picker filtered by a chosen system |
| Pilot | Pilot picker: ships spawned by earlier steps in this quest, then free text |
| Place (ship stops) | Pilot picker + place picker (player, station, planet) |
| Cargo | Cargo picker, plus material chips (material boxes report a material) |
| Material / ore | Material chips (`CraftMaterial` names) |
| Planet or star type | Type picker |
| Seconds / distance | Number stepper with unit; distance in steps of 200, as the game reports it |
| Seismic level | 0 / 33 / 66 / 100% |
| Nebula | Chips of the named nebulae in `NebulaDB.json` |

The confirmed condition card reads as a sentence: **"Finishes when the player arrives in *Sirius*."**

### 11.7 Ship orders (`shipControl[]`)

Order cards read as sentences: **"*Hunter* attacks the player."**, **"*Kaito* becomes Ally."**, **"*Decoy* is
destroyed."**

Order editor:

| Field | Control | Help |
|---|---|---|
| Which ship (`ShipName`) | Pilot picker: pilots spawned in this or earlier steps, "The player" | "Orders apply to ships that already exist." |
| What to do | Chips (multi): Attack · Change behaviour · Destroy now | |
| Target (`SetTarget`) + Attack (`Attack`) | Shown with Attack: target picker (The player, other pilots); for a Miner, "Stay put" (`self`) | "Attack the chosen target." |
| New behaviour (`shipBehavior`) | Shown with Change behaviour: behaviour picker | |
| Destroy (`Destroy`) | Shown with Destroy now | "The ship is destroyed on the spot." |

Info: "A ship counts as attacking for the reward only when it targets the player with Attack on."

### 11.8 Station mission (`task_on_station`)

One mission per step. It takes two steps: the mission's step finishes on *Accept a story mission*, and a later step
on *Collect a story mission reward* (or the type's hand-in action). **Add station mission** on the Steps page appends
both, with a briefing step first when the quest is empty, because the board never lists a mission from step 1. Only
`Story` missions raise the accept and reward actions, and only they never time out.

Card summary: type icon, "*Pirate hunt* at Thunder Station → Sirius, 100,000 CR".

Editor:

| Section | Field | Control | Help | Validation |
|---|---|---|---|---|
| Mission | Type (`Type`) | Grid of 12 type cards with icon and one-line description | Descriptions from the game's mission text | Required |
| | Offered at (`HomeStation`) | Station picker | "The station whose mission board shows this card." | Required |
| | Story mission (`Story`) | Switch | "Needed for the Accept a story mission and Collect a story mission reward conditions. Story missions never time out." | Warning when off |
| | Reputation needed (`Level`) | Segmented Low · Proven · Confidence · Ally | | |
| Target | System (`TargetSystem`) | System picker | | |
| | Station (`TargetStation`) | Station picker | "If this is the same as the offering station, the game picks another within 100 ly." | Info when equal |
| Target ship | Ship (`TargetShipType`) | Ship picker showing display names, storing internal names | | Unknown: becomes Ion |
| | Pilot (`TargetShipName`) | Text | "Use this name in *Ship destroyed* conditions." | |
| | Hull (`TargetShipHull`) | Slider 0–100%, stored 0–1 | | |
| Cargo | Goods (`TargetGoods`) | Cargo picker | | Unknown: becomes Water |
| | Amount (`TargetGoodsCount`) | Stepper, tons | | |
| Pay | Credits (`Reward`) | Number with slider to 100,000 | "The game caps this at 100,000 CR." | Warning above |
| | Reputation (`Reputation`) | Stepper 0–3 | "The game caps this at 3." | Warning above |

Type decides which sections are expanded by default: ship-related types open *Target ship*; goods-related types
open *Cargo*; others open *Target*. All sections stay reachable, since the file stores every field.

---

## 12. Shared pickers

All pickers are bottom sheets on phones (half height, drag to full) and popovers or side sheets on desktop. Each has
search and recent picks at the top. Pickers offer only values the game or a mod on this device provides; there is no
free-text entry for systems, stations, planets or goods. A name the editor does not know (from an imported or
hand-edited file) stays a problem with a fix that opens the picker. Free text remains only for pilot names, which the author
invents.

### 12.1 System / station / planet picker

- Search matches name and alternative spellings; results show system, faction colour dot, security, and distance
  from Sol.
- Filters: faction, has station, security.
- Each result has "View on map ↗" opening `…/map/?system=<name>` in a new tab.
- "Pick on map" opens the star map full screen (§17.6); tapping a system returns its name, generated systems
  included.
- **Valid sets** (`placeOptions` in `src/lib/dependencies.ts`): systems are the on-map catalogue plus this mod's stars
  (generated systems only through Pick on map for arrival conditions); stations are the game's plus this mod's;
  planets are the bodies of the chosen system from reference data plus this mod's. This mod's places carry a
  "This mod" badge.
- **From other mods on this device** (quest parts only): a section listing systems, stations and planets that other
  stars & stations mods add, grouped by mod. Picking one from a mod that is not yet required opens a confirm sheet
  "Require <mod>?" explaining that players need both installed; accepting adds the mod to `meta.requires` and sets the
  value as one step with an Undo toast. A stars & stations mod never reaches into another mod.

### 12.7 Required mods

- A mod may use another mod's places only as a visible required mod. `ModMeta.requires` holds the author's accepted
  list: `{ modId, entryId?, title, version? }`; `entryId` names a library entry, so the requirement holds across
  reinstalls and versions.
- `modDependencies(mod, allMods)` derives the real set from the quests: every station, system or planet name that
  neither the game nor the mod provides but another mod does. Several providers: a required one wins, then a
  favorite, then the first. Renaming a place changes the derived set at once.
- **Problems:** a place that resolves only through a mod not required is a warning with fix "Add <mod> as a required
  mod"; a required mod missing from the device is a warning, with fix "Add from library" for a library entry; a
  required mod nothing uses any more is a tip with fix "Remove requirement". Unknown station and system names keep
  their own severities and gain "Choose a station" / "Choose a system", which opens that field's picker.
- **Import review** suggests the dependency when an opened quest names places found only in other mods on the
  device.

### 12.2 Quest picker (requirements)

Sections: *This mod* (its other quests), *Main story* ("Past step 68" = 0), *The game's side quests* (IDs
100002–100044, with name, contact and station when the local game quest file loads, "Game quest <ID>" otherwise),
*From other mods on this device* (grouped by mod). Picking a quest from a mod that is not yet required opens the same
confirm sheet as places (§12.1) and adds it as a required mod. Multi-select with chips; search by name or ID. There is
no entry by raw ID; an imported unknown ID is a warning with fix **Choose a quest**.

### 12.3 Portrait grid

3-column grid of portrait thumbnails with names, grouped: *Common* (Tourist1–4, Pirate1–6), *Story characters*,
*Special* (Daily Task, Expedition, None). Selected has a cyan frame. Names are the game's own.

### 12.4 Ship picker

2-column cards: ship icon, display name, class/size, faction. Search and size filter. Stores the game's key
(`anglerm`, `phasis`…) or, for missions, the internal type name. Ships that cannot spawn (Falcon, Thorn, Rogue) are
absent; Angler-Mother, Angler and Automaton carry an "always hostile" badge.

### 12.5 Location picker (galaxy point and radius)

- A full-screen route with the star map (§17.6) in `circle` mode: drag the centre to move the point, drag the ring
  to set the radius.
- Numeric X, Y, radius inputs pinned below the map; values are whole light years.
- "Centre on a system" search flies the map there.
- "Open in full map ↗" links to `…/map/?at=X,Y&ly=<3×radius>&draw={"circle":[X,Y,R]}`.
- Help: "Light years on the galaxy map. Sol is at 0, 0; Y grows toward the top of the map."

### 12.6 Behaviour picker

List with a one-line description per behaviour (Trader, TraderNoWeapons, Miner, Explorer, Pirate, LawForces,
Fighter, Enemy, Ally, AllyAFK, Mercenary, Automaton, Zentarks, Angler), grouped *Friendly*, *Neutral*, *Hostile*,
*Special*. `Player` is excluded.

---

## 13. Quest: Flow

A visual map of how steps connect.

- **Phone:** a vertical lane view. Steps are nodes in list order; fall-through is a straight line down; choice jumps
  are curved cyan arrows labelled with the choice text on a dark plate, placed along the curve or pushed sideways so no
  label covers a step card or another label; backward jumps curve on the left, forward on the right.
  Pinch to zoom; tap a node to open its step.
- **Desktop:** the same graph, laid out left to right with lanes per branch, plus a minimap.
- Highlights: unreachable steps dashed and dimmed; fall-through from one branch into another in amber with a
  "Fix: add a choice to jump to…" action; loops marked with ↻; the checkpoint badge on nodes.
- Legend chip row at the top: Next step · Choice · Problem · Checkpoint.
- **Map** (a third segment): each step as a numbered pin where it happens, joined in step order with forks, merges and
  loops; steps with no place in a strip below. A mod's quests and all favorites have a series map. Detail:
  [star-map.md](star-map.md#quest-views).
- Quest dependencies (a separate tab, *Depends on*): this quest, the quests it requires, and local mods that
  require it, as a small tree.

---

## 14. Quest: Rumors (`BarRumors[]`)

- List of rumor cards with a quote style and a scope chip.
- Editor sheet:

| Field | Control | Help |
|---|---|---|
| Rumor (`text`) | Multiline with counter | "Overheard gossip in station bars." |
| Where heard (`type`) | Segmented "Every bar" (`global`) / "This quest's bar only" (`local`) | "Local rumors play in the bar of the quest's station." |

Local rumors on a starts-in-space quest show a warning: "This quest has no station, so local rumors are never heard."

---

## 15. Quest: Test (play-through simulator)

A safe, text-only rehearsal of the quest logic, so authors can check branches without copying files to a phone.

```
┌──────────────────────────────────┐
│ TEST                  ↺ Restart  │
│ Step 1 · Briefing   Journal: …   │
│ ┌──────────────────────────────┐ │
│ │ [Edmond] The exact location… │ │  game-style bubbles, auto-advance
│ │ [Eva] But we have no time.   │ │
│ │ [Edmond] Then choose…        │ │
│ │  [Head for Wolf 359]         │ │  tappable choices
│ │  [Check Ross 720 first]      │ │
│ └──────────────────────────────┘ │
│ SPAWNED: Hunter (Hawk, Pirate)   │
│ WAITING FOR: Dialogue closed     │
│ [ Pretend it happened ▶ ]        │
│ [ Pretend a failure… ]           │
└──────────────────────────────────┘
```

- Shows each step's dialogue, spawns, orders and mission card as events in a timeline.
- "Pretend it happened" completes the waiting condition; choices jump as the game does (first step with the label;
  no match continues in order).
- Tracks checkpoints ("Reload" returns to the last one) and the 3-choice cap.
- End screen: "Quest complete. Reward 70 CR." with the path taken, and "Try another path".
- Help: "This checks the quest's logic, not the game's graphics or timing."

---

## 16. Language versions

- ⋯ → Language versions lists the mod's versions: EN (original), + Add a language.
- Adding a language creates a linked copy with the same ID, the same steps, ships and logic, and text fields marked
  "Needs translation".
- **Translate view:** side-by-side on desktop, stacked pairs on phones: original text (read-only, dim) above the
  translation input, for every text field in order (quest name, description, contact name, journal lines, dialogue,
  choices, rumors, mission pilot names). Progress bar "34 of 52 translated".
- Structural edits (steps, ships, conditions) in any version apply to all versions after a confirm: "Apply to all
  language versions?" Default yes.
- Download puts the version matching the chosen game language into the mod.

---

## 17. Stars & stations mod

Separate mod type with its own bottom tabs: **Overview · Stars · Planets · Stations · Map**.

### 17.1 Overview
Title, author, description, and summary counts. Info: "The game reads one stars & stations file. Download merges your
favorites into one."

### 17.2 Star editor (`Stars[]`)

| Field | Control | Help | Validation |
|---|---|---|---|
| Name | Text with existence check | "Using the name of an existing system moves and changes that system." | Info when existing; error for Sagittarius A* |
| Position (`X`, `Y`, `Z`) | Location picker (X, Y) + Z number | "Light years. The map uses X and Y; Z is height." | Required |
| Security (`security`) | Segmented Anarchy · Low · Medium · High · Only · NoOne · Conflict | | Default Anarchy |
| Type (`type`) | Star type picker grouped (Main sequence, Giants, Dwarfs, Pulsars and magnetars, Carbon, Young stars, Black hole) with colour swatch | | Unknown: becomes M-RedDwarf |

### 17.3 Planet editor (`Planets[]`)

| Field | Control | Help | Validation |
|---|---|---|---|
| Name | Text | | Required |
| System (`system`) | System picker incl. this mod's stars | | Required |
| Type (`type`) | Planet type picker with thumbnails | | Unknown: skipped by the game (error) |
| Orbit (`dist`) | Number; shows "Rounded down to 1,200" live | "Planets use multiples of 100." | Error if another planet in the system has the same orbit |
| Moons (`sput`), Size (`size`), Rings (`rings`) | Steppers | | |
| Material (`mater1`) | Cargo picker, optional | "A material found there." | |

Info: "Planets from mods start out already discovered."

### 17.4 Station editor (`Stations[]`)

| Field | Control | Help | Validation |
|---|---|---|---|
| Name | Text | | Required |
| System (`StarSystem`) | System picker | | Required |
| Orbits (`PlanetID`) | Picker listing the system's bodies in order ("1 · Sirius A (star)", "2 · Kepler b (planet)") | "Must be a planet, not a star." | Error on a star |
| Type (`type`) | Visual picker: Orbital dark, Orbital white, Nova, Farm, High-tech, Asteroid | | Required |
| Faction (`Faction`) | United Empire · Trade Federation · Interstellar Alliance · Independent · Pirates (stored `Russian`, `USA`, `China`, `Independent`, `Pirates`) | | Required |

Info: "A station missing any field is skipped."

### 17.5 Map

The editor's own star map (detail: [star-map.md](star-map.md)), a canvas component copied from the published map's
renderer. Full page, no sidebar.

- **Shows:** grid, galaxy outline, catalogue systems with names by zoom, generated systems when zoomed in, this mod's
  stars (bright, labelled), other favorite stars mods' stars (dimmed), the selection highlight.
- **Edits:** drag a star to move it (one undo step per drag); tap empty space to add a star there; tap a star to open
  its editor. Z stays a number field in the star editor.
- **Checks** appear on the map and in Problems: star outside the galaxy outline (warning), star within 4.37 ly of
  another system (tip), star that hides generated systems (tip), star named like a catalogue system (info, with a
  line from the old position).
- "Open in full map ↗" links to the published map at the view's centre.
- Quests use the same component read-only: quest overview and series maps ([star-map.md](star-map.md#quest-views)).

### 17.6 Galaxy map in pickers

The same `StarMap` component serves as a full-screen route, never a sheet, because drag-to-pan conflicts with
swipe-to-close.

| Used by | Mode | Result |
|---|---|---|
| Stars Map tab (§17.5) | `edit` | Store edits |
| Star position (§17.2) | `point` | `X`, `Y` |
| Location picker (§12.5) | `circle` | `RandomQuestX`, `RandomQuestY`, `RandomQuestRadius` |
| System picker (§12.1), condition system parameter (§11.6) | `pick` | System name, catalogue, generated or mod |

Offline: the service worker caches the map data with the rest of `data/`.

---

## 18. Game quests library (read-only, local only)

- The game's own side quests load at startup from `data/game-quests.json`, generated from `game.db` by
  `scripts/build-reference.py` and not published. When the file doesn't load, the Game quests tab, the home menu
  entry and quest names in pickers are absent, and ID checks use the reserved range 100002–100044 alone.
- When present: a list of the game's side quests with contact, station, steps and requirements, each opening in the
  quest screens in read-only mode ("The game's own quest. Make a copy to edit."). Make a copy creates a new mod of the
  user's own with a new quest ID and "(copy)" suffix.

## 19. Import

Entry points: Home "Open a mod file", drag-and-drop anywhere on desktop, the OS share sheet (PWA share target), and
paste JSON (⋯ on Home).

The home **Open** button accepts:
- **A zip from Download** (has `state/`): asks "Open this file?" with **Add to mine** (mods whose ids are not already
  here are added with their History) or **Replace everything**. Settings come back either way.
- **A zip of mod files:** becomes one mod named after the zip, holding every `QuestN.json` (same quest ID in several
  languages merged), `StarsStations.json` and `txtr_*.png`/`.xml` pair inside; opens its contents page.
- **One `QuestN.json` (2022 onward) or `StarsStations.json`,** or pasted JSON: the review screen below.

### 19.1 Review screen

```
┌──────────────────────────────────┐
│ ←  Review import         Import ✓│
│ Quest150.json                    │
│ StoryAlt · EN · 12 steps         │
│ ✓ Ready with 5 fixes             │
│                                  │
│ FIXED AUTOMATICALLY          ▾   │
│ • Removed BUTTON_ from step 7's  │
│   condition                      │
│ • "questparts" read as steps     │
│ • Barracuda target → game name   │
│ NEEDS A LOOK                 ▾   │
│ ⚠ ID 100040 belongs to the game. │
│   [ Pick a new ID ]              │
│ ⚠ Step 4 has 4 choices; only 3   │
│   show. [ Open step 4 ]          │
│ KEPT AS IS                   ▾   │
│ • Reminder on step 2 (ignored by │
│   the game)                      │
└──────────────────────────────────┘
```

- Groups: *Fixed automatically*, *Needs a look*, *Kept as is*, each item tied to a field.
- Import never blocks except when the file is not a JSON object; that case shows "This doesn't look like a 2022 or
  newer mod file" with a link to the help article on older formats.
- A file that fails to parse even leniently shows the line and column with a snippet and the likely cause (curly
  quote, missing comma).
- After import a History entry "Imported <file>" exists.

---

## 20. Download

One button, always the same result: a zip named `YYYYMMDD-ggmods-<name>.zip`.

```
20260913-ggmods-my-mods.zip
├── mod/                     copy these files to the phone
│   ├── Quest0.json … QuestN.json   every quest of every favorite mod, in the chosen language
│   ├── StarsStations.json   merged from every favorite mod that has one
│   └── textures/            txtr_*.png and .xml from favorite mods
└── state/                   the editor's stored records
    ├── meta.json            format, schema, game version, date
    ├── settings.json        interface and download language, file name, tips, advanced view
    ├── mods.json            every mod (yours, community, imported) by unique id, with favorite, version, dates
    ├── history.json         History entries
    └── textures/            texture images by content hash
```

### 20.1 Download sheet

```
┌──────────────────────────────────┐
│ Download                      ✕  │
│ Your favorites as one mod for    │
│ the game, and everything here.   │
│ File name                        │
│ [ my-mods                     ]  │
│ 20260913-ggmods-my-mods.zip    │
│ WHAT'S IN THE ZIP                │
│ 📁 mod/ for your phone      🇬🇧 ▾ │  flag: game language, tap to change
│    98 quest files in English     │
│ 🗄 state/ everything here         │
│    All 98 mods, favorites,       │
│    History and settings          │
│ NEEDS A LOOK                     │
│ ⚠ "Old Friend" has errors; the   │
│   game may skip it.        Open  │
│ FIXED AUTOMATICALLY (2)       ▾  │
├──────────────────────────────────┤
│ [ ⤓ Download zip ]               │
└──────────────────────────────────┘
```

- **File name:** remembered; lowercased to letters, digits and dashes in the preview line under the field.
- **Language:** English by default, shown only as a flag on the mod/ row. Tapping it reveals the five languages with a
  count of favorites in each; the choice is remembered in settings and so travels in `state/`. Quests without that
  language are left out, one line per mod ("“Random Encounters” has no Русский version, so its quests are left out").
- **Automatic, listed under Fixed automatically:** file slots `Quest0…`; a new quest ID for any favorite whose ID the
  game uses (100002–100044) or another favorite already uses; requirements of a renumbered quest's own mod or
  library entry follow it (a requirement still held by another favorite is left alone); stars & stations favorites
  merged into one file; textures copied into `mod/textures/`.
- **Needs a look** (warnings, each with Open): favorites with errors; a required quest that is neither a favorite nor
  one of the game's quests; two favorites spawning the same pilot name; the same star added twice; two planets at one
  orbit; two favorite mods replacing the same texture sheet (the later one wins); a favorite that requires a mod which
  is not a favorite, with one-tap **Also favorite <mod>** (Undo in its toast), or a required mod not on the device. **Error** (disables Download): more than
  200 quest files.
- **Zero favorites** still downloads: the zip then holds `state/` only, and the sheet says
  "No favorites yet. Tap ☆ on a mod to include it."
- **After download:** toast "Downloaded <file name> · Copy the files in its "mod" folder to your phone." with **How to
  install**.

### 20.2 Per-mod Export (⋯ menu inside a mod)

For sharing one mod rather than installing: Favorite / In your favorites, Download mod file (`QuestN.json` or
`StarsStations.json`), Share (Web Share API), Copy JSON, Download this mod's backup. Errors disable Download and
Share with "Show problems"; warnings confirm first.

### 20.3 Install guide

A stepped guide with illustrations, linked from the download toast and Help:
1. Copy the files in `mod/` to `Android/data/com.skvgames.GalaxyGenome/files/` (not a subfolder).
2. Open **Modifications** from the main menu and check the files show as existing.
3. Switch on **Side Quests** (and **Stars and Stations** when present) and allow file access.
4. After a game update, switch mods on again. Rating battles are off while mods are on.

## 21. Help system

Four layers, from glance to deep.

1. **Helper text** under every field: one sentence, always visible (§8–§17 tables give the text).
2. **ⓘ popover** beside labels where more is useful: 2–4 sentences, an example, and "Learn more ›".
3. **Help centre** (Home ⚙ → Help, or `?` in any screen): searchable articles:
   - Getting started: your first quest in 5 minutes
   - How steps, choices and branches work
   - Conditions: every "Finishes when" explained
   - Ships and orders
   - Station missions
   - How rewards are worked out
   - Starting quests in space
   - Requirements and quest chains
   - Translating a quest
   - Stars, planets and stations
   - Installing mods on your phone
   - Why didn't my quest show up? (a checklist that runs against the open mod)
   - Glossary
   Each article is short, uses the game's words, and links into the editor ("Try it: add a choice").
4. **Contextual inspector** (desktop right pane): shows the article section for the focused field.

**Onboarding:** no forced tour. The first time each screen opens, one dismissible **tip card** at the top explains
the screen in one sentence. "Hide all tips" in Settings.

**Glossary terms** are dotted-underlined in help text and tap to define: Step, Checkpoint, Journal, Condition,
Choice, Contact, Pilot name, Behaviour, Station mission, Language version.

---

## 22. Favorites and the community library

- **Favoriting takes required mods along:** favoriting a mod also favorites every mod it requires, following requirements of requirements; a toast "Also favorited <mods>" has one Undo for the whole action. Unfavoriting a required mod is allowed; Download then lists the requirement with **Also favorite**. Adding a library entry with Add and favorite adds and favorites its required entries too.
- **Quest file limit:** the home bar shows "3 favorites · 143/200 quests" when favorites hold quests, amber above 180 and red above 200. Favoriting past 200 shows a warning toast with Undo. Over 200 is a Download error that blocks the zip, says files past Quest199.json never load, and names the largest favorites to drop. Quest files already on the phone from other mods use the same 200 slots.
- **Favorite** is a flag on the whole mod (every file in it), set from any card, the contents page, the app bar inside any of its editors, the library or
  per-mod Export. Favorites are what Download bundles; nothing else about a mod changes. A mod the user creates, imports
  or duplicates starts as a favorite; a community mod is a favorite only when added with Add and favorite.
- **Community mods** are library mods on the user's device, edited in place like the user's own. An unmodified one
  shows a quiet line "From the community library · <entry> v<version> · by <author>" (author omitted when unknown).
- **Modified:** the first edit marks the mod Modified. It shows an amber Modified badge and "Changed from <entry>
  v<version>"; when no unmodified copy of that entry is on the device, **Add original from library** adds one beside
  it with its own id. A modified copy is the user's work: Delete (with undo) replaces Remove from home, and Download
  for submission is available so an improvement can go back to the library. Favoriting is not an edit.
- **Library states:** an entry on home unmodified shows Open, Favorite and On your home · Remove; an entry on home
  only as modified copies shows "Modified copy on your home" and **Add original**.
- **Duplicate** on a community mod makes a separate mod of the user's own, with no library link; if the community mod
  was a favorite, the copy takes over the favorite so the download doesn't include both.
- **Game quests** (§18) stay read-only; editing one shows a toast with Make a copy.
- **Top community mods** on home are the library's most popular entries; the user can remove any unmodified one from
  home and add others from the library.
- **Where the library comes from:** the community library is a folder in the editor's own repository, shipped with
  the app as static files: each mod's files and a catalogue entry (title, author, summary, licence, tags, version,
  and `requires` when the mod uses another mod's places). A library entry with requirements lists "Requires …" and
  offers **Add with required mods**, which adds each required entry not yet on the device beside it.
  Order on home and in the library is the catalogue's own ranking, set by maintainers. A new version of a mod is a
  new catalogue entry version with its own mod id, so players' copies of the old version keep working.
- **Submitting from the editor:** Overview → *About this mod* → **Submit to library**, shown when the mod has no
  errors:
  1. Downloads the submission zip: that one mod's files, textures, and a filled-in `catalogue.json` entry, including
     `requires`.
  2. Opens the repository's new-issue page with the "Submit a mod" issue form, title and metadata prefilled through
     URL parameters. A sheet says what happens: sign in to GitHub, drag the downloaded zip into the form, submit.
  - Needs only a GitHub account: no fork, git or token.
- **Submission pipeline (GitHub Action on issues labelled `mod-submission`):**
  1. **Validate** (read-only job): download the attached zip; cap unzipped size and file count; parse only, never
     run contents; import with the editor's own `importer.ts` and run `rules.ts`, the same checks as the editor.
     A `settings.ID` already used by another library mod is a warning (Download renumbers clashes). Any error fails
     the submission.
  2. **Report:** comment on the issue with every error and warning in the editor's wording. On failure the author
     fixes the mod and attaches a new zip in a comment, which re-runs the check.
  3. **Open the PR** (separate job with write access, only after validation passes): unpack into
     `community/<id>/`, add the catalogue entry, open a pull request linked to the issue.
  4. A maintainer reviews, sets rank, and merges; the next deploy ships it.
  - Mods shared on Discord go through the same issue form, submitted by a maintainer.
- **Mod metadata** used by the library when a user shares a mod (Overview → *About this mod*, collapsed by default):
  author name, version, short summary, licence (CC BY 4.0, CC BY-SA 4.0, CC0, All rights reserved), link, tags
  (Combat, Trade, Exploration, Story, Short, Long). Help: "Needed if you share your mod in the mod library."

## 23. Advanced view

Toggle in ⋯ (remembered). Adds, everywhere:

- The raw JSON key beside each label in `--mono` `--dim`.
- Raw `questID` per step; raw action strings on conditions; raw values in pickers.
- `Reward`, `KarmaReward` fields (with the ignored note).
- **JSON tab** on each step and on the whole mod: read-only formatted JSON with copy; an "Edit JSON" mode with
  validation, applying through the same import pipeline and showing its review list.
- Unknown keys kept from imports, editable as key/value rows.

---

## 24. Settings

Interface language; Tips on/off; Advanced view default; Units display (thousands separators); Storage (usage,
persistent status, History entries by size, "Download everything", "Delete everything" with typed confirmation); Reference data version
(game version 1.6.12) with "Check for update"; About and licences.

---

## 25. Feedback, errors and states

- **Toasts** (bottom, above tabs, 4s; 10s with Undo): "Step deleted · Undo", "Copied".
- **Inline validation** appears on blur or after 800ms idle, never while the first character is typed. Error text
  sits under the field in the severity colour with an icon, plus the field border.
- **Skeletons** in `--chip` for lists while stored mods load.
- **Destructive confirmations** only for irreversible actions (delete mod after undo window, delete everything).
  Everything else is undoable instead of confirmed.
- **Offline:** a small "Offline" chip in the app bar; everything keeps working; external map links note they need a
  connection.
- **Storage full:** blocking banner with "Download backup" and "Free space" (lists History entries by size).

---

## 26. Accessibility

- WCAG 2.2 AA. Contrast checked for every token pairing used for text.
- All controls reachable and operable by keyboard and screen reader; sheets trap focus and restore it.
- Segmented controls are radio groups; switches are `role="switch"`; the Flow graph has an equivalent list view
  ("Steps and where they lead").
- Colour is never the only signal: severity uses icon + text; hostile ships have a badge label.
- Text scales to 200% without horizontal scroll; respects `prefers-reduced-motion` and `prefers-contrast` (raise
  `--edge` and `--dim`).
- Touch targets 44px; no time limits.

---

## 27. Internationalisation

- UI in English, Russian, Spanish, Portuguese and Chinese, matching the map (`tools/port/ui_strings.py` pattern):
  every user-facing string in all five.
- Game names (stations, systems, ships, goods) come from the game's own language tables in `game.db` for the
  interface language, while stored values remain the game's keys.
- Layout tolerates 40% text expansion; no text in images.
- Mod content language (§16) is independent of the interface language.

---

## 28. Data model (for implementation)

The editor model is `src/lib/types.ts`: a `Mod` holds `meta`, quest parts (one content object per language), an
optional stars & stations part, and textures. Storage, History, identifiers, `_extra` and `_layout` are specified
in [data-layer.md](data-layer.md).

Reference data (read-only, shipped): systems, stations, planets with bodies in order, enum value lists with display
names in five languages, the game's side quests.

---

## 29. Screen inventory

| # | Screen | Phone presentation |
|---|---|---|
| 1 | Mod contents page | Full page |
| 2 | Home (my mods, top community mods, favorites bar) | Full page |
| 3 | New mod: type | Bottom sheet |
| 4 | New mod: template | Bottom sheet |
| 5 | New mod: quick setup | Full page |
| 6 | Import review | Full page |
| 7 | Quest Overview | Tab |
| 8 | Quest ID change | Bottom sheet |
| 9 | Problems | Bottom sheet |
| 10 | Steps list | Tab |
| 11 | Step editor | Full page |
| 12 | Dialogue list | Full page |
| 13 | Line editor | Bottom sheet (full) |
| 14 | Step picker (choice target) | Bottom sheet |
| 15 | Ships appear list | Full page |
| 16 | Ship editor | Bottom sheet (full) |
| 17 | Ship orders list / order editor | Full page / sheet |
| 18 | Station mission editor | Full page |
| 19 | Condition picker + parameter step | Bottom sheet (full) |
| 20 | System / station / planet picker | Bottom sheet |
| 21 | Quest picker | Bottom sheet |
| 22 | Portrait grid | Bottom sheet |
| 23 | Ship picker | Bottom sheet |
| 24 | Location picker | Full page |
| 25 | Behaviour picker | Bottom sheet |
| 26 | Reminder editor | Full page |
| 27 | Flow | Tab |
| 28 | Rumors list / editor | Tab / sheet |
| 29 | Test | Tab |
| 30 | Language versions / Translate | Sheet / full page |
| 31 | Stars & stations: Overview, Stars, Planets, Stations, Map, editors | Tabs / sheets |
| 32 | Mod library (Community, Game quests) / read-only quest | Full page |
| 33 | Download sheet / per-mod Export sheet / Install guide | Sheet / sheet / full page |
| 34 | History | Full page |
| 35 | Help centre / article | Full page |
| 36 | Settings | Full page |
| 37 | Advanced JSON view / edit | Full page |
| 38 | Command palette (desktop) | Dialog |

---

## 30. Implementation notes for the build

- Stack: React, TypeScript, Tailwind, shadcn/ui (Sheet, Command, Tabs, Toggle Group, Slider, Popover), styled with
  the tokens in §2; IndexedDB for storage; a service worker for offline; no backend.
- The mod file writer serialises in the key order of `_layout` for imported files and the game's own
  key order for new ones, compact JSON, UTF-8 without BOM.
- All rules in §9 run in a pure validation module; Download's checks (§20.1) reuse it.
- Reference data and the game's quests ship as a versioned JSON bundle generated from `game.db`.

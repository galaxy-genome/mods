# Quest Editor: data layer

How mods are stored, loaded, saved, shared between tabs, recovered, downloaded and opened. Companion to
[quest-editor.md](quest-editor.md) (§4 storage, §20 Download, §22 favorites and community, §28 data model).

A **mod** is one user mod: its quests, optional stars & stations, and textures. **Bundle** means only what Download
does: combining the favorited mods into one zip.

**Names in code:** `Mod`, `ModMeta`, `ModPart` (the per-part view).

The UI talks to one module, `src/store/editor.ts`. Its exported functions are the contract; this document specifies
what sits behind them.

---

## 1. Architecture

```
 Tab A                                   Tab B
 ┌─────────────────────────┐             ┌─────────────────────────┐
 │ React UI                │             │ React UI                │
 │   │ sync reads/writes   │             │   │                     │
 │ Store (in-memory)       │  Broadcast  │ Store (in-memory)       │
 │   │ flush (async)       │── Channel ─>│   reloads changed mod   │
 │ Repository              │ 'gg-editor' │ Repository              │
 └───┼─────────────────────┘             └───┼─────────────────────┘
     └──────────── IndexedDB 'gg-editor' ────┘
```

- **The UI stays synchronous.** Components read the in-memory store and mutate it immediately. The store persists in
  the background and never makes a component await storage.
- **IndexedDB is a document store.** Each tab opens the database directly; IndexedDB serialises transactions across
  tabs, so there is no worker and no leader.
- **Wrapper:** the plain IndexedDB API behind a small promise helper in `src/data/db.ts` (open, get, getAll, put,
  delete, one multi-store transaction). No library.
- Every read and write is wrapped; a failure surfaces through the save dot and banners (§7), never an uncaught error.
- `navigator.storage.persist()` is requested after the first mod of the user's own is added, and from the storage
  banner and Settings.

### First boot

- An empty database gets the default mods (the samples and library entries marked `default`) (with their texture sheets) and `meta.seeded`; deleting them
  later never reseeds.
- Dev URLs: `?fresh` empties mods, history and textures and marks the database seeded; `?samples` adds the sample mods
  that are missing. Both are removed from the address bar after boot, so a reload does not repeat them.
- Settings → Mockup tools: **Simulate storage full** (every write fails with `QuotaExceededError`), **Delete every
  mod**, **Clear all data** (all four stores and the `gg.*` keys; the next load is a first visit).

### Stores

| Store | Key | Value |
|---|---|---|
| `mods` | mod id | `{ mod, revision, updatedAt, deletedAt, schema }`; `mod` is the mod's JSON with each texture as `{ id, name, hash }` |
| `textures` | content hash (SHA-256 of PNG bytes + XML) | `{ png, xml }`; `png` as a Blob |
| `history` | entry id | `{ id, modId, name, auto, createdAt, bytes, mod, revision, schema }` (index on `modId`) |
| `meta` | key | `schemaVersion`; `settings` (download language, download file name), which travel in backups; `seeded`; `importDraft` |

- **Textures are shared.** Mods and history entries reference them by hash, so a copy never duplicates image bytes.
  After a mod save, delete, history purge or Open, textures no longer referenced by any `mods` or `history` record are
  deleted in the same transaction.
- **IndexedDB `version`** changes only when stores or indexes change. Record shape is versioned per record (§8).

---

## 2. The store as a cache

| Concern | Rule |
|---|---|
| Boot | Render the shell from localStorage prefs at once; load every `mods` record with `deletedAt` null and every texture they reference; skeleton cards until it returns. Mods are kilobytes each, so everything loads |
| Mutations | Apply to the store immediately, mark the mod dirty, push an undo entry (§4) |
| Flush | 400 ms after the last change to a mod, write its record with `revision + 1`; also flush all dirty mods on `visibilitychange` to hidden and on `pagehide` |
| Save dot | Amber while dirty or saving, green once the write resolves, red on failure (`saves[modId]`: `dirty`, `saving`, `saved`, `error`) |
| Order | Writes of one mod run one after another; the revision is read and incremented inside the write's transaction |
| Granularity | Whole mod per write. A quest is a few KB, so there is no partial-update logic |

---

## 3. Several tabs

- After each write the tab posts `{ type: 'mod-changed', id, revision }` on `BroadcastChannel('gg-editor')`;
  deleting posts `{ type: 'mod-deleted', id }`.
- A tab receiving `mod-changed` with a revision newer than its own reads the record and replaces the mod in its store
  live; its undo stack for that mod is cleared. A tab holding unsaved changes to that mod skips the reload: its own
  write follows and wins. `mod-deleted` removes the mod and sends a route open on it to Home (window event
  `gg-mod-deleted`). Every message also reloads the History list and deleted-mod rows.
- Open (a backup) posts `mod-changed` for every mod it wrote and `mod-deleted` for every mod it removed.
- **Last save wins.** There is no conflict UI. Anything overwritten is still in History when an automatic entry
  covered it (§5).
- Favoriting is an ordinary save of the mod.

---

## 4. Undo

**Undo for just now, History for anything older.**

- In memory only: per session, per mod. Nothing is persisted.
- An undo entry is the previous mod state. Textures are never copied (entries share them), and adding or removing a
  texture is not undoable and is unaffected by undo, redo and restore.
- Typing in one text field, from focus until it is left, is one step; every other edit is its own step.
- 200 steps per mod, oldest dropped; a new edit after undos drops the redo tail.
- **Toast Undo is exact.** Deleting a step, line, ship, rumor or mod shows a toast whose Undo puts back exactly that
  item, not "the latest change".
- **Structural sharing** with Immer `produceWithPatches`: each mutation copies only the changed path, so an entry
  costs the size of what changed, not a whole mod. Auto-freeze is off; nothing outside update recipes writes to store
  objects.
- The grouping decision is `startsUndoStep(lastField, focusedField)`; the patches of a keystroke feed `gg.draft` (§6).

---

## 5. History

The one user-facing recovery feature. Opened from the mod's ⋯ menu (**History**) and from Settings (all mods).

| Entry | When | Kept |
|---|---|---|
| Automatic | First edit to a mod after 10 minutes without edits (copy of the state before it); before deleting a part and before restoring; on import ("Imported <file>") | Newest 20 per mod |
| Named | "Save a copy to History" with a name | Until the user deletes it |
| Deleted mod | Deleting a mod sets `deletedAt` | 30 days after `deletedAt`, then the mod and its entries are purged on boot |

- **Restore** writes the current state as an automatic entry first, then replaces the mod with the entry's copy.
  Community mods stay Modified after a restore.
- **History sheet:** entries newest first, grouped by day; each row shows name or "Automatic", time, size, and
  Restore, Rename (turns it into a named entry) and Delete. A **Deleted** row reads "<title> · Deleted · Restore" and
  shows days left.
- Settings → Storage lists History entries of all mods by size with Delete, used by the quota banner.

### Screens

- `src/features/output/HistoryPage.tsx`: `HistoryPage` at `/mod/:modId/history` (⋯ menu **History**) and
  `AllHistoryPage` at `/history` (Settings), which adds the Deleted rows.
- Automatic entries after an idle gap have an empty name and show as "Automatic". Other automatic entries are named:
  "Before restore", "Before removing “…”", "Before deleting step n", "Before changing quest ID n", "Imported <file>".
- The storage-full banner's **Free space** and the Settings storage list count History entries.
- Deleting an unmodified community copy removes it for good (the library adds it again); every other mod delete sets
  `deletedAt`.

---

## 6. localStorage

Small, per-device, loss-tolerant state. Every read and write is wrapped in `try/catch`.

| Key | Value |
|---|---|
| `gg.prefs` | `{ uiLang, tips, advanced, dismissedTips[], installPromptDismissedAt }` |
| `gg.last` | `{ path, at }` for reopening where the user left off |
| `gg.draft` | `{ modId, lang, field, value, at }` mirrored on each keystroke into a text field, cleared when the flush resolves; `field` is the path of the string in the mod (from the edit's Immer patch), `lang` the quest version it sits in |

On boot, a `gg.draft` newer than the mod record's `updatedAt`, whose value differs from the stored one, shows a banner
on Home and on that mod's screens: **"Unsaved text recovered"** with Restore and Discard. Restore writes the value at
`field` as an ordinary edit. The installed app (display mode standalone) opens `gg.last` when launched at `/`.

---

## 7. Durability and fallbacks

| Situation | Behaviour |
|---|---|
| Persistent storage not granted | Home banner with "Keep my mods safe" and "Download a backup" |
| Safari, not installed | Script-written storage can be cleared after 7 days without a visit; the storage banner says so and recommends Add to Home Screen and backups |
| IndexedDB unavailable or fails to open | Store works in memory only (the same repository over `fake-indexeddb`, loaded on demand); red banner: **"This browser can't save. Download a backup before closing."** |
| Quota exceeded | The write fails; red save dot and a blocking banner with **Download backup** and History entries by size to delete; the mod stays dirty and retries on the next change |
| Backup | Download (§10) is the backup; Open restores it |

---

## 8. Schema

- Every `mods` and `history` record carries `schema`. `src/data/migrations.ts` is an ordered list of functions, each
  a JSON transform from schema n to n+1, given the other stored mods; the current schema is the list's length + 1.
  Schema 2 adds `meta.requires`: migration 1 → 2 (`addRequires`) computes it with `modDependencies` from the mod's
  place references and the other mods in the database or backup, and leaves the field out when nothing is required.
- On load, a record below the current schema runs its pending migrations and is written back. Migrations are pure,
  so the same functions upgrade records from an opened zip.
- `meta.schemaVersion` holds the highest schema the database has seen.
- A record newer than the app (a tab running an older build) is loaded as far as it is understood; fields the app
  does not know stay in `_extra` (§9) and are written back unchanged.

---

## 9. Import fidelity

An imported file exports with its unknown keys and its key order intact (quest-editor.md §23 "Kept from import").

| Field | On | Holds |
|---|---|---|
| `_extra` | every model object that maps to a game JSON object (quest content, step, dialog line, ship spawn, order, mission, rumor, star, planet, station) and the part itself | `{ key: value }` for keys the editor does not model |
| `_layout` | the same objects | the original key order (and spelling) as a string array; absent on objects created in the editor |
| `_kept` | the same objects | `{ key: { written, value } }` for modelled keys whose file value differs from what the writer makes of the imported model (`null` for an empty list, a left-out key, a label the editor renumbers). While the writer still produces `written`, the file's `value` is emitted (nothing when the file had no such key) |

- Import fills all three (`keepFromFile` in `importer.ts`, run on the writer's output for the fresh model); the writer
  (`withKept` in `gameJson.ts`) emits keys in `_layout` order, then modelled keys `_layout` has no entry for, then any
  other `_extra` keys, and the game's own order for new objects.
- Language versions of one object keep separate `_extra` and `_layout`.
- **Round-trip test** `src/data/fidelity.test.ts`: every quest and stars file under `local/` (gitignored) and
  `public/community` is imported and written back; the output must equal the input as parsed JSON with key order
  compared. Community library entries are also checked per language version through the mod they join.

---

## 10. Download zip

Download (quest-editor.md §20) writes `YYYYMMDD-ggmods-<name>.zip`:

```
mod/QuestN.json ...            favorites in one game language, ready for the phone's mod folder
mod/StarsStations.json         favorite mods' stars & stations merged
mod/textures/txtr_*.png|.xml   favorite mods' texture sheets
state/meta.json                { format: 'ggeditor-state', schema, game, date }
state/mods.json                every mods record, deleted ones included
state/history.json             every history record
state/settings.json            download language and name plus gg.prefs
state/textures/<hash>.png|.xml every referenced texture
```

Opening a zip that has `state/`:
- **Add to mine** adds mods whose ids are not already present, with their history entries; **Replace everything**
  empties `mods`, `history` and `textures` first, after a confirmation that offers Download backup. Settings are restored in both cases.
- **Older schema:** records run through `migrations.ts`.
- **Newer schema:** fields the app does not understand go into `_extra` of the nearest object; a summary lists them.
- Missing fields take defaults; objects without an id get a new UUID (`normalizeMod` in `backup.ts`).
- Replace everything asks first; its dialog offers **Download backup** of what is here.

A zip without `state/` imports every `QuestN.json`, `StarsStations.json` and texture pair inside as one new mod.

---

## 11. Identifiers

- `crypto.randomUUID()` for mods, parts, every model object, and history entries.
- Quest IDs (`settings.ID`) remain game numbers, chosen as in quest-editor.md §8.2.
- Community mods use `<entry>@<version>`; a second, unmodified copy beside a modified one is `<entry>@<version>-2`.
- Routes carry ids; a route to a mod not in the store shows "This mod doesn't exist any more" with Back.

---

## 12. Reference data

- `reference.json` is generated from `game.db` with a `game` version field and a content hash, served with the app
  and cached by the service worker.
- Each mod stores the reference version it was last validated against.
- A new reference version re-runs problems for every mod on next open; names that no longer exist become warnings,
  never silent changes.

---

## 13. UI state and the URL

- **In the URL:** the screen (`/mod/:modId/...`), the open item editor (`:lineId`, `:shipId`, `:orderId`,
  `:itemId`), Problems navigation (`?field=&sev=`), and open app-level sheets as `?sheet=...`; opening pushes a
  history entry so Back closes the sheet.
- **Not in the URL:** scroll positions (session-scoped map per path), section collapse state (localStorage), search
  text.
- An import in review is held in the `meta` store (`importDraft`) so a reload on the review screen keeps it.

---

## 14. Module layout and tests

```
src/data/
  db.ts             open 'gg-editor', stores and indexes, promise helper
  repository.ts     load, save, delete, history (create, retention, restore, purge), texture dedupe and GC
  sync.ts           flush scheduler, BroadcastChannel messages
  migrations.ts     ordered record transforms
  backup.ts         state/ zip out and in (Add to mine, Replace everything)
src/store/editor.ts in-memory store, dirty tracking, undo (API unchanged for components)
```

`npm test` runs every `src/lib/*.test.ts` and `src/data/*.test.ts` with node, through `scripts/test-hooks.mjs`: it
resolves `@/` and extensionless imports, loads JSON, stands in for Vite's `import.meta.env` and `import.meta.glob`, and
installs `fake-indexeddb`. Two store instances in one process are the same module imported under different query
strings; they share the database and talk over a real `BroadcastChannel`.

| Test | Checks |
|---|---|
| Save and load | A mod written and read back is deep-equal; textures come back by hash |
| Revision and broadcast | Two repository instances on one database: a save increments `revision`, posts `mod-changed`, the other reloads |
| Flush timing | Fake timers: one write 400 ms after the last of several edits; `pagehide` flushes at once |
| Texture dedupe and GC | The same texture in two mods is stored once; removing it from both deletes it; a history reference keeps it |
| History | Idle-gap and pre-destructive entries created; automatic retention of 20; named kept; Restore saves current first; a deleted mod restores within 30 days and is purged after |
| Migrations | Each step on a fixture of the previous schema; a chain from schema 1 to current |
| Backup round trip | Download `state/` then Replace everything reproduces every store; Add to mine skips existing ids |
| Quota | A put that throws `QuotaExceededError` leaves the mod dirty and sets the red save state |
| Import fidelity | §9 round trip over `mods/` and `public/community`, community entries per language, edits after import |
| Store | Boot seeds once, `?fresh`, `?samples`; undo shares unchanged objects and groups typing; textures outside undo; Modified sticky; draft recovery; settings persistence |

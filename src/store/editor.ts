import { current as draftValue, enablePatches, isDraft, produceWithPatches, setAutoFreeze, type Patch } from 'immer'
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { modFromParts, splitViewId, viewId, partsOf, partViews } from '@/lib/mods'
import { COMMUNITY, entryMod, loadEntryTextures } from '@/lib/community'
import { importText } from '@/features/start/importer'
import { staleEntry } from '@/lib/staleCopy'
import { uid } from '@/lib/factory'
import { GAME_QUESTS, loadGameQuests } from '@/lib/reference'
import { sampleMods } from '@/lib/templates'
import { syncVersion } from '@/lib/versions'
import type { HistoryEntry, Mod, Lang, ModPart, QuestContent, QuestView, QuestPart, StarsView, StarsPart, TexturePart } from '@/lib/types'
import { CURRENT_SCHEMA } from '@/data/migrations'
import { withRequired } from '@/lib/dependencies'
import { MAX_QUEST_FILES, questFileCount } from '@/lib/mods'
import { isQuotaError, Repository, toStored, type DeletedMod } from '@/data/repository'
import { FlushScheduler, openChannel, type SyncMessage } from '@/data/sync'

enablePatches()
// Nothing outside update recipes writes to store objects; freezing would only cost time on every edit.
setAutoFreeze(false)

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Text typed into a field and not yet saved, mirrored to localStorage on each keystroke. `field` is the path in the mod. */
export interface TextDraft {
  modId: string
  lang: Lang | null
  field: (string | number)[]
  value: string
  at: number
}

/** The in-memory store: components read it synchronously; changes persist in the background. */
export interface EditorState {
  /** Every mod: quests, stars & stations and textures. */
  mods: Mod[]
  /** Every quest and stars part of every mod and game quest (derived from mods and gameMods). */
  parts: ModPart[]
  /** The game's own quests opened by a `/built-in/` link: read-only, in memory only, never listed with the user's mods. */
  gameMods: Mod[]
  /** Every history entry of every mod, newest first. */
  history: HistoryEntry[]
  /** Deleted mods still restorable. */
  deleted: DeletedMod[]
  /** Whether the game's own quests loaded (a local-only data file). */
  gameQuests: boolean
  /** True until the first load from storage returns. */
  loading: boolean
  saves: Record<string, SaveState>
  storage: {
    /** False when IndexedDB could not open and mods live in memory only. */
    available: boolean
    persisted: boolean
    quotaFull: boolean
    simulateQuota: boolean
  }
  settings: {
    uiLang: Lang
    tips: boolean
    advanced: boolean
    dismissedTips: string[]
    installPromptDismissedAt: number | null
    offline: boolean
    /** Game language of the mod folder in a download. */
    downloadLang: Lang
    /** The user's part of the download file name. */
    downloadName: string
  }
  /** A file waiting on the import review screen. */
  importDraft: { text: string; fileName: string } | null
  /** Unsaved text found on boot. */
  recoveredDraft: (TextDraft & { title: string }) | null
}

const UNDO_LIMIT = 200
const IDLE_GAP = 10 * 60_000
const PREF_KEYS = ['uiLang', 'tips', 'advanced', 'dismissedTips', 'installPromptDismissedAt'] as const
const META_SETTING_KEYS = ['downloadLang', 'downloadName'] as const

function detectLang(): Lang {
  const l = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase()
  return l === 'zh' ? 'cn' : (['en', 'ru', 'es', 'pt'] as const).find((x) => x === l) ?? 'en'
}

/** localStorage, where every read and write may throw and loses nothing that matters. */
export const local = {
  get<T>(key: string): T | null {
    try { const v = globalThis.localStorage?.getItem(key); return v == null ? null : JSON.parse(v) } catch { return null }
  },
  set(key: string, value: unknown) {
    try { if (value == null) globalThis.localStorage?.removeItem(key); else globalThis.localStorage?.setItem(key, JSON.stringify(value)) } catch { /* private mode or full */ }
  },
}

const withParts = (s: Omit<EditorState, 'parts'> & { parts?: ModPart[] }): EditorState => ({ ...s, parts: [...s.mods, ...s.gameMods].flatMap(partsOf) })

function initialState(): EditorState {
  return withParts({
    mods: [],
    gameMods: [],
    history: [],
    deleted: [],
    gameQuests: false,
    loading: true,
    saves: {},
    storage: { available: true, persisted: false, quotaFull: false, simulateQuota: false },
    importDraft: null,
    recoveredDraft: null,
    settings: {
      uiLang: detectLang(), tips: true, advanced: false, dismissedTips: [], installPromptDismissedAt: null,
      offline: globalThis.navigator ? !navigator.onLine : false, downloadLang: 'en', downloadName: 'my-mods',
      ...(local.get<Partial<EditorState['settings']>>('gg.prefs') ?? {}),
    },
  })
}

let state = initialState()
let repo: Repository | null = null
let channel: ReturnType<typeof openChannel> = { post: () => {}, close: () => {} }
const undoStacks = new Map<string, Mod[]>()
const redoStacks = new Map<string, Mod[]>()
const lastUndoField = new Map<string, unknown>()
const listeners = new Set<() => void>()
const dirty = new Set<string>()
const revisions = new Map<string, number>()
const schemas = new Map<string, number>()
/** When each mod was last edited in this tab, for the idle-gap History entry. */
const lastEdit = new Map<string, number>()
const writes = new Map<string, Promise<void>>()
const flusher = new FlushScheduler((id) => void writeMod(id))

if (typeof document !== 'undefined') {
  document.addEventListener('focusout', () => lastUndoField.clear())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() })
  addEventListener('pagehide', flushAll)
  addEventListener('online', () => setSettings({ offline: false }))
  addEventListener('offline', () => setSettings({ offline: true }))
}

function emit(next: Omit<EditorState, 'parts'> & { parts?: ModPart[] }) {
  state = next.mods === state.mods && next.gameMods === state.gameMods && next.parts ? (next as EditorState) : withParts(next)
  listeners.forEach((l) => l())
}

const patch = (p: Partial<EditorState>) => emit({ ...state, ...p })

export function useEditor<T>(select: (s: EditorState) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => select(state),
  )
}

export const getState = () => state

export const modById = (id: string) => state.mods.find((b) => b.meta.id === id)
/** A user's mod or an open game quest. */
const anyMod = (id: string) => modById(id) ?? state.gameMods.find((b) => b.meta.id === id)

/** A view (`mod~part`) or, given a bare mod id, its first view. */
export function usePart(id: string | undefined) {
  return useEditor((s) => s.parts.find((m) => m.meta.id === id))
}

export function useMod(id: string | undefined) {
  const key = id ? splitViewId(id).modId : undefined
  return useEditor((s) => s.mods.find((b) => b.meta.id === key) ?? s.gameMods.find((b) => b.meta.id === key))
}

export const useSaveState = (id: string | undefined) => useEditor((s) => (id ? s.saves[splitViewId(id).modId] ?? 'saved' : 'saved'))

const modKey = (id: string) => splitViewId(id).modId

const isReadOnly = (b: Mod) => b.meta.origin === 'game'

function readOnlyToast(modId: string) {
  toast(t('lib.readOnly'), { description: t('lib.readOnlyHelp'), action: { label: t('lib.makeCopy'), onClick: () => { const cid = duplicateMod(modId); if (cid) location.assign(`${import.meta.env.BASE_URL}mod/${cid}`) } } })
}

// ---------------------------------------------------------------------------------------------------------------------
// Boot

export interface BootOptions {
  dbName?: string
  factory?: IDBFactory
  /** The page's query string; `?fresh` empties storage, `?samples` adds the sample mods. */
  search?: string
  /** Mods written on the first boot of an empty database. */
  seed?: () => Promise<Mod[]>
  now?: number
}

/** A first visit starts with the library entries marked default, so Home shows other players' mods, not ours. */
async function defaultMods() {
  return Promise.all(COMMUNITY.filter((e) => e.role !== 'library').map(async (e) => entryMod(e, await loadEntryTextures(e).catch(() => []))))
}

const samples = () => sampleMods().map((m) => modFromParts([m], { id: m.meta.id }))

/** Loads everything from IndexedDB, or starts in memory when it cannot open. Resolves once the store holds the mods. */
export async function bootEditor(opts: BootOptions = {}) {
  channel.close()
  repo?.close()
  for (const m of [undoStacks, redoStacks, lastUndoField, revisions, schemas, lastEdit, writes]) m.clear()
  dirty.clear()
  state = { ...initialState(), loading: true }
  let available = true
  try {
    repo = await Repository.open(opts.dbName, opts.factory)
  } catch {
    available = false
    const { IDBFactory } = await import('fake-indexeddb')
    repo = await Repository.open(opts.dbName, new IDBFactory())
  }
  const r = repo
  channel = openChannel((msg) => void onMessage(msg))
  const q = new URLSearchParams(opts.search ?? '')
  try {
    await r.purge(opts.now)
    if (q.has('fresh')) { await r.clear(); await r.setMeta('seeded', true) }
    if (!(await r.getMeta('seeded'))) {
      await r.saveMods(await (opts.seed ?? defaultMods)())
      await r.setMeta('seeded', true)
    }
    if (q.has('samples')) {
      const have = new Set((await r.loadAll()).mods.map((m) => m.mod.meta.id))
      await r.saveMods(samples().filter((m) => !have.has(m.meta.id)))
    }
    const { mods, deleted, history } = await r.loadAll()
    const saved = (await r.getMeta<Partial<EditorState['settings']>>('settings')) ?? {}
    const importDraft = (await r.getMeta<EditorState['importDraft']>('importDraft')) ?? null
    for (const { record } of mods) { revisions.set(record.mod.meta.id, record.revision); schemas.set(record.mod.meta.id, record.schema) }
    const list = mods.sort((a, b) => b.record.updatedAt - a.record.updatedAt).map((m) => m.mod)
    const draft = local.get<TextDraft>('gg.draft')
    let recoveredDraft: EditorState['recoveredDraft'] = null
    if (draft) {
      const found = mods.find((m) => m.mod.meta.id === draft.modId)
      if (found && draft.at > found.record.updatedAt && valueAt(found.mod, draft.field) !== draft.value) recoveredDraft = { ...draft, title: found.mod.meta.title }
      else local.set('gg.draft', null)
    }
    const persisted = await globalThis.navigator?.storage?.persisted?.().catch(() => false) ?? false
    emit({
      ...state, mods: list, deleted, history: history.sort((a, b) => b.createdAt - a.createdAt), importDraft, recoveredDraft, loading: false,
      storage: { ...state.storage, available, persisted },
      settings: { ...state.settings, ...pick(saved, META_SETTING_KEYS) },
    })
  } catch {
    patch({ loading: false, storage: { ...state.storage, available: false } })
  }
  await refreshStaleCopies()
  loadGameQuests().then((ok) => { if (ok) patch({ gameQuests: GAME_QUESTS.length > 0 }) }).catch(() => {})
}

function pick<T extends object, K extends keyof T>(o: T, keys: readonly K[]) {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) as Pick<T, K>
}

// ---------------------------------------------------------------------------------------------------------------------
// Persistence

function setSave(id: string, s: SaveState) {
  if (state.saves[id] !== s) patch({ saves: { ...state.saves, [id]: s } })
}

function markDirty(id: string) {
  dirty.add(id)
  setSave(id, 'dirty')
  flusher.touch(id)
}

/** Writes a dirty mod. Writes of one mod run one after another; a failed write leaves it dirty for the next change. */
function writeMod(id: string): Promise<void> {
  const mod = modById(id)
  if (!mod || !dirty.has(id) || !repo) return writes.get(id) ?? Promise.resolve()
  dirty.delete(id)
  setSave(id, 'saving')
  const r = repo
  const run = (writes.get(id) ?? Promise.resolve()).then(async () => {
    try {
      const record = await r.saveMod(mod, Date.now(), schemas.get(id))
      revisions.set(id, record.revision)
      if (dirty.has(id)) return
      setSave(id, 'saved')
      if (state.storage.quotaFull) patch({ storage: { ...state.storage, quotaFull: false } })
      if (local.get<TextDraft>('gg.draft')?.modId === id) local.set('gg.draft', null)
      channel.post({ type: 'mod-changed', id, revision: record.revision })
    } catch (e) {
      if (modById(id)) dirty.add(id)
      setSave(id, 'error')
      if (isQuotaError(e)) patch({ storage: { ...state.storage, quotaFull: true } })
    }
  })
  writes.set(id, run)
  return run
}

/** Writes every dirty mod now; resolves when the writes finish. */
export function flushAll() {
  flusher.flush([...dirty])
  return Promise.all(writes.values()).then(() => {})
}

async function onMessage(msg: SyncMessage) {
  if (!repo) return
  if (msg.type === 'history-changed') return refreshIndex()
  if (msg.type === 'mod-deleted') {
    dropMod(msg.id)
  } else if (!dirty.has(msg.id) && (revisions.get(msg.id) ?? 0) < msg.revision) {
    const found = await repo.loadMod(msg.id).catch(() => null)
    if (!found || dirty.has(msg.id)) return
    revisions.set(msg.id, found.record.revision)
    schemas.set(msg.id, found.record.schema)
    if (found.record.deletedAt != null) { dropMod(msg.id); await refreshIndex() } else {
      undoStacks.delete(msg.id)
      redoStacks.delete(msg.id)
      const exists = modById(msg.id)
      patch({ mods: exists ? state.mods.map((b) => (b.meta.id === msg.id ? found.mod : b)) : [found.mod, ...state.mods] })
      if (!exists) await refreshIndex()
    }
    return
  }
  await refreshIndex()
}

/** Removes a mod another tab deleted and sends a screen open on it to Home. */
function dropMod(id: string) {
  if (!modById(id)) return
  flusher.cancel(id)
  dirty.delete(id)
  undoStacks.delete(id)
  redoStacks.delete(id)
  patch({ mods: state.mods.filter((b) => b.meta.id !== id) })
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new CustomEvent('gg-mod-deleted', { detail: id }))
}

async function refreshIndex() {
  if (!repo) return
  const { history, deleted } = await repo.loadIndex().catch(() => ({ history: state.history, deleted: state.deleted }))
  patch({ history: history.sort((a, b) => b.createdAt - a.createdAt), deleted })
}

let persistAsked = false
function askPersist() {
  if (persistAsked || state.storage.persisted) return
  persistAsked = true
  globalThis.navigator?.storage?.persist?.().then((p) => patch({ storage: { ...state.storage, persisted: p } })).catch(() => {})
}

// ---------------------------------------------------------------------------------------------------------------------
// Edits and undo

/** Typing in one text field, from focus until it is left, is one undo step; every other edit is its own step. */
export const startsUndoStep = (lastField: unknown, field: unknown) => !field || lastField !== field

/** The text field being typed into, if any. Tests replace it. */
export let focusedField = (): unknown => {
  const el = typeof document === 'undefined' ? null : document.activeElement
  return typeof HTMLInputElement !== 'undefined' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el : null
}
export const setFocusedField = (fn: () => unknown) => { focusedField = fn }

function commit(modId: string, next: Mod, recordUndo = true, patches: Patch[] = []) {
  const current = modById(modId)
  if (!current) return
  const field = focusedField()
  if (recordUndo) {
    if (startsUndoStep(lastUndoField.get(modId), field)) {
      const undoStack = undoStacks.get(modId) ?? []
      undoStack.push(current)
      if (undoStack.length > UNDO_LIMIT) undoStack.shift()
      undoStacks.set(modId, undoStack)
    }
    if (field) lastUndoField.set(modId, field)
    else lastUndoField.delete(modId)
    redoStacks.set(modId, [])
  }
  const typed = field ? patches.filter((p) => p.op === 'replace' && typeof p.value === 'string') : []
  if (typed.length === 1) {
    const path = typed[0].path
    const lang = path[0] === 'quests' && path[2] === 'versions' ? (path[3] as Lang) : null
    local.set('gg.draft', { modId, lang, field: path, value: typed[0].value, at: Date.now() } satisfies TextDraft)
  }
  emit({ ...state, mods: state.mods.map((b) => (b.meta.id === modId ? next : b)) })
  markDirty(modId)
}

/** An automatic History entry before the first edit after 10 minutes without edits. */
function idleEntry(current: Mod) {
  const id = current.meta.id
  const now = Date.now()
  if (now - (lastEdit.get(id) ?? current.meta.updatedAt) > IDLE_GAP) void addHistory(id, '', true)
  lastEdit.set(id, now)
}

/** Changes mod-level data (title, metadata, parts) with undo. */
export function updateMod(modId: string, recipe: (draft: Mod) => void) {
  const current = anyMod(modId)
  if (!current) return
  if (isReadOnly(current)) return readOnlyToast(modId)
  const [next, patches] = produceWithPatches(current, (draft) => {
    recipe(draft)
    draft.meta.updatedAt = Date.now()
    if (draft.meta.community) draft.meta.modified = true
  })
  idleEntry(current)
  commit(modId, next, true, patches)
}

const plain = <T>(v: T): T => (isDraft(v) ? (draftValue(v as never) as T) : v)

const MOD_META_FIELDS = ['author', 'version', 'summary', 'licence', 'link', 'tags', 'requires'] as const

/** Changes one part through its view; the view's content and shared metadata are written back into the mod. */
export function updatePart(id: string, recipe: (draft: ModPart) => void) {
  const { modId, partId } = splitViewId(id)
  const current = anyMod(modId)
  if (!current || !partId) return
  if (isReadOnly(current)) return readOnlyToast(modId)
  if (!partsOf(current).some((v) => v.meta.id === id)) return
  const [next, patches] = produceWithPatches(current, (draft) => {
    const view = partViews(draft).find((v) => v.meta.id === id)!
    recipe(view)
    const quest = draft.quests.find((q) => q.id === partId)
    if (quest) {
      const q = view as QuestView
      if (quest.versions !== q.versions) quest.versions = q.versions
      if (quest.primaryLang !== q.primaryLang) quest.primaryLang = q.primaryLang
      const primary = q.versions[q.primaryLang]
      if (primary && Object.keys(quest.versions).length > 1) {
        for (const lang of Object.keys(quest.versions) as Lang[]) {
          if (lang !== q.primaryLang && quest.versions[lang]) quest.versions[lang] = syncVersion(plain(primary), plain(quest.versions[lang]!))
        }
      }
    } else if (draft.stars?.id === partId) {
      const s = view as StarsView
      for (const k of ['stars', 'planets', 'stations'] as const) if (draft.stars[k] !== s[k]) (draft.stars as Record<string, unknown>)[k] = s[k]
      if (draft.meta.title !== s.meta.title) draft.meta.title = s.meta.title
    }
    for (const f of MOD_META_FIELDS) {
      if (draft.meta[f] !== view.meta[f]) (draft.meta as unknown as Record<string, unknown>)[f] = view.meta[f]
    }
    draft.meta.updatedAt = Date.now()
    if (draft.meta.community) draft.meta.modified = true
  })
  idleEntry(current)
  commit(modId, next, true, patches)
}

export function updateQuest(id: string, recipe: (q: QuestContent, mod: QuestView) => void, lang?: Lang) {
  updatePart(id, (m) => {
    const qm = m as QuestView
    recipe(qm.versions[lang ?? qm.primaryLang]!, qm)
  })
}

export function updateStars(id: string, recipe: (m: StarsView) => void) {
  updatePart(id, (m) => recipe(m as StarsView))
}

/**
 * Runs a change (any updateQuest/updateStars/updatePart/updateMod calls on one mod) and shows a 10-second toast whose
 * Undo puts the mod back only while it is still exactly what the change produced.
 */
export function updateWithUndo(id: string, message: string, change: () => void) {
  const key = modKey(id)
  const before = modById(key)
  change()
  const after = modById(key)
  if (!before || !after || after === before) return
  toast(message, {
    duration: 10_000,
    action: {
      label: t('common.undo'),
      onClick: () => {
        if (modById(key) !== after) return void toast(t('lib.cantUndo'))
        commit(key, keepModified(before, after))
      },
    },
  })
}

export const canUndo = (id: string) => (undoStacks.get(modKey(id))?.length ?? 0) > 0
export const canRedo = (id: string) => (redoStacks.get(modKey(id))?.length ?? 0) > 0

/** Undo, redo and restore leave textures as they are, and Modified stays set once a community mod is edited. */
const keepModified = (b: Mod, current: Mod): Mod => ({ ...b, textures: current.textures, meta: current.meta.modified ? { ...b.meta, modified: true } : b.meta })

function step(id: string, from: Map<string, Mod[]>, to: Map<string, Mod[]>) {
  const key = modKey(id)
  lastUndoField.delete(key)
  const target = from.get(key)?.pop()
  const current = modById(key)
  if (!target || !current) return
  to.set(key, [...(to.get(key) ?? []), current])
  emit({ ...state, mods: state.mods.map((b) => (b.meta.id === key ? keepModified(target, current) : b)) })
  markDirty(key)
}

export const undo = (id: string) => step(id, undoStacks, redoStacks)
export const redo = (id: string) => step(id, redoStacks, undoStacks)

/** Adds a mod and writes it at once. */
export function addMod(mod: Mod) {
  emit({ ...state, mods: [mod, ...state.mods] })
  dirty.add(mod.meta.id)
  void writeMod(mod.meta.id)
  if (!mod.meta.community) askPersist()
  return mod.meta.id
}

/** Adds loose views as a new one-part favorite mod and returns the view id of its first part. */
export function addModFromPart(part: ModPart) {
  const b = modFromParts([part], { favorite: true })
  addMod(b)
  return partsOf(b)[0].meta.id
}

/** Adds a quest to an existing mod and returns its view id. */
export function addQuestPart(modId: string, quest: QuestView) {
  const part: QuestPart = { id: uid(), primaryLang: quest.primaryLang, versions: quest.versions }
  updateMod(modId, (b) => { b.quests.push(part) })
  return viewId(modId, part.id)
}

export function addStarsPart(modId: string) {
  const part: StarsPart = { id: 'stars', stars: [], planets: [], stations: [] }
  updateMod(modId, (b) => { if (!b.stars) b.stars = part })
  return viewId(modId, 'stars')
}

/** Texture changes have no undo: they skip the undo stack and survive undo, redo and restore. */
function setTextures(modId: string, next: (textures: TexturePart[]) => TexturePart[]) {
  const current = anyMod(modId)
  if (!current) return
  if (isReadOnly(current)) return readOnlyToast(modId)
  const meta = { ...current.meta, updatedAt: Date.now(), modified: current.meta.community ? true : current.meta.modified }
  commit(modId, { ...current, meta, textures: next(current.textures) }, false)
}

export function addTextures(modId: string, textures: TexturePart[]) {
  setTextures(modId, (list) => {
    const byName = new Map(textures.map((x) => [x.name, x]))
    return [...list.map((x) => byName.get(x.name) ?? x), ...textures.filter((x) => !list.some((y) => y.name === x.name))]
  })
}

/** Removes one part of a mod; quests and stars get a History entry and an undo toast, textures do neither. */
export function removePart(modId: string, partId: string, label: string) {
  if (modById(modId)?.textures.some((x) => x.id === partId)) {
    setTextures(modId, (list) => list.filter((x) => x.id !== partId))
    return void toast(t('lib.removedPart', { name: label }))
  }
  void addHistory(modId, t('lib.beforeRemoving', { name: label }), true)
  updateWithUndo(modId, t('lib.removedPart', { name: label }), () => updateMod(modId, (b) => {
    b.quests = b.quests.filter((q) => q.id !== partId)
    if (b.stars?.id === partId) b.stars = null
  }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Deleting, restoring and copying mods

/** Deletes mods with a single 10-second undo toast. They stay in History as deleted for 30 days. Accepts mod or view ids. */
export function deleteMods(ids: string[]) {
  const keys = new Set(ids.map(modKey))
  const removed = state.mods.map((b, i) => ({ b, i })).filter(({ b }) => keys.has(b.meta.id))
  if (!removed.length) return
  flusher.flush([...keys].filter((k) => dirty.has(k)))
  emit({ ...state, mods: state.mods.filter((b) => !keys.has(b.meta.id)) })
  const now = Date.now()
  for (const { b } of removed) {
    const id = b.meta.id
    flusher.cancel(id)
    undoStacks.delete(id)
    redoStacks.delete(id)
    const r = repo
    if (!r) continue
    const run = (writes.get(id) ?? Promise.resolve()).then(async () => {
      const record = await r.deleteMod(id, now).catch(() => null)
      if (record) revisions.set(id, record.revision)
      channel.post({ type: 'mod-deleted', id })
      await refreshIndex()
    })
    writes.set(id, run)
  }
  const label = removed.length === 1 ? t('lib.deletedMod', { name: removed[0].b.meta.title }) : t('lib.deletedMods', { count: removed.length })
  toast(label, {
    duration: 10_000,
    action: { label: t('common.undo'), onClick: () => { removed.forEach(({ b, i }) => void restoreDeletedMod(b.meta.id, i)) } },
  })
}

export const deleteMod = (id: string) => deleteMods([id])

/** Brings back a deleted mod, at `index` in the list when given. */
export async function restoreDeletedMod(id: string, index = 0) {
  const r = repo
  if (!r) return
  await writes.get(id)
  const found = await r.restoreMod(id).catch(() => null)
  if (!found || modById(id)) return
  revisions.set(id, found.record.revision)
  schemas.set(id, found.record.schema)
  const mods = [...state.mods]
  mods.splice(Math.min(index, mods.length), 0, found.mod)
  patch({ mods, saves: { ...state.saves, [id]: 'saved' } })
  channel.post({ type: 'mod-changed', id, revision: found.record.revision })
  await refreshIndex()
}

/** Copies a whole mod. Given a view id, returns the copy's matching view id. */
export function duplicateMod(id: string) {
  const { modId, partId } = splitViewId(id)
  const source = anyMod(modId)
  if (!source) return
  const copy = { ...structuredClone({ ...source, textures: [] }), textures: source.textures }
  copy.meta.id = uid()
  copy.meta.title = t('lib.copyTitle', { name: source.meta.title })
  copy.meta.createdAt = copy.meta.updatedAt = Date.now()
  copy.meta.favorite = true
  if (isReadOnly(source) || source.meta.community) {
    copy.meta.origin = 'local'
    copy.meta.community = undefined
    copy.meta.modified = undefined
    if (source.meta.favorite && modById(modId)) setFavorite([modId], false)
  }
  addMod(copy)
  toast(t('lib.madeCopy', { name: source.meta.title }))
  return partId ? viewId(copy.meta.id, partId) : copy.meta.id
}

/** Favorites are whole mods and not an edit: no undo entry, never marks a mod modified, allowed on read-only mods. Accepts mod or view ids. */
/** Returns an undo that restores every flag the call changed. */
export function setFavorite(ids: string[], favorite: boolean, quiet = false) {
  const asked = ids.map(modKey)
  // Favoriting takes the mod's required mods along, since the game needs their files too.
  const keys = new Set(favorite ? withRequired(asked, state.mods) : asked)
  const before = new Map(state.mods.filter((b) => keys.has(b.meta.id)).map((b) => [b.meta.id, b.meta.favorite]))
  const filesBefore = questFileCount(state.mods.filter((b) => b.meta.favorite), state.settings.downloadLang)
  emit({ ...state, mods: state.mods.map((b) => (keys.has(b.meta.id) ? { ...b, meta: { ...b.meta, favorite } } : b)) })
  keys.forEach((k) => { if (modById(k)) markDirty(k) })
  const undo = () => setFavoriteFlags(before)
  if (quiet || !favorite) return undo
  const extra = state.mods.filter((b) => keys.has(b.meta.id) && !asked.includes(b.meta.id) && !before.get(b.meta.id))
  if (extra.length) toast(t('lib.alsoFavorited', { mods: extra.map((b) => b.meta.title).join(', ') }), { action: { label: t('common.undo'), onClick: undo } })
  const files = questFileCount(state.mods.filter((b) => b.meta.favorite), state.settings.downloadLang)
  if (files > MAX_QUEST_FILES && filesBefore <= MAX_QUEST_FILES) toast.warning(t('lib.overQuestLimit', { count: files, max: MAX_QUEST_FILES }), { action: { label: t('common.undo'), onClick: undo } })
  return undo
}

function setFavoriteFlags(flags: Map<string, boolean>) {
  emit({ ...state, mods: state.mods.map((b) => (flags.has(b.meta.id) ? { ...b, meta: { ...b.meta, favorite: flags.get(b.meta.id)! } } : b)) })
  flags.forEach((_, k) => { if (modById(k)) markDirty(k) })
}

export const isEntryAdded = (entryId: string) => state.mods.some((b) => b.meta.community?.entryId === entryId)

/** Whether an unmodified copy of a library entry is on this device. */
export const hasUnmodifiedCopy = (entryId: string) =>
  state.mods.some((b) => b.meta.community?.entryId === entryId && !b.meta.modified && b.meta.version === COMMUNITY.find((e) => e.id === entryId)?.version)

/** Replaces unmodified copies of an older library version with the current one, in place, keeping the favourite flag. */
export async function refreshStaleCopies(entryId?: string) {
  for (const old of state.mods.filter((b) => !entryId || b.meta.community?.entryId === entryId)) {
    const entry = staleEntry(old, COMMUNITY)
    if (!entry || adding.has(entry.id)) continue
    adding.add(entry.id)
    const textures = await loadEntryTextures(entry).catch(() => [])
    adding.delete(entry.id)
    if (!state.mods.includes(old)) continue
    const mod = entryMod(entry, textures)
    const base = mod.meta.id
    for (let n = 2; modById(mod.meta.id); n++) mod.meta.id = `${base}-${n}`
    mod.meta.favorite = old.meta.favorite
    emit({ ...state, mods: state.mods.map((b) => (b === old ? mod : b)) })
    dirty.add(mod.meta.id)
    void writeMod(mod.meta.id)
    const id = old.meta.id
    flusher.cancel(id)
    dirty.delete(id)
    const r = repo
    if (r) writes.set(id, (writes.get(id) ?? Promise.resolve()).then(() => r.removeMod(id)).then(() => channel.post({ type: 'mod-deleted', id })).catch(() => {}))
  }
}

let gameFiles: Promise<Record<string, string> | null> | null = null

/** Opens one of the game's own quests read-only as `game-<questId>`, from the local-only data/game-quests-full.json. Resolves null when it isn't there. */
export async function openGameQuest(questId: string) {
  const id = `game-${questId}`
  const open = state.gameMods.find((b) => b.meta.id === id)
  if (open) return open
  gameFiles ??= fetch(`${import.meta.env.BASE_URL}data/game-quests-full.json`)
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null)).catch(() => null)
  const text = (await gameFiles)?.[questId]
  const result = text ? importText(text) : null
  if (result?.kind !== 'ok') return null
  const mod = state.gameMods.find((b) => b.meta.id === id) ?? modFromParts([result.mod], { id, origin: 'game', favorite: false })
  if (!state.gameMods.includes(mod)) patch({ gameMods: [...state.gameMods, mod] })
  return mod
}

const adding = new Set<string>()

/** Adds a library entry. When modified copies exist, the new unmodified copy gets its own id beside them. */
export async function addCommunityEntry(entryId: string, favorite = false) {
  const entry = COMMUNITY.find((e) => e.id === entryId)
  // The textures load before anything reaches the store, so a second call meanwhile would add a second copy.
  if (!entry) return
  await refreshStaleCopies(entryId)
  if (hasUnmodifiedCopy(entryId) || adding.has(entryId)) return
  adding.add(entryId)
  const textures = await loadEntryTextures(entry).catch(() => [])
  adding.delete(entryId)
  // Another tab may have added it while the textures loaded, and its copy reaches this tab over the channel.
  if (hasUnmodifiedCopy(entryId)) return
  const mod = entryMod(entry, textures)
  let n = 1
  const base = mod.meta.id
  while (modById(mod.meta.id)) mod.meta.id = `${base}-${++n}`
  mod.meta.favorite = false
  addMod(mod)
  if (favorite) setFavorite([mod.meta.id], true)
  toast(t('lib.addedEntry', { name: entry.title }), { action: { label: t('common.undo'), onClick: () => removeCommunityEntry(entryId, true) } })
}

/** Removes the unmodified copy of a library entry for good; the library can add it again. Modified copies are deleted like own mods. */
export function removeCommunityEntry(entryId: string, silent = false) {
  const isOriginal = (b: Mod) => b.meta.community?.entryId === entryId && !b.meta.modified
  const removed = state.mods.filter(isOriginal)
  if (!removed.length) return
  emit({ ...state, mods: state.mods.filter((b) => !isOriginal(b)) })
  for (const b of removed) {
    const id = b.meta.id
    flusher.cancel(id)
    dirty.delete(id)
    const r = repo
    if (r) writes.set(id, (writes.get(id) ?? Promise.resolve()).then(() => r.removeMod(id)).then(() => channel.post({ type: 'mod-deleted', id })).catch(() => {}))
  }
  if (!silent) toast(t('lib.removedEntry', { name: removed[0].meta.title }), { action: { label: t('common.undo'), onClick: () => removed.forEach((b) => addMod(b)) } })
}

// ---------------------------------------------------------------------------------------------------------------------
// History

/** Saves a copy of a mod to History. `id` is the mod or one of its parts. */
export async function addHistory(id: string, name: string, auto = false) {
  const mod = modById(modKey(id))
  if (!mod) return
  const stored = await toStored(mod)
  const entry: HistoryEntry = {
    id: uid(), modId: mod.meta.id, name, auto, createdAt: Date.now(), bytes: JSON.stringify(stored).length,
    mod: stored, revision: revisions.get(mod.meta.id) ?? 0, schema: schemas.get(mod.meta.id) ?? CURRENT_SCHEMA,
  }
  const pruned = repo ? await repo.addHistory(entry).catch(() => [] as string[]) : []
  patch({ history: [entry, ...state.history.filter((h) => !pruned.includes(h.id))] })
  channel.post({ type: 'history-changed' })
  return entry
}

/** Saves the current state as an automatic entry, then puts the entry's copy back. Textures stay as they are. */
export async function restoreHistory(entryId: string) {
  const entry = state.history.find((h) => h.id === entryId)
  const current = entry && modById(entry.modId)
  if (!entry || !current) return
  await addHistory(entry.modId, t('lib.beforeRestore'), true)
  const now = modById(entry.modId) ?? current
  const restored = keepModified({ ...structuredClone(entry.mod), textures: now.textures } as Mod, now)
  commit(entry.modId, { ...restored, meta: { ...restored.meta, updatedAt: Date.now() } })
  toast(t('lib.restored', { name: entry.name || t('lib.autoEntry') }))
}

export async function renameHistory(entryId: string, name: string) {
  const entry = state.history.find((h) => h.id === entryId)
  if (!entry) return
  const next = { ...entry, name, auto: false }
  patch({ history: state.history.map((h) => (h.id === entryId ? next : h)) })
  await repo?.putHistory(next).catch(() => {})
  channel.post({ type: 'history-changed' })
}

export async function deleteHistory(entryId: string) {
  patch({ history: state.history.filter((h) => h.id !== entryId) })
  await repo?.deleteHistory(entryId).catch(() => {})
  channel.post({ type: 'history-changed' })
}

// ---------------------------------------------------------------------------------------------------------------------
// Settings, drafts and whole-store actions

export function setImportDraft(draft: EditorState['importDraft']) {
  patch({ importDraft: draft })
  repo?.setMeta('importDraft', draft ?? undefined).catch(() => {})
}

export function setSettings(p: Partial<EditorState['settings']>) {
  patch({ settings: { ...state.settings, ...p } })
  if (PREF_KEYS.some((k) => k in p)) local.set('gg.prefs', pick(state.settings, PREF_KEYS))
  if (META_SETTING_KEYS.some((k) => k in p)) repo?.setMeta('settings', pick(state.settings, META_SETTING_KEYS)).catch(() => {})
}

export function dismissTip(key: string) {
  setSettings({ dismissedTips: [...state.settings.dismissedTips, key] })
}

/** Makes every write fail as a full device would. */
export function simulateQuota(on: boolean) {
  if (repo) repo.simulateQuota = on
  patch({ storage: { ...state.storage, simulateQuota: on } })
}

export async function requestPersist() {
  const p = await globalThis.navigator?.storage?.persist?.().catch(() => false) ?? false
  patch({ storage: { ...state.storage, persisted: p } })
  return p
}

function valueAt(root: unknown, path: (string | number)[]) {
  return path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), root)
}

/** Puts recovered text back into its field. */
export function restoreDraft() {
  const d = state.recoveredDraft
  if (!d) return
  patch({ recoveredDraft: null })
  local.set('gg.draft', null)
  updateMod(d.modId, (m) => {
    const parent = valueAt(m, d.field.slice(0, -1))
    if (parent && typeof parent === 'object') (parent as Record<string, unknown>)[d.field[d.field.length - 1]] = d.value
  })
}

export function discardDraft() {
  patch({ recoveredDraft: null })
  local.set('gg.draft', null)
}

export function loadSamples() {
  samples().filter((m) => !modById(m.meta.id)).forEach(addMod)
}

/** Deletes every mod and History entry. */
export async function resetAll() {
  undoStacks.clear()
  redoStacks.clear()
  dirty.clear()
  emit({ ...state, mods: [], history: [], deleted: [], settings: { ...state.settings, dismissedTips: [] } })
  setSettings({ dismissedTips: [] })
  const ids = [...revisions.keys()]
  await repo?.clear().catch(() => {})
  ids.forEach((id) => channel.post({ type: 'mod-deleted', id }))
}

/** Empties the database and this device's preferences; the next boot starts as a first visit. */
export async function clearAllData() {
  await repo?.clear(['mods', 'history', 'textures', 'meta']).catch(() => {})
  for (const key of ['gg.prefs', 'gg.last', 'gg.draft']) local.set(key, null)
}

/** Reloads every mod after storage changed underneath the store (Open a backup). */
export async function reloadFromStorage() {
  if (!repo) return
  await flushAll()
  const { mods, deleted, history } = await repo.loadAll()
  undoStacks.clear()
  redoStacks.clear()
  const before = new Set(state.mods.map((m) => m.meta.id))
  for (const { record } of mods) { revisions.set(record.mod.meta.id, record.revision); schemas.set(record.mod.meta.id, record.schema) }
  const saved = (await repo.getMeta<Partial<EditorState['settings']>>('settings')) ?? {}
  emit({ ...state, mods: mods.sort((a, b) => b.record.updatedAt - a.record.updatedAt).map((m) => m.mod), deleted, history: history.sort((a, b) => b.createdAt - a.createdAt), settings: { ...state.settings, ...pick(saved, META_SETTING_KEYS) } })
  for (const id of before) if (!modById(id)) channel.post({ type: 'mod-deleted', id })
  for (const { record } of mods) channel.post({ type: 'mod-changed', id: record.mod.meta.id, revision: record.revision })
}

export const getRepository = () => repo

/** Primary-language content of a quest view. */
export const questOf = (m: ModPart | undefined): QuestContent | undefined =>
  m && m.meta.type === 'quest' ? (m as QuestView).versions[(m as QuestView).primaryLang] : undefined

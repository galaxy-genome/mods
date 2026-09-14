/** IndexedDB 'gg-editor' behind a small promise helper. `version` changes only when stores or indexes change. */

export const DB_NAME = 'gg-editor'
const DB_VERSION = 1

export type StoreName = 'mods' | 'textures' | 'history' | 'meta'
export const STORES: StoreName[] = ['mods', 'textures', 'history', 'meta']

export const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })

export function openDb(name = DB_NAME, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'))
  const req = factory.open(name, DB_VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains('mods')) db.createObjectStore('mods', { keyPath: 'mod.meta.id' })
    if (!db.objectStoreNames.contains('textures')) db.createObjectStore('textures')
    if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' }).createIndex('modId', 'modId')
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
  }
  return request(req)
}

/** Runs `body` in one transaction over `stores` and resolves with its result once the transaction commits. */
export function tx<T>(db: IDBDatabase, stores: StoreName[], mode: IDBTransactionMode, body: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode)
    let result: T
    let failed: unknown
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(failed ?? t.error)
    t.onabort = () => reject(failed ?? t.error)
    Promise.resolve().then(() => body(t)).then((r) => { result = r }, (e) => { failed = e; try { t.abort() } catch { /* already finished */ } })
  })
}

export const get = <T>(t: IDBTransaction, store: StoreName, key: IDBValidKey) => request(t.objectStore(store).get(key)) as Promise<T | undefined>
export const getAll = <T>(t: IDBTransaction, store: StoreName, query?: IDBValidKey | IDBKeyRange, index?: string) =>
  request((index ? t.objectStore(store).index(index) : t.objectStore(store)).getAll(query)) as Promise<T[]>
export const put = (t: IDBTransaction, store: StoreName, value: unknown, key?: IDBValidKey) => request(t.objectStore(store).put(value, key))
export const del = (t: IDBTransaction, store: StoreName, key: IDBValidKey) => request(t.objectStore(store).delete(key))

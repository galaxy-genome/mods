/** When dirty mods are written, and the messages tabs send each other about them. */

export const FLUSH_DELAY = 400
export const CHANNEL = 'gg-editor'

export type SyncMessage = { type: 'mod-changed'; id: string; revision: number } | { type: 'mod-deleted'; id: string } | { type: 'history-changed' }

/** Writes a mod 400 ms after its last change, or at once on `flush`. */
export class FlushScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private write: (id: string) => void
  private delay: number

  constructor(write: (id: string) => void, delay = FLUSH_DELAY) {
    this.write = write
    this.delay = delay
  }

  touch(id: string) {
    clearTimeout(this.timers.get(id))
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); this.write(id) }, this.delay))
  }

  cancel(id: string) {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
  }

  /** Writes the given mods, or every mod waiting on a timer, now. */
  flush(ids: Iterable<string> = [...this.timers.keys()]) {
    for (const id of [...ids]) {
      this.cancel(id)
      this.write(id)
    }
  }
}

export function openChannel(onMessage: (msg: SyncMessage) => void) {
  if (typeof BroadcastChannel === 'undefined') return { post: (_msg: SyncMessage) => {}, close: () => {} }
  const channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data)
  // Node keeps a process alive for an open channel; browsers have no unref.
  ;(channel as { unref?: () => void }).unref?.()
  return { post: (msg: SyncMessage) => channel.postMessage(msg), close: () => channel.close() }
}

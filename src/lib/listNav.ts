export const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'j', 'k', 'Home', 'End']

/** Visible `[data-opt]` rows in the top sheet or dialog, or the page when none is open. */
export function navRows(): HTMLElement[] {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  const scope: ParentNode = dialogs[dialogs.length - 1] ?? document
  return [...scope.querySelectorAll<HTMLElement>('[data-opt]')].filter((el) => el.offsetParent !== null)
}

/** `data-nav="<name>:<key>"` parsed into the `?<name>=<key>` a row records itself as. */
export function navPlace(attr: string | null | undefined): { name: string; key: string } | null {
  const i = attr ? attr.indexOf(':') : -1
  return i > 0 ? { name: attr!.slice(0, i), key: attr!.slice(i + 1) } : null
}

/** The row's place, taken from it or its nearest ancestor that declares one. */
export const rowPlace = (el: Element | null) => navPlace(el?.closest<HTMLElement>('[data-nav]')?.dataset.nav)

/** The row a search string names, or null when none matches — a stale key selects nothing. */
export function rowFor(search: string, rows: HTMLElement[] = navRows()): HTMLElement | null {
  const params = new URLSearchParams(search)
  return rows.find((r) => { const p = rowPlace(r); return p && params.get(p.name) === p.key }) ?? null
}

/** The row index a key moves to; `current` is -1 when no row is active. Clamped, no wrap. */
export function nextIndex(current: number, count: number, key: string): number {
  if (!count) return -1
  const last = count - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  const down = key === 'ArrowDown' || key === 'ArrowRight' || key === 'j'
  if (current < 0) return down ? 0 : last
  return Math.max(0, Math.min(last, current + (down ? 1 : -1)))
}

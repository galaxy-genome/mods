export const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'j', 'k', 'Home', 'End']

/** Visible `[data-opt]` rows in the top sheet or dialog, or the page when none is open. */
export function navRows(): HTMLElement[] {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  const scope: ParentNode = dialogs[dialogs.length - 1] ?? document
  return [...scope.querySelectorAll<HTMLElement>('[data-opt]')].filter((el) => el.offsetParent !== null)
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

/** A number the save holds, typed in place. Every figure a screen shows is one the reader can
 * set: the wand is a shortcut, never the only way.
 */
import './overview.css'

export function NumberField({ value, onSet, label, width }: {
  value: number; onSet: (n: number) => void; label: string; width?: number
}) {
  return (
    <input
      className="ggnum"
      inputMode="numeric"
      aria-label={label}
      style={width ? { width } : undefined}
      value={value.toLocaleString('en-US')}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const text = e.target.value.replace(/[^\d-]/g, '')
        const n = Number(text === '' || text === '-' ? 0 : text)
        if (Number.isSafeInteger(n)) onSet(n)
      }}
    />
  )
}

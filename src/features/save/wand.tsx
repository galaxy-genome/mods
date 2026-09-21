/** The magic wand. It means one thing everywhere it appears: set this to the best there is.
 *
 * It sits only where a value is below that best and disappears once the value is there, and only
 * where the best is settled: where two options are each better at something, the reader chooses
 * and there is no wand.
 */
import magic from './magic.svg?raw'
import './overview.css'

export function Wand({ atBest, what, onSet }: { atBest: boolean; what: string; onSet: () => void }) {
  if (atBest) return null
  return (
    <button
      type="button"
      className="ggwand"
      title={`${what}: the best there is`}
      aria-label={`${what}: the best there is`}
      onClick={(e) => { e.stopPropagation(); onSet() }}
      dangerouslySetInnerHTML={{ __html: magic }}
    />
  )
}

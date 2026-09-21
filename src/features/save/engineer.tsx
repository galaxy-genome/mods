/** The engineer, on the module panel.
 *
 * Opening a module shows it with every engineer improvement already applied; the control here
 * sets a lower level, or none, and picks the modification. Nothing is spent and no material is
 * consumed: only `Module.priority_and_level` moves (`system/modules/Module.as:320`).
 */
import * as React from 'react'
import type { AmfObject } from '../../lib/save/codec'
import {
  ENGINEER_CAP, MAX_LEVEL, UPGRADES, applyBest, moduleBits, setLevel, setUpgradeType,
} from '../../lib/save/engineer'
import './engineer.css'

export function Engineer({ module, subtype, onChange }: {
  module: AmfObject; subtype: string; onChange: () => void
}) {
  // The module arrives at its best; the reader steps back from there.
  React.useEffect(() => { if (applyBest(module)) onChange() }, [module, onChange])

  const options = UPGRADES[subtype]
  if (!options) return null
  const { level, upgradeType } = moduleBits(module)
  const cap = ENGINEER_CAP[subtype]

  const type = (t: number) => { if (setUpgradeType(module, t)) onChange() }
  const set = (n: number) => { if (setLevel(module, n)) onChange() }

  return (
    <div className="engbox">
      <div className="ovbar engbar">Engineer</div>
      <div className="ovrow engopts">
        {options.map((o) => (
          <button
            key={o.type} type="button"
            className={`ggbutton engopt${o.type === upgradeType ? ' engon' : ''}`}
            onClick={() => type(o.type)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="englevels">
        <input
          className="engbar2" type="range" min={0} max={MAX_LEVEL} value={level}
          aria-label="Level" onChange={(e) => set(Number(e.currentTarget.value))}
        />
        <div className="englevel">LEVEL {level}</div>
      </div>
      {cap && (
        <div className="engnote">
          {cap.engineer} takes this module to level {cap.cap}.
          {level > cap.cap ? " No engineer's qualification allows the level set here." : ''}
        </div>
      )}
    </div>
  )
}

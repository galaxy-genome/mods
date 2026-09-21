// `Module.SetExperementalStats` (system/modules/Module.as:377-437): an Experimental
// Booster's stats are a pure function of the module's `fuel` field, used as the seed.
import { Rndm } from './noise.ts'

/** The ten boosts, in the case order of Module.as:400-433, with their ranges. */
export const BOOSTS = [
  { key: 'shieldsBoost', base: 0.05, span: 0.05 },
  { key: 'energyDamageBoost', base: 0.05, span: 0.05 },
  { key: 'kineticDamageBoost', base: 0.05, span: 0.05 },
  { key: 'fsdBoost', base: 2, span: 6 },
  { key: 'thrustersBoost', base: 0.05, span: 0.05 },
  { key: 'powerBoost', base: 0.05, span: 0.15 },
  { key: 'scannerBoost', base: 0.05, span: 0.1 },
  { key: 'overheatCoolingBoost', base: 0.05, span: 0.25 },
  { key: 'shieldsRegBoost', base: 0.05, span: 0.1 },
  { key: 'explosionDamageBoost', base: 0.05, span: 0.05 },
] as const

export type BoostKey = (typeof BOOSTS)[number]['key']

/**
 * The boosts a seed rolls. A case that comes up twice overwrites its own value,
 * so the result can hold fewer entries than the loop ran.
 */
export function rollExperimental(seed: number): Partial<Record<BoostKey, number>> {
  const rnd = new Rndm(seed)
  const count = rnd.integer(2, 4)
  const out: Partial<Record<BoostKey, number>> = {}
  for (let i = 0; i < count; i++) {
    const b = BOOSTS[rnd.integer(0, 10)]
    out[b.key] = b.base + rnd.random() * b.span
  }
  return out
}

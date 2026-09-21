import type { Save } from '../../../lib/save/codec'

/** Every sub-screen takes the loaded save, a way back to the home page, and a way to
 * tell the home page its figures have changed. */
export interface ScreenProps {
  sv: Save
  onReturn: () => void
  redraw: () => void
}

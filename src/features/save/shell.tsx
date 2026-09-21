import * as React from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import './overview.css'

/** The screen is authored at 820x369 and scaled to whatever the stage measures. */
const SCREEN_WIDTH = 820

function useScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = React.useState(1)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SCREEN_WIDTH))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return scale
}

export function RotatePrompt() {
  return (
    <div className="ggrotate">
      <div>Rotate your device</div>
      <div>The save editor uses the game's landscape screens.</div>
    </div>
  )
}

/** The fixed landscape frame: centred and letterboxed, dark backdrop, portrait asks for a rotation. */
export function SaveFrame({ children }: { children: React.ReactNode }) {
  const frame = React.useRef<HTMLDivElement>(null)
  const scale = useScale(frame)
  const portrait = useMediaQuery('(orientation: portrait) and (max-width: 899px)')
  if (portrait) return <RotatePrompt />
  return (
    <div className="ggstage">
      <div className="ggframe" ref={frame}>
        <div className="ggscreen" style={{ '--ggscale': scale } as React.CSSProperties}>{children}</div>
      </div>
    </div>
  )
}

/** The game's two header forms: a Return chevron on a sub-screen, a Close box on a top-level list. */
export function ScreenHeader({ title, onReturn, onClose }: { title: string; onReturn?: () => void; onClose?: () => void }) {
  return (
    <div className="gghead">
      {onReturn && <button type="button" className="ggreturn" onClick={onReturn}>Return</button>}
      <div className="ggtitle">{title}</div>
      {onClose && <button type="button" className="ggclose2" onClick={onClose}>Close</button>}
    </div>
  )
}

export function StartScreen({ onPick }: { onPick: (file: File) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <div className="ggstart">
      <div className="ovbar" style={{ minWidth: 300 }}>SAVE EDITOR</div>
      <p>Open a save file to edit it. Nothing is overwritten: the edited save leaves as a download.</p>
      <button type="button" className="ggbutton" onClick={() => input.current?.click()}>Open save file</button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f) }}
      />
    </div>
  )
}

import * as React from 'react'
import { cn } from '@/lib/utils'

/** A pointy-top hexagon, the shape every button in the game's ship and station HUD uses. */
export function HexButton({ icon, label, onClick, disabled, title }: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'group flex w-full flex-col items-center gap-[0.35em] outline-offset-4',
        disabled ? 'cursor-default text-dim/70' : 'text-white/90 hover:text-cyan',
      )}
    >
      <span className="relative block w-full" style={{ aspectRatio: '0.866' }}>
        <svg viewBox="0 0 100 115" className="absolute inset-0 size-full" aria-hidden>
          <polygon
            points="50,2 98,30 98,85 50,113 2,85 2,30"
            className={cn('transition-colors', disabled ? 'fill-black/30' : 'fill-black/45 group-hover:fill-cyan/15')}
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center [&_svg]:size-[42%]">{icon}</span>
      </span>
      <span className="whitespace-nowrap font-mono text-[max(8px,0.62cqw)] tracking-[0.2em]">{label}</span>
    </button>
  )
}

/** The dark planet limb the HUD buttons sit over, plus the corner brackets framing the view. */
export function HudBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_38%,rgba(32,74,96,0.55),rgba(4,6,14,0.95)_62%)]" />
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute left-[6%] top-[2%] aspect-square w-[52%] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.92)_58%,transparent_70%)]" />
      <div className="pointer-events-none absolute left-[20%] top-[22%] h-[4%] w-[1.6%] border-l-2 border-t-2 border-cyan/80" />
      <div className="pointer-events-none absolute right-[20%] top-[22%] h-[4%] w-[1.6%] border-r-2 border-t-2 border-cyan/80" />
    </>
  )
}

/** Label over value, in the readout style the game uses along the bottom of the HUD. */
export function Readout({ label, value, tone = 'cyan' }: { label: string; value: React.ReactNode; tone?: 'cyan' | 'amber' | 'ink' }) {
  return (
    <div className="flex flex-col gap-[0.2em]">
      <span className="font-mono text-[max(8px,0.65cqw)] tracking-[0.22em] text-dim">{label}</span>
      <span className={cn('font-mono text-[max(12px,1.2cqw)] tracking-[0.06em]', tone === 'cyan' ? 'text-cyan' : tone === 'amber' ? 'text-amber' : 'text-white')}>{value}</span>
    </div>
  )
}

/** Places `n` hexes on an ellipse, the way the game scatters its HUD buttons around the view. */
export function ringStyle(n: number, i: number, width = 6): React.CSSProperties {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2
  return {
    position: 'absolute',
    width: `${width}%`,
    left: `calc(${50 + Math.cos(a) * 26}% - ${width / 2}%)`,
    top: `calc(${48 + Math.sin(a) * 30}% - ${width / 2}%)`,
  }
}

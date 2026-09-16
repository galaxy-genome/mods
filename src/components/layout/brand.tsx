import { cn } from '@/lib/utils'

export function Brand({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('flex flex-col gap-0.5 text-[13px] font-bold uppercase leading-tight tracking-[0.16em]', compact && 'text-[12px]')}>
        <span className="text-white">Galaxy Genome</span>
        <span className="text-cyan">Quest Editor</span>
      </div>
    </div>
  )
}

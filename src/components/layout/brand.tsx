import { Check, ChevronDown } from 'lucide-react'
import { Menu } from '@/components/ui/overlays'
import { t } from '@/i18n'
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

/** The brand as the product switcher shared by the Star Map, the Quest Editor, Loadouts and the wiki. The sibling
 * apps live next to this one on the same site, so their addresses are relative to it. */
export function BrandMenu({ compact, className }: { compact?: boolean; className?: string }) {
  const go = (path: string) => () => location.assign(new URL(path, location.origin + import.meta.env.BASE_URL).href)
  return (
    <Menu
      label={t('shell.switchProduct')}
      align="start"
      trigger={<button type="button" data-testid="brand-menu" className={cn('flex items-center gap-1 rounded-[2px] text-left hover:bg-white/[0.03]', className)}><Brand compact={compact} /><ChevronDown className="size-4 shrink-0 text-dim" /></button>}
      items={[
        { label: t('shell.starMap'), onSelect: go('../map/') },
        { label: t('shell.questEditor'), icon: <Check />, onSelect: () => {} },
        { label: t('shell.loadouts'), onSelect: go('../loadouts/') },
        { label: t('shell.wiki'), onSelect: go('../wiki/') },
      ]}
    />
  )
}

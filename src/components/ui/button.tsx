import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[2px] font-ui font-semibold transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border border-cyan bg-cyan/10 text-cyan hover:bg-cyan/20',
        solid: 'border border-cyan bg-cyan text-void hover:bg-white hover:border-white',
        secondary: 'border border-edge bg-chip text-white hover:border-grid-strong',
        destructive: 'border border-danger/70 bg-danger/10 text-danger hover:bg-danger/20',
        warning: 'border border-amber bg-amber/10 text-amber hover:bg-amber/20',
        ghost: 'text-ink hover:bg-white/5',
        text: 'px-1 text-cyan hover:text-white',
      },
      size: {
        md: 'h-11 px-4 text-[15px]',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-12 px-5 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'

export { buttonVariants }

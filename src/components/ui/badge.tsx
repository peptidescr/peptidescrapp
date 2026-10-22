import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-accent text-primary',
      muted: 'bg-muted text-muted-foreground',
      destructive: 'bg-destructive/15 text-destructive',
      outline: 'border border-border text-foreground',
      // "Earned", "+$15": green on a pale green.
      positive: 'bg-positive-lt text-positive',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

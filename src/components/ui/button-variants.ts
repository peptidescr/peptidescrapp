import { cva } from 'class-variance-authority'

/**
 * Split out from button.tsx (matches shadcn's own convention) so other
 * primitives — AlertDialog's Action/Cancel, which render Radix's own
 * elements rather than our <Button> — can reuse the exact same button look.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground active:bg-brand-primary-dk',
        secondary: 'bg-card text-foreground border border-border active:bg-secondary',
        ghost: 'bg-transparent text-primary active:bg-accent',
        danger: 'bg-transparent text-destructive border border-destructive active:bg-destructive/10',
        destructive: 'bg-destructive text-destructive-foreground active:opacity-90',
      },
      size: {
        default: 'min-h-11 px-4 text-base',
        sm: 'min-h-9 px-3 text-sm',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

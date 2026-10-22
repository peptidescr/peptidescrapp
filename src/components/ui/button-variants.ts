import { cva } from 'class-variance-authority'

/**
 * Split out from button.tsx (matches shadcn's own convention) so other
 * primitives — AlertDialog's Action/Cancel, which render Radix's own
 * elements rather than our <Button> — can reuse the exact same button look.
 *
 * The primary button is the approved design's: brand fill, 12px radius, a bold
 * label and an optional leading icon (drop an svg in as a child). `fullWidth`
 * stretches it across its card ("Reorder · $272.85"). `attention` is the one
 * loud colour (the compact "Redeem" button) and `locked` its unavailable
 * counterpart; use `locked` together with `disabled`.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground active:bg-brand-primary-dk',
        secondary: 'bg-card text-foreground border border-border active:bg-secondary',
        tint: 'bg-secondary text-primary active:bg-accent',
        ghost: 'bg-transparent text-primary active:bg-accent',
        danger: 'bg-transparent text-destructive border border-destructive active:bg-destructive/10',
        destructive: 'bg-destructive text-destructive-foreground active:opacity-90',
        attention: 'bg-attention text-attention-foreground active:bg-attention-dk',
        locked: 'bg-secondary text-muted-foreground disabled:opacity-100',
      },
      size: {
        // 48px: the approved primary button's height.
        default: 'min-h-12 px-5 text-base',
        // Both stay at the 44px touch-target floor.
        sm: 'min-h-11 px-3.5 text-sm',
        compact: 'min-h-11 px-4 text-sm',
        icon: 'size-11',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      fullWidth: false,
    },
  },
)

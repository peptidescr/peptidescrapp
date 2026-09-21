import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * The text input every screen was previously re-styling by hand — the exact
 * same class string was duplicated verbatim across the Calculator, the
 * protocol form, the history edit form and History's search box, which meant
 * a radius or focus-ring change had to be made in six places and inevitably
 * drifted. This is that string, once.
 *
 * `text-base` (16px) is not a style choice: anything smaller makes iOS Safari
 * zoom the viewport on focus, which on a one-handed dosing form is actively
 * hostile. Keep it.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-full border border-input bg-card px-4 text-base text-foreground',
        'placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  )
}

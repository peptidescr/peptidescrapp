import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * One selectable chip: a filter ("Taken"), a weekday, an injection site, a
 * template category. The same look as the calculator's preset chips (ChipGroup)
 * — brand-filled when selected, white with a hairline border otherwise, 44px
 * tall — for the places where chips wrap or scroll rather than share a row.
 * `aria-pressed` announces the selection.
 */
export function Chip({
  selected,
  className,
  ...props
}: { selected: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'min-h-11 rounded-xl border px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        selected
          ? 'border-primary bg-primary font-bold text-primary-foreground'
          : 'border-border bg-card font-semibold text-foreground active:bg-secondary',
        className,
      )}
      {...props}
    />
  )
}

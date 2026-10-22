import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A two-to-four way switch: one track, one selected option. It replaces the
 * hand-rolled versions that had grown separately in Protocols (tabs), Settings
 * (language) and the calculator — each a slightly different height, radius and
 * selected colour. It is also the segmented control of the approved design
 * ("Redeem / Tier perks", Track's "Today / Protocols / ...").
 *
 * The track is the soft tint and the selected option a white pill with
 * brand-coloured text, so a row of these doesn't shout louder than the real
 * primary action beside it. Buttons carry `aria-pressed`, so selection is
 * announced rather than colour-only. Options are equal width.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  ariaLabel?: string
  className?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex gap-1 rounded-xl bg-tint p-1', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-card font-bold text-primary shadow-sm' : 'font-semibold text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

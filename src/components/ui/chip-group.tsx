import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ChipOption<T extends string | number> {
  value: T
  label: ReactNode
  /** An accessible name when the label alone isn't enough ("2 mg"). */
  ariaLabel?: string
}

/**
 * A row of equal-width selectable chips: the calculator's presets (vial mass 2
 * / 5 / 10 / 15 / 50 mg). The selected chip is brand-filled, the rest white
 * with a hairline border; each is at least 44px tall and carries `aria-pressed`.
 *
 * Up to `perRow` chips share one line at equal widths; past that they wrap, and
 * the last line stretches to fill its row, so a trailing "Custom" chip becomes
 * a full-width one under the presets instead of a cramped sixth column.
 * `value` may be null when nothing is selected (a custom value is being used).
 */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  perRow = 5,
  className,
}: {
  options: ChipOption<T>[]
  value: T | null
  onChange: (value: T) => void
  ariaLabel?: string
  perRow?: number
  className?: string
}) {
  const basis = `calc((100% - ${(perRow - 1) * 0.5}rem) / ${perRow})`
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            style={{ flexBasis: basis }}
            className={cn(
              'min-h-11 min-w-0 grow rounded-xl border px-1 text-base transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary font-bold text-primary-foreground'
                : 'border-border bg-card font-semibold text-foreground active:bg-secondary',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A two-to-four way switch: one track, one selected option. It replaces the
 * hand-rolled versions that had grown separately in Protocols (tabs), Settings
 * (language, appearance) and the calculator — each a slightly different
 * height, radius and selected colour.
 *
 * The selected option is a soft tint of the accent rather than a solid fill,
 * so a row of these on a screen doesn't shout louder than the real primary
 * action beside it. Buttons carry `aria-pressed`, so selection is announced
 * rather than colour-only.
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
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex gap-1 rounded-full border border-border bg-card p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-9 min-w-0 flex-1 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-accent text-primary' : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

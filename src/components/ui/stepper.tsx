import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "- 5 +" on a tint pill: a quantity stepper (Your usual's vial counts). The two
 * buttons are 44px touch targets; the value is announced as it changes.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  decrementLabel,
  incrementLabel,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Accessible names for the two buttons ("Fewer BPC-157"). */
  decrementLabel: string
  incrementLabel: string
  className?: string
}) {
  const button =
    'flex size-11 shrink-0 items-center justify-center rounded-xl text-primary outline-none transition-colors active:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35'
  return (
    <div role="group" className={cn('inline-flex items-center rounded-xl bg-tint', className)}>
      <button
        type="button"
        aria-label={decrementLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={button}
      >
        <Minus className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-6 text-center font-display text-lg font-bold tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        aria-label={incrementLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={button}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

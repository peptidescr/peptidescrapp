import { cn } from '@/lib/utils'

/**
 * The thin determinate bar PeptIQ runs across the top of every onboarding
 * step, also used for Home's "N of M doses logged today".
 *
 * Deliberately not a Radix primitive: it's a div with a width, and pulling in
 * @radix-ui/react-progress would add a dependency for markup we'd write
 * anyway. The ARIA attributes below are what Radix would have given us.
 */
export function Progress({
  value,
  max = 100,
  className,
  label,
}: {
  value: number
  max?: number
  className?: string
  /** Accessible name — required, since a bare bar tells a screen reader nothing. */
  label: string
}) {
  const safeMax = max <= 0 ? 1 : max
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

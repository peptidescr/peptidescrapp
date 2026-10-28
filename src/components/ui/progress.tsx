import { cn } from '@/lib/utils'

/**
 * The thin determinate bar run across the top of every onboarding step, also
 * used for "N of M doses logged today". For the points ring and the tier track
 * see progress-ring.tsx and segmented-progress-track.tsx.
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
  variant = 'default',
}: {
  value: number
  max?: number
  className?: string
  /** Accessible name — required, since a bare bar tells a screen reader nothing. */
  label: string
  /** 'onBrand' is for use on the brand-coloured hero band: light fill on a translucent track. */
  variant?: 'default' | 'onBrand'
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
      className={cn(
        'w-full overflow-hidden rounded-full',
        variant === 'onBrand' ? 'h-2 bg-on-primary-tile' : 'h-1.5 bg-tint',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          variant === 'onBrand' ? 'bg-on-primary' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

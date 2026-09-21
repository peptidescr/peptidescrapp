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
  variant = 'default',
}: {
  value: number
  max?: number
  className?: string
  /** Accessible name — required, since a bare bar tells a screen reader nothing. */
  label: string
  /** 'onBrand' is for use on the blue Home hero: white fill on a translucent white track. */
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
        variant === 'onBrand' ? 'h-2 bg-white/20' : 'h-1.5 bg-border',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          variant === 'onBrand' ? 'bg-white' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

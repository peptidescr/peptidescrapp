import { cn } from '@/lib/utils'

/**
 * Progress across ascending stops where each gap is drawn the same width
 * however far apart the numbers are (Bench 0 -> Lab 1,500 -> Institute 5,000
 * is two equal halves): how far `value` is through the whole track, 0..1.
 */
export function segmentedProgress(value: number, thresholds: readonly number[]): number {
  if (thresholds.length < 2) return 0
  const last = thresholds.length - 1
  if (value <= thresholds[0]!) return 0
  if (value >= thresholds[last]!) return 1
  for (let i = 0; i < last; i++) {
    const from = thresholds[i]!
    const to = thresholds[i + 1]!
    if (value < to) return (i + (value - from) / (to - from)) / last
  }
  return 1
}

/**
 * A track with labelled stops under it ("Bench 0", "Lab 1,500", "Institute
 * 5,000"), a filled portion and a handle. `progress` is 0..1; compute it with
 * segmentedProgress when the stops aren't evenly spaced. Built for the hero
 * band (`onPrimary`) and usable on a card.
 */
export function SegmentedProgressTrack({
  stops,
  progress,
  ariaLabel,
  tone = 'onPrimary',
  className,
}: {
  stops: { label: string; detail?: string }[]
  progress: number
  ariaLabel: string
  tone?: 'default' | 'onPrimary'
  className?: string
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const pct = `${clamped * 100}%`
  const onPrimary = tone === 'onPrimary'
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={ariaLabel}
      className={cn('w-full', className)}
    >
      <div className="relative h-6">
        <div className={cn('absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full', onPrimary ? 'bg-on-primary-tile' : 'bg-tint')} />
        <div
          className={cn('absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full', onPrimary ? 'bg-on-primary' : 'bg-primary')}
          style={{ width: pct }}
        />
        <div
          className={cn(
            'absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm',
            onPrimary ? 'border-on-primary-muted bg-on-primary' : 'border-card bg-primary',
          )}
          style={{ left: `clamp(0.625rem, ${pct}, calc(100% - 0.625rem))` }}
        />
      </div>
      <ol className="mt-1.5 flex justify-between text-xs">
        {stops.map((stop, index) => (
          <li
            key={stop.label}
            className={cn(
              'flex flex-1 flex-col',
              index === 0 ? 'items-start text-left' : index === stops.length - 1 ? 'items-end text-right' : 'items-center text-center',
            )}
          >
            <span className={cn('font-bold', onPrimary ? 'text-on-primary' : 'text-foreground')}>{stop.label}</span>
            {stop.detail && <span className={onPrimary ? 'text-on-primary-muted' : 'text-muted-foreground'}>{stop.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

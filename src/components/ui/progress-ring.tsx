import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A ring that fills clockwise from the top, with room in the middle for a
 * label ("940 POINTS"). Part B feeds it the loyalty points; it is built now so
 * the look is settled. `value` is 0..1.
 */
export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  label,
  tone = 'default',
  children,
  className,
}: {
  value: number
  size?: number
  strokeWidth?: number
  /** Accessible name ("940 points, 63% of the way to Lab"). */
  label: string
  /** 'onPrimary' is for a brand-coloured surface: a light arc on a translucent track. */
  tone?: 'default' | 'onPrimary'
  children?: ReactNode
  className?: string
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={tone === 'onPrimary' ? 'stroke-on-primary-tile' : 'stroke-tint'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          className={cn('transition-[stroke-dasharray] duration-500', tone === 'onPrimary' ? 'stroke-accent-light' : 'stroke-primary')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

import { Check, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The small uppercase tier pill ("BENCH TIER"). `onPrimary` is for the
 * brand-coloured hero band, where it is a translucent tile; the default sits on
 * a card.
 */
export function TierBadge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: 'default' | 'onPrimary'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]',
        tone === 'onPrimary' ? 'bg-on-primary-tile text-on-primary' : 'bg-tint text-primary',
        className,
      )}
    >
      {children}
    </span>
  )
}

const STATUS_STYLES = {
  earned: 'bg-positive-lt text-positive',
  locked: 'bg-tint text-muted-foreground',
  info: 'bg-accent text-primary',
  pending: 'bg-brand-warn-lt text-brand-warn',
} as const

/**
 * A status pill: Earned (green on pale green, with a check), Locked (muted, with
 * a lock), an informational one ("2 to go"), or pending. The state is in the
 * words and the icon, never colour alone.
 */
export function StatusPill({
  status,
  children,
  className,
}: {
  status: keyof typeof STATUS_STYLES
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
        STATUS_STYLES[status],
        className,
      )}
    >
      {status === 'earned' && <Check aria-hidden className="size-3.5" />}
      {status === 'locked' && <Lock aria-hidden className="size-3" />}
      {children}
    </span>
  )
}

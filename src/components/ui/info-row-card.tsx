import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A tappable row card: an icon tile on the left, a title and a muted line, a
 * chevron on the right. It is the credit banner (a tinted card with a
 * brand-filled tile) and the calculator shortcut (a white card with a tinted
 * tile) of the approved Home screen.
 *
 * `tone` is the card, `iconTone` the tile: 'tint' + 'primary' is the banner,
 * 'card' + 'tint' the shortcut. Always a real button (or a link, with `href`),
 * at least 44px tall.
 */
export function InfoRowCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  href,
  tone = 'card',
  iconTone = 'tint',
  trailing,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  onClick?: () => void
  href?: string
  tone?: 'card' | 'tint'
  iconTone?: 'primary' | 'tint'
  /** Replaces the chevron (e.g. a badge). */
  trailing?: ReactNode
  className?: string
}) {
  const classes = cn(
    'flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
    tone === 'tint' ? 'bg-tint' : 'border border-border/60 bg-card shadow-card',
    className,
  )
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-xl',
          iconTone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-tint text-primary',
        )}
      >
        <Icon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-sm font-bold leading-snug text-foreground">{title}</span>
        {subtitle && <span className="text-xs leading-snug text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing ?? <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
    </>
  )
  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  )
}

import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * What a notice is about, which colours its icon tile (and its small status line):
 * - 'warn': something to plan for (a vial running low, a backup overdue), in the
 *   app's soft amber;
 * - 'info': a calm heads-up or invitation (a titration step, turn on reminders);
 * - 'due': a dose to take; 'missed': one that was due earlier.
 */
export type NoticeTone = 'warn' | 'info' | 'due' | 'missed'

const TILE: Record<NoticeTone, string> = {
  warn: 'bg-brand-warn-lt text-brand-warn',
  info: 'bg-tint text-primary',
  due: 'bg-tint text-primary',
  missed: 'bg-destructive/10 text-destructive',
}

const META: Record<NoticeTone, string> = {
  warn: 'text-brand-warn',
  info: 'text-primary',
  due: 'text-primary',
  missed: 'text-destructive',
}

/**
 * The one shape every notice in the app takes (Home's vial alerts and backup
 * nudge, Today's, and everything in the bell's panel): a card with an icon tile
 * coloured by tone, a small status line, a title and a muted line, then a
 * chevron when the row opens something. They used to be five different cards;
 * now they read as one list and sort themselves by the tile colour.
 *
 * `onClick` makes the text block a button (the 44px-tall tap target, with the
 * chevron). `trailing` sits beside it for a separate action (Reorder); `children`
 * go under the row, full width (Taken / Skipped, an Enable button).
 */
export function NoticeRow({
  icon: Icon,
  tone,
  title,
  subtitle,
  meta,
  onClick,
  trailing,
  children,
  className,
}: {
  icon: LucideIcon
  tone: NoticeTone
  title: ReactNode
  subtitle?: ReactNode
  /** A small coloured line above the title ("Missed · Today · 8:00 AM"). */
  meta?: ReactNode
  onClick?: () => void
  trailing?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const content = (
    <>
      <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TILE[tone])}>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {meta && <span className={cn('text-xs font-semibold leading-snug', META[tone])}>{meta}</span>}
        <span className="text-[14.5px] font-semibold leading-snug text-foreground">{title}</span>
        {subtitle && <span className="text-[12.5px] leading-snug text-muted-foreground">{subtitle}</span>}
      </span>
    </>
  )
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-3', className)}>
      <div className="flex items-center gap-2">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">{content}</div>
        )}
        {trailing}
      </div>
      {children}
    </div>
  )
}

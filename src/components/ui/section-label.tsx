import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small uppercase, letter-spaced, muted label that heads a section, with an
 * optional right-aligned muted note ("YOUR USUAL      Last ordered Sep 22").
 * Renders an <h2> so the page keeps a heading outline.
 */
export function SectionLabel({
  children,
  note,
  className,
}: {
  children: ReactNode
  note?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1', className)}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {note && <span className="shrink-0 text-xs text-muted-foreground">{note}</span>}
    </div>
  )
}

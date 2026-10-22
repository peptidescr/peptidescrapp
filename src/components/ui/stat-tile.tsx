import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A translucent tile for a dark, brand-coloured hero: a small label over a bold
 * value ("Concentration 2,500 mcg/mL", "Aliquots per vial 20"). The label takes
 * the light accent tone, as in the approved calculator.
 */
export function StatTile({
  label,
  value,
  className,
}: {
  label: ReactNode
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-on-primary-tile px-3 py-2.5', className)}>
      <p className="text-[11px] font-medium leading-tight text-accent-light">{label}</p>
      <p className="mt-1 whitespace-nowrap font-display text-base font-bold leading-tight tabular-nums text-on-primary">{value}</p>
    </div>
  )
}

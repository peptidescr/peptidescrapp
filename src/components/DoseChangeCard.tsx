import { isSameDay } from 'date-fns'
import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getCompoundById } from '../content/compounds'
import { formatDate } from '../lib/dates'
import type { DoseChangeItem } from '../lib/homeData'
import { formatDose } from '../lib/titration'

/**
 * A titration step about to change a protocol's dose (or changing it today),
 * on Home and in the bell panel. A planned change, not a problem, so it uses
 * the calm accent tint rather than the amber of vial alerts. Tapping it opens
 * the protocol, where the full step plan is.
 */
export function DoseChangeCard({
  item,
  now,
  onOpenProtocol,
}: {
  item: DoseChangeItem
  now: Date
  onOpenProtocol: (protocolId: string) => void
}) {
  const { t } = useTranslation()
  const { protocol, change } = item
  const name = protocol.name || getCompoundById(protocol.compoundId)?.name || ''
  const from = formatDose({ amount: change.from, unit: change.unit })
  const to = formatDose({ amount: change.to, unit: change.unit })
  const Icon = change.to >= change.from ? TrendingUp : TrendingDown

  return (
    <button
      type="button"
      onClick={() => onOpenProtocol(protocol.id)}
      className="flex min-h-11 w-full items-start gap-2 rounded-2xl bg-accent px-4 py-3 text-left text-sm text-foreground"
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        {isSameDay(change.on, now)
          ? t('doseChange.today', { name, from, to })
          : t('doseChange.upcoming', { name, from, to, date: formatDate(change.on) })}
      </span>
      <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

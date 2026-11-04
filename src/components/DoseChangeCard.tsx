import { isSameDay } from 'date-fns'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NoticeRow } from '@/components/ui/notice-row'
import { getCompoundById } from '../content/compounds'
import { formatDate } from '../lib/dates'
import type { DoseChangeItem } from '../lib/homeData'
import { formatDose } from '../lib/titration'

/**
 * A titration step about to change a protocol's dose (or changing it today),
 * on Home, in Today and in the bell panel. A planned change, not a problem, so
 * it takes the calm 'info' tone rather than the amber of vial alerts. Tapping
 * it opens the protocol, where the full step plan is.
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

  return (
    <NoticeRow
      icon={change.to >= change.from ? TrendingUp : TrendingDown}
      tone="info"
      title={
        isSameDay(change.on, now)
          ? t('doseChange.today', { name, from, to })
          : t('doseChange.upcoming', { name, from, to, date: formatDate(change.on) })
      }
      onClick={() => onOpenProtocol(protocol.id)}
    />
  )
}

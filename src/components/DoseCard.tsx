import { isSameDay, subDays } from 'date-fns'
import { Check, Clock3, Syringe, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import type { DoseLog, Protocol } from '../lib/db'
import { logProtocolDose } from '../lib/doseLog'
import { computeStreakDays, loggedTimesFor, type DueItem } from '../lib/homeData'

export function LogButtons({
  protocol,
  administeredAt,
}: {
  protocol: Protocol
  /**
   * Fixed timestamp to log against — pass the occurrence's own scheduledAt
   * for something already due (Catch up). Omit it to log against the actual
   * moment of the tap instead, which is what "logging ahead of schedule"
   * (e.g. Home's Next up card) means: taken/skipped *now*, not at its future
   * reminder time.
   */
  administeredAt?: Date
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function handle(status: 'taken' | 'skipped') {
    setBusy(true)
    try {
      await logProtocolDose(protocol, status, administeredAt ?? new Date())
      toast.success(status === 'taken' ? t('home.toastTaken') : t('home.toastSkipped'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => handle('taken')} className="flex-1">
        <Check className="size-4" />
        {t('home.logTaken')}
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => handle('skipped')} className="flex-1">
        <X className="size-4" />
        {t('home.logSkipped')}
      </Button>
    </div>
  )
}

/**
 * Shared body for every due/upcoming dose card — Home's Catch-up and Next-up
 * sections, and the notification panel — styled to match PeptIQ's upcoming-
 * dose card layout: a colored status line + time pill, icon + name, dose
 * line, a three-stat row (total logs / last 7 days / day streak, all derived
 * from this protocol's own dose logs), the log/skip actions, and a link out
 * to the protocol. We don't carry over PeptIQ's injection-site line or
 * "reschedule in calendar" (no site rotation or calendar view in this app —
 * see HANDOVER.md's "not in this build" list).
 */
export function DoseCardBody({
  statusLabel,
  statusClassName,
  time,
  protocol,
  compoundName,
  doseLogs,
  now,
  showActions,
  administeredAt,
  onNavigateToProtocols,
}: {
  statusLabel: string
  statusClassName: string
  time: Date
  protocol: Protocol
  compoundName: string | undefined
  doseLogs: DoseLog[]
  now: Date
  showActions: boolean
  administeredAt?: Date
  onNavigateToProtocols: () => void
}) {
  const { t } = useTranslation()
  const protocolLogTimes = loggedTimesFor(protocol, doseLogs)
  const sevenDaysAgo = subDays(now, 7)
  const totalLogs = protocolLogTimes.length
  const logs7d = protocolLogTimes.filter((d) => d >= sevenDaysAgo).length
  const dayStreak = computeStreakDays(now, protocolLogTimes)

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${statusClassName}`}>{statusLabel}</p>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">
          <Clock3 className="size-3" />
          {formatTime(time)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Syringe className="size-4 text-primary" />
        </span>
        <div>
          <p className="font-medium text-foreground">{protocol.name || compoundName}</p>
          <p className="text-sm text-muted-foreground">
            {protocol.doseAmount} {protocol.doseUnit} · {t(`route.${protocol.route}`)}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-t border-border pt-3 text-center">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{totalLogs}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('home.statTotalLogs')}</p>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{logs7d}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('home.statLogs7d')}</p>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{dayStreak}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('home.statDayStreak')}</p>
        </div>
      </div>

      {showActions && <LogButtons protocol={protocol} administeredAt={administeredAt} />}

      <button type="button" onClick={onNavigateToProtocols} className="min-h-11 self-center text-xs text-primary">
        {t('home.viewProtocol')} →
      </button>
    </>
  )
}

/** A due or missed occurrence, rendered identically wherever it shows up (Home, notification panel). */
export function DueCard({
  item,
  doseLogs,
  now,
  onNavigateToProtocols,
}: {
  item: DueItem
  doseLogs: DoseLog[]
  now: Date
  onNavigateToProtocols: () => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(item.protocol.compoundId)
  const dayWord = isSameDay(item.occurrence.scheduledAt, now) ? t('home.today') : formatDate(item.occurrence.scheduledAt)
  const label = item.isMissed ? t('home.missedLabel') : t('home.dueLabel')

  return (
    <Card
      className={`flex flex-col gap-3 border-l-4 p-4 ${
        item.isMissed ? 'border-l-destructive shadow-[0_0_24px_-8px_var(--destructive)]' : 'border-l-primary'
      }`}
    >
      <DoseCardBody
        statusLabel={`${label} · ${dayWord}`}
        statusClassName={item.isMissed ? 'text-destructive' : 'text-primary'}
        time={item.occurrence.scheduledAt}
        protocol={item.protocol}
        compoundName={compound?.name}
        doseLogs={doseLogs}
        now={now}
        showActions
        administeredAt={item.occurrence.scheduledAt}
        onNavigateToProtocols={onNavigateToProtocols}
      />
    </Card>
  )
}

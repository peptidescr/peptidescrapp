import { addDays, isSameDay, subDays } from 'date-fns'
import { AlertTriangle, Bell, Check, ClipboardList, Clock3, Flame, Syringe, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '../components/EmptyState'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import { db, type DoseLog, type Protocol } from '../lib/db'
import { logProtocolDose } from '../lib/doseLog'
import { getNotificationCapability } from '../lib/notifications'
import { getDueOccurrences, getNextOccurrence, type Occurrence, type ScheduleContext } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import { useSettings } from '../lib/useSettings'

const BACKUP_NUDGE_DAYS = 14
const MISSED_THRESHOLD_HOURS = 12

interface DueItem {
  protocol: Protocol
  occurrence: Occurrence
  isMissed: boolean
}

function contextOf(protocol: Protocol): ScheduleContext {
  return {
    schedule: protocol.schedule,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    reminderTimes: protocol.reminderTimes,
  }
}

function loggedTimesFor(protocol: Protocol, doseLogs: DoseLog[]): Date[] {
  return doseLogs.filter((log) => log.protocolId === protocol.id).map((log) => new Date(log.administeredAt))
}

/**
 * Consecutive calendar days, ending today, with at least one dose log —
 * "logged something" (taken or skipped both count), not "took every dose".
 * If nothing's logged yet today, today doesn't break an existing streak from
 * yesterday — it just doesn't add to it until something is logged.
 */
function computeStreakDays(now: Date, loggedAt: Date[]): number {
  if (loggedAt.length === 0) return 0
  let cursor = now
  if (!loggedAt.some((d) => isSameDay(d, cursor))) {
    cursor = addDays(cursor, -1)
  }
  let streak = 0
  while (loggedAt.some((d) => isSameDay(d, cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Time-of-day greeting — no name/account to personalize with, just the hour. */
function greetingKey(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 19) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

function formatCountdown(
  now: Date,
  target: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return t('home.dueNow')
  const totalMinutes = Math.round(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return t('home.inMinutes', { minutes })
  return t('home.inHoursMinutes', { hours, minutes })
}

interface HomeScreenProps {
  onNavigateToSettings: () => void
  onNavigateToProtocols: () => void
  onNavigateToHistory: () => void
}

export function HomeScreen({ onNavigateToSettings, onNavigateToProtocols, onNavigateToHistory }: HomeScreenProps) {
  const { t } = useTranslation()
  const settings = useSettings()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const activeProtocols = useMemo(() => (protocols ?? []).filter((p) => p.isActive), [protocols])

  const dosesTodayCount = useMemo(
    () => (doseLogs ?? []).filter((log) => isSameDay(new Date(log.administeredAt), now)).length,
    [doseLogs, now],
  )

  const overallStreak = useMemo(
    () => computeStreakDays(now, (doseLogs ?? []).map((log) => new Date(log.administeredAt))),
    [doseLogs, now],
  )

  const dueItems: DueItem[] = useMemo(() => {
    if (!doseLogs) return []
    const items: DueItem[] = []
    for (const protocol of activeProtocols) {
      const ctx = contextOf(protocol)
      const loggedTimes = loggedTimesFor(protocol, doseLogs)
      for (const occurrence of getDueOccurrences(ctx, now, loggedTimes)) {
        const hoursAgo = (now.getTime() - occurrence.scheduledAt.getTime()) / 3_600_000
        items.push({ protocol, occurrence, isMissed: hoursAgo > MISSED_THRESHOLD_HOURS })
      }
    }
    items.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())
    return items
  }, [activeProtocols, doseLogs, now])

  // Depends on doseLogs (not just the schedule) so that logging an upcoming
  // dose early from the "Next up" card is actually reflected here — otherwise
  // the same occurrence would keep showing as next until real time caught up
  // to its scheduled slot, making the log buttons look broken.
  const nextUp = useMemo(() => {
    if (!doseLogs) return null
    let soonest: { protocol: Protocol; occurrence: Occurrence } | null = null
    for (const protocol of activeProtocols) {
      const loggedTimes = loggedTimesFor(protocol, doseLogs)
      const next = getNextOccurrence(contextOf(protocol), now, loggedTimes)
      if (next && (!soonest || next.scheduledAt < soonest.occurrence.scheduledAt)) {
        soonest = { protocol, occurrence: next }
      }
    }
    return soonest
  }, [activeProtocols, doseLogs, now])

  // Only nudge once there's actually something worth losing — a brand-new
  // install with zero protocols/logs doesn't need a backup yet.
  const hasData = (protocols?.length ?? 0) > 0 || (doseLogs?.length ?? 0) > 0
  const showBackupNudge =
    hasData &&
    (!settings?.lastBackupAt ||
      (now.getTime() - new Date(settings.lastBackupAt).getTime()) / (24 * 3_600_000) > BACKUP_NUDGE_DAYS)

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
      <HeroHeader
        now={now}
        activeCount={activeProtocols.length}
        dosesTodayCount={dosesTodayCount}
        onOpenNotifications={onNavigateToSettings}
      />

      {overallStreak > 0 && <StreakCard days={overallStreak} onViewHistory={onNavigateToHistory} />}

      {showBackupNudge && (
        <button
          type="button"
          onClick={onNavigateToSettings}
          className="flex min-h-11 items-start gap-2 rounded-2xl border border-brand-warn bg-brand-warn-lt px-4 py-3 text-left text-sm text-brand-warn"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('home.backupNudge')}
        </button>
      )}

      {dueItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('home.catchUpTitle')}
          </h2>
          <AnimatePresence initial={false}>
            {dueItems.map((item) => (
              <motion.div
                key={`${item.protocol.id}-${item.occurrence.scheduledAt.toISOString()}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <DueCard item={item} doseLogs={doseLogs ?? []} now={now} onNavigateToProtocols={onNavigateToProtocols} />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('home.nextUpTitle')}
        </h2>
        {nextUp ? (
          <NextUpCard
            protocol={nextUp.protocol}
            occurrence={nextUp.occurrence}
            doseLogs={doseLogs ?? []}
            now={now}
            onNavigateToProtocols={onNavigateToProtocols}
          />
        ) : (
          <EmptyState icon={Clock3} title={t('home.noUpcomingTitle')} body={t('home.noUpcomingBody')} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('home.activeProtocolsTitle')}
        </h2>
        {activeProtocols.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t('home.noProtocolsTitle')}
            body={t('home.noProtocolsBody')}
          />
        ) : (
          activeProtocols.map((protocol) => <ActiveProtocolRow key={protocol.id} protocol={protocol} />)
        )}
      </section>
    </div>
  )
}

/**
 * The app's one branded moment on Home — small logo + name, then the
 * greeting (with a notification shortcut alongside it, PeptIQ-style), then
 * an at-a-glance stat row — set apart from the scrollable content below
 * with its own card surface rather than floating on the bare page
 * background.
 */
function HeroHeader({
  now,
  activeCount,
  dosesTodayCount,
  onOpenNotifications,
}: {
  now: Date
  activeCount: number
  dosesTodayCount: number
  onOpenNotifications: () => void
}) {
  const { t } = useTranslation()
  // Same condition Settings uses to offer the "enable notifications" button —
  // a small dot here means there's something to act on, not an unread count
  // we don't actually have (no in-app notification inbox exists to count).
  const capability = getNotificationCapability()
  const notificationsNeedAttention =
    capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default'

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <img src="/brand/icon-192.png" alt="" className="size-6 rounded-lg" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">peptidescr</span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatDate(now)}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t(greetingKey(now))}</h1>
        </div>
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={t('settings.notifications')}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-foreground"
        >
          <Bell className="size-4" />
          {notificationsNeedAttention && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-warn" />
          )}
        </button>
      </div>

      <div className="mt-4 flex gap-4 border-t border-border pt-4">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
            <ClipboardList className="size-4 text-primary" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight text-foreground">{activeCount}</p>
            <p className="text-xs leading-tight text-muted-foreground">{t('home.statActiveProtocols')}</p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
            <Syringe className="size-4 text-primary" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight text-foreground">{dosesTodayCount}</p>
            <p className="text-xs leading-tight text-muted-foreground">{t('home.statDosesToday')}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

/**
 * PeptIQ-style streak card, in our own blue rather than their gold — a
 * deliberate deviation from the earlier "no streak language" design pass
 * (see NOTES.md), added at the client's direct request. Kept factual
 * ("you've logged N days in a row") rather than motivational framing, to
 * stay on the right side of a record-keeping app that must never nudge
 * someone toward a dose.
 */
function StreakCard({ days, onViewHistory }: { days: number; onViewHistory: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col gap-1 border-primary/30 bg-accent p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Flame className="size-4 text-brand-warn" />
        {t('home.streakTitle', { count: days })}
      </p>
      <p className="text-sm text-muted-foreground">{t('home.streakBody', { count: days })}</p>
      <button type="button" onClick={onViewHistory} className="mt-1 min-h-11 self-start text-sm font-medium text-primary">
        {t('home.streakCta')} →
      </button>
    </Card>
  )
}

function LogButtons({
  protocol,
  administeredAt,
}: {
  protocol: Protocol
  /**
   * Fixed timestamp to log against — pass the occurrence's own scheduledAt
   * for something already due (Catch up). Omit it to log against the actual
   * moment of the tap instead, which is what "logging ahead of schedule"
   * from the Next up card means: taken/skipped *now*, not at its future
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
 * Shared body for both the Catch up and Next up cards, styled to match
 * PeptIQ's upcoming-dose card layout: a colored status line + time pill,
 * icon + name, dose line, a three-stat row (total logs / last 7 days / day
 * streak, all derived from this protocol's own dose logs), the log/skip
 * actions, and a link out to the protocol. We don't carry over PeptIQ's
 * injection-site line or "reschedule in calendar" (no site rotation or
 * calendar view in this app — see HANDOVER.md's "not in this build" list).
 */
function DoseCardBody({
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

      <button
        type="button"
        onClick={onNavigateToProtocols}
        className="min-h-11 self-center text-xs text-primary"
      >
        {t('home.viewProtocol')} →
      </button>
    </>
  )
}

function DueCard({
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

function NextUpCard({
  protocol,
  occurrence,
  doseLogs,
  now,
  onNavigateToProtocols,
}: {
  protocol: Protocol
  occurrence: Occurrence
  doseLogs: DoseLog[]
  now: Date
  onNavigateToProtocols: () => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  // One-tap logging here means "ahead of schedule, right now" — that only
  // makes sense while the occurrence is still today. For a dose several days
  // out (a weekly/every-N-days/cycling protocol between reminders), logging
  // it "now" would date-mismatch against its actual scheduled day and the
  // card would never register it as fulfilled — so the buttons are withheld
  // until the day itself, rather than appearing to work but silently not
  // updating anything. See NOTES.md.
  const canLogToday = isSameDay(occurrence.scheduledAt, now)
  const dayWord = canLogToday ? t('home.today') : formatDate(occurrence.scheduledAt)

  return (
    <Card className="flex flex-col gap-3 border-l-4 border-l-primary p-4">
      <DoseCardBody
        statusLabel={`${t('home.upcomingLabel')} · ${dayWord} · ${formatCountdown(now, occurrence.scheduledAt, t)}`}
        statusClassName="text-primary"
        time={occurrence.scheduledAt}
        protocol={protocol}
        compoundName={compound?.name}
        doseLogs={doseLogs}
        now={now}
        showActions={canLogToday}
        onNavigateToProtocols={onNavigateToProtocols}
      />
    </Card>
  )
}

function ActiveProtocolRow({ protocol }: { protocol: Protocol }) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  return (
    <Card className="p-4">
      <p className="font-medium text-foreground">{protocol.name || compound?.name}</p>
      <p className="text-sm text-muted-foreground">
        {compound?.name} · {protocol.doseAmount} {protocol.doseUnit} · {t(`schedule.${protocol.schedule.kind}`)}
      </p>
    </Card>
  )
}

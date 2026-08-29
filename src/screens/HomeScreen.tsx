import { isSameDay } from 'date-fns'
import { AlertTriangle, Bell, ClipboardList, Clock3, Flame, Syringe } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { DoseCardBody, DueCard } from '../components/DoseCard'
import { EmptyState } from '../components/EmptyState'
import { NotificationPanel } from '../components/NotificationPanel'
import { getCompoundById } from '../content/compounds'
import { formatDate } from '../lib/dates'
import { db, type DoseLog, type Protocol } from '../lib/db'
import {
  computeDueItems,
  computeShowBackupNudge,
  computeStreakDays,
  contextOf,
  loggedTimesFor,
} from '../lib/homeData'
import { getNotificationCapability } from '../lib/notifications'
import { getNextOccurrence, type Occurrence } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import { useSettings } from '../lib/useSettings'

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
  const [notificationsOpen, setNotificationsOpen] = useState(false)

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

  const dueItems = useMemo(() => computeDueItems(protocols ?? [], doseLogs ?? [], now), [protocols, doseLogs, now])

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

  const showBackupNudge = useMemo(
    () => computeShowBackupNudge(protocols ?? [], doseLogs ?? [], settings, now),
    [protocols, doseLogs, settings, now],
  )

  // Same signals the notification panel itself uses to decide what to show —
  // kept in lockstep so the bell's badge count always matches what's actually
  // inside the panel it opens.
  const capability = getNotificationCapability()
  const notifNudgeCount = capability.supported && (capability.requiresInstallOnIOS || capability.permission === 'default') ? 1 : 0
  const notificationCount = dueItems.length + (showBackupNudge ? 1 : 0) + notifNudgeCount

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
      <HeroHeader
        now={now}
        activeCount={activeProtocols.length}
        dosesTodayCount={dosesTodayCount}
        notificationCount={notificationCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      <NotificationPanel
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        protocols={protocols ?? []}
        doseLogs={doseLogs ?? []}
        settings={settings}
        now={now}
        onNavigateToSettings={onNavigateToSettings}
        onNavigateToProtocols={onNavigateToProtocols}
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
  notificationCount,
  onOpenNotifications,
}: {
  now: Date
  activeCount: number
  dosesTodayCount: number
  notificationCount: number
  onOpenNotifications: () => void
}) {
  const { t } = useTranslation()
  const badgeText = notificationCount > 9 ? '9+' : String(notificationCount)

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
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-warn px-1 text-[10px] font-semibold leading-none text-white">
              {badgeText}
            </span>
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

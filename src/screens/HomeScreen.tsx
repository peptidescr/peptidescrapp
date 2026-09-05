import { isSameDay } from 'date-fns'
import {
  AlertTriangle,
  Bell,
  Calculator as CalculatorIcon,
  Check,
  ClipboardList,
  Clock3,
  Flame,
  History as HistoryIcon,
  Plus,
  Syringe,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { DoseCardBody, DueCard } from '../components/DoseCard'
import { EmptyState } from '../components/EmptyState'
import { NotificationPanel } from '../components/NotificationPanel'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import { db, type DoseLog, type Protocol } from '../lib/db'
import {
  computeDueItems,
  computeGetStartedSteps,
  computeRecentActivity,
  computeShowBackupNudge,
  computeStreakDays,
  computeTodayProgress,
  computeTodayStatus,
  computeUpcoming,
  type GetStartedStepId,
  type TodayStatus,
} from '../lib/homeData'
import { getNotificationCapability } from '../lib/notifications'
import type { Occurrence } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import { updateSettings, useSettings } from '../lib/useSettings'

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
  onNavigateToCalculator: () => void
}

export function HomeScreen({
  onNavigateToSettings,
  onNavigateToProtocols,
  onNavigateToHistory,
  onNavigateToCalculator,
}: HomeScreenProps) {
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

  const todayProgress = useMemo(
    () => computeTodayProgress(protocols ?? [], doseLogs ?? [], now),
    [protocols, doseLogs, now],
  )
  const todayStatus = useMemo(() => computeTodayStatus(todayProgress), [todayProgress])

  // The whole "up next" queue, not just the single soonest — Home shows one
  // card per active protocol so a second protocol isn't invisible until the
  // first one's dose is logged.
  const upcoming = useMemo(
    () => computeUpcoming(protocols ?? [], doseLogs ?? [], now),
    [protocols, doseLogs, now],
  )

  const recentActivity = useMemo(() => computeRecentActivity(doseLogs ?? []), [doseLogs])

  const getStartedSteps = useMemo(
    () => computeGetStartedSteps(protocols ?? [], doseLogs ?? [], settings),
    [protocols, doseLogs, settings],
  )
  const showGetStarted =
    protocols !== undefined &&
    !settings?.getStartedDismissedAt &&
    getStartedSteps.some((step) => !step.done)

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
        todayProgress={todayProgress}
        todayStatus={todayStatus}
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

      <QuickActions
        onNavigateToProtocols={onNavigateToProtocols}
        onNavigateToHistory={onNavigateToHistory}
        onNavigateToCalculator={onNavigateToCalculator}
      />

      {showGetStarted && (
        <GetStartedChecklist
          steps={getStartedSteps}
          onNavigateToProtocols={onNavigateToProtocols}
          onNavigateToSettings={onNavigateToSettings}
          onNavigateToCalculator={onNavigateToCalculator}
          onDismiss={() => void updateSettings({ getStartedDismissedAt: new Date().toISOString() })}
        />
      )}

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
          <SectionTitle>{t('home.catchUpTitle')}</SectionTitle>
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
        <SectionTitle>{t('home.nextUpTitle')}</SectionTitle>
        {upcoming.length > 0 ? (
          <UpNextCarousel
            items={upcoming}
            doseLogs={doseLogs ?? []}
            now={now}
            onNavigateToProtocols={onNavigateToProtocols}
          />
        ) : (
          <EmptyState icon={Clock3} title={t('home.noUpcomingTitle')} body={t('home.noUpcomingBody')} />
        )}
      </section>

      {recentActivity.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{t('home.recentActivityTitle')}</SectionTitle>
            <button type="button" onClick={onNavigateToHistory} className="min-h-11 text-xs text-primary">
              {t('home.recentActivitySeeAll')} →
            </button>
          </div>
          <Card className="divide-y divide-border">
            {recentActivity.map((log) => (
              <RecentActivityRow key={log.id} log={log} onOpen={onNavigateToHistory} />
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('home.activeProtocolsTitle')}</SectionTitle>
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

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
  )
}

/**
 * The app's one branded moment on Home — small logo + name, the greeting with
 * a notification shortcut alongside it, then today's state: a one-line status,
 * a progress bar, and the at-a-glance stat row.
 *
 * The status line and the bar are computed together in a single pass
 * (computeTodayProgress) precisely so they can't contradict each other — a bar
 * reading 2/3 under a line saying "all caught up" is the kind of small
 * inconsistency that makes people stop trusting the numbers.
 */
function HeroHeader({
  now,
  activeCount,
  dosesTodayCount,
  notificationCount,
  todayProgress,
  todayStatus,
  onOpenNotifications,
}: {
  now: Date
  activeCount: number
  dosesTodayCount: number
  notificationCount: number
  todayProgress: { completed: number; total: number }
  todayStatus: TodayStatus
  onOpenNotifications: () => void
}) {
  const { t } = useTranslation()
  const badgeText = notificationCount > 9 ? '9+' : String(notificationCount)

  let statusText: string
  let statusClass = 'text-muted-foreground'
  switch (todayStatus.kind) {
    case 'none':
      statusText = t('home.statusNone')
      break
    case 'allDone':
      statusText = t('home.statusAllDone')
      statusClass = 'text-primary'
      break
    case 'overdue':
      statusText = t('home.statusOverdue', { count: todayStatus.count })
      statusClass = 'text-destructive'
      break
    case 'upcoming':
      statusText = t('home.statusUpcoming', { time: formatTime(todayStatus.at) })
      break
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <img src="/brand/icon-192.png" alt="" className="size-6 rounded-lg" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">peptidescr</span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatDate(now)}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{t(greetingKey(now))}</h1>
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

      <p className={`mt-2 text-sm font-medium ${statusClass}`}>{statusText}</p>

      {todayProgress.total > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <Progress
            value={todayProgress.completed}
            max={todayProgress.total}
            label={t('home.todayProgress', {
              completed: todayProgress.completed,
              total: todayProgress.total,
            })}
          />
          <p className="text-xs text-muted-foreground">
            {t('home.todayProgress', {
              completed: todayProgress.completed,
              total: todayProgress.total,
            })}
          </p>
        </div>
      )}

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
 * PeptIQ keeps a row of one-tap shortcuts on Home. Ours are pure navigation —
 * deliberately not a "log a dose" button, because logging outside a schedule
 * has no form to open yet; the due cards above already cover logging what's
 * actually scheduled.
 */
function QuickActions({
  onNavigateToProtocols,
  onNavigateToHistory,
  onNavigateToCalculator,
}: {
  onNavigateToProtocols: () => void
  onNavigateToHistory: () => void
  onNavigateToCalculator: () => void
}) {
  const { t } = useTranslation()
  const actions = [
    { icon: Plus, label: t('home.quickNewProtocol'), onClick: onNavigateToProtocols },
    { icon: CalculatorIcon, label: t('home.quickCalculator'), onClick: onNavigateToCalculator },
    { icon: HistoryIcon, label: t('home.quickHistory'), onClick: onNavigateToHistory },
  ]

  return (
    <div className="flex gap-2">
      {actions.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 text-center"
        >
          <Icon className="size-5 text-primary" />
          <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * First-run checklist. Only rendered while something is still outstanding and
 * the user hasn't dismissed it, so it disappears on its own rather than
 * becoming permanent furniture.
 */
function GetStartedChecklist({
  steps,
  onNavigateToProtocols,
  onNavigateToSettings,
  onNavigateToCalculator,
  onDismiss,
}: {
  steps: { id: GetStartedStepId; done: boolean }[]
  onNavigateToProtocols: () => void
  onNavigateToSettings: () => void
  onNavigateToCalculator: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const doneCount = steps.filter((s) => s.done).length

  const targets: Record<GetStartedStepId, () => void> = {
    createProtocol: onNavigateToProtocols,
    logDose: onNavigateToProtocols,
    tryCalculator: onNavigateToCalculator,
    backUp: onNavigateToSettings,
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-foreground">{t('home.getStartedTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('home.getStartedProgress', { done: doneCount, total: steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('home.getStartedDismiss')}
          className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={step.done ? undefined : targets[step.id]}
              disabled={step.done}
              className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  step.done ? 'border-primary bg-primary' : 'border-border'
                }`}
              >
                {step.done && <Check className="size-4 text-primary-foreground" />}
              </span>
              <span className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {t(`home.getStarted_${step.id}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * A horizontally snapping row of upcoming doses when there's more than one,
 * matching PeptIQ's swipeable "Up Next". A single upcoming dose renders as a
 * plain card — a carousel of one is just a card with a pointless dot under it.
 */
function UpNextCarousel({
  items,
  doseLogs,
  now,
  onNavigateToProtocols,
}: {
  items: { protocol: Protocol; occurrence: Occurrence }[]
  doseLogs: DoseLog[]
  now: Date
  onNavigateToProtocols: () => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  if (items.length === 1) {
    const only = items[0]!
    return (
      <NextUpCard
        protocol={only.protocol}
        occurrence={only.occurrence}
        doseLogs={doseLogs}
        now={now}
        onNavigateToProtocols={onNavigateToProtocols}
      />
    )
  }

  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    // Card width plus the gap; rounding gives the nearest settled slide even
    // mid-momentum, which is what the dots should reflect.
    const slide = el.clientWidth
    setActiveIndex(Math.round(el.scrollLeft / (slide || 1)))
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ protocol, occurrence }) => (
          <div
            key={`${protocol.id}-${occurrence.scheduledAt.toISOString()}`}
            className="w-[calc(100vw-2rem)] shrink-0 snap-center sm:w-full"
          >
            <NextUpCard
              protocol={protocol}
              occurrence={occurrence}
              doseLogs={doseLogs}
              now={now}
              onNavigateToProtocols={onNavigateToProtocols}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {items.map((item, i) => (
          <span
            key={`${item.protocol.id}-dot`}
            className={`h-1.5 rounded-full transition-all ${
              i === activeIndex ? 'w-4 bg-primary' : 'w-1.5 bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/** One row of the Home "recent activity" peek — the full record lives in History. */
function RecentActivityRow({ log, onOpen }: { log: DoseLog; onOpen: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(log.compoundId)
  const administeredAt = new Date(log.administeredAt)

  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center gap-3 p-3 text-left">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
        <Syringe className="size-4 text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {compound?.name ?? t('history.unknownCompound')}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(administeredAt)} · {formatTime(administeredAt)}
        </span>
      </span>
      <span
        className={`shrink-0 text-xs font-medium ${
          log.status === 'taken' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {t(`history.status.${log.status}`)}
      </span>
    </button>
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

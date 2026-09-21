import { isSameDay } from 'date-fns'
import { AlertTriangle, Bell, Check, ChevronRight, ClipboardList, Clock3, Flame, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DoseCard, DueCard } from '../components/DoseCard'
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
    <div className="flex flex-col gap-7 px-4 pb-6 pt-2">
      <HeroHeader
        now={now}
        notificationCount={notificationCount}
        todayProgress={todayProgress}
        todayStatus={todayStatus}
        streakDays={overallStreak}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenHistory={onNavigateToHistory}
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
                <DueCard item={item} now={now} onNavigateToProtocols={onNavigateToProtocols} />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}

      {protocols !== undefined && activeProtocols.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('home.noProtocolsTitle')}
          body={t('home.noProtocolsBody')}
          action={
            <Button onClick={onNavigateToProtocols} className="mt-1">
              <Plus />
              {t('home.quickNewProtocol')}
            </Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionTitle>{t('home.nextUpTitle')}</SectionTitle>
          {upcoming.length > 0 ? (
            upcoming.map(({ protocol, occurrence }) => (
              <NextUpCard
                key={`${protocol.id}-${occurrence.scheduledAt.toISOString()}`}
                protocol={protocol}
                occurrence={occurrence}
                now={now}
                onNavigateToProtocols={onNavigateToProtocols}
              />
            ))
          ) : (
            <EmptyState icon={Clock3} title={t('home.noUpcomingTitle')} body={t('home.noUpcomingBody')} />
          )}
        </section>
      )}

      {showGetStarted && (
        <GetStartedChecklist
          steps={getStartedSteps}
          onNavigateToProtocols={onNavigateToProtocols}
          onNavigateToSettings={onNavigateToSettings}
          onNavigateToCalculator={onNavigateToCalculator}
          onDismiss={() => void updateSettings({ getStartedDismissedAt: new Date().toISOString() })}
        />
      )}

      {showBackupNudge && (
        <button
          type="button"
          onClick={onNavigateToSettings}
          className="flex min-h-11 items-start gap-2 rounded-2xl border border-brand-warn/60 bg-brand-warn-lt px-4 py-3 text-left text-sm text-brand-warn"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('home.backupNudge')}
        </button>
      )}

      {recentActivity.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{t('home.recentActivityTitle')}</SectionTitle>
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="-mr-2 flex min-h-11 items-center gap-0.5 rounded-full pl-3 pr-2 text-sm font-medium text-primary"
            >
              {t('home.recentActivitySeeAll')}
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Card className="divide-y divide-border">
            {recentActivity.map((log) => (
              <RecentActivityRow key={log.id} log={log} onOpen={onNavigateToHistory} />
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>
}

/**
 * The molecule glyph from the logo — three nodes on a rising chain — drawn as
 * a faint watermark so the hero reads as the brand's own surface without
 * adding a single element the user has to parse. Decorative only.
 */
function GlyphWatermark() {
  return (
    <svg
      aria-hidden
      viewBox="110 55 470 250"
      className="pointer-events-none absolute -right-24 -top-12 w-64 fill-white opacity-[0.05]"
    >
      <path d="M215 200 L300 245 L345 230 L440 165 L455 130 L400 150 L320 205 L250 175 Z" />
      <circle cx="172" cy="180" r="57" />
      <circle cx="325" cy="240" r="58" />
      <circle cx="485" cy="140" r="75" />
    </svg>
  )
}

/**
 * Today at a glance, as the logo's own molecule: one node per dose due today,
 * joined by a chain that lights up sky-blue as each one is logged. It replaces
 * a progress bar plus a pair of stat tiles — the count, the remainder and the
 * pace are all readable from the shape alone.
 *
 * Capped at 8 nodes so a very busy day still fits a phone; past that the chain
 * shows the same proportion instead of one node per dose.
 */
function DoseChain({ completed, total, label }: { completed: number; total: number; label: string }) {
  const MAX_NODES = 8
  const nodes = Math.min(total, MAX_NODES)
  const filled = total > MAX_NODES ? Math.round((completed / total) * nodes) : Math.min(completed, nodes)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
      aria-label={label}
      className="flex items-center"
    >
      {Array.from({ length: nodes }, (_, i) => {
        const lit = i < filled
        return (
          <Fragment key={i}>
            {/* Links have a capped length so a short day reads as a small
                molecule, not a slider track stretched across the card. */}
            {i > 0 && (
              <span
                className={`h-0.5 max-w-9 flex-1 rounded-full transition-colors ${lit ? 'bg-sky-300' : 'bg-white/25'}`}
              />
            )}
            <span
              className={`size-4 shrink-0 rounded-full transition-all ${
                lit ? 'bg-sky-300 shadow-[0_0_14px_rgb(125_211_252/0.75)]' : 'border-2 border-white/40'
              }`}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

/**
 * The app's one branded moment on Home — a card in the logo's own navy and
 * royal blue, with today's state told three ways that agree by construction:
 * a sentence, the dose chain, and a count. Colours are fixed brand art (white
 * on blue) rather than theme tokens, so the card looks the same in light and
 * dark, like the logo itself.
 *
 * The sentence and the chain are computed together in a single pass
 * (computeTodayProgress) precisely so they can't contradict each other — a chain
 * reading 2/3 under a line saying "all caught up" is the kind of small
 * inconsistency that makes people stop trusting the numbers.
 */
function HeroHeader({
  now,
  notificationCount,
  todayProgress,
  todayStatus,
  streakDays,
  onOpenNotifications,
  onOpenHistory,
}: {
  now: Date
  notificationCount: number
  todayProgress: { completed: number; total: number }
  todayStatus: TodayStatus
  streakDays: number
  onOpenNotifications: () => void
  onOpenHistory: () => void
}) {
  const { t } = useTranslation()
  const badgeText = notificationCount > 9 ? '9+' : String(notificationCount)

  // The dot carries the state's colour; the sentence stays white for contrast on the blue card.
  let statusText: string
  let dotClass = 'bg-white/50'
  switch (todayStatus.kind) {
    case 'none':
      statusText = t('home.statusNone')
      break
    case 'allDone':
      statusText = t('home.statusAllDone')
      dotClass = 'bg-emerald-300'
      break
    case 'overdue':
      statusText = t('home.statusOverdue', { count: todayStatus.count })
      dotClass = 'bg-amber-300'
      break
    case 'upcoming':
      statusText = t('home.statusUpcoming', { time: formatTime(todayStatus.at) })
      dotClass = 'bg-sky-300'
      break
  }

  const progressLabel = t('home.todayProgress', {
    completed: todayProgress.completed,
    total: todayProgress.total,
  })

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 pb-4 text-white ring-1 ring-white/10"
      style={{ background: 'var(--brand-hero)' }}
    >
      <GlyphWatermark />

      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white/70">{formatDate(now)}</p>
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={t('settings.notifications')}
          className="relative -mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors active:bg-white/15"
        >
          <Bell className="size-5" />
          {notificationCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-[#1c1400] ring-2 ring-[#10286f]">
              {badgeText}
            </span>
          )}
        </button>
      </div>

      <h1 className="relative -mt-1 font-display text-[1.75rem] font-bold leading-tight">{t(greetingKey(now))}</h1>

      <p className="relative mt-2 flex items-center gap-2 text-[15px] font-medium text-white/90">
        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="min-w-0">{statusText}</span>
      </p>

      {todayProgress.total > 0 && (
        <div className="relative mt-6">
          <DoseChain completed={todayProgress.completed} total={todayProgress.total} label={progressLabel} />
        </div>
      )}

      {(todayProgress.total > 0 || streakDays > 0) && (
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-x-3 text-xs font-medium text-white/75">
          <span className="whitespace-nowrap">{todayProgress.total > 0 ? progressLabel : ''}</span>
          {streakDays > 0 && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="-mb-2 -mr-2 ml-auto flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2 active:bg-white/10"
            >
              <Flame className="size-3.5 text-amber-300" />
              {t('home.streakTitle', { count: streakDays })}
            </button>
          )}
        </div>
      )}
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
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-foreground">{t('home.getStartedTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('home.getStartedProgress', { done: doneCount, total: steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('home.getStartedDismiss')}
          className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col">
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

/** One row of the Home "recent activity" peek — the full record lives in History. */
function RecentActivityRow({ log, onOpen }: { log: DoseLog; onOpen: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(log.compoundId)
  const administeredAt = new Date(log.administeredAt)
  const taken = log.status === 'taken'

  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">
          {compound?.name ?? t('history.unknownCompound')}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(administeredAt)} · {formatTime(administeredAt)}
        </span>
      </span>
      <span
        className={`flex shrink-0 items-center gap-1 text-xs font-medium ${taken ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {taken && <Check className="size-3.5" />}
        {t(`history.status.${log.status}`)}
      </span>
    </button>
  )
}

function NextUpCard({
  protocol,
  occurrence,
  now,
  onNavigateToProtocols,
}: {
  protocol: Protocol
  occurrence: Occurrence
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
    <DoseCard
      tone="upcoming"
      statusLabel={`${dayWord} · ${formatCountdown(now, occurrence.scheduledAt, t)}`}
      time={occurrence.scheduledAt}
      protocol={protocol}
      compoundName={compound?.name}
      showActions={canLogToday}
      onNavigateToProtocols={onNavigateToProtocols}
    />
  )
}

import { Check, ChevronRight, ClipboardList, Clock3, Flame, HeartPulse, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InfoRowCard } from '@/components/ui/info-row-card'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { DoseCard, DueCard } from '../components/DoseCard'
import { DoseChangeCard } from '../components/DoseChangeCard'
import { EmptyState } from '../components/EmptyState'
import { VialAlertCard } from '../components/VialAlertCard'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import type { DoseLog, Protocol } from '../lib/db'
import type { TodayStatus } from '../lib/homeData'
import { describeNextUp } from '../lib/nextUp'
import type { Occurrence } from '../lib/schedule'
import { useHomeState } from '../lib/useHomeState'
import { vialAlertKey } from '../lib/vials'

interface TodayViewProps {
  onNavigateToProtocols: () => void
  onNavigateToHistory: () => void
  onNavigateToProgress: () => void
  /** Tapping a specific protocol (a due/upcoming card): straight to its own edit page. */
  onOpenProtocol: (protocolId: string) => void
}

/**
 * Track > Today: the day's dosing. A summary of how today is going, the doses to
 * catch up on, vial alerts and titration heads-ups, what's coming next per
 * protocol, and the latest activity. It is what Home used to be, with the hero
 * band replaced by a summary card, because Home is now the dashboard.
 */
export function TodayView({
  onNavigateToProtocols,
  onNavigateToHistory,
  onNavigateToProgress,
  onOpenProtocol,
}: TodayViewProps) {
  const { t } = useTranslation()
  const today = useHomeState()
  const { now } = today

  return (
    <div className="flex flex-col gap-6">
      {today.protocols !== undefined && today.activeProtocols.length > 0 && (
        <TodaySummary
          todayProgress={today.todayProgress}
          todayStatus={today.todayStatus}
          streakDays={today.streakDays}
          adherencePercent={today.adherence.percent}
          onOpenHistory={onNavigateToHistory}
        />
      )}

      {today.dueItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>{t('home.catchUpTitle')}</SectionLabel>
          <AnimatePresence initial={false}>
            {today.dueItems.map((item) => (
              <motion.div
                key={`${item.protocol.id}-${item.occurrence.scheduledAt.toISOString()}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <DueCard item={item} now={now} onOpenProtocol={onOpenProtocol} />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}

      {today.vialAlerts.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel>{t('vialAlerts.title')}</SectionLabel>
          {today.vialAlerts.map((alert) => (
            <VialAlertCard key={vialAlertKey(alert)} alert={alert} onOpenProtocol={onOpenProtocol} />
          ))}
        </section>
      )}

      {today.doseChanges.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel>{t('doseChange.title')}</SectionLabel>
          {today.doseChanges.map((item) => (
            <DoseChangeCard key={item.protocol.id} item={item} now={now} onOpenProtocol={onOpenProtocol} />
          ))}
        </section>
      )}

      {today.protocols !== undefined && today.activeProtocols.length === 0 ? (
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
          <SectionLabel>{t('home.nextUpTitle')}</SectionLabel>
          {today.upcoming.length > 0 ? (
            today.upcoming.map(({ protocol, occurrence }) => (
              <NextUpCard
                key={`${protocol.id}-${occurrence.scheduledAt.toISOString()}`}
                protocol={protocol}
                occurrence={occurrence}
                now={now}
                onOpenProtocol={onOpenProtocol}
              />
            ))
          ) : (
            <EmptyState icon={Clock3} title={t('home.noUpcomingTitle')} body={t('home.noUpcomingBody')} />
          )}
        </section>
      )}

      {today.activeProtocols.length > 0 && today.resultsToday === false && (
        <InfoRowCard tone="tint" icon={HeartPulse} title={t('progress.homePrompt')} onClick={onNavigateToProgress} />
      )}

      {today.recentActivity.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel className="flex-1">{t('home.recentActivityTitle')}</SectionLabel>
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="-mr-2 flex min-h-11 items-center gap-0.5 rounded-full pl-3 pr-2 text-sm font-bold text-primary"
            >
              {t('home.recentActivitySeeAll')}
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Card className="divide-y divide-border/60">
            {today.recentActivity.map((log) => (
              <RecentActivityRow key={log.id} log={log} onOpen={onNavigateToHistory} />
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}

/**
 * Today at a glance, as the logo's own molecule: one node per dose due today,
 * joined by a chain that lights up as each one is logged. The count, the
 * remainder and the pace are all readable from the shape alone.
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
                className={cn('h-0.5 max-w-9 flex-1 rounded-full transition-colors', lit ? 'bg-accent-light' : 'bg-on-primary-tile')}
              />
            )}
            <span
              className={cn(
                'size-4 shrink-0 rounded-full transition-all',
                lit ? 'bg-accent-light shadow-[0_0_12px_var(--brand-accent-light)]' : 'border-2 border-on-primary-muted',
              )}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

/**
 * How today is going, told three ways that agree by construction: a sentence,
 * the dose chain, and a count. A brand-coloured card with fixed on-brand colours,
 * like the hero on Home.
 *
 * The sentence and the chain are computed together in a single pass
 * (computeTodayProgress) precisely so they can't contradict each other — a chain
 * reading 2/3 under a line saying "all caught up" is the kind of small
 * inconsistency that makes people stop trusting the numbers.
 */
function TodaySummary({
  todayProgress,
  todayStatus,
  streakDays,
  adherencePercent,
  onOpenHistory,
}: {
  todayProgress: { completed: number; total: number }
  todayStatus: TodayStatus
  streakDays: number
  adherencePercent: number | null
  onOpenHistory: () => void
}) {
  const { t } = useTranslation()

  // The dot carries the state's colour; the sentence stays in the on-brand ink for contrast.
  let statusText: string
  let dotClass = 'bg-on-primary-muted'
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
      dotClass = 'bg-accent-light'
      break
  }

  const progressLabel = t('home.todayProgress', {
    completed: todayProgress.completed,
    total: todayProgress.total,
  })

  return (
    <div className="rounded-3xl bg-hero p-5 pb-4 text-on-primary">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="min-w-0">{statusText}</span>
      </p>

      {todayProgress.total > 0 && (
        <div className="mt-5">
          <DoseChain completed={todayProgress.completed} total={todayProgress.total} label={progressLabel} />
        </div>
      )}

      {(todayProgress.total > 0 || streakDays > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 text-xs font-medium text-on-primary-muted">
          <span className="whitespace-nowrap">{todayProgress.total > 0 ? progressLabel : ''}</span>
          {streakDays > 0 && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="-mb-2 -mr-2 ml-auto flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2 active:bg-on-primary-tile"
            >
              <Flame className="size-3.5 text-amber-300" />
              {t('home.streakTitle', { count: streakDays })}
            </button>
          )}
        </div>
      )}

      {adherencePercent !== null && (
        <p className="mt-1 text-xs font-medium text-on-primary-muted">{t('adherence.overall', { percent: adherencePercent })}</p>
      )}
    </div>
  )
}

/** One row of the "recent activity" peek — the full record lives in History. */
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
  onOpenProtocol,
}: {
  protocol: Protocol
  occurrence: Occurrence
  now: Date
  onOpenProtocol: (protocolId: string) => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  const next = describeNextUp(protocol, occurrence, now, t)

  return (
    <DoseCard
      tone="upcoming"
      statusLabel={next.statusLabel}
      time={occurrence.scheduledAt}
      protocol={protocol}
      compoundName={compound?.name}
      showActions={next.canLogNow}
      onOpenProtocol={onOpenProtocol}
    />
  )
}

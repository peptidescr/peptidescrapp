/**
 * Shared derivation helpers for "what needs attention right now" — used by
 * both Home's Catch-up section and the notification panel, so the two never
 * disagree about what counts as due/missed or how a streak is computed.
 */
import { addDays, endOfDay, isSameDay, startOfDay } from 'date-fns'
import type { DoseLog, Protocol, Settings } from './db'
import {
  findUnloggedOccurrences,
  getDueOccurrences,
  getMissedOccurrences,
  getNextOccurrence,
  getOccurrencesInRange,
  type Occurrence,
  type ScheduleContext,
} from './schedule'

export const MISSED_THRESHOLD_HOURS = 12
export const BACKUP_NUDGE_DAYS = 14

export interface DueItem {
  protocol: Protocol
  occurrence: Occurrence
  isMissed: boolean
}

export function contextOf(protocol: Protocol): ScheduleContext {
  return {
    schedule: protocol.schedule,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    reminderTimes: protocol.reminderTimes,
  }
}

export function loggedTimesFor(protocol: Protocol, doseLogs: DoseLog[]): Date[] {
  return doseLogs.filter((log) => log.protocolId === protocol.id).map((log) => new Date(log.administeredAt))
}

/**
 * Consecutive calendar days, ending today, with at least one dose log —
 * "logged something" (taken or skipped both count), not "took every dose".
 * If nothing's logged yet today, today doesn't break an existing streak from
 * yesterday — it just doesn't add to it until something is logged.
 */
export function computeStreakDays(now: Date, loggedAt: Date[]): number {
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

/** Every unlogged due (including missed) occurrence across active protocols, soonest first. */
export function computeDueItems(protocols: Protocol[], doseLogs: DoseLog[], now: Date): DueItem[] {
  const items: DueItem[] = []
  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const ctx = contextOf(protocol)
    const loggedTimes = loggedTimesFor(protocol, doseLogs)
    for (const occurrence of getDueOccurrences(ctx, now, loggedTimes)) {
      const hoursAgo = (now.getTime() - occurrence.scheduledAt.getTime()) / 3_600_000
      items.push({ protocol, occurrence, isMissed: hoursAgo > MISSED_THRESHOLD_HOURS })
    }
  }
  items.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())
  return items
}

/** Only nudge once there's actually something worth losing — a brand-new install with zero protocols/logs doesn't need a backup yet. */
export function computeShowBackupNudge(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  settings: Settings | undefined,
  now: Date,
): boolean {
  const hasData = protocols.length > 0 || doseLogs.length > 0
  if (!hasData) return false
  if (!settings?.lastBackupAt) return true
  return (now.getTime() - new Date(settings.lastBackupAt).getTime()) / (24 * 3_600_000) > BACKUP_NUDGE_DAYS
}

// ---------------------------------------------------------------------------
// Today at a glance
// ---------------------------------------------------------------------------

export interface TodayProgress {
  /** Occurrences scheduled for today that already have a matching log. */
  completed: number
  /** Occurrences scheduled for today, logged or not. */
  total: number
  /** Scheduled for today, still unlogged, and already past their reminder time. */
  overdue: number
  /** The soonest still-unlogged occurrence later today, if there is one. */
  nextToday: Occurrence | null
}

/**
 * Everything Home's header needs to say what kind of day this is, computed in
 * one pass so the progress bar and the status line can never disagree.
 *
 * "Today" is the local calendar day, not a rolling 24h window — a dose due at
 * 23:00 belongs to today even at 00:30, and one due tomorrow at 01:00 does
 * not, which is how a person reads their own schedule.
 */
export function computeTodayProgress(protocols: Protocol[], doseLogs: DoseLog[], now: Date): TodayProgress {
  const dayStart = startOfDay(now)
  const dayEnd = endOfDay(now)

  let completed = 0
  let total = 0
  let overdue = 0
  let nextToday: Occurrence | null = null

  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const occurrences = getOccurrencesInRange(contextOf(protocol), dayStart, dayEnd)
    if (occurrences.length === 0) continue

    const unlogged = new Set(
      findUnloggedOccurrences(occurrences, loggedTimesFor(protocol, doseLogs)).map((o) =>
        o.scheduledAt.getTime(),
      ),
    )

    for (const occurrence of occurrences) {
      total += 1
      if (!unlogged.has(occurrence.scheduledAt.getTime())) {
        completed += 1
        continue
      }
      if (occurrence.scheduledAt <= now) {
        overdue += 1
      } else if (!nextToday || occurrence.scheduledAt < nextToday.scheduledAt) {
        nextToday = occurrence
      }
    }
  }

  return { completed, total, overdue, nextToday }
}

/**
 * Which single sentence Home should lead with. Ordered by urgency rather than
 * by chronology: something already missed outranks something merely upcoming,
 * and "nothing scheduled" is a different statement from "all done".
 */
export type TodayStatus =
  | { kind: 'none' }
  | { kind: 'allDone'; count: number }
  | { kind: 'overdue'; count: number }
  | { kind: 'upcoming'; at: Date; remaining: number }

export function computeTodayStatus(progress: TodayProgress): TodayStatus {
  if (progress.total === 0) return { kind: 'none' }
  if (progress.overdue > 0) return { kind: 'overdue', count: progress.overdue }
  if (progress.completed >= progress.total) return { kind: 'allDone', count: progress.total }
  if (progress.nextToday) {
    return {
      kind: 'upcoming',
      at: progress.nextToday.scheduledAt,
      remaining: progress.total - progress.completed,
    }
  }
  return { kind: 'allDone', count: progress.total }
}

// ---------------------------------------------------------------------------
// Up next / recent activity
// ---------------------------------------------------------------------------

export interface UpcomingItem {
  protocol: Protocol
  occurrence: Occurrence
}

/**
 * The next few unlogged occurrences across every active protocol, soonest
 * first — one per protocol, so a twice-daily protocol doesn't fill the whole
 * carousel with itself while another protocol never appears.
 */
export function computeUpcoming(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  now: Date,
  limit = 5,
): UpcomingItem[] {
  const items: UpcomingItem[] = []
  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const next = getNextOccurrence(contextOf(protocol), now, loggedTimesFor(protocol, doseLogs))
    if (next) items.push({ protocol, occurrence: next })
  }
  items.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())
  return items.slice(0, limit)
}

/** Most recently administered logs first — Home shows a peek, History shows all of them. */
export function computeRecentActivity(doseLogs: DoseLog[], limit = 3): DoseLog[] {
  return [...doseLogs]
    .sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime())
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Get-started checklist
// ---------------------------------------------------------------------------

export type GetStartedStepId = 'createProtocol' | 'logDose' | 'tryCalculator' | 'backUp'

export interface GetStartedStep {
  id: GetStartedStepId
  done: boolean
}

/**
 * The first-run checklist. Every step is derived from data the app already
 * has rather than from a "has the user tapped this yet" flag, so it stays
 * honest: restore a backup onto a fresh device and the list correctly shows
 * as already done instead of asking you to redo work you've done.
 *
 * `tryCalculator` is the exception — using a calculator leaves no trace by
 * design (it computes, it doesn't record) — so that one step does need a
 * stored flag.
 */
export function computeGetStartedSteps(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  settings: Settings | undefined,
): GetStartedStep[] {
  return [
    { id: 'createProtocol', done: protocols.length > 0 },
    { id: 'logDose', done: doseLogs.length > 0 },
    { id: 'tryCalculator', done: Boolean(settings?.hasUsedCalculator) },
    { id: 'backUp', done: Boolean(settings?.lastBackupAt) },
  ]
}

// ---------------------------------------------------------------------------
// Per-protocol stats (Protocols list)
// ---------------------------------------------------------------------------

export interface ProtocolStats {
  nextOccurrence: Occurrence | null
  /** Unlogged occurrences more than MISSED_THRESHOLD_HOURS past their time, within the schedule lookback. */
  missedCount: number
  /** Logged doses recorded against this protocol. */
  loggedCount: number
  /** Occurrences scheduled in the next week — gives the card a sense of cadence. */
  upcomingCount: number
  /** No end date set, so it runs until stopped. */
  isPerpetual: boolean
}

export function computeProtocolStats(protocol: Protocol, doseLogs: DoseLog[], now: Date): ProtocolStats {
  const ctx = contextOf(protocol)
  const loggedTimes = loggedTimesFor(protocol, doseLogs)
  return {
    nextOccurrence: protocol.isActive ? getNextOccurrence(ctx, now, loggedTimes) : null,
    missedCount: protocol.isActive ? getMissedOccurrences(ctx, now, loggedTimes).length : 0,
    loggedCount: loggedTimes.length,
    upcomingCount: protocol.isActive
      ? getOccurrencesInRange(ctx, now, addDays(now, 7)).length
      : 0,
    isPerpetual: !protocol.endDate,
  }
}

/**
 * Shared derivation helpers for "what needs attention right now" — used by
 * both Home's Catch-up section and the notification panel, so the two never
 * disagree about what counts as due/missed or how a streak is computed.
 */
import { addDays, isSameDay } from 'date-fns'
import type { DoseLog, Protocol, Settings } from './db'
import { getDueOccurrences, type Occurrence, type ScheduleContext } from './schedule'

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

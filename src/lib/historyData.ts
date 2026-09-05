/**
 * Derivations for the History screen — grouping logs into days, and working
 * out what a single day actually held (both what was recorded and what the
 * schedule expected but never got).
 *
 * Kept separate from homeData.ts because these answer a different question:
 * homeData is "what needs attention now", this is "what happened, and when".
 */
import { isSameDay, isToday, isYesterday } from 'date-fns'
import type { DoseLog, Protocol } from './db'
import { contextOf, loggedTimesFor } from './homeData'
import { findUnloggedOccurrences, getOccurrencesInRange, type Occurrence } from './schedule'
import { toIsoDate } from './dates'

export interface DayGroup {
  /** yyyy-MM-dd, the local calendar day. */
  date: string
  /** A real Date for the day, for formatting. */
  day: Date
  /** Logs administered on this day, most recent first. */
  logs: DoseLog[]
  takenCount: number
  skippedCount: number
}

/**
 * Logs bucketed by the local calendar day they were administered on, newest
 * day first, newest log first within each day.
 *
 * Grouping is on `administeredAt` rather than `createdAt` on purpose: a dose
 * backfilled on Tuesday for Sunday belongs to Sunday in the record, which is
 * the whole point of being able to correct a timestamp.
 */
export function groupLogsByDay(doseLogs: DoseLog[]): DayGroup[] {
  const buckets = new Map<string, DoseLog[]>()

  for (const log of doseLogs) {
    const key = toIsoDate(new Date(log.administeredAt))
    const existing = buckets.get(key)
    if (existing) existing.push(log)
    else buckets.set(key, [log])
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, logs]) => {
      const sorted = [...logs].sort(
        (a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime(),
      )
      return {
        date,
        day: new Date(sorted[0]!.administeredAt),
        logs: sorted,
        takenCount: sorted.filter((l) => l.status === 'taken').length,
        skippedCount: sorted.filter((l) => l.status === 'skipped').length,
      }
    })
}

/** Which i18n key a day heading should use — "Today"/"Yesterday" read better than a date. */
export function relativeDayKey(day: Date): 'today' | 'yesterday' | null {
  if (isToday(day)) return 'today'
  if (isYesterday(day)) return 'yesterday'
  return null
}

export interface MissedSlot {
  protocol: Protocol
  occurrence: Occurrence
}

export interface DayActivity {
  date: string
  day: Date
  logs: DoseLog[]
  /**
   * Occurrences the schedule expected on this day that never got a log. These
   * are what the day sheet offers to backfill — without them, a dose missed
   * more than 12 hours ago can only be recorded by hand-typing the right
   * timestamp into a new entry, which nobody does.
   */
  missedSlots: MissedSlot[]
}

export function computeDayActivity(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  day: Date,
): DayActivity {
  const logs = doseLogs
    .filter((log) => isSameDay(new Date(log.administeredAt), day))
    .sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime())

  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  const missedSlots: MissedSlot[] = []
  for (const protocol of protocols) {
    // Paused protocols are included deliberately: pausing stops future
    // reminders, it doesn't rewrite what was scheduled back when the day in
    // question was live, and you should still be able to backfill it.
    const occurrences = getOccurrencesInRange(contextOf(protocol), dayStart, dayEnd)
    if (occurrences.length === 0) continue
    for (const occurrence of findUnloggedOccurrences(occurrences, loggedTimesFor(protocol, doseLogs))) {
      missedSlots.push({ protocol, occurrence })
    }
  }
  missedSlots.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())

  return { date: toIsoDate(day), day, logs, missedSlots }
}

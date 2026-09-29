/**
 * Derivations for the History screen — grouping logs into days, and working
 * out what a single day actually held (both what was recorded and what the
 * schedule expected but never got).
 *
 * Kept separate from homeData.ts because these answer a different question:
 * homeData is "what needs attention now", this is "what happened, and when".
 */
import { endOfDay, endOfMonth, isSameDay, isToday, isYesterday, startOfDay, startOfMonth } from 'date-fns'
import type { DoseLog, Protocol } from './db'
import { contextOf, loggedTimesFor, MISSED_THRESHOLD_HOURS } from './homeData'
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

// ---------------------------------------------------------------------------
// Month calendar
// ---------------------------------------------------------------------------

/** What one calendar day held, for the month grid's markers. */
export interface DayMarks {
  taken: number
  skipped: number
  /** Scheduled, never logged, and past the missed threshold. */
  missed: number
  /** Scheduled and not logged yet, but not missed either (still ahead, or only just due). */
  scheduled: number
}

/** An expected dose with no log, for the selected day's list. */
export interface DaySlot {
  protocol: Protocol
  occurrence: Occurrence
  /** Past the missed threshold — offered for backfill, like Home's catch-up. */
  isMissed: boolean
  /** Still ahead of now. */
  isFuture: boolean
}

/**
 * Unlogged occurrences of active protocols within [from, to]. Only active
 * protocols: a paused one expected nothing, so its schedule mustn't paint
 * the calendar with misses. (History's list still shows everything logged,
 * paused or not — logs are records, this is expectation.)
 */
function unloggedSlots(protocols: Protocol[], doseLogs: DoseLog[], from: Date, to: Date, now: Date): DaySlot[] {
  const missedBefore = now.getTime() - MISSED_THRESHOLD_HOURS * 60 * 60 * 1000
  const slots: DaySlot[] = []
  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const occurrences = getOccurrencesInRange(contextOf(protocol), from, to)
    for (const occurrence of findUnloggedOccurrences(occurrences, loggedTimesFor(protocol, doseLogs))) {
      const at = occurrence.scheduledAt.getTime()
      slots.push({ protocol, occurrence, isMissed: at <= missedBefore, isFuture: at > now.getTime() })
    }
  }
  return slots.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())
}

/** Markers for every day of `month` that held anything, keyed yyyy-MM-dd. Days with nothing are absent. */
export function computeMonthMarks(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  month: Date,
  now: Date,
): Map<string, DayMarks> {
  const from = startOfMonth(month)
  const to = endOfMonth(month)
  const marks = new Map<string, DayMarks>()
  const markFor = (key: string): DayMarks => {
    let m = marks.get(key)
    if (!m) {
      m = { taken: 0, skipped: 0, missed: 0, scheduled: 0 }
      marks.set(key, m)
    }
    return m
  }

  for (const log of doseLogs) {
    const at = new Date(log.administeredAt)
    if (at < from || at > to) continue
    markFor(toIsoDate(at))[log.status] += 1
  }
  for (const slot of unloggedSlots(protocols, doseLogs, from, to, now)) {
    const m = markFor(slot.occurrence.date)
    if (slot.isMissed) m.missed += 1
    else m.scheduled += 1
  }
  return marks
}

/** The unlogged expected doses of one day — what the selected day's list shows under its logs. */
export function computeDaySlots(protocols: Protocol[], doseLogs: DoseLog[], day: Date, now: Date): DaySlot[] {
  return unloggedSlots(protocols, doseLogs, startOfDay(day), endOfDay(day), now)
}

/**
 * Schedule types + derived occurrence logic.
 *
 * No ScheduledDose table exists — upcoming and missed doses are computed on
 * demand from a Protocol's schedule plus its existing DoseLogs. Only what
 * actually happened is persisted.
 *
 * Everything here works in the device's local time (plain `Date`, which JS
 * always interprets/formats in local time) — there's no server and no
 * multi-timezone data, so there's nothing for date-fns-tz to convert between.
 * A dosing schedule is about the user's own day/night cycle wherever their
 * phone currently is, not a fixed Costa Rica clock.
 */

import {
  addDays,
  differenceInCalendarDays,
  getDay,
  isSameDay,
  parseISO,
  set,
} from 'date-fns'

/** date-fns `getDay()` convention: 0 = Sunday .. 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Schedule =
  | { kind: 'daily' }
  | { kind: 'everyNDays'; n: number }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'cycle'; daysOn: number; daysOff: number }

/** The subset of a Protocol that scheduling needs — kept local to avoid a circular import with db.ts. */
export interface ScheduleContext {
  schedule: Schedule
  startDate: string // yyyy-MM-dd
  endDate?: string // yyyy-MM-dd
  reminderTimes: string[] // "HH:mm", 24h, local time
}

export interface Occurrence {
  /** Calendar day this occurrence belongs to, yyyy-MM-dd. */
  date: string
  /** "HH:mm" reminder time this occurrence uses. */
  time: string
  /** The day and time combined into a real local Date. */
  scheduledAt: Date
}

const HOURS_CONSIDERED_MISSED = 12
/** How far back a missed-dose scan looks, so a very old/abandoned protocol can't produce an unbounded backlog. */
const MISSED_LOOKBACK_DAYS = 30
/** How far forward the search for "next occurrence" runs before giving up. */
const NEXT_OCCURRENCE_HORIZON_DAYS = 400

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function validateSchedule(schedule: Schedule): void {
  switch (schedule.kind) {
    case 'daily':
      return
    case 'everyNDays':
      if (!Number.isInteger(schedule.n) || schedule.n < 1) {
        throw new RangeError('everyNDays.n must be a positive integer')
      }
      return
    case 'weekdays':
      if (schedule.days.length === 0) {
        throw new RangeError('weekdays.days must not be empty')
      }
      return
    case 'cycle':
      if (!Number.isInteger(schedule.daysOn) || schedule.daysOn < 1) {
        throw new RangeError('cycle.daysOn must be a positive integer')
      }
      if (!Number.isInteger(schedule.daysOff) || schedule.daysOff < 0) {
        throw new RangeError('cycle.daysOff must be a non-negative integer')
      }
      return
  }
}

function combineDateAndTime(day: Date, time: string): Date {
  const match = TIME_RE.exec(time)
  if (!match) throw new RangeError(`time must be "HH:mm" in 24h format, got "${time}"`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return set(day, { hours, minutes, seconds: 0, milliseconds: 0 })
}

/** Whether the schedule produces an occurrence on this calendar day, ignoring reminder times. */
export function isScheduledDay(ctx: Pick<ScheduleContext, 'schedule' | 'startDate' | 'endDate'>, day: Date): boolean {
  validateSchedule(ctx.schedule)
  const start = parseISO(ctx.startDate)
  const offset = differenceInCalendarDays(day, start)
  if (offset < 0) return false
  if (ctx.endDate && differenceInCalendarDays(day, parseISO(ctx.endDate)) > 0) return false

  switch (ctx.schedule.kind) {
    case 'daily':
      return true
    case 'everyNDays':
      return offset % ctx.schedule.n === 0
    case 'weekdays':
      return ctx.schedule.days.includes(getDay(day) as Weekday)
    case 'cycle': {
      const period = ctx.schedule.daysOn + ctx.schedule.daysOff
      if (period === 0) return false
      return (offset % period) < ctx.schedule.daysOn
    }
  }
}

/** Every occurrence (day + reminder time) the schedule produces within [from, to], chronological order. */
export function getOccurrencesInRange(ctx: ScheduleContext, from: Date, to: Date): Occurrence[] {
  validateSchedule(ctx.schedule)
  if (ctx.reminderTimes.length === 0 || from > to) return []

  const occurrences: Occurrence[] = []
  let day = set(from, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
  const lastDay = set(to, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })

  while (day <= lastDay) {
    if (isScheduledDay(ctx, day)) {
      for (const time of ctx.reminderTimes) {
        const scheduledAt = combineDateAndTime(day, time)
        if (scheduledAt >= from && scheduledAt <= to) {
          occurrences.push({ date: toIsoDate(day), time, scheduledAt })
        }
      }
    }
    day = addDays(day, 1)
  }

  occurrences.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return occurrences
}

function toIsoDate(day: Date): string {
  const y = day.getFullYear()
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Pairs logged administration times to occurrences so a logged dose stops
 * showing as due/missed. Matching is same-calendar-day + nearest-in-time,
 * processed in chronological occurrence order — exact for the common once-
 * or twice-daily cases; with several same-day reminder times and irregular
 * logging times a log could in principle pair with a neighbouring occurrence
 * instead of its "true" one, but the visible result (that day's occurrences
 * are accounted for) is the same either way.
 */
export function findUnloggedOccurrences(occurrences: Occurrence[], loggedAdministeredAt: Date[]): Occurrence[] {
  const available = loggedAdministeredAt.map((log, idx) => ({ idx, log }))
  const consumed = new Set<number>()
  const unlogged: Occurrence[] = []

  for (const occ of occurrences) {
    const candidates = available.filter(
      ({ idx, log }) => !consumed.has(idx) && isSameDay(log, occ.scheduledAt),
    )
    if (candidates.length === 0) {
      unlogged.push(occ)
      continue
    }
    candidates.sort(
      (a, b) =>
        Math.abs(a.log.getTime() - occ.scheduledAt.getTime()) -
        Math.abs(b.log.getTime() - occ.scheduledAt.getTime()),
    )
    consumed.add(candidates[0]!.idx)
  }

  return unlogged
}

function getUnloggedOccurrencesUpTo(
  ctx: ScheduleContext,
  upTo: Date,
  now: Date,
  loggedAdministeredAt: Date[],
): Occurrence[] {
  const start = parseISO(ctx.startDate)
  const lookback = new Date(now.getTime() - MISSED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const from = start > lookback ? start : lookback
  if (from > upTo) return []
  const occurrences = getOccurrencesInRange(ctx, from, upTo)
  return findUnloggedOccurrences(occurrences, loggedAdministeredAt)
}

/**
 * Occurrences due at or before now with no matching DoseLog yet — this is the
 * Home catch-up list. Broader than "missed" (below): a dose due 20 minutes
 * ago belongs here even though it isn't "missed" yet, because the brief
 * wants every dose that came due while the app was closed surfaced with
 * one-tap log-or-skip, not just the ones that crossed the 12h mark.
 */
export function getDueOccurrences(
  ctx: ScheduleContext,
  now: Date,
  loggedAdministeredAt: Date[],
): Occurrence[] {
  return getUnloggedOccurrencesUpTo(ctx, now, now, loggedAdministeredAt)
}

/** Occurrences that were due more than 12 hours ago and have no matching DoseLog. */
export function getMissedOccurrences(
  ctx: ScheduleContext,
  now: Date,
  loggedAdministeredAt: Date[],
): Occurrence[] {
  const cutoff = new Date(now.getTime() - HOURS_CONSIDERED_MISSED * 60 * 60 * 1000)
  return getUnloggedOccurrencesUpTo(ctx, cutoff, now, loggedAdministeredAt)
}

/**
 * The next occurrence at or after `now` with no matching DoseLog yet, or null
 * if the schedule has ended / produces nothing further. `loggedAdministeredAt`
 * matters here, not just for the catch-up list above: without it, logging an
 * upcoming dose early (Home's "Next up" card allows this) would never be
 * reflected — the same occurrence would keep coming back as "next" until the
 * clock caught up to it, making the log button look like it did nothing.
 */
export function getNextOccurrence(
  ctx: ScheduleContext,
  now: Date,
  loggedAdministeredAt: Date[] = [],
): Occurrence | null {
  const horizonEnd = ctx.endDate
    ? parseISO(ctx.endDate)
    : addDays(now, NEXT_OCCURRENCE_HORIZON_DAYS)
  if (horizonEnd < now) return null
  const occurrences = getOccurrencesInRange(ctx, now, horizonEnd)
  const unlogged = findUnloggedOccurrences(occurrences, loggedAdministeredAt)
  return unlogged[0] ?? null
}

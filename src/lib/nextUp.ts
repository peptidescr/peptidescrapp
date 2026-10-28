import { isSameDay } from 'date-fns'
import { formatDate } from './dates'
import type { Protocol } from './db'
import { contextOf } from './homeData'
import { formatCountdown } from './homeText'
import { cyclePhase, wouldSettle, type Occurrence } from './schedule'

type Translate = (key: string, opts?: Record<string, unknown>) => string

/**
 * How an upcoming dose is described and whether it can be logged now (Home's
 * Next dose card and Track > Today's Next up cards).
 *
 * One-tap logging here means "ahead of schedule, right now". It's offered when
 * a log now would count for this dose: on its own day, or — for doses at least
 * two days apart, like a weekly shot — up to 3½ days early (see
 * matchLogsToOccurrences). Further out, a log now wouldn't register against it,
 * so the buttons are withheld rather than appearing to do nothing.
 *
 * In a weeks cycle's off weeks, why the next dose is so far away is the useful
 * part. The date stays the dose's own (beside its time), not the day the
 * on-block starts, which a weekday pattern may not dose on.
 */
export function describeNextUp(protocol: Protocol, occurrence: Occurrence, now: Date, t: Translate) {
  const isToday = isSameDay(occurrence.scheduledAt, now)
  const canLogNow = isToday || wouldSettle(contextOf(protocol), occurrence, [], now)
  const dayWord = isToday ? t('home.today') : formatDate(occurrence.scheduledAt)
  const offWeek = cyclePhase(protocol, now)?.phase === 'off'
  const statusLabel = offWeek
    ? t('cycle.offNextDose', { date: dayWord })
    : `${dayWord} · ${formatCountdown(now, occurrence.scheduledAt, t)}`
  return { isToday, canLogNow, statusLabel }
}

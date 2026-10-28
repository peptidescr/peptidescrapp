/**
 * Late and early doses (Tier 1 #3). A dose taken off its scheduled day still
 * counts for it when the schedule leaves room — see the second matching pass
 * in schedule.ts's matchLogsToOccurrences. When it's taken late, the person
 * can also choose to move the rest of the schedule to follow it ("I take it
 * on Tuesdays now"), the way Shotsy offers.
 */
import { getDay, startOfDay } from 'date-fns'
import { toIsoDate } from './dates'
import type { Protocol } from './db'
import type { Weekday } from './schedule'

/**
 * What changes if future doses move to follow a dose taken at `at`, or null
 * when the schedule has no single anchor to move: only "every N days" (its
 * count restarts from that day) and a once-a-week weekday schedule (it moves
 * to that weekday). Tracking restarts at the start of that day, the same as
 * any schedule edit, so the old schedule's open doses don't linger as missed.
 *
 * A titration counts from the start date, so moving an every-N schedule
 * shifts its steps by the same number of days — the plan moves as a whole.
 */
export function shiftScheduleTo(protocol: Protocol, at: Date): Partial<Protocol> | null {
  const { schedule } = protocol
  const trackingStartsAt = startOfDay(at).toISOString()
  if (schedule.kind === 'everyNDays' && schedule.n >= 2) {
    return { startDate: toIsoDate(at), trackingStartsAt }
  }
  if (schedule.kind === 'weekdays' && schedule.days.length === 1) {
    const day = getDay(at) as Weekday
    if (schedule.days[0] === day) return null
    return { schedule: { kind: 'weekdays', days: [day] }, trackingStartsAt }
  }
  return null
}

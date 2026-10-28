/**
 * The protocol form's schedule fields, as typed text, and the two ways
 * between them and a Schedule: prefilling from a saved one (an existing
 * protocol, a template) and reading back what was typed. Kept out of the
 * component so the rule "invalid input is refused, never quietly turned into
 * a default" can be tested.
 */
import { MAX_CYCLES, MAX_DAY_COUNT, MAX_WEEK_COUNT, parseBoundedInteger } from './sanitize'
import type { CycleInnerSchedule, Schedule, Weekday } from './schedule'

export interface ScheduleFields {
  kind: Schedule['kind']
  everyN: string
  weekdays: Weekday[]
  daysOn: string
  daysOff: string
  customDates: string[]
  /** The pattern a weeks cycle runs while on; its every-N / weekdays reuse the fields above. */
  cycleInner: CycleInnerSchedule['kind']
  weeksOn: string
  weeksOff: string
  fixedCycles: boolean
  cycleCount: string
  /** Optional: blank means no washout. */
  washoutWeeks: string
}

export function scheduleFields(schedule?: Schedule): ScheduleFields {
  const fields: ScheduleFields = {
    kind: schedule?.kind ?? 'daily',
    everyN: '2',
    weekdays: [1, 3, 5],
    daysOn: '5',
    daysOff: '2',
    customDates: [],
    cycleInner: 'daily',
    weeksOn: '8',
    weeksOff: '4',
    fixedCycles: false,
    cycleCount: '3',
    washoutWeeks: '',
  }
  const pattern = schedule?.kind === 'cycleWeeks' ? schedule.inner : schedule
  if (pattern?.kind === 'everyNDays') fields.everyN = String(pattern.n)
  if (pattern?.kind === 'weekdays') fields.weekdays = pattern.days
  if (schedule?.kind === 'cycle') {
    fields.daysOn = String(schedule.daysOn)
    fields.daysOff = String(schedule.daysOff)
  }
  if (schedule?.kind === 'custom') fields.customDates = schedule.dates
  if (schedule?.kind === 'cycleWeeks') {
    fields.cycleInner = schedule.inner.kind
    fields.weeksOn = String(schedule.weeksOn)
    fields.weeksOff = String(schedule.weeksOff)
    fields.fixedCycles = schedule.cycles !== undefined
    if (schedule.cycles !== undefined) fields.cycleCount = String(schedule.cycles)
    if (schedule.washoutWeeks !== undefined) fields.washoutWeeks = String(schedule.washoutWeeks)
  }
  return fields
}

export interface ParsedScheduleFields {
  /** The schedule as entered, or null while anything it needs is invalid. */
  schedule: Schedule | null
  // Each field read on its own, so the form can flag exactly which one is wrong (null = invalid).
  everyN: number | null
  daysOn: number | null
  daysOff: number | null
  weeksOn: number | null
  weeksOff: number | null
  cycles: number | null
  /** undefined = left blank (no washout). */
  washoutWeeks: number | null | undefined
}

export function parseScheduleFields(fields: ScheduleFields): ParsedScheduleFields {
  const everyN = parseBoundedInteger(fields.everyN, 1, MAX_DAY_COUNT)
  const daysOn = parseBoundedInteger(fields.daysOn, 1, MAX_DAY_COUNT)
  const daysOff = parseBoundedInteger(fields.daysOff, 0, MAX_DAY_COUNT)
  const weeksOn = parseBoundedInteger(fields.weeksOn, 1, MAX_WEEK_COUNT)
  const weeksOff = parseBoundedInteger(fields.weeksOff, 0, MAX_WEEK_COUNT)
  const cycles = parseBoundedInteger(fields.cycleCount, 1, MAX_CYCLES)
  const washoutWeeks = fields.washoutWeeks.trim() === '' ? undefined : parseBoundedInteger(fields.washoutWeeks, 1, MAX_WEEK_COUNT)

  const pattern = (kind: CycleInnerSchedule['kind']): CycleInnerSchedule | null => {
    switch (kind) {
      case 'daily':
        return { kind: 'daily' }
      case 'everyNDays':
        return everyN === null ? null : { kind: 'everyNDays', n: everyN }
      case 'weekdays':
        return fields.weekdays.length === 0 ? null : { kind: 'weekdays', days: [...fields.weekdays].sort() }
    }
  }

  let schedule: Schedule | null
  switch (fields.kind) {
    case 'daily':
    case 'everyNDays':
    case 'weekdays':
      schedule = pattern(fields.kind)
      break
    case 'cycle':
      schedule = daysOn === null || daysOff === null ? null : { kind: 'cycle', daysOn, daysOff }
      break
    case 'custom':
      schedule = fields.customDates.length === 0 ? null : { kind: 'custom', dates: [...fields.customDates].sort() }
      break
    case 'cycleWeeks': {
      const inner = pattern(fields.cycleInner)
      if (!inner || weeksOn === null || weeksOff === null) {
        schedule = null
        break
      }
      const cycle: Schedule = { kind: 'cycleWeeks', inner, weeksOn, weeksOff }
      if (fields.fixedCycles) {
        if (cycles === null || washoutWeeks === null) {
          schedule = null
          break
        }
        cycle.cycles = cycles
        if (washoutWeeks !== undefined) cycle.washoutWeeks = washoutWeeks
      }
      schedule = cycle
      break
    }
  }

  return { schedule, everyN, daysOn, daysOff, weeksOn, weeksOff, cycles, washoutWeeks }
}

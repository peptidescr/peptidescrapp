/**
 * Schedule types + derived occurrence logic.
 *
 * No ScheduledDose table exists — upcoming and missed doses are computed on
 * demand from a Protocol's schedule plus its existing DoseLogs. Only what
 * actually happened is persisted.
 */

/** date-fns `getDay()` convention: 0 = Sunday .. 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Schedule =
  | { kind: 'daily' }
  | { kind: 'everyNDays'; n: number }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'cycle'; daysOn: number; daysOff: number }

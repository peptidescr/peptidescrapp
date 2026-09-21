import { format } from 'date-fns'

/**
 * Dates display as dd/MM/yyyy and times as a 12-hour clock with AM/PM
 * ("8:30 AM"), uniformly regardless of which language is selected — switching
 * to en shouldn't also switch the date order. Decimal formatting (comma vs
 * period) still follows locale — see units.ts.
 *
 * What is *stored* is always 24h: reminder times are "HH:mm" strings and
 * timestamps are ISO. 12-hour is purely a display/entry format, so the
 * schedule maths never has to care. `toHHmm` is the way from a Date back to
 * the stored form.
 */

export function formatDate(date: Date): string {
  return format(date, 'dd/MM/yyyy')
}

/** 12-hour display, e.g. "8:30 AM". */
export function formatTime(date: Date): string {
  return format(date, 'h:mm a')
}

export function formatDateTime(date: Date): string {
  return format(date, 'dd/MM/yyyy h:mm a')
}

/** The stored 24h "HH:mm" form of a Date's time — use this, not `formatTime`, to seed a time field. */
export function toHHmm(date: Date): string {
  return format(date, 'HH:mm')
}

export type Period = 'AM' | 'PM'

/** Splits a stored 24h "HH:mm" into the pieces a 12-hour picker shows. */
export function to12Hour(hhmm: string): { hour: number; minute: string; period: Period } {
  const [h = '0', m = '00'] = hhmm.split(':')
  const hour24 = Number(h)
  return { hour: hour24 % 12 === 0 ? 12 : hour24 % 12, minute: m.padStart(2, '0'), period: hour24 < 12 ? 'AM' : 'PM' }
}

/** Inverse of `to12Hour`: 12-hour pieces back to a stored 24h "HH:mm". (12 AM is 00:xx, 12 PM is 12:xx.) */
export function from12Hour(hour: number, minute: string, period: Period): string {
  const hour24 = (hour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/** Displays a stored "HH:mm" as a 12-hour time, e.g. "16:35" → "4:35 PM". */
export function formatClock(hhmm: string): string {
  const { hour, minute, period } = to12Hour(hhmm)
  return `${hour}:${minute} ${period}`
}

export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Reads a typed date as day-month-year (the app's display order), tolerating
 * the separators and shorthand people actually type: "5/3/2026", "05-03-26",
 * "5.3.2026", or a bare "05032026". Returns null for anything that isn't a
 * real calendar day (31/02/2026 doesn't roll over into March).
 */
export function parseTypedDate(text: string): Date | null {
  const match = /^(\d{1,2})[/.\-\s]?(\d{1,2})[/.\-\s]?(\d{2}|\d{4})$/.exec(text.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (match[3]!.length === 2) year += 2000
  const date = new Date(year, month - 1, day)
  const isRealDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return isRealDay ? date : null
}

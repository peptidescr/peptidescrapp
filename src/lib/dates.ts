import { format } from 'date-fns'

/**
 * Date/time display is 24h + dd/MM/yyyy uniformly, regardless of which
 * language is selected — this is a Costa Rica app first, and switching to
 * en shouldn't also switch to 12h AM/PM or MM/dd/yyyy (the brief never asks
 * for that, and it would be a confusing extra axis of variation). Decimal
 * formatting (comma vs period) still follows locale — see units.ts.
 */

export function formatDate(date: Date): string {
  return format(date, 'dd/MM/yyyy')
}

export function formatTime(date: Date): string {
  return format(date, 'HH:mm')
}

export function formatDateTime(date: Date): string {
  return format(date, 'dd/MM/yyyy HH:mm')
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

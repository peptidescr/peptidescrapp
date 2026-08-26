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

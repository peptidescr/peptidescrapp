/**
 * A protocol takes one dose at each of its times of day ("HH:mm", 24h, local),
 * so several times a day is how a protocol asks for several doses a day. These
 * helpers keep that list sensible: no time twice, at most MAX_DOSE_TIMES, and
 * a suggestion for the next one that is not already taken.
 */

/** Matches the backup validator's limit, so a protocol the form allows always restores. */
export const MAX_DOSE_TIMES = 12

const FALLBACK_TIME = '08:00'

function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const m = String(wrapped % 60).padStart(2, '0')
  return `${h}:${m}`
}

/** True when two doses are set for the same time of day. */
export function hasDuplicateDoseTimes(times: readonly string[]): boolean {
  return new Set(times).size !== times.length
}

/** Earliest first, each time once. This is the form a protocol is saved in. */
export function normalizeDoseTimes(times: readonly string[]): string[] {
  return [...new Set(times)].sort((a, b) => toMinutes(a) - toMinutes(b))
}

/**
 * The time to offer when someone adds another dose: twelve hours after the
 * latest one (08:00 then 20:00), or failing that the first free hour, so
 * pressing "Add" twice never produces the same time twice.
 */
export function suggestNextDoseTime(times: readonly string[]): string {
  if (times.length === 0) return FALLBACK_TIME
  const taken = new Set(times)
  const latest = Math.max(...times.map(toMinutes))
  const candidates = [fromMinutes(latest + 12 * 60)]
  for (let hour = 8; hour < 8 + 24; hour++) candidates.push(fromMinutes(hour * 60))
  return candidates.find((time) => !taken.has(time)) ?? FALLBACK_TIME
}

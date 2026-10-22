/**
 * Small wording helpers shared by Home and Track > Today, kept apart from
 * homeData.ts (which has no i18n in it).
 */

type Translate = (key: string, opts?: Record<string, unknown>) => string

/** Time-of-day greeting — no name/account to personalize with, just the hour. */
export function greetingKey(now: Date): 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening' {
  const hour = now.getHours()
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 19) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

/** "Due now" / "In 25m" / "In 2h 59m", rounded to the minute. */
export function formatCountdown(now: Date, target: Date, t: Translate): string {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return t('home.dueNow')
  const totalMinutes = Math.round(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return t('home.inMinutes', { minutes })
  return t('home.inHoursMinutes', { hours, minutes })
}

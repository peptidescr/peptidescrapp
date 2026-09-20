import type { DoseLog, Protocol } from './db'
import { contextOf, loggedTimesFor } from './homeData'
import { findUnloggedOccurrences, getOccurrencesInRange } from './schedule'

/** How far ahead reminders are uploaded. Each app open refreshes this, so it's a ceiling on "days away from the app", not a schedule length. */
export const PUSH_HORIZON_DAYS = 45
/** Matches the server's cap; more than this is trimmed to the soonest. */
export const PUSH_MAX_ITEMS = 500

/**
 * Identifies one dose reminder: which protocol, at which moment. The server
 * treats it as an opaque string and hands it back inside the push; the service
 * worker splits it on this separator to look the protocol up locally. Shared by
 * every path that shows a reminder so the same dose always has the same tag
 * (which is what makes a second notification for it replace the first).
 */
export const TAG_SEPARATOR = '|'

export function reminderTag(protocolId: string, scheduledAt: Date): string {
  return `${protocolId}${TAG_SEPARATOR}${scheduledAt.toISOString()}`
}

export interface PushItem {
  at: number
  tag: string
}

/**
 * Every future, not-yet-logged dose across active protocols, soonest first —
 * exactly the list the server needs and nothing about what the doses are.
 * Already-logged doses are excluded (logging a dose early must stop its push).
 */
export function buildPushSchedule(protocols: Protocol[], doseLogs: DoseLog[], now: Date): PushItem[] {
  const horizon = new Date(now.getTime() + PUSH_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  const items: PushItem[] = []

  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const upcoming = getOccurrencesInRange(contextOf(protocol), now, horizon).filter(
      (o) => o.scheduledAt.getTime() > now.getTime(),
    )
    for (const occurrence of findUnloggedOccurrences(upcoming, loggedTimesFor(protocol, doseLogs))) {
      items.push({ at: occurrence.scheduledAt.getTime(), tag: reminderTag(protocol.id, occurrence.scheduledAt) })
    }
  }

  items.sort((a, b) => a.at - b.at)
  return items.slice(0, PUSH_MAX_ITEMS)
}

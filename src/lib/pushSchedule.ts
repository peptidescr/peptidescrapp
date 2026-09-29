import { addDays, parseISO, set } from 'date-fns'
import { toIsoDate } from './dates'
import type { DoseLog, Protocol, Vial } from './db'
import { contextOf, loggedTimesFor } from './homeData'
import { findUnloggedOccurrences, getOccurrencesInRange } from './schedule'
import { DATE_NOTICE_DAYS } from './vials'

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

/**
 * A vial date reminder: which vial, which date (its discard-by or its label
 * expiry), and the day it's sent on — "vial|<vialId>|<discard|expiry>|<yyyy-MM-dd>".
 * The leading "vial" can't collide with a dose tag, whose first part is a
 * protocol id (a UUID). Like dose tags, it names nothing about the vial.
 */
export type VialDateKind = 'discard' | 'expiry'
export const VIAL_TAG_PREFIX = 'vial'

export function vialReminderTag(vialId: string, kind: VialDateKind, sendDay: string): string {
  return [VIAL_TAG_PREFIX, vialId, kind, sendDay].join(TAG_SEPARATOR)
}

/** Vial date reminders go out at this local hour. */
const VIAL_REMINDER_HOUR = 9

export interface PushItem {
  at: number
  tag: string
}

/**
 * Every future, not-yet-logged dose across active protocols, soonest first —
 * exactly the list the server needs and nothing about what the doses are.
 * Already-logged doses are excluded (logging a dose early must stop its push).
 */
export function buildPushSchedule(
  protocols: Protocol[],
  doseLogs: DoseLog[],
  now: Date,
  vials: Vial[] = [],
): PushItem[] {
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

  // Vial dates: once when the notice window opens, and once on the day
  // itself, both at 09:00. Only these go to the server — low stock depends on
  // doses being logged, so it's checked in the app (see notifications.ts).
  for (const vial of vials) {
    if (vial.status !== 'active') continue
    for (const [kind, date] of [
      ['discard', vial.discardOn],
      ['expiry', vial.expiresOn],
    ] as const) {
      if (!date) continue
      const day = parseISO(date)
      for (const sendDay of [addDays(day, -DATE_NOTICE_DAYS), day]) {
        const at = set(sendDay, { hours: VIAL_REMINDER_HOUR, minutes: 0, seconds: 0, milliseconds: 0 })
        if (at <= now || at > horizon) continue
        items.push({ at: at.getTime(), tag: vialReminderTag(vial.id, kind, toIsoDate(sendDay)) })
      }
    }
  }

  items.sort((a, b) => a.at - b.at)
  return items.slice(0, PUSH_MAX_ITEMS)
}

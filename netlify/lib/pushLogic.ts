/**
 * Pure logic for the reminder push server: what a device may send us, and
 * which stored reminders are due. No I/O, so it is unit-tested directly.
 *
 * Privacy shape, deliberately minimal: the server stores an anonymous push
 * subscription (an address the browser vendor gave the device — no login, no
 * name, no email) and a list of *timestamps with an opaque tag*. It never
 * receives compound names, doses or protocol names; the device turns a tag
 * back into notification text locally (see public/sw-notifications.js).
 */
import { createHash } from 'node:crypto'

export interface ScheduleItem {
  /** When to send, epoch milliseconds. */
  at: number
  /** Opaque to the server; the device uses it to rebuild the notification text. */
  tag: string
}

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface StoredSchedule {
  subscription: PushSubscriptionData
  items: ScheduleItem[]
  updatedAt: number
}

export const MAX_ITEMS = 500
export const MAX_BODY_CHARS = 100_000
export const MAX_HORIZON_MS = 90 * 24 * 60 * 60 * 1000
/** A reminder more than this late is dropped, not sent — "time for your dose" an hour+ after the fact is worse than silence. */
export const STALE_AFTER_MS = 30 * 60 * 1000

/**
 * The server will POST to whatever endpoint a client hands it, so an open
 * endpoint field would let anyone make this function send requests to
 * arbitrary URLs. Only the real browser push services are accepted.
 */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari / iOS PWAs
  /^[a-z0-9.-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/, // legacy Edge
]

export function isAllowedEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname))
}

const BASE64URL = /^[A-Za-z0-9_-]{8,200}={0,2}$/

export type ParsedRequest =
  | { ok: true; subscription: PushSubscriptionData; items: ScheduleItem[] }
  | { ok: false; error: string }

/** Validates an untrusted schedule upload and trims it to what's worth storing. */
export function parseScheduleRequest(body: unknown, now: number): ParsedRequest {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be an object' }
  const { subscription, items } = body as { subscription?: unknown; items?: unknown }

  if (typeof subscription !== 'object' || subscription === null) return { ok: false, error: 'missing subscription' }
  const { endpoint, keys } = subscription as { endpoint?: unknown; keys?: unknown }
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isAllowedEndpoint(endpoint)) {
    return { ok: false, error: 'unsupported push endpoint' }
  }
  if (typeof keys !== 'object' || keys === null) return { ok: false, error: 'missing keys' }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !BASE64URL.test(p256dh) || !BASE64URL.test(auth)) {
    return { ok: false, error: 'invalid keys' }
  }

  if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' }
  const clean: ScheduleItem[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return { ok: false, error: 'invalid item' }
    const { at, tag } = item as { at?: unknown; tag?: unknown }
    if (typeof at !== 'number' || !Number.isFinite(at) || typeof tag !== 'string' || tag.length > 200) {
      return { ok: false, error: 'invalid item' }
    }
    // Quietly drop what can never be useful rather than rejecting the whole upload.
    if (at <= now - STALE_AFTER_MS || at > now + MAX_HORIZON_MS) continue
    clean.push({ at: Math.round(at), tag })
  }
  clean.sort((a, b) => a.at - b.at)

  return { ok: true, subscription: { endpoint, keys: { p256dh, auth } }, items: clean.slice(0, MAX_ITEMS) }
}

/** Splits stored items into what to send now, what's still in the future, and (by omission) what's too stale to send. */
export function selectDue(
  items: ScheduleItem[],
  now: number,
): { due: ScheduleItem[]; remaining: ScheduleItem[] } {
  const due: ScheduleItem[] = []
  const remaining: ScheduleItem[] = []
  for (const item of items) {
    if (item.at > now) remaining.push(item)
    else if (now - item.at <= STALE_AFTER_MS) due.push(item)
  }
  return { due, remaining }
}

/** Storage key for a device: a hash, so the raw push endpoint isn't used as an identifier in listings/logs. */
export function endpointKey(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex')
}

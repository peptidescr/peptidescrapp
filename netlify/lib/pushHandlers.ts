/**
 * The two operations of the reminder server, written against an injectable
 * store and sender so they can be tested (and run locally) without Netlify or
 * a real push service. The functions in netlify/functions are thin wrappers.
 */
import {
  endpointKey,
  MAX_BODY_CHARS,
  parseScheduleRequest,
  selectDue,
  type PushSubscriptionData,
  type StoredSchedule,
} from './pushLogic.ts'

export interface ScheduleStore {
  get(key: string): Promise<StoredSchedule | null>
  set(key: string, value: StoredSchedule): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

/** POST /api/push/schedule — a device replaces its whole upcoming-reminder list. */
export async function handleScheduleRequest(
  req: Request,
  store: ScheduleStore,
  now: number = Date.now(),
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const text = await req.text()
  if (text.length > MAX_BODY_CHARS) return new Response('Payload too large', { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const parsed = parseScheduleRequest(body, now)
  if (!parsed.ok) return new Response(parsed.error, { status: 400 })

  const key = endpointKey(parsed.subscription.endpoint)
  if (parsed.items.length === 0) {
    // Nothing left to remind about (protocols paused/deleted): forget the device entirely.
    await store.delete(key)
  } else {
    await store.set(key, { subscription: parsed.subscription, items: parsed.items, updatedAt: now })
  }
  return Response.json({ ok: true, count: parsed.items.length })
}

/** What sending a push can fail with that matters here: the push service saying the subscription is gone. */
function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode
  return status === 404 || status === 410
}

export interface SendResult {
  sent: number
  devicesRemoved: number
  failed: number
}

/**
 * Sends every due reminder and removes what was sent. Run once a minute.
 * The push body is just `{ tag }`; the device builds the visible text itself.
 */
export async function sendDueReminders(
  store: ScheduleStore,
  send: (subscription: PushSubscriptionData, payload: string) => Promise<void>,
  now: number = Date.now(),
): Promise<SendResult> {
  const result: SendResult = { sent: 0, devicesRemoved: 0, failed: 0 }

  for (const key of await store.keys()) {
    const stored = await store.get(key)
    if (!stored) continue

    const { due, remaining } = selectDue(stored.items, now)
    if (due.length === 0 && remaining.length === stored.items.length) continue

    let gone = false
    for (const item of due) {
      try {
        await send(stored.subscription, JSON.stringify({ tag: item.tag }))
        result.sent += 1
      } catch (err) {
        if (isGone(err)) {
          gone = true
          break
        }
        // Transient failure: the reminder is dropped rather than retried
        // forever, since a late reminder stops being useful (see STALE_AFTER_MS).
        result.failed += 1
      }
    }

    if (gone || remaining.length === 0) {
      await store.delete(key)
      if (gone) result.devicesRemoved += 1
    } else {
      await store.set(key, { ...stored, items: remaining })
    }
  }
  return result
}

/**
 * Payment results (Part B, phase B1). ChargX tells this site when a card
 * payment goes through (`payment.succeeded`), signed with the site's webhook
 * secret; the app then asks whether its order is paid.
 *
 *   POST /api/chargx-webhook          ChargX → us. Verified, then recorded.
 *   GET  /api/order-status?order=…    the app → us. { paid: boolean }, nothing else.
 *
 * The store marks its own order paid from its own webhook; this is only how
 * the app hears about it. Neither doc shows the event's payload, so the order
 * number is found by its shape (PTR-… for Peptides CR, USP-… for USA Peptide
 * Depot) wherever it sits in the event. Until a real sandbox event confirms
 * that, an event without one logs its field names (never their values) so the
 * shape can be read off the function log.
 *
 * Needs CHARGX_WEBHOOK_SECRET in the site's environment: the sandbox webhook's
 * secret, sent by the store once the webhook exists.
 */
import { verifyChargxWebhook } from './signing.ts'
import type { CatalogueBrand } from './catalogue.ts'

export interface PaidRecord {
  paidAt: string
  eventId: string
}

export interface PaymentStore {
  get(orderNumber: string): Promise<PaidRecord | null>
  set(orderNumber: string, record: PaidRecord): Promise<void>
}

const ORDER_PREFIX: Record<CatalogueBrand, string> = { pcr: 'PTR-', upd: 'USP-' }
const MAX_WEBHOOK_CHARS = 64_000

/** A full order number for this brand: its prefix and up to 36 letters, digits or dashes. */
export function isOrderNumber(value: unknown, brand: CatalogueBrand): value is string {
  return typeof value === 'string' && matchesOrderNumber(value, brand)
}

function matchesOrderNumber(value: string, brand: CatalogueBrand): boolean {
  return value.startsWith(ORDER_PREFIX[brand]) && /^[A-Za-z0-9-]{5,40}$/.test(value)
}

/** Fields that name the order, searched first. */
const ORDER_FIELD = /order|reference|invoice|description|memo/i
/** Never read: UPD's SKUs share the USP- prefix ("USP-BPC157-5"). */
const SKIPPED_FIELD = /sku|product|item/i

function search(payload: unknown, brand: CatalogueBrand, preferred: boolean, depth: number): string | undefined {
  if (depth > 5 || payload === null || typeof payload !== 'object') return undefined
  for (const [key, value] of Object.entries(payload)) {
    if (SKIPPED_FIELD.test(key)) continue
    if (typeof value === 'string' && (!preferred || ORDER_FIELD.test(key))) {
      if (matchesOrderNumber(value, brand)) return value
      // An order number inside a reference such as "Order PTR-1042".
      const match = value.match(new RegExp(`\\b${ORDER_PREFIX[brand]}[A-Za-z0-9-]{1,36}\\b`))
      if (match && matchesOrderNumber(match[0], brand)) return match[0]
    }
    const nested = search(value, brand, preferred, depth + 1)
    if (nested) return nested
  }
  return undefined
}

/**
 * This brand's order number in the event: from a field named like an order
 * or reference if there is one, else from any field but a product's.
 */
export function findOrderNumber(payload: unknown, brand: CatalogueBrand): string | undefined {
  return search(payload, brand, true, 0) ?? search(payload, brand, false, 0)
}

/** The event's field names, dotted ("data.object.amount"), for the log when the shape isn't known yet. */
function fieldNames(payload: unknown, prefix = '', depth = 0): string[] {
  if (depth > 3 || payload === null || typeof payload !== 'object' || Array.isArray(payload)) return []
  return Object.entries(payload).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key
    const nested = fieldNames(value, name, depth + 1)
    return nested.length ? nested : [name]
  })
}

function eventType(payload: Record<string, unknown>): unknown {
  return payload.type ?? payload.event ?? payload.event_type
}

export async function handleWebhookRequest(
  req: Request,
  brand: CatalogueBrand,
  secret: string | undefined,
  store: PaymentStore,
  now: Date = new Date(),
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
  if (!secret) {
    console.error('chargx-webhook: CHARGX_WEBHOOK_SECRET is not set')
    return new Response('not configured', { status: 503 })
  }
  const raw = await req.text()
  if (raw.length > MAX_WEBHOOK_CHARS) return new Response('Payload too large', { status: 413 })

  const check = verifyChargxWebhook(req.headers, raw, secret, now)
  if (!check.ok) {
    console.error(`chargx-webhook: refused (${check.reason})`)
    return new Response('Invalid signature', { status: 400 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    console.error('chargx-webhook: signed body is not JSON')
    return new Response('Invalid JSON', { status: 400 })
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return new Response('ok')
  const type = eventType(payload as Record<string, unknown>)
  if (type !== 'payment.succeeded') {
    console.log(`chargx-webhook: ignored ${typeof type === 'string' ? type.slice(0, 60) : 'an untyped event'}`)
    return new Response('ok')
  }

  const orderNumber = findOrderNumber(payload, brand)
  if (!orderNumber) {
    console.error(`chargx-webhook: payment.succeeded without a ${ORDER_PREFIX[brand]} order number; fields: ${fieldNames(payload).join(', ')}`)
    return new Response('ok')
  }
  const eventId = req.headers.get('webhook-id') ?? ''
  if (!(await store.get(orderNumber))) {
    await store.set(orderNumber, { paidAt: now.toISOString(), eventId: eventId.slice(0, 100) })
    console.log(`chargx-webhook: ${orderNumber} paid`)
  }
  // Answered 2xx once verified, so ChargX doesn't keep retrying an event we've read.
  return new Response('ok')
}

/** GET /api/order-status?order=PTR-… → { paid }. Says nothing else about the order. */
export async function handleStatusRequest(req: Request, brand: CatalogueBrand, store: PaymentStore): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } })
  const orderNumber = new URL(req.url).searchParams.get('order')
  if (!isOrderNumber(orderNumber, brand)) return new Response('Bad order number', { status: 400 })
  const record = await store.get(orderNumber)
  return Response.json({ paid: record !== null }, { headers: { 'Cache-Control': 'no-store' } })
}

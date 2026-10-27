/**
 * POST /api/orders — guest checkout (Part B, phase B1). The app sends a cart
 * and the customer's details; this function places the order with the site's
 * own store and hands back the order number and, for a card order, the store's
 * payment link. The card is typed on the store's payment page, never in the app.
 *
 * Both stores price every order themselves and ignore any price sent to them,
 * so no price goes out from here: only product references and quantities.
 *
 * SAFETY. An order here is a real order in the store's system: PCR's and UPD's
 * order APIs have no test mode, and creating one notifies their staff and, for
 * UPD, starts their emails at once. So checkout is off unless the site says
 * otherwise, and the switches are deliberately narrow (checkoutSettings):
 *
 *   STORE_CHECKOUT=sandbox      the only value accepted. There is no live mode
 *                               in this code yet; adding one is a code change.
 *   PCR_PARTNER_KEY             must be the sandbox partner key (pk_sandbox_…);
 *   PCR_SIGNING_SECRET          a live key is refused.
 *   UPD_LIVE_ORDERS_OK=true     UPD's order API has no sandbox at all, so every
 *                               UPD order is a real one. Set only once the
 *                               store has agreed how test orders are handled.
 *
 * Keys live only in the site's environment (Netlify), entered by whoever holds
 * them. Nothing here logs a key, a request body or a customer's details.
 */
import { signPartnerBody } from './signing.ts'
import type { CatalogueBrand, FetchLike, StorePrice } from './catalogue.ts'

// ---------------------------------------------------------------------------
// Settings: is checkout on for this site, and with which credentials?
// ---------------------------------------------------------------------------

export type CheckoutSettings =
  | { ok: true; brand: 'pcr'; partnerKey: string; signingSecret: string }
  | { ok: true; brand: 'upd' }
  | { ok: false; reason: string }

/** Whether this site may place orders, and the credentials to do it with. Never returns a key in `reason`. */
export function checkoutSettings(brand: CatalogueBrand, env: Record<string, string | undefined>): CheckoutSettings {
  const mode = env.STORE_CHECKOUT
  if (mode === undefined || mode === '') return { ok: false, reason: 'STORE_CHECKOUT is not set' }
  if (mode !== 'sandbox') return { ok: false, reason: 'STORE_CHECKOUT must be "sandbox"; there is no live mode yet' }
  if (brand === 'pcr') {
    const partnerKey = env.PCR_PARTNER_KEY
    const signingSecret = env.PCR_SIGNING_SECRET
    if (!partnerKey || !signingSecret) return { ok: false, reason: 'PCR_PARTNER_KEY / PCR_SIGNING_SECRET are not set' }
    if (!partnerKey.startsWith('pk_sandbox_')) return { ok: false, reason: 'PCR_PARTNER_KEY is not a sandbox key' }
    return { ok: true, brand, partnerKey, signingSecret }
  }
  if (env.UPD_LIVE_ORDERS_OK !== 'true') return { ok: false, reason: 'UPD_LIVE_ORDERS_OK is not "true"' }
  return { ok: true, brand }
}

// ---------------------------------------------------------------------------
// The app's request.
// ---------------------------------------------------------------------------

export type PaymentMethod = 'card' | 'whatsapp'

export interface CheckoutAddress {
  line1: string
  line2?: string
  city: string
  /** Province (PCR) or two-letter state (UPD). */
  region?: string
  postalCode?: string
}

export interface CheckoutRequest {
  items: { ref: string; qty: number }[]
  customer: { name: string; phone: string; email: string; address: CheckoutAddress }
  paymentMethod: PaymentMethod
  language: 'en' | 'es'
}

export const MAX_BODY_CHARS = 16_000
/** Both stores' limits: PCR takes 50 lines and 1–100 of each. */
export const MAX_LINES = 50
export const MAX_QTY = 100

const PCR_REF = /^[A-Za-z0-9-]{1,64}$/
const UPD_REF = /^[a-z0-9-]{1,120}$/
const US_STATE = /^[A-Z]{2}$/
const US_ZIP = /^\d{5}(-\d{4})?$/
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed text with control characters and angle brackets taken out; undefined when empty or over `max`. */
function field(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean && clean.length <= max ? clean : undefined
}

export type ParseResult = { ok: true; request: CheckoutRequest } | { ok: false; field: string }

/**
 * Checks the app's request against what this brand's store accepts, so a bad
 * one is refused here rather than half-sent. `field` names what was wrong, for
 * the app to point at; it never echoes the value.
 */
export function parseCheckoutRequest(input: unknown, brand: CatalogueBrand): ParseResult {
  if (!isRecord(input)) return { ok: false, field: 'body' }

  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > MAX_LINES) return { ok: false, field: 'items' }
  const quantities = new Map<string, number>()
  for (const raw of input.items) {
    if (!isRecord(raw)) return { ok: false, field: 'items' }
    const { ref, qty } = raw
    if (typeof ref !== 'string' || !(brand === 'pcr' ? PCR_REF : UPD_REF).test(ref)) return { ok: false, field: 'items' }
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, field: 'items' }
    quantities.set(ref, (quantities.get(ref) ?? 0) + qty)
  }
  if ([...quantities.values()].some((qty) => qty > MAX_QTY)) return { ok: false, field: 'items' }
  const items = [...quantities].map(([ref, qty]) => ({ ref, qty }))

  const customer = isRecord(input.customer) ? input.customer : {}
  const name = field(customer.name, 100)
  if (!name || name.length < 2) return { ok: false, field: 'name' }
  const phone = field(customer.phone, 25)
  const digits = phone?.replace(/\D/g, '') ?? ''
  // PCR wants full international form; UPD takes a US number as people write it.
  if (!phone || !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15 || (brand === 'pcr' && !phone.startsWith('+'))) {
    return { ok: false, field: 'phone' }
  }
  // Both need it: PCR sends no receipt without one, and UPD requires it.
  const email = field(customer.email, 254)
  if (!email || !EMAIL.test(email)) return { ok: false, field: 'email' }

  const rawAddress = isRecord(customer.address) ? customer.address : {}
  const line1 = field(rawAddress.line1, 200)
  if (!line1) return { ok: false, field: 'line1' }
  const city = field(rawAddress.city, 100)
  if (!city) return { ok: false, field: 'city' }
  const address: CheckoutAddress = { line1, city }
  const line2 = field(rawAddress.line2, 200)
  if (line2) address.line2 = line2
  const region = field(rawAddress.region, 60)
  const postalCode = field(rawAddress.postalCode, 12)
  if (brand === 'upd') {
    if (!region || !US_STATE.test(region.toUpperCase())) return { ok: false, field: 'region' }
    if (!postalCode || !US_ZIP.test(postalCode)) return { ok: false, field: 'postalCode' }
    address.region = region.toUpperCase()
    address.postalCode = postalCode
  } else {
    if (region) address.region = region
    if (postalCode) address.postalCode = postalCode
  }

  const paymentMethod = input.paymentMethod
  // UPD takes cards only; PCR also takes an order to settle over WhatsApp.
  if (paymentMethod !== 'card' && !(brand === 'pcr' && paymentMethod === 'whatsapp')) return { ok: false, field: 'paymentMethod' }

  // The research-use-only confirmation. UPD refuses an order without it, and
  // the app asks for it on both brands.
  if (input.researchUseAck !== true) return { ok: false, field: 'researchUseAck' }

  const language = input.language === 'es' ? 'es' : 'en'
  return { ok: true, request: { items, customer: { name, phone, email, address }, paymentMethod, language } }
}

// ---------------------------------------------------------------------------
// The store's request, and reading its answer.
// ---------------------------------------------------------------------------

const PCR_ORDERS_URL = 'https://catalog.peptidescostarica.net/api/partner/orders'
const UPD_ORDERS_URL = 'https://www.usapeptidedepot.com/api/orders'

export interface StoreRequest {
  url: string
  headers: Record<string, string>
  /** The exact string sent, which is also the string PCR's signature covers. */
  body: string
}

/** The order as each store's API documents it (partner integration doc §3; UPD API doc §4). */
export function buildStoreRequest(settings: CheckoutSettings & { ok: true }, request: CheckoutRequest): StoreRequest {
  const { customer } = request
  if (settings.brand === 'pcr') {
    const { line1, line2, city, region, postalCode } = customer.address
    const body = JSON.stringify({
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        shipping_address: [line1, line2, city, region, postalCode].filter(Boolean).join(', '),
      },
      items: request.items.map(({ ref, qty }) => ({ product_id: ref, qty })),
      payment_method: request.paymentMethod,
      language: request.language,
    })
    return {
      url: PCR_ORDERS_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Partner-Key': settings.partnerKey,
        'X-Partner-Signature': signPartnerBody(body, settings.signingSecret),
      },
      body,
    }
  }
  const { line1, line2, city, region, postalCode } = customer.address
  const body = JSON.stringify({
    fullName: customer.name,
    email: customer.email,
    phone: customer.phone,
    items: request.items.map(({ ref, qty }) => ({ slug: ref, quantity: qty })),
    shippingAddress: { line1, ...(line2 ? { line2 } : {}), city, state: region, postalCode, country: 'US' },
    complianceAck: true,
    paymentMethod: 'card',
  })
  return { url: UPD_ORDERS_URL, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body }
}

export interface OrderTotals {
  currency: StorePrice['currency']
  goods?: number
  discount?: number
  shipping?: number
  total: number
}

export type StoreAnswer =
  | { kind: 'placed'; orderNumber: string; status?: string; totals?: OrderTotals; paymentUrl?: string }
  /** The store said no, with a message written for the customer (PCR asks that it's shown as it is). */
  | { kind: 'refused'; message?: string }
  /** Anything else: the order may or may not exist, so the app must not simply retry. */
  | { kind: 'unconfirmed' }

const ORDER_NUMBER = /^[A-Za-z0-9-]{3,40}$/

/** Where a payment link may point: the store's own sites, or ChargX's. Anything else is dropped. */
const PAYMENT_HOSTS: Record<CatalogueBrand, readonly string[]> = {
  pcr: ['catalog.peptidescostarica.net', 'peptidescostarica.net', 'www.peptidescostarica.net'],
  upd: ['www.usapeptidedepot.com', 'usapeptidedepot.com'],
}

export function isAllowedPaymentUrl(value: unknown, brand: CatalogueBrand): value is string {
  if (typeof value !== 'string' || value.length > 1000) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    return PAYMENT_HOSTS[brand].includes(url.hostname) || url.hostname === 'chargx.io' || url.hostname.endsWith('.chargx.io')
  } catch {
    return false
  }
}

function money(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000_000 ? value : undefined
}

function customerMessage(value: unknown): string | undefined {
  return field(value, 300)
}

/**
 * Reads the store's answer. PCR's shape is documented; UPD's success shape is
 * documented without a payment link, and this assumes (October 2026, pending
 * UPD's developer) that one will arrive as `paymentUrl` like PCR's, on the
 * order or beside it. A total of 0 (UPD's doc example) is treated as unknown,
 * never shown as the price.
 */
export function readStoreAnswer(brand: CatalogueBrand, status: number, body: unknown): StoreAnswer {
  if (!isRecord(body)) return { kind: 'unconfirmed' }
  const order = brand === 'upd' && isRecord(body.order) ? body.order : body
  const orderNumber = order.orderNumber
  const succeeded = brand === 'pcr' ? body.ok === true : status >= 200 && status < 300

  if (succeeded && typeof orderNumber === 'string' && ORDER_NUMBER.test(orderNumber)) {
    const answer: StoreAnswer & { kind: 'placed' } = { kind: 'placed', orderNumber }
    const orderStatus = field(order.status, 60)
    if (orderStatus) answer.status = orderStatus
    const paymentUrl = order.paymentUrl ?? body.paymentUrl
    if (isAllowedPaymentUrl(paymentUrl, brand)) answer.paymentUrl = paymentUrl
    else if (paymentUrl !== undefined) console.error(`orders: ${brand} payment link refused (not one of the store's hosts)`)

    let totals: OrderTotals | undefined
    if (brand === 'pcr' && isRecord(body.totals)) {
      const t = body.totals
      const total = money(t.total)
      if ((t.currency === 'USD' || t.currency === 'CRC') && total) {
        totals = { currency: t.currency, total, goods: money(t.goods), discount: money(t.discount), shipping: money(t.shipping) }
      }
    } else if (brand === 'upd') {
      const total = money(order.grandTotal)
      if (total) totals = { currency: 'USD', total, goods: money(order.subtotal), shipping: money(order.shippingTotal) }
    }
    if (totals) answer.totals = totals
    return answer
  }

  // A clear refusal: PCR's ok:false, or a 4xx with a message (UPD's error shape isn't documented).
  if ((brand === 'pcr' && body.ok === false) || (status >= 400 && status < 500)) {
    return { kind: 'refused', message: customerMessage(body.error) ?? customerMessage(body.message) }
  }
  return { kind: 'unconfirmed' }
}

// ---------------------------------------------------------------------------
// The handler.
// ---------------------------------------------------------------------------

const STORE_TIMEOUT_MS = 20_000

export type OrderResponseBody =
  | { ok: true; orderNumber: string; status?: string; totals?: OrderTotals; paymentUrl?: string }
  | { ok: false; error: 'checkout-off' | 'invalid' | 'refused' | 'unconfirmed'; field?: string; message?: string }

function reply(body: OrderResponseBody, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Only the site's own pages may place orders: a browser always sends Origin on
 * a POST, and it has to be this site's.
 */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return origin === new URL(req.url).origin
  } catch {
    return false
  }
}

export async function handleOrderRequest(
  req: Request,
  brand: CatalogueBrand,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike,
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 })
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return reply({ ok: false, error: 'invalid', field: 'body' }, 415)

  const settings = checkoutSettings(brand, env)
  if (!settings.ok) {
    console.error(`orders: checkout is off for ${brand}: ${settings.reason}`)
    return reply({ ok: false, error: 'checkout-off' }, 503)
  }

  const text = await req.text()
  if (text.length > MAX_BODY_CHARS) return reply({ ok: false, error: 'invalid', field: 'body' }, 413)
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return reply({ ok: false, error: 'invalid', field: 'body' }, 400)
  }
  const parsed = parseCheckoutRequest(input, brand)
  if (!parsed.ok) return reply({ ok: false, error: 'invalid', field: parsed.field }, 400)

  const storeRequest = buildStoreRequest(settings, parsed.request)
  let answer: StoreAnswer
  try {
    const response = await fetchFn(storeRequest.url, {
      method: 'POST',
      headers: storeRequest.headers,
      body: storeRequest.body,
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Not JSON: unconfirmed, below.
    }
    answer = readStoreAnswer(brand, response.status, body)
    if (answer.kind !== 'placed') console.error(`orders: ${brand} store answered ${response.status} (${answer.kind})`)
  } catch (err) {
    // A timeout can land after the store created the order, so this is "unconfirmed", not "failed".
    console.error(`orders: ${brand} store request failed:`, err instanceof Error ? err.name : 'error')
    answer = { kind: 'unconfirmed' }
  }

  if (answer.kind === 'placed') {
    console.log(`orders: ${brand} ${answer.orderNumber} placed (${parsed.request.paymentMethod}${answer.paymentUrl ? ', payment link' : ''})`)
    const { orderNumber, status, totals, paymentUrl } = answer
    return reply({ ok: true, orderNumber, status, totals, paymentUrl }, 200)
  }
  if (answer.kind === 'refused') return reply({ ok: false, error: 'refused', message: answer.message }, 422)
  return reply({ ok: false, error: 'unconfirmed' }, 502)
}

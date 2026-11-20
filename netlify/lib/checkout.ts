/**
 * POST /api/orders — guest checkout (Part B, phase B1). The app sends a cart
 * and the customer's details; this function places the order with the site's
 * own store and hands back the order number and, for a card order, the store's
 * payment link. The card is typed on the store's payment page, never in the app.
 *
 * Both stores price every order themselves and ignore any price sent to them,
 * so no price goes out from here: only product references and quantities.
 *
 * SAFETY. An order here goes to the store's own order system. Neither spec
 * documents a test mode for orders: UPD's says the moment an order is created
 * its emails fire and its staff are notified, and PCR's sandbox partner key may
 * or may not reach its real staff (asked, not confirmed). So checkout is off
 * unless the site says otherwise, and the switches are deliberately narrow
 * (checkoutSettings):
 *
 *   STORE_CHECKOUT=sandbox      the only value accepted. There is no live mode
 *                               in this code yet; adding one is a code change.
 *   PCR_PARTNER_KEY             must be the sandbox partner key (pk_sandbox_…);
 *   PCR_SIGNING_SECRET          a live key is refused.
 *   UPD_LIVE_ORDERS_OK=true     UPD's order address is the same in testing as
 *                               live, so every UPD order reaches its staff.
 *                               Set only when test orders are expected.
 *   CHARGX_PUBLISHABLE_KEY      UPD only: the sandbox store's key, which starts
 *                               the card payment (startChargxPayment). Without
 *                               it a UPD card order has no payment link.
 *   UPD_CARD_PAYMENT=store     UPD only: start the card payment through UPD's
 *                               own /api/checkout/card (startUpdCardPayment), as
 *                               its developer asked, instead of the ChargX
 *                               sandbox. Whether that route charges real cards
 *                               isn't known yet: leave unset until UPD says.
 *
 * A signed-in UPD customer's spending goes as UPD's `redeem` object, with their
 * token: UPD checks the balance. The staging test account's balance (which UPD
 * doesn't know) still goes as a discount under an assumed field name
 * (DISCOUNT_FIELD), which UPD ignores.
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
  /**
   * `chargxKey`: the sandbox store's publishable key, which starts UPD's card payments (UPD API doc §6).
   * `storeCardRoute`: start them through UPD's own /api/checkout/card instead (UPD_CARD_PAYMENT=store).
   */
  | { ok: true; brand: 'upd'; chargxKey?: string; storeCardRoute?: true }
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
  return {
    ok: true,
    brand,
    ...(env.CHARGX_PUBLISHABLE_KEY ? { chargxKey: env.CHARGX_PUBLISHABLE_KEY } : {}),
    ...(env.UPD_CARD_PAYMENT === 'store' ? { storeCardRoute: true as const } : {}),
  }
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
  /** Points and credit the customer chose to apply, in dollars; absent when none. */
  discountUsd?: number
  /** A promo code the customer typed (UPD only; the store checks it). */
  promoCode?: string
  /**
   * What the signed-in UPD customer chose to spend (UPD's `redeem`): points, credit and fixed rewards. UPD checks
   * the balance and uses only what the order needs. Needs the customer's token.
   */
  redeem?: Redeem
  /** The referral code that brought the customer (UPD's `ref`, from a `?ref=` link). */
  ref?: string
  /** What the customer agreed to be contacted about: only boxes they actually ticked. */
  consent: { marketing: boolean; sms: boolean; call: boolean }
}

export interface Redeem {
  points?: number
  creditUsd?: number
  rewards?: string[]
}

/** The most a customer can apply to one order; a sanity bound, not a rule. */
export const MAX_DISCOUNT_USD = 10_000
const MAX_REDEEM_POINTS = 10_000_000
const REWARD_ID = /^[a-z0-9_-]{1,40}$/
/** UPD's website keeps referral codes of 4–32 letters, digits and dashes. */
const REF_CODE = /^[A-Za-z0-9-]{4,32}$/

/** UPD's `redeem` object from the app's request; undefined when empty, null when malformed. */
function parseRedeem(value: unknown): Redeem | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  const redeem: Redeem = {}
  if (value.points !== undefined) {
    const p = value.points
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > MAX_REDEEM_POINTS) return null
    if (p > 0) redeem.points = p
  }
  if (value.creditUsd !== undefined) {
    const c = value.creditUsd
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > MAX_DISCOUNT_USD) return null
    if (c > 0) redeem.creditUsd = Math.round(c * 100) / 100
  }
  if (value.rewards !== undefined) {
    const r = value.rewards
    if (!Array.isArray(r) || r.length > 10 || !r.every((id) => typeof id === 'string' && REWARD_ID.test(id))) return null
    if (r.length > 0) redeem.rewards = [...new Set(r as string[])]
  }
  return Object.keys(redeem).length > 0 ? redeem : undefined
}

export const MAX_BODY_CHARS = 16_000
/** Both stores' limits: PCR takes 50 lines and 1–100 of each. */
export const MAX_LINES = 50
export const MAX_QTY = 100

const PCR_REF = /^[A-Za-z0-9-]{1,64}$/
const UPD_REF = /^[a-z0-9-]{1,120}$/
const US_STATE = /^[A-Z]{2}$/
const US_ZIP = /^\d{5}(-\d{4})?$/
/** The app's promo code check (src/lib/shop/checkout.ts), again here. */
const PROMO_CODE = /^[A-Za-z0-9_-]{2,40}$/
/** A Supabase access token (a JWT): three base64url parts. */
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const MAX_TOKEN_CHARS = 4096

/**
 * The signed-in UPD customer's token from the app's request, to pass on to
 * UPD's order API so the order is linked to the account (UPD's own checkout
 * does the same). Undefined when absent or not shaped like a token. UPD checks
 * it; it is never logged or kept here.
 */
export function customerToken(header: string | null): string | undefined {
  if (!header || header.length > MAX_TOKEN_CHARS + 7) return undefined
  return BEARER.exec(header)?.[1]
}
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

  let discountUsd: number | undefined
  if (input.discountUsd !== undefined) {
    const d = input.discountUsd
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > MAX_DISCOUNT_USD) return { ok: false, field: 'discount' }
    if (d > 0) discountUsd = Math.round(d * 100) / 100
  }
  const rawConsent = isRecord(input.consent) ? input.consent : {}
  const consent = { marketing: rawConsent.marketing === true, sms: rawConsent.sms === true, call: rawConsent.call === true }

  // Only UPD's order takes a promo code; PCR's documents none, so one sent for PCR is refused rather than dropped.
  let promoCode: string | undefined
  if (input.promoCode !== undefined && input.promoCode !== '') {
    if (brand !== 'upd' || typeof input.promoCode !== 'string' || !PROMO_CODE.test(input.promoCode)) return { ok: false, field: 'promoCode' }
    promoCode = input.promoCode
  }

  // Spending rewards and referral codes exist only on UPD.
  const redeem = parseRedeem(input.redeem)
  if (redeem === null || (redeem && brand !== 'upd')) return { ok: false, field: 'redeem' }
  let ref: string | undefined
  if (input.ref !== undefined && input.ref !== '') {
    if (brand !== 'upd' || typeof input.ref !== 'string' || !REF_CODE.test(input.ref)) return { ok: false, field: 'ref' }
    ref = input.ref
  }

  const request: CheckoutRequest = { items, customer: { name, phone, email, address }, paymentMethod, language, consent }
  if (discountUsd !== undefined) request.discountUsd = discountUsd
  if (promoCode !== undefined) request.promoCode = promoCode
  if (redeem) request.redeem = redeem
  if (ref !== undefined) request.ref = ref
  return { ok: true, request }
}

// ---------------------------------------------------------------------------
// The store's request, and reading its answer.
// ---------------------------------------------------------------------------

const PCR_ORDERS_URL = 'https://catalog.peptidescostarica.net/api/partner/orders'
const PCR_CUSTOMERS_URL = 'https://catalog.peptidescostarica.net/api/partner/customers'
const UPD_ORDERS_URL = 'https://www.usapeptidedepot.com/api/orders'
const CHARGX_PAYMENT_REQUEST_URL = 'https://api.chargx.io/v1/payment-request'

/**
 * ASSUMED field names for the points and credit applied to an order. Neither
 * store's spec documents a discount yet (November 2026); the agreed assumption
 * is that their order APIs will take one. Change these to the documented names
 * when they arrive. Whatever the store does with it, its returned total is what
 * the app shows and the customer pays.
 */
export const DISCOUNT_FIELD: Record<CatalogueBrand, string> = { pcr: 'discount_usd', upd: 'discountUsd' }

export interface StoreRequest {
  url: string
  headers: Record<string, string>
  /** The exact string sent, which is also the string PCR's signature covers. */
  body: string
}

/**
 * Where an app order came from, in the shape of the first- and last-touch
 * attribution UPD's website sends with its orders (`firstTouch` / `lastTouch`:
 * source, medium, landing, at), so UPD's reports can tell app orders apart. UPD's
 * admin has no "app" channel yet; this is what it would key on.
 */
export function appAttribution(now: Date): { source: string; medium: string; landing: string; at: string } {
  return { source: 'app', medium: 'app', landing: '/app', at: now.toISOString() }
}

/**
 * The order as each store's API documents it (partner integration doc §3; UPD API doc §4), plus, for UPD, what its
 * own website sends and its developer asked for (2026-11-18): the promo code, shipping protection (off: the app
 * doesn't offer it) and attribution; and the signed-in customer's token, which links the order to their account.
 */
export function buildStoreRequest(
  settings: CheckoutSettings & { ok: true },
  request: CheckoutRequest,
  token?: string,
  now: Date = new Date(),
): StoreRequest {
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
      ...(request.discountUsd ? { [DISCOUNT_FIELD.pcr]: request.discountUsd } : {}),
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
  // The spec (§4) spells the ZIP `postalCode`; UPD's own checkout sends `postal_code`. Both go until the
  // first sandbox order shows which their API reads.
  const body = JSON.stringify({
    fullName: customer.name,
    email: customer.email,
    phone: customer.phone,
    items: request.items.map(({ ref, qty }) => ({ slug: ref, quantity: qty })),
    shippingAddress: { line1, ...(line2 ? { line2 } : {}), city, state: region, postalCode, postal_code: postalCode, country: 'US' },
    complianceAck: true,
    paymentMethod: 'card',
    smsConsent: request.consent.sms,
    callConsent: request.consent.call,
    // UPD's developer (19 November 2026): every app order says so; rewards apply only to app orders.
    channel: 'app',
    ...(request.ref ? { ref: request.ref } : {}),
    ...(request.redeem && token ? { redeem: request.redeem } : {}),
    ...(request.promoCode ? { promoCode: request.promoCode } : {}),
    shippingProtection: false,
    firstTouch: appAttribution(now),
    lastTouch: appAttribution(now),
    ...(request.discountUsd ? { [DISCOUNT_FIELD.upd]: request.discountUsd } : {}),
  })
  return {
    url: UPD_ORDERS_URL,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  }
}

/** What UPD applied from the customer's rewards (`order.rewards`), as far as the app needs to show it. */
export interface RewardsApplied {
  pointsUsed?: number
  creditUsd?: number
  tierDiscountUsd?: number
  /** Fixed rewards applied, by id. */
  rewards?: string[]
}

export interface OrderTotals {
  currency: StorePrice['currency']
  goods?: number
  discount?: number
  shipping?: number
  total: number
  rewards?: RewardsApplied
}

export type StoreAnswer =
  /** `paymentToken`: UPD's one-time token for starting the card payment; never sent to the app. */
  | { kind: 'placed'; orderNumber: string; status?: string; totals?: OrderTotals; paymentUrl?: string; paymentToken?: string }
  /** The store said no, with a message written for the customer (PCR asks that it's shown as it is). */
  | { kind: 'refused'; message?: string }
  /** UPD didn't accept the customer's token (expired or signed out): no order was made; refresh and ask again. */
  | { kind: 'unauthorized' }
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

/** The first of these fields that holds a sensible amount. */
function firstMoney(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = money(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

let loggedRewardsShape = false

/**
 * UPD's `order.rewards` breakdown. Its developer described it in words ("the reply has the breakdown in
 * order.rewards"), not field by field, so the likely names are read and the names actually sent are logged once
 * (never the values) to check against. Undefined when nothing was applied or nothing is recognised.
 */
export function readRewardsApplied(value: unknown): RewardsApplied | undefined {
  if (!isRecord(value)) return undefined
  if (!loggedRewardsShape) {
    loggedRewardsShape = true
    console.log(`orders: upd order.rewards fields: ${Object.keys(value).slice(0, 40).join(', ')}`)
  }
  const applied: RewardsApplied = {}
  const points = firstMoney(value, ['pointsUsed', 'pointsRedeemed', 'points'])
  if (points) applied.pointsUsed = Math.round(points)
  const credit = firstMoney(value, ['creditUsedUsd', 'creditUsd', 'storeCreditUsd', 'creditApplied'])
  if (credit) applied.creditUsd = credit
  const tier = firstMoney(value, ['tierDiscountUsd', 'tierDiscount'])
  if (tier) applied.tierDiscountUsd = tier
  const list = value.rewards ?? value.fixedRewards ?? value.applied
  if (Array.isArray(list)) {
    const ids = list
      .map((r) => (typeof r === 'string' ? r : isRecord(r) && typeof r.id === 'string' ? r.id : undefined))
      .filter((id): id is string => id !== undefined && REWARD_ID.test(id))
    if (ids.length > 0) applied.rewards = ids.slice(0, 10)
  }
  return Object.keys(applied).length > 0 ? applied : undefined
}

/**
 * Reads the store's answer. PCR's shape is documented. UPD's spec shows
 * `{ order: {...} }`, while UPD's own website reads `{ data: { order, payment:
 * { token } } }` (seen in its public checkout code, November 2026), so both
 * are accepted until a sandbox order shows which is real. UPD's order carries
 * no payment link; one is started separately (startChargxPayment). A total of
 * 0 (UPD's doc example) is treated as unknown, never shown as the price.
 */
export function readStoreAnswer(brand: CatalogueBrand, status: number, body: unknown): StoreAnswer {
  // UPD's developer: "An invalid or expired token gets a 401, so please refresh the session and retry."
  if (brand === 'upd' && status === 401) return { kind: 'unauthorized' }
  if (!isRecord(body)) return { kind: 'unconfirmed' }
  const root = brand === 'upd' && isRecord(body.data) ? body.data : body
  const order = brand === 'upd' && isRecord(root.order) ? root.order : root
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
      if (total) {
        totals = { currency: 'USD', total, goods: money(order.subtotal), shipping: money(order.shippingTotal) }
        // UPD's website reads `discountTotal` on its price preview; kept when an order carries it too.
        const discount = money(order.discountTotal)
        if (discount) totals.discount = discount
        const applied = readRewardsApplied(order.rewards)
        if (applied) totals.rewards = applied
      }
    }
    if (totals) answer.totals = totals
    if (brand === 'upd' && isRecord(root.payment) && typeof root.payment.token === 'string' && root.payment.token.length <= 500) {
      answer.paymentToken = root.payment.token
    }
    return answer
  }

  // A clear refusal: PCR's ok:false, or a 4xx with a message. UPD's spec doesn't show its error shape; its
  // website reads a per-field `fields` object and a `message`.
  if ((brand === 'pcr' && body.ok === false) || (status >= 400 && status < 500)) {
    const fieldMessage = isRecord(body.fields) ? Object.values(body.fields).find((v) => typeof v === 'string') : undefined
    return { kind: 'refused', message: customerMessage(body.error) ?? customerMessage(fieldMessage) ?? customerMessage(body.message) }
  }
  return { kind: 'unconfirmed' }
}

// ---------------------------------------------------------------------------
// Starting the card payment.
// ---------------------------------------------------------------------------

/** Where the payment form is hosted: ChargX's own domain (its docs show dashboard.chargx.io/payment-form/…). */
export function isChargxForm(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'chargx.io' || url.hostname.endsWith('.chargx.io'))
  } catch {
    return false
  }
}

/**
 * Starts a UPD card payment, as UPD's spec says (§6: "ChargX, with the sandbox
 * keys"): ChargX's payment request for the order's total, with the order number
 * as `external_order_id` (ChargX's documented reference, echoed back in its
 * webhook) and the customer's details prefilled on the form, returning to the
 * app's own return page. The card is typed on ChargX's form, never in the app.
 *
 * Sandbox only for now: a reply that says it is a production request is
 * refused. Returns the form's address, or undefined when it couldn't start;
 * the order stands either way and is never placed again.
 */
const UPD_CARD_URL = 'https://www.usapeptidedepot.com/api/checkout/card'

/**
 * Starts a UPD card payment the way UPD's website does and its developer asked for (19 November 2026): POST
 * /api/checkout/card with the order number and the order reply's `payment.token`, answered with
 * `data.paymentUrl` (read from UPD's public checkout code). UPD's server holds the payment key. Whether this route
 * charges real cards or has a sandbox is not known yet, so it runs only when UPD_CARD_PAYMENT=store.
 */
export async function startUpdCardPayment(fetchFn: FetchLike, input: { orderNumber: string; paymentToken: string }): Promise<string | undefined> {
  try {
    const response = await fetchFn(UPD_CARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ orderNumber: input.orderNumber, token: input.paymentToken, method: 'card' }),
      signal: AbortSignal.timeout(15_000),
    })
    const body: unknown = await response.json().catch(() => null)
    const paymentUrl = isRecord(body) && isRecord(body.data) ? body.data.paymentUrl : undefined
    if (!response.ok) {
      console.error(`orders: upd card payment answered ${response.status}`)
      return undefined
    }
    if (isAllowedPaymentUrl(paymentUrl, 'upd')) return paymentUrl
    console.error('orders: upd card payment link refused (missing, or not on the store or ChargX)')
    return undefined
  } catch (err) {
    console.error('orders: upd card payment failed:', err instanceof Error ? err.name : 'error')
    return undefined
  }
}

export async function startChargxPayment(
  fetchFn: FetchLike,
  input: {
    publishableKey: string
    orderNumber: string
    amount: number
    customer: CheckoutRequest['customer']
    /** The site's own origin, for the return page. */
    origin: string
    /** Dev only (vite.config.ts): a local pretend form instead of ChargX's. */
    mockFormOrigin?: string
  },
): Promise<string | undefined> {
  const back = (result: 'success' | 'cancel') =>
    `${input.origin}/pay-return.html?order=${encodeURIComponent(input.orderNumber)}&result=${result}`
  let checkoutUrl: unknown
  let production: unknown
  try {
    const response = await fetchFn(CHARGX_PAYMENT_REQUEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-publishable-api-key': input.publishableKey },
      body: JSON.stringify({ amount: input.amount, currency: 'usd', type: 'card', success_url: back('success'), cancel_url: back('cancel') }),
      signal: AbortSignal.timeout(15_000),
    })
    const body: unknown = await response.json().catch(() => null)
    const request = isRecord(body) && isRecord(body.payment_request) ? body.payment_request : undefined
    checkoutUrl = request?.checkout_url
    production = request?.isProduction
    if (!response.ok) console.error(`orders: chargx payment request answered ${response.status}`)
  } catch (err) {
    console.error('orders: chargx payment request failed:', err instanceof Error ? err.name : 'error')
    return undefined
  }
  if (production === true) {
    console.error('orders: chargx answered with a production payment request while checkout is in sandbox; not used')
    return undefined
  }
  if (typeof checkoutUrl !== 'string') return undefined
  const allowed = isChargxForm(checkoutUrl) || (input.mockFormOrigin !== undefined && checkoutUrl.startsWith(`${input.mockFormOrigin}/`))
  if (!allowed) {
    console.error('orders: chargx payment form refused (not on chargx.io)')
    return undefined
  }
  const url = new URL(checkoutUrl)
  const { address } = input.customer
  const prefill: Record<string, string | undefined> = {
    external_order_id: input.orderNumber,
    email: input.customer.email,
    'phone-number': input.customer.phone,
    'street-address': address.line1,
    'unit-address': address.line2,
    city: address.city,
    state: address.region,
    'zip-code': address.postalCode,
    country: 'US',
  }
  for (const [key, value] of Object.entries(prefill)) if (value) url.searchParams.set(key, value)
  return url.toString()
}

/**
 * Peptides CR's payment link is on its own site, which refuses to be shown
 * inside another (X-Frame-Options: SAMEORIGIN). If the link simply forwards to
 * ChargX's form, that form can be shown inside the app instead; this asks
 * where it forwards, without following it. Undefined when it doesn't forward
 * to ChargX (the link then opens full-screen).
 */
export async function findChargxForward(fetchFn: FetchLike, paymentUrl: string): Promise<string | undefined> {
  try {
    const response = await fetchFn(paymentUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(4000) })
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return undefined
    const target = new URL(location, paymentUrl).toString()
    return isChargxForm(target) ? target : undefined
  } catch {
    return undefined
  }
}

/**
 * Files a customer who ticked the marketing box with Peptides CR's CRM
 * (partner integration doc §2), with the consent flags set only because they
 * agreed: the doc says those flags are the legal basis for messaging them.
 * Best effort: the order already stands, so a failure here is only logged.
 */
export async function postPcrConsent(
  fetchFn: FetchLike,
  settings: CheckoutSettings & { ok: true; brand: 'pcr' },
  request: CheckoutRequest,
): Promise<void> {
  if (!request.consent.marketing) return
  const body = JSON.stringify({
    contact_method: 'whatsapp',
    contact_value: request.customer.phone.replace(/[^\d+]/g, ''),
    name: request.customer.name,
    email: request.customer.email,
    language: request.language,
    marketing_consent: true,
    whatsapp_consent: true,
    source: 'peptides-cr-app',
  })
  try {
    const response = await fetchFn(PCR_CUSTOMERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Partner-Key': settings.partnerKey,
        'X-Partner-Signature': signPartnerBody(body, settings.signingSecret),
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) console.error(`orders: pcr customer post answered ${response.status}`)
  } catch (err) {
    console.error('orders: pcr customer post failed:', err instanceof Error ? err.name : 'error')
  }
}

// ---------------------------------------------------------------------------
// The handler.
// ---------------------------------------------------------------------------

const STORE_TIMEOUT_MS = 20_000

export type OrderResponseBody =
  /** `paymentUrl` opens full-screen; `embedUrl`, when there is one, is ChargX's own form, shown inside the app. */
  | { ok: true; orderNumber: string; status?: string; totals?: OrderTotals; paymentUrl?: string; embedUrl?: string }
  | { ok: false; error: 'checkout-off' | 'invalid' | 'refused' | 'unconfirmed' | 'unauthorized'; field?: string; message?: string }

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

  // Only UPD has store accounts; a token sent to a PCR site is ignored.
  const token = settings.brand === 'upd' ? customerToken(req.headers.get('authorization')) : undefined
  // Spending rewards needs the signed-in customer (UPD checks their balance).
  if (parsed.request.redeem && !token) return reply({ ok: false, error: 'unauthorized' }, 401)
  const storeRequest = buildStoreRequest(settings, parsed.request, token)
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
    const { orderNumber, status, totals } = answer
    let paymentUrl = answer.paymentUrl
    let embedUrl: string | undefined
    if (parsed.request.paymentMethod === 'card') {
      if (settings.brand === 'upd' && !paymentUrl && settings.storeCardRoute) {
        if (answer.paymentToken) paymentUrl = await startUpdCardPayment(fetchFn, { orderNumber, paymentToken: answer.paymentToken })
        else console.error('orders: upd order reply has no payment token; no card payment started')
        if (paymentUrl) embedUrl = isChargxForm(paymentUrl) ? paymentUrl : await findChargxForward(fetchFn, paymentUrl)
      } else if (settings.brand === 'upd' && !paymentUrl && settings.chargxKey && totals?.total) {
        paymentUrl = await startChargxPayment(fetchFn, {
          publishableKey: settings.chargxKey,
          orderNumber,
          amount: totals.total,
          customer: parsed.request.customer,
          origin: new URL(req.url).origin,
          mockFormOrigin: env.MOCK_PAYMENT_FORM_ORIGIN,
        })
        embedUrl = paymentUrl
      } else if (paymentUrl) {
        embedUrl = isChargxForm(paymentUrl) ? paymentUrl : await findChargxForward(fetchFn, paymentUrl)
      }
    }
    if (settings.brand === 'pcr') await postPcrConsent(fetchFn, settings, parsed.request)
    console.log(
      `orders: ${brand} ${orderNumber} placed (${parsed.request.paymentMethod}${paymentUrl ? ', payment link' : ''}${embedUrl ? ', in app' : ''}${token ? ', signed in' : ''}${parsed.request.promoCode ? ', promo code' : ''})`,
    )
    return reply({ ok: true, orderNumber, status, totals, paymentUrl, embedUrl }, 200)
  }
  if (answer.kind === 'refused') return reply({ ok: false, error: 'refused', message: answer.message }, 422)
  if (answer.kind === 'unauthorized') return reply({ ok: false, error: 'unauthorized' }, 401)
  return reply({ ok: false, error: 'unconfirmed' }, 502)
}

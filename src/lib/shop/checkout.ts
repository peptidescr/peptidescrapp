/**
 * Guest checkout from the app's side (Part B, phase B1). The app sends the
 * cart and the customer's details to /api/orders (netlify/lib/checkout.ts),
 * which places the order with the store; a card order comes back with the
 * store's payment link, and the card is typed there, never here.
 *
 * The rules below mirror the server's so the form can point at a mistake
 * before sending; the server checks everything again.
 */
import type { BrandId } from '../../brand'
import type { Locale } from '../units'
import type { CartLine } from './cart'
import type { ShopCurrency } from './catalogue'

export type PaymentMethod = 'card' | 'whatsapp'

export interface CheckoutForm {
  name: string
  phone: string
  email: string
  line1: string
  line2: string
  city: string
  /** Province (PCR) or two-letter state (UPD). */
  region: string
  postalCode: string
  paymentMethod: PaymentMethod
  researchUseAck: boolean
}

export type CheckoutField = 'name' | 'phone' | 'email' | 'line1' | 'city' | 'region' | 'postalCode' | 'paymentMethod' | 'researchUseAck'

export function emptyCheckoutForm(brand: BrandId): CheckoutForm {
  return {
    name: '',
    // Costa Rica's code to start from; PCR's store needs the number in international form.
    phone: brand === 'pcr' ? '+506 ' : '',
    email: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    paymentMethod: 'card',
    researchUseAck: false,
  }
}

/** The payment methods each store takes in the app: UPD cards only; PCR also a WhatsApp order. */
export function paymentMethodsFor(brand: BrandId): PaymentMethod[] {
  return brand === 'pcr' ? ['card', 'whatsapp'] : ['card']
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

/** The first field that needs fixing, in the order the form shows them; null when it can be sent. */
export function firstInvalidField(form: CheckoutForm, brand: BrandId): CheckoutField | null {
  if (form.name.trim().length < 2) return 'name'
  const phone = form.phone.trim()
  const digits = phone.replace(/\D/g, '')
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15 || (brand === 'pcr' && !phone.startsWith('+'))) {
    return 'phone'
  }
  if (!EMAIL.test(form.email.trim())) return 'email'
  if (!form.line1.trim()) return 'line1'
  if (!form.city.trim()) return 'city'
  if (brand === 'upd') {
    if (!/^[A-Za-z]{2}$/.test(form.region.trim())) return 'region'
    if (!/^\d{5}(-\d{4})?$/.test(form.postalCode.trim())) return 'postalCode'
  }
  if (!paymentMethodsFor(brand).includes(form.paymentMethod)) return 'paymentMethod'
  if (!form.researchUseAck) return 'researchUseAck'
  return null
}

export interface OrderTotals {
  currency: ShopCurrency
  goods?: number
  discount?: number
  shipping?: number
  total: number
}

export type OrderResult =
  | { kind: 'placed'; orderNumber: string; status?: string; totals?: OrderTotals; paymentUrl?: string }
  | { kind: 'invalid'; field?: string }
  /** The store said no; its message is for the customer, shown as it is. */
  | { kind: 'refused'; message?: string }
  /** The order may or may not exist: never offer a plain retry. */
  | { kind: 'unconfirmed' }
  | { kind: 'off' }
  /** Refused before reaching the store (no connection, or too many tries): no order exists. */
  | { kind: 'notSent' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTotals(value: unknown): OrderTotals | undefined {
  if (!isRecord(value) || (value.currency !== 'USD' && value.currency !== 'CRC') || typeof value.total !== 'number') return undefined
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return { currency: value.currency, total: value.total, goods: num(value.goods), discount: num(value.discount), shipping: num(value.shipping) }
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

/** Reads /api/orders' answer (see OrderResponseBody in netlify/lib/checkout.ts). */
export function readOrderResponse(status: number, body: unknown): OrderResult {
  if (isRecord(body) && body.ok === true && typeof body.orderNumber === 'string') {
    const result: OrderResult & { kind: 'placed' } = { kind: 'placed', orderNumber: body.orderNumber }
    if (typeof body.status === 'string') result.status = body.status
    const totals = readTotals(body.totals)
    if (totals) result.totals = totals
    const paymentUrl = httpsUrl(body.paymentUrl)
    if (paymentUrl) result.paymentUrl = paymentUrl
    return result
  }
  const error = isRecord(body) ? body.error : undefined
  if (error === 'invalid') return { kind: 'invalid', field: isRecord(body) && typeof body.field === 'string' ? body.field : undefined }
  if (error === 'refused') return { kind: 'refused', message: isRecord(body) && typeof body.message === 'string' ? body.message : undefined }
  if (error === 'checkout-off') return { kind: 'off' }
  // 403 and 429 are refused before anything reaches the store.
  if (status === 403 || status === 429) return { kind: 'notSent' }
  return { kind: 'unconfirmed' }
}

export async function placeOrder(
  cart: readonly CartLine[],
  form: CheckoutForm,
  locale: Locale,
  fetchFn: typeof fetch = fetch,
): Promise<OrderResult> {
  const body = {
    items: cart.map(({ ref, qty }) => ({ ref, qty })),
    customer: {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: {
        line1: form.line1.trim(),
        line2: form.line2.trim() || undefined,
        city: form.city.trim(),
        region: form.region.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
      },
    },
    paymentMethod: form.paymentMethod,
    language: locale === 'es-CR' ? 'es' : 'en',
    researchUseAck: form.researchUseAck,
  }
  let response: Response
  try {
    response = await fetchFn('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch rejects only when no response came back at all; the request may still have
    // reached the server, so this is as uncertain as a timeout there.
    return navigator.onLine === false ? { kind: 'notSent' } : { kind: 'unconfirmed' }
  }
  let json: unknown = null
  try {
    json = await response.json()
  } catch {
    // Not JSON: read as unconfirmed below.
  }
  return readOrderResponse(response.status, json)
}

// ---------------------------------------------------------------------------
// The order just placed: kept on the phone so its status survives a reload
// or a trip to the payment page and back.
// ---------------------------------------------------------------------------

export interface PlacedOrder {
  orderNumber: string
  placedAt: string
  paymentMethod: PaymentMethod
  paymentUrl?: string
  totals?: OrderTotals
  paid?: boolean
}

const ORDER_KEY = 'shop-last-order-v1'

export function loadPlacedOrder(): PlacedOrder | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null')
    if (!isRecord(raw) || typeof raw.orderNumber !== 'string' || typeof raw.placedAt !== 'string') return null
    return {
      orderNumber: raw.orderNumber,
      placedAt: raw.placedAt,
      paymentMethod: raw.paymentMethod === 'whatsapp' ? 'whatsapp' : 'card',
      paymentUrl: httpsUrl(raw.paymentUrl),
      totals: readTotals(raw.totals),
      paid: raw.paid === true,
    }
  } catch {
    return null
  }
}

export function savePlacedOrder(order: PlacedOrder | null): void {
  try {
    if (order) localStorage.setItem(ORDER_KEY, JSON.stringify(order))
    else localStorage.removeItem(ORDER_KEY)
  } catch {
    // Storage unavailable: the order's status lasts this visit only.
  }
}

/** Whether the payment webhook has heard this order is paid; null when the server can't be asked. */
export async function fetchPaid(orderNumber: string, fetchFn: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const response = await fetchFn(`/api/order-status?order=${encodeURIComponent(orderNumber)}`, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return isRecord(body) && typeof body.paid === 'boolean' ? body.paid : null
  } catch {
    return null
  }
}

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { FetchLike } from './catalogue.ts'
import {
  buildStoreRequest,
  checkoutSettings,
  handleOrderRequest,
  isAllowedPaymentUrl,
  parseCheckoutRequest,
  readStoreAnswer,
} from './checkout.ts'

// Made-up values; no real key appears anywhere in the repo.
const PCR_ENV = { STORE_CHECKOUT: 'sandbox', PCR_PARTNER_KEY: 'pk_sandbox_test-not-real', PCR_SIGNING_SECRET: 'test-secret-not-real' }
const UPD_ENV = { STORE_CHECKOUT: 'sandbox', UPD_LIVE_ORDERS_OK: 'true' }
const PCR_ID = '11111111-2222-4333-8444-555555555555'

const pcrInput = (over: Record<string, unknown> = {}) => ({
  items: [{ ref: PCR_ID, qty: 2 }],
  customer: {
    name: 'María Rodríguez',
    phone: '+506 8888 7777',
    email: 'maria@example.com',
    address: { line1: 'Barrio Escalante, Casa 14', city: 'San José', region: 'San José' },
  },
  paymentMethod: 'card',
  language: 'es',
  researchUseAck: true,
  ...over,
})

const updInput = (over: Record<string, unknown> = {}) => ({
  items: [{ ref: 'bpc-157-5mg', qty: 2 }],
  customer: {
    name: 'Jane Doe',
    phone: '(405) 555-0134',
    email: 'jane@example.com',
    address: { line1: '12 Main St', city: 'Austin', region: 'tx', postalCode: '78701' },
  },
  paymentMethod: 'card',
  language: 'en',
  researchUseAck: true,
  ...over,
})

describe('checkoutSettings', () => {
  it('is off unless STORE_CHECKOUT is exactly "sandbox"', () => {
    expect(checkoutSettings('pcr', {}).ok).toBe(false)
    expect(checkoutSettings('pcr', { ...PCR_ENV, STORE_CHECKOUT: 'live' }).ok).toBe(false)
    expect(checkoutSettings('pcr', PCR_ENV).ok).toBe(true)
  })

  it('refuses a PCR partner key that is not a sandbox key, and never shows it', () => {
    const live = checkoutSettings('pcr', { ...PCR_ENV, PCR_PARTNER_KEY: 'pk_live_test-not-real' })
    expect(live).toEqual({ ok: false, reason: 'PCR_PARTNER_KEY is not a sandbox key' })
    expect(JSON.stringify(live)).not.toContain('pk_live_test')
  })

  it('needs UPD_LIVE_ORDERS_OK for UPD, whose order API has no sandbox', () => {
    expect(checkoutSettings('upd', { STORE_CHECKOUT: 'sandbox' }).ok).toBe(false)
    expect(checkoutSettings('upd', UPD_ENV).ok).toBe(true)
  })
})

describe('parseCheckoutRequest', () => {
  it('accepts a good order and merges repeated lines', () => {
    const parsed = parseCheckoutRequest(pcrInput({ items: [{ ref: PCR_ID, qty: 2 }, { ref: PCR_ID, qty: 3 }] }), 'pcr')
    expect(parsed.ok && parsed.request.items).toEqual([{ ref: PCR_ID, qty: 5 }])
  })

  it('names the field that is wrong', () => {
    const fieldOf = (input: unknown, brand: 'pcr' | 'upd' = 'pcr') => {
      const parsed = parseCheckoutRequest(input, brand)
      return parsed.ok ? null : parsed.field
    }
    expect(fieldOf(pcrInput({ items: [] }))).toBe('items')
    expect(fieldOf(pcrInput({ items: [{ ref: PCR_ID, qty: 101 }] }))).toBe('items')
    expect(fieldOf(pcrInput({ items: [{ ref: PCR_ID, qty: 1.5 }] }))).toBe('items')
    expect(fieldOf(pcrInput({ items: [{ ref: '../admin', qty: 1 }] }))).toBe('items')
    expect(fieldOf(pcrInput({ researchUseAck: false }))).toBe('researchUseAck')
    expect(fieldOf(updInput({ paymentMethod: 'whatsapp' }), 'upd')).toBe('paymentMethod')
    const customer = pcrInput().customer
    expect(fieldOf(pcrInput({ customer: { ...customer, phone: '8888 7777' } }))).toBe('phone')
    expect(fieldOf(pcrInput({ customer: { ...customer, email: 'not-an-email' } }))).toBe('email')
    expect(fieldOf(pcrInput({ customer: { ...customer, address: { city: 'X' } } }))).toBe('line1')
    const upd = updInput().customer
    expect(fieldOf(updInput({ customer: { ...upd, address: { ...upd.address, postalCode: '7870' } } }), 'upd')).toBe('postalCode')
  })

  it('caps a line at 100 even when it arrives split', () => {
    const parsed = parseCheckoutRequest(pcrInput({ items: [{ ref: PCR_ID, qty: 60 }, { ref: PCR_ID, qty: 60 }] }), 'pcr')
    expect(parsed.ok).toBe(false)
  })

  it('takes control characters and markup out of text', () => {
    const customer = { ...pcrInput().customer, name: 'Ana\u0000 <b>Mora</b>' }
    const parsed = parseCheckoutRequest(pcrInput({ customer }), 'pcr')
    expect(parsed.ok && parsed.request.customer.name).toBe('Ana b Mora /b')
  })
})

describe('buildStoreRequest', () => {
  it('builds PCR\'s order, signed over the exact body sent, with no prices', () => {
    const settings = checkoutSettings('pcr', PCR_ENV)
    const parsed = parseCheckoutRequest(pcrInput(), 'pcr')
    if (!settings.ok || !parsed.ok) throw new Error('setup')
    const req = buildStoreRequest(settings, parsed.request)
    expect(req.url).toBe('https://catalog.peptidescostarica.net/api/partner/orders')
    expect(JSON.parse(req.body)).toEqual({
      customer: {
        name: 'María Rodríguez',
        phone: '+506 8888 7777',
        email: 'maria@example.com',
        shipping_address: 'Barrio Escalante, Casa 14, San José, San José',
      },
      items: [{ product_id: PCR_ID, qty: 2 }],
      payment_method: 'card',
      language: 'es',
    })
    expect(req.headers['X-Partner-Key']).toBe(PCR_ENV.PCR_PARTNER_KEY)
    expect(req.headers['X-Partner-Signature']).toBe(createHmac('sha256', PCR_ENV.PCR_SIGNING_SECRET).update(req.body).digest('hex'))
    expect(req.body).not.toMatch(/price|total/i)
  })

  it('builds UPD\'s order with the research-use confirmation and no key', () => {
    const settings = checkoutSettings('upd', UPD_ENV)
    const parsed = parseCheckoutRequest(updInput(), 'upd')
    if (!settings.ok || !parsed.ok) throw new Error('setup')
    const req = buildStoreRequest(settings, parsed.request)
    expect(req.url).toBe('https://www.usapeptidedepot.com/api/orders')
    expect(JSON.parse(req.body)).toEqual({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '(405) 555-0134',
      items: [{ slug: 'bpc-157-5mg', quantity: 2 }],
      shippingAddress: { line1: '12 Main St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' },
      complianceAck: true,
      paymentMethod: 'card',
    })
    expect(Object.keys(req.headers)).toEqual(['Content-Type', 'Accept'])
  })
})

describe('readStoreAnswer', () => {
  it('reads PCR\'s placed order, totals and payment link', () => {
    expect(
      readStoreAnswer('pcr', 200, {
        ok: true,
        orderNumber: 'PTR-1042',
        status: 'Pending - Card',
        totals: { currency: 'USD', goods: 300, discount: 0, shipping: 0, total: 300 },
        paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/abc',
      }),
    ).toEqual({
      kind: 'placed',
      orderNumber: 'PTR-1042',
      status: 'Pending - Card',
      totals: { currency: 'USD', goods: 300, discount: 0, shipping: 0, total: 300 },
      paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/abc',
    })
  })

  it('passes PCR\'s refusal message through for the customer to read', () => {
    expect(readStoreAnswer('pcr', 200, { ok: false, error: 'Ese producto está agotado.' })).toEqual({
      kind: 'refused',
      message: 'Ese producto está agotado.',
    })
  })

  it('reads UPD\'s order, takes a payment link on it (assumed), and drops a $0 total', () => {
    const answer = readStoreAnswer('upd', 201, {
      order: { orderNumber: 'USP-77', status: 'pending', subtotal: 0, shippingTotal: 0, grandTotal: 0, paymentUrl: 'https://pay.chargx.io/c/1' },
    })
    expect(answer).toEqual({ kind: 'placed', orderNumber: 'USP-77', status: 'pending', paymentUrl: 'https://pay.chargx.io/c/1' })
  })

  it('treats anything unclear as unconfirmed, never as failed', () => {
    expect(readStoreAnswer('upd', 500, { error: 'boom' })).toEqual({ kind: 'unconfirmed' })
    expect(readStoreAnswer('pcr', 200, { ok: true })).toEqual({ kind: 'unconfirmed' })
    expect(readStoreAnswer('pcr', 200, null)).toEqual({ kind: 'unconfirmed' })
  })
})

describe('isAllowedPaymentUrl', () => {
  it('allows only https links on the store\'s own hosts or ChargX', () => {
    expect(isAllowedPaymentUrl('https://catalog.peptidescostarica.net/pay-card/x', 'pcr')).toBe(true)
    expect(isAllowedPaymentUrl('https://checkout.chargx.io/x', 'upd')).toBe(true)
    expect(isAllowedPaymentUrl('https://catalog.peptidescostarica.net/x', 'upd')).toBe(false)
    expect(isAllowedPaymentUrl('http://catalog.peptidescostarica.net/x', 'pcr')).toBe(false)
    expect(isAllowedPaymentUrl('https://evilchargx.io/x', 'pcr')).toBe(false)
    expect(isAllowedPaymentUrl('https://user@checkout.chargx.io/x', 'pcr')).toBe(false)
    expect(isAllowedPaymentUrl('javascript:alert(1)', 'pcr')).toBe(false)
  })
})

describe('handleOrderRequest', () => {
  const SITE = 'https://app.example.com'
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${SITE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SITE, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  /** A fake store: records what it was sent, answers with `reply`. Nothing reaches a network. */
  const fakeStore = (reply: () => Response) => {
    const calls: { url: string; body?: string; headers?: Record<string, string> }[] = []
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, body: init?.body, headers: init?.headers })
      return reply()
    }
    return { calls, fetchFn }
  }

  it('places the order and returns the payment link', async () => {
    const store = fakeStore(() =>
      Response.json({ ok: true, orderNumber: 'PTR-1', status: 'Pending - Card', paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/1' }),
    )
    const res = await handleOrderRequest(post(pcrInput()), 'pcr', PCR_ENV, store.fetchFn)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      orderNumber: 'PTR-1',
      status: 'Pending - Card',
      paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/1',
    })
    expect(store.calls).toHaveLength(1)
  })

  it('sends nothing to the store when checkout is off, the key is live, or the request is bad', async () => {
    const store = fakeStore(() => Response.json({}))
    expect((await handleOrderRequest(post(pcrInput()), 'pcr', {}, store.fetchFn)).status).toBe(503)
    expect((await handleOrderRequest(post(pcrInput()), 'pcr', { ...PCR_ENV, PCR_PARTNER_KEY: 'pk_live_x' }, store.fetchFn)).status).toBe(503)
    expect((await handleOrderRequest(post(updInput()), 'upd', { STORE_CHECKOUT: 'sandbox' }, store.fetchFn)).status).toBe(503)
    expect((await handleOrderRequest(post(pcrInput({ researchUseAck: false })), 'pcr', PCR_ENV, store.fetchFn)).status).toBe(400)
    expect((await handleOrderRequest(post('{not json'), 'pcr', PCR_ENV, store.fetchFn)).status).toBe(400)
    expect(store.calls).toHaveLength(0)
  })

  it('refuses requests from other sites, or with no Origin', async () => {
    const store = fakeStore(() => Response.json({}))
    expect((await handleOrderRequest(post(pcrInput(), { Origin: 'https://evil.example' }), 'pcr', PCR_ENV, store.fetchFn)).status).toBe(403)
    const noOrigin = new Request(`${SITE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect((await handleOrderRequest(noOrigin, 'pcr', PCR_ENV, store.fetchFn)).status).toBe(403)
    expect(store.calls).toHaveLength(0)
  })

  it('says "unconfirmed", not "failed", when the store times out or answers oddly', async () => {
    const timeout = fakeStore(() => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    const res = await handleOrderRequest(post(pcrInput()), 'pcr', PCR_ENV, timeout.fetchFn)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: 'unconfirmed' })
  })

  it('returns the store\'s refusal message', async () => {
    const store = fakeStore(() => Response.json({ ok: false, error: 'Producto agotado.' }, { status: 400 }))
    const res = await handleOrderRequest(post(pcrInput()), 'pcr', PCR_ENV, store.fetchFn)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ ok: false, error: 'refused', message: 'Producto agotado.' })
  })
})

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { FetchLike } from './catalogue.ts'
import {
  buildStoreRequest,
  checkoutSettings,
  customerToken,
  findChargxForward,
  handleOrderRequest,
  isAllowedPaymentUrl,
  parseCheckoutRequest,
  readStoreAnswer,
  startChargxPayment,
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

/** A fake network that answers by address; records every call. Nothing reaches a real one. */
function routes(map: Record<string, (init?: Parameters<FetchLike>[1]) => Response>) {
  const calls: { url: string; method?: string; body?: string; headers?: Record<string, string> }[] = []
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body, headers: init?.headers })
    const key = Object.keys(map).find((prefix) => url.startsWith(prefix))
    if (!key) throw new Error(`unexpected request to ${url}`)
    return map[key]!(init)
  }
  return { fetchFn, calls }
}

const CHARGX = 'https://api.chargx.io/v1/payment-request'
const FORM = 'https://dashboard.chargx.io/payment-form/01TEST'

describe('UPD orders and their card payment', () => {
  it('reads the reply UPD\'s own website reads, and the spec\'s, keeping the payment token on the server', () => {
    const real = readStoreAnswer('upd', 201, { data: { order: { orderNumber: 'USP-77', status: 'pending', grandTotal: 92.5, subtotal: 90, shippingTotal: 2.5 }, payment: { token: 'tok-1' } } })
    expect(real).toEqual({ kind: 'placed', orderNumber: 'USP-77', status: 'pending', totals: { currency: 'USD', total: 92.5, goods: 90, shipping: 2.5 }, paymentToken: 'tok-1' })
    expect(readStoreAnswer('upd', 200, { order: { orderNumber: 'USP-78', grandTotal: 10 } })).toMatchObject({ kind: 'placed', orderNumber: 'USP-78' })
  })

  it('shows the first per-field message of a refusal', () => {
    expect(readStoreAnswer('upd', 422, { fields: { email: 'Enter a valid email.' }, message: 'Check the form.' })).toEqual({ kind: 'refused', message: 'Enter a valid email.' })
    expect(readStoreAnswer('upd', 400, { message: 'Out of stock.' })).toEqual({ kind: 'refused', message: 'Out of stock.' })
  })

  const customer = { name: 'Jane Doe', phone: '(405) 555-0134', email: 'jane@example.com', address: { line1: '12 Main St', city: 'Austin', region: 'TX', postalCode: '78701' } }

  it('starts a ChargX payment for the total, with the order as external_order_id and the customer prefilled', async () => {
    const net = routes({ [CHARGX]: () => Response.json({ payment_request: { id: 'pr_1', checkout_url: FORM, isProduction: false } }) })
    const url = await startChargxPayment(net.fetchFn, { publishableKey: 'pk-test-not-real', orderNumber: 'USP-77', amount: 92.5, customer, origin: 'https://app.example.com' })
    const form = new URL(url!)
    expect(form.origin + form.pathname).toBe(FORM)
    expect(Object.fromEntries(form.searchParams)).toEqual({
      external_order_id: 'USP-77',
      email: 'jane@example.com',
      'phone-number': '(405) 555-0134',
      'street-address': '12 Main St',
      city: 'Austin',
      state: 'TX',
      'zip-code': '78701',
      country: 'US',
    })
    const sent = JSON.parse(net.calls[0]!.body!)
    expect(sent).toEqual({
      amount: 92.5,
      currency: 'usd',
      type: 'card',
      success_url: 'https://app.example.com/pay-return.html?order=USP-77&result=success',
      cancel_url: 'https://app.example.com/pay-return.html?order=USP-77&result=cancel',
    })
    expect(net.calls[0]!.headers?.['x-publishable-api-key']).toBe('pk-test-not-real')
  })

  it('refuses a production payment while in sandbox, a form off chargx.io, and a failed request', async () => {
    const start = (reply: () => Response) =>
      startChargxPayment(routes({ [CHARGX]: reply }).fetchFn, { publishableKey: 'k', orderNumber: 'USP-1', amount: 5, customer, origin: 'https://app.example.com' })
    expect(await start(() => Response.json({ payment_request: { checkout_url: FORM, isProduction: true } }))).toBeUndefined()
    expect(await start(() => Response.json({ payment_request: { checkout_url: 'https://evil.example/pay' } }))).toBeUndefined()
    expect(await start(() => new Response('nope', { status: 500 }))).toBeUndefined()
    expect(await startChargxPayment(async () => { throw new Error('offline') }, { publishableKey: 'k', orderNumber: 'USP-1', amount: 5, customer, origin: 'https://app.example.com' })).toBeUndefined()
  })

  const SITE = 'https://app.example.com'
  const post = (body: unknown) =>
    new Request(`${SITE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify(body) })
  const UPD_PAY_ENV = { ...UPD_ENV, CHARGX_PUBLISHABLE_KEY: 'pk-test-not-real' }

  it('places the order, then the payment, and hands the app ChargX\'s form to show inside it', async () => {
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': () => Response.json({ data: { order: { orderNumber: 'USP-9', grandTotal: 50 }, payment: { token: 't' } } }, { status: 201 }),
      [CHARGX]: () => Response.json({ payment_request: { checkout_url: FORM, isProduction: false } }),
    })
    const res = await handleOrderRequest(post(updInput()), 'upd', UPD_PAY_ENV, net.fetchFn)
    const body = (await res.json()) as { orderNumber: string; paymentUrl: string; embedUrl: string }
    expect(res.status).toBe(200)
    expect(body.orderNumber).toBe('USP-9')
    expect(body.embedUrl).toBe(body.paymentUrl)
    expect(new URL(body.paymentUrl).searchParams.get('external_order_id')).toBe('USP-9')
    expect(JSON.stringify(body)).not.toContain('"t"')
    expect(net.calls.map((c) => c.url)).toEqual(['https://www.usapeptidedepot.com/api/orders', CHARGX])
  })

  it('forwards the app\'s Bearer token to UPD\'s order API only, and never to ChargX', async () => {
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': () => Response.json({ data: { order: { orderNumber: 'USP-13', grandTotal: 50 } } }),
      [CHARGX]: () => Response.json({ payment_request: { checkout_url: FORM, isProduction: false } }),
    })
    const req = new Request(`${SITE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: 'Bearer aaa.bbb.ccc' },
      body: JSON.stringify(updInput()),
    })
    await handleOrderRequest(req, 'upd', UPD_PAY_ENV, net.fetchFn)
    expect(net.calls[0]!.headers?.Authorization).toBe('Bearer aaa.bbb.ccc')
    expect(JSON.stringify(net.calls[1]!.headers ?? {})).not.toContain('aaa.bbb.ccc')
  })

  it('tells the app when UPD refuses the token (no order), and refuses redeem without a sign-in', async () => {
    const net = routes({ 'https://www.usapeptidedepot.com/api/orders': () => Response.json({ error: 'Session expired' }, { status: 401 }) })
    const signedIn = new Request(`${SITE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: 'Bearer aaa.bbb.ccc' },
      body: JSON.stringify(updInput()),
    })
    const res = await handleOrderRequest(signedIn, 'upd', UPD_PAY_ENV, net.fetchFn)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' })
    const none = routes({})
    const noToken = await handleOrderRequest(post(updInput({ redeem: { points: 300 } })), 'upd', UPD_PAY_ENV, none.fetchFn)
    expect(noToken.status).toBe(401)
    expect(none.calls).toHaveLength(0)
  })

  it('reads what UPD applied from the rewards into the totals', async () => {
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': () =>
        Response.json({
          data: {
            order: { orderNumber: 'USP-20', subtotal: 90, discountTotal: 14, grandTotal: 76, rewards: { pointsUsed: 300, creditUsedUsd: 5, tierDiscountUsd: 0, rewards: ['free_delivery'] } },
          },
        }),
    })
    const body = (await (await handleOrderRequest(post(updInput()), 'upd', UPD_ENV, net.fetchFn)).json()) as { totals: unknown }
    expect(body.totals).toEqual({ currency: 'USD', total: 76, goods: 90, discount: 14, rewards: { pointsUsed: 300, creditUsd: 5, rewards: ['free_delivery'] } })
  })

  it('starts the card payment through UPD\'s own route only when UPD_CARD_PAYMENT=store', async () => {
    const order = () => Response.json({ data: { order: { orderNumber: 'USP-21', grandTotal: 50 }, payment: { token: 'pay-token' } } })
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': order,
      'https://www.usapeptidedepot.com/api/checkout/card': () => Response.json({ data: { paymentUrl: FORM } }),
    })
    const body = (await (await handleOrderRequest(post(updInput()), 'upd', { ...UPD_PAY_ENV, UPD_CARD_PAYMENT: 'store' }, net.fetchFn)).json()) as {
      paymentUrl: string
      embedUrl: string
    }
    expect(body.paymentUrl).toBe(FORM)
    expect(body.embedUrl).toBe(FORM)
    expect(JSON.parse(net.calls[1]!.body!)).toEqual({ orderNumber: 'USP-21', token: 'pay-token', method: 'card' })
    expect(net.calls.map((c) => c.url)).not.toContain(CHARGX)
    // Off by default: the ChargX sandbox, as before.
    const sandbox = routes({ 'https://www.usapeptidedepot.com/api/orders': order, [CHARGX]: () => Response.json({ payment_request: { checkout_url: FORM, isProduction: false } }) })
    await handleOrderRequest(post(updInput()), 'upd', UPD_PAY_ENV, sandbox.fetchFn)
    expect(sandbox.calls.map((c) => c.url)).toEqual(['https://www.usapeptidedepot.com/api/orders', CHARGX])
  })

  it('refuses a payment link from UPD\'s route that is off the store and ChargX', async () => {
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': () => Response.json({ data: { order: { orderNumber: 'USP-22', grandTotal: 50 }, payment: { token: 't' } } }),
      'https://www.usapeptidedepot.com/api/checkout/card': () => Response.json({ data: { paymentUrl: 'https://evil.example/pay' } }),
    })
    const body = (await (await handleOrderRequest(post(updInput()), 'upd', { ...UPD_ENV, UPD_CARD_PAYMENT: 'store' }, net.fetchFn)).json()) as { paymentUrl?: string }
    expect(body.paymentUrl).toBeUndefined()
  })

  it('keeps the order when the payment can\'t start, and never places it again', async () => {
    const net = routes({
      'https://www.usapeptidedepot.com/api/orders': () => Response.json({ data: { order: { orderNumber: 'USP-10', grandTotal: 50 } } }),
      [CHARGX]: () => new Response('down', { status: 503 }),
    })
    const res = await handleOrderRequest(post(updInput()), 'upd', UPD_PAY_ENV, net.fetchFn)
    expect(await res.json()).toEqual({ ok: true, orderNumber: 'USP-10', totals: { currency: 'USD', total: 50 } })
    expect(net.calls.filter((c) => c.url.includes('/api/orders'))).toHaveLength(1)
  })

  it('starts no payment without the ChargX key or a known total', async () => {
    const link = async (res: Response) => ((await res.json()) as { paymentUrl?: string }).paymentUrl
    const noKey = routes({ 'https://www.usapeptidedepot.com/api/orders': () => Response.json({ data: { order: { orderNumber: 'USP-11', grandTotal: 50 } } }) })
    expect(await link(await handleOrderRequest(post(updInput()), 'upd', UPD_ENV, noKey.fetchFn))).toBeUndefined()
    const zero = routes({ 'https://www.usapeptidedepot.com/api/orders': () => Response.json({ order: { orderNumber: 'USP-12', grandTotal: 0 } }) })
    expect(await link(await handleOrderRequest(post(updInput()), 'upd', UPD_PAY_ENV, zero.fetchFn))).toBeUndefined()
    expect(zero.calls).toHaveLength(1)
  })
})

describe('Peptides CR payment page and consent', () => {
  it('finds where the payment page forwards, only when it is ChargX\'s form', async () => {
    const to = (location: string) => routes({ 'https://catalog.peptidescostarica.net/': () => new Response(null, { status: 302, headers: { location } }) }).fetchFn
    expect(await findChargxForward(to(FORM), 'https://catalog.peptidescostarica.net/pay-card/1')).toBe(FORM)
    expect(await findChargxForward(to('https://elsewhere.example/x'), 'https://catalog.peptidescostarica.net/pay-card/1')).toBeUndefined()
    const page = routes({ 'https://catalog.peptidescostarica.net/': () => new Response('<html>', { status: 200 }) })
    expect(await findChargxForward(page.fetchFn, 'https://catalog.peptidescostarica.net/pay-card/1')).toBeUndefined()
    expect(page.calls[0]?.method).toBe('GET')
  })

  const SITE = 'https://app.example.com'
  const post = (body: unknown) =>
    new Request(`${SITE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify(body) })
  const order = () => Response.json({ ok: true, orderNumber: 'PTR-5', status: 'Pending - WhatsApp' })

  it('files the customer with the CRM, signed, only when they ticked the box', async () => {
    const ticked = routes({ 'https://catalog.peptidescostarica.net/api/partner/orders': order, 'https://catalog.peptidescostarica.net/api/partner/customers': () => Response.json({ ok: true }) })
    await handleOrderRequest(post(pcrInput({ paymentMethod: 'whatsapp', consent: { marketing: true } })), 'pcr', PCR_ENV, ticked.fetchFn)
    const posted = ticked.calls.find((c) => c.url.endsWith('/customers'))!
    expect(JSON.parse(posted.body!)).toEqual({
      contact_method: 'whatsapp',
      contact_value: '+50688887777',
      name: 'María Rodríguez',
      email: 'maria@example.com',
      language: 'es',
      marketing_consent: true,
      whatsapp_consent: true,
      source: 'peptides-cr-app',
    })
    expect(posted.headers?.['X-Partner-Signature']).toBe(createHmac('sha256', 'test-secret-not-real').update(posted.body!).digest('hex'))

    const unticked = routes({ 'https://catalog.peptidescostarica.net/api/partner/orders': order })
    await handleOrderRequest(post(pcrInput({ paymentMethod: 'whatsapp' })), 'pcr', PCR_ENV, unticked.fetchFn)
    expect(unticked.calls.some((c) => c.url.endsWith('/customers'))).toBe(false)
  })
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

  it('needs UPD_LIVE_ORDERS_OK for UPD, whose spec says every order alerts its staff and shows no test flag', () => {
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
    const req = buildStoreRequest(settings, parsed.request, undefined, new Date('2026-11-18T15:00:00Z'))
    const touch = { source: 'app', medium: 'app', landing: '/app', at: '2026-11-18T15:00:00.000Z' }
    expect(req.url).toBe('https://www.usapeptidedepot.com/api/orders')
    expect(JSON.parse(req.body)).toEqual({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '(405) 555-0134',
      items: [{ slug: 'bpc-157-5mg', quantity: 2 }],
      // The spec's spelling and UPD's website's, both, until a sandbox order shows which their API reads.
      shippingAddress: { line1: '12 Main St', city: 'Austin', state: 'TX', postalCode: '78701', postal_code: '78701', country: 'US' },
      complianceAck: true,
      paymentMethod: 'card',
      smsConsent: false,
      callConsent: false,
      // UPD's developer: every app order says so.
      channel: 'app',
      // What UPD's website sends too: shipping protection (not offered in the app) and where the order came from.
      shippingProtection: false,
      firstTouch: touch,
      lastTouch: touch,
    })
    expect(Object.keys(req.headers)).toEqual(['Content-Type', 'Accept'])
  })

  it('sends UPD the referral code, and redeem only with the customer\'s token', () => {
    const settings = checkoutSettings('upd', UPD_ENV)
    const parsed = parseCheckoutRequest(updInput({ ref: 'JANE20', redeem: { points: 300, creditUsd: 5.005, rewards: ['free_delivery', 'free_delivery'] } }), 'upd')
    if (!settings.ok || !parsed.ok) throw new Error('setup')
    expect(JSON.parse(buildStoreRequest(settings, parsed.request, 'aaa.bbb.ccc').body)).toMatchObject({
      ref: 'JANE20',
      redeem: { points: 300, creditUsd: 5.01, rewards: ['free_delivery'] },
    })
    expect(JSON.parse(buildStoreRequest(settings, parsed.request).body)).not.toHaveProperty('redeem')
  })

  it('refuses a malformed redeem or ref, and either for PCR', () => {
    expect(parseCheckoutRequest(updInput({ redeem: { points: 1.5 } }), 'upd')).toEqual({ ok: false, field: 'redeem' })
    expect(parseCheckoutRequest(updInput({ redeem: { creditUsd: -1 } }), 'upd')).toEqual({ ok: false, field: 'redeem' })
    expect(parseCheckoutRequest(updInput({ redeem: { rewards: ['Free Delivery!'] } }), 'upd')).toEqual({ ok: false, field: 'redeem' })
    expect(parseCheckoutRequest(updInput({ redeem: 'all' }), 'upd')).toEqual({ ok: false, field: 'redeem' })
    expect(parseCheckoutRequest(updInput({ ref: 'x' }), 'upd')).toEqual({ ok: false, field: 'ref' })
    expect(parseCheckoutRequest(pcrInput({ redeem: { points: 300 } }), 'pcr')).toEqual({ ok: false, field: 'redeem' })
    expect(parseCheckoutRequest(pcrInput({ ref: 'JANE20' }), 'pcr')).toEqual({ ok: false, field: 'ref' })
    const empty = parseCheckoutRequest(updInput({ redeem: { points: 0, rewards: [] } }), 'upd')
    expect(empty.ok && empty.request.redeem).toBeUndefined()
  })

  it('passes a UPD promo code and the signed-in customer\'s token on to UPD', () => {
    const settings = checkoutSettings('upd', UPD_ENV)
    const parsed = parseCheckoutRequest(updInput({ promoCode: 'SAVE10' }), 'upd')
    if (!settings.ok || !parsed.ok) throw new Error('setup')
    const req = buildStoreRequest(settings, parsed.request, 'aaa.bbb.ccc')
    expect(JSON.parse(req.body)).toMatchObject({ promoCode: 'SAVE10' })
    expect(req.headers.Authorization).toBe('Bearer aaa.bbb.ccc')
  })

  it('refuses a promo code that isn\'t one, and any promo code for PCR', () => {
    expect(parseCheckoutRequest(updInput({ promoCode: 'two words' }), 'upd')).toEqual({ ok: false, field: 'promoCode' })
    expect(parseCheckoutRequest(updInput({ promoCode: 42 }), 'upd')).toEqual({ ok: false, field: 'promoCode' })
    expect(parseCheckoutRequest(pcrInput({ promoCode: 'SAVE10' }), 'pcr')).toEqual({ ok: false, field: 'promoCode' })
    const empty = parseCheckoutRequest(updInput({ promoCode: '' }), 'upd')
    expect(empty.ok && empty.request.promoCode).toBeUndefined()
  })

  it('reads only a token-shaped Bearer header', () => {
    expect(customerToken('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc')
    expect(customerToken('Bearer aaa.bbb')).toBeUndefined()
    expect(customerToken('Basic dXNlcjpwYXNz')).toBeUndefined()
    expect(customerToken('Bearer a.b.c\r\nX-Evil: 1')).toBeUndefined()
    expect(customerToken(`Bearer ${'a'.repeat(5000)}.b.c`)).toBeUndefined()
    expect(customerToken(null)).toBeUndefined()
  })

  it('sends the applied balance under the assumed field name, and consent only when ticked', () => {
    const upd = checkoutSettings('upd', UPD_ENV)
    const pcr = checkoutSettings('pcr', PCR_ENV)
    const u = parseCheckoutRequest(updInput({ discountUsd: 12.345, consent: { sms: true, call: 'yes' } }), 'upd')
    const p = parseCheckoutRequest(pcrInput({ discountUsd: 20 }), 'pcr')
    if (!upd.ok || !pcr.ok || !u.ok || !p.ok) throw new Error('setup')
    expect(JSON.parse(buildStoreRequest(upd, u.request).body)).toMatchObject({ discountUsd: 12.35, smsConsent: true, callConsent: false })
    expect(JSON.parse(buildStoreRequest(pcr, p.request).body)).toMatchObject({ discount_usd: 20 })
    // No balance applied: no discount field at all.
    const none = parseCheckoutRequest(updInput(), 'upd')
    if (!none.ok) throw new Error('setup')
    expect(JSON.parse(buildStoreRequest(upd, none.request).body)).not.toHaveProperty('discountUsd')
  })

  it('refuses a discount that is negative, not a number, or absurd', () => {
    expect(parseCheckoutRequest(updInput({ discountUsd: -1 }), 'upd')).toEqual({ ok: false, field: 'discount' })
    expect(parseCheckoutRequest(updInput({ discountUsd: '5' }), 'upd')).toEqual({ ok: false, field: 'discount' })
    expect(parseCheckoutRequest(updInput({ discountUsd: 1e9 }), 'upd')).toEqual({ ok: false, field: 'discount' })
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
    // The order, then a look at where the payment page forwards (it doesn't here, so no in-app form).
    expect(store.calls).toHaveLength(2)
    expect(store.calls[1]?.url).toBe('https://catalog.peptidescostarica.net/pay-card/1')
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

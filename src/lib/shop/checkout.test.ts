import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLines, viewCart } from './cart'
import type { ShopProduct } from './catalogue'
import {
  arriveByDate,
  emptyCheckoutForm,
  firstInvalidField,
  forgetSavedCustomer,
  loadPlacedOrder,
  loadSavedCustomer,
  placeOrder,
  readOrderResponse,
  saveCustomer,
  savePlacedOrder,
  type CheckoutForm,
} from './checkout'

const products: ShopProduct[] = [
  { name: 'BPC-157 5mg', slug: 'bpc', orderRef: 'bpc', inStock: true, price: { currency: 'USD', amount: 45 } },
  { name: 'TB-500 10mg', slug: 'tb', orderRef: 'tb', inStock: true, price: { currency: 'USD', amount: 60.5 } },
  { name: 'GHK-Cu', slug: 'ghk', orderRef: 'ghk', inStock: false, price: { currency: 'USD', amount: 30 } },
  { name: 'Browse only', slug: 'woo', inStock: true },
]

describe('viewCart', () => {
  it('prices the orderable lines and sets aside the rest', () => {
    const view = viewCart(
      [
        { ref: 'bpc', qty: 2 },
        { ref: 'tb', qty: 1 },
        { ref: 'ghk', qty: 1 },
        { ref: 'gone', qty: 1 },
      ],
      products,
    )
    expect(view.lines.map((l) => l.line.ref)).toEqual(['bpc', 'tb'])
    expect(view.unavailable.map((l) => l.line.ref)).toEqual(['ghk', 'gone'])
    expect(view.count).toBe(3)
    expect(view.subtotal).toEqual({ currency: 'USD', amount: 150.5 })
  })

  it('shows no subtotal when a line has no price', () => {
    const view = viewCart([{ ref: 'x', qty: 1 }], [{ name: 'X', slug: 'x', orderRef: 'x', inStock: true }])
    expect(view.subtotal).toBeUndefined()
  })
})

describe('firstInvalidField', () => {
  const pcr: CheckoutForm = {
    ...emptyCheckoutForm('pcr'),
    name: 'Ana Mora',
    phone: '+506 8888 7777',
    email: 'ana@example.com',
    line1: 'Barrio Escalante',
    city: 'San José',
    researchUseAck: true,
  }

  it('passes a complete form', () => {
    expect(firstInvalidField(pcr, 'pcr')).toBeNull()
  })

  it('points at the first problem, in the form\'s order', () => {
    expect(firstInvalidField({ ...pcr, phone: '8888 7777' }, 'pcr')).toBe('phone')
    expect(firstInvalidField({ ...pcr, email: 'ana@' }, 'pcr')).toBe('email')
    expect(firstInvalidField({ ...pcr, researchUseAck: false }, 'pcr')).toBe('researchUseAck')
    expect(firstInvalidField({ ...pcr, region: '', postalCode: '' }, 'upd')).toBe('region')
    expect(firstInvalidField({ ...pcr, paymentMethod: 'whatsapp', region: 'TX', postalCode: '78701' }, 'upd')).toBe('paymentMethod')
  })
})

describe('readOrderResponse', () => {
  it('reads a placed order and keeps only an https payment link', () => {
    expect(readOrderResponse(200, { ok: true, orderNumber: 'PTR-1', paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/1' })).toEqual({
      kind: 'placed',
      orderNumber: 'PTR-1',
      paymentUrl: 'https://catalog.peptidescostarica.net/pay-card/1',
    })
    expect(readOrderResponse(200, { ok: true, orderNumber: 'PTR-1', paymentUrl: 'javascript:alert(1)' })).toEqual({ kind: 'placed', orderNumber: 'PTR-1' })
  })

  it('tells "not sent" apart from "unconfirmed"', () => {
    expect(readOrderResponse(429, null)).toEqual({ kind: 'notSent' })
    expect(readOrderResponse(502, { ok: false, error: 'unconfirmed' })).toEqual({ kind: 'unconfirmed' })
    expect(readOrderResponse(504, null)).toEqual({ kind: 'unconfirmed' })
    expect(readOrderResponse(422, { ok: false, error: 'refused', message: 'Agotado.' })).toEqual({ kind: 'refused', message: 'Agotado.' })
  })
})

describe('placeOrder', () => {
  it('sends references and quantities only, never a price', async () => {
    let sent: unknown
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return Response.json({ ok: true, orderNumber: 'USP-1' })
    }) as unknown as typeof fetch
    const form: CheckoutForm = { ...emptyCheckoutForm('upd'), name: 'Jane', phone: '4055550134', email: 'j@example.com', line1: '1 Main', city: 'Austin', region: 'TX', postalCode: '78701', researchUseAck: true }
    await placeOrder([{ ref: 'bpc', qty: 2 }], form, 'en', fetchFn)
    expect(sent).toMatchObject({ items: [{ ref: 'bpc', qty: 2 }], paymentMethod: 'card', language: 'en', researchUseAck: true })
    expect(JSON.stringify(sent)).not.toMatch(/price|amount|total/i)
  })
})

// A tiny localStorage, since these tests run without a browser.
function stubStorage(): Map<string, string> {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
  return data
}

describe('readLines', () => {
  it('keeps whole quantities of 1-100 of a named product, once each', () => {
    expect(
      readLines([
        { ref: 'bpc', qty: 2 },
        { ref: 'bpc', qty: 5 },
        { ref: 'tb', qty: 0 },
        { ref: 'tb', qty: 101 },
        { ref: 'ghk', qty: 1.5 },
        { ref: '', qty: 1 },
        { ref: 7, qty: 1 },
        null,
        { ref: 'ok', qty: 100 },
      ]),
    ).toEqual([
      { ref: 'bpc', qty: 2 },
      { ref: 'ok', qty: 100 },
    ])
    expect(readLines('nope')).toEqual([])
  })
})

describe('the last order and the customer, kept on the phone', () => {
  afterEach(() => vi.unstubAllGlobals())

  const placed = { orderNumber: 'USP-1', placedAt: '2026-10-20T15:00:00.000Z', paymentMethod: 'card' as const }

  it('keeps what was ordered, and reads an order from before that was kept as having no lines', () => {
    const data = stubStorage()
    savePlacedOrder({ ...placed, lines: [{ ref: 'bpc', qty: 5 }, { ref: 'ghk', qty: 2 }] })
    expect(loadPlacedOrder()?.lines).toEqual([{ ref: 'bpc', qty: 5 }, { ref: 'ghk', qty: 2 }])
    data.set('shop-last-order-v1', JSON.stringify(placed))
    expect(loadPlacedOrder()).toEqual({ ...placed, paid: false, paymentUrl: undefined, totals: undefined })
    data.set('shop-last-order-v1', JSON.stringify({ ...placed, lines: [{ ref: 'x', qty: 0 }] }))
    expect(loadPlacedOrder()?.lines).toBeUndefined()
  })

  const jane: CheckoutForm = { ...emptyCheckoutForm('upd'), name: 'Jane Doe', phone: '(405) 555-0134', email: 'j@example.com', line1: '12 Main St', city: 'Austin', region: 'TX', postalCode: '78701', researchUseAck: true }

  it('remembers the details but never the research-use confirmation', () => {
    const data = stubStorage()
    saveCustomer(jane)
    expect(data.get('shop-customer-v1')).not.toMatch(/researchUseAck/)
    expect(loadSavedCustomer('upd')).toMatchObject({ name: 'Jane Doe', line1: '12 Main St', paymentMethod: 'card' })
    expect(loadSavedCustomer('upd')).not.toHaveProperty('researchUseAck')
  })

  it('ignores details that would no longer pass the form, and forgets on request', () => {
    const data = stubStorage()
    saveCustomer({ ...jane, postalCode: 'abc' })
    expect(loadSavedCustomer('upd')).toBeNull()
    data.set('shop-customer-v1', '{not json')
    expect(loadSavedCustomer('upd')).toBeNull()
    saveCustomer(jane)
    expect(loadSavedCustomer('upd')).not.toBeNull()
    forgetSavedCustomer()
    expect(loadSavedCustomer('upd')).toBeNull()
  })

  it('checks saved details against the store they are loaded for', () => {
    stubStorage()
    saveCustomer({ ...jane, phone: '4055550134' })
    // PCR needs the number in international form, so a US-style number isn't enough there.
    expect(loadSavedCustomer('pcr')).toBeNull()
  })
})

describe('arriveByDate', () => {
  it('counts calendar days from the order date, across a month end', () => {
    expect(arriveByDate(new Date(2026, 9, 29, 18, 30), 3)).toEqual(new Date(2026, 10, 1))
    expect(arriveByDate(new Date(2026, 9, 20), 2)).toEqual(new Date(2026, 9, 22))
  })
})

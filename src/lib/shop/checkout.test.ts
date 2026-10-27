import { describe, expect, it } from 'vitest'
import { viewCart } from './cart'
import type { ShopProduct } from './catalogue'
import { emptyCheckoutForm, firstInvalidField, placeOrder, readOrderResponse, type CheckoutForm } from './checkout'

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

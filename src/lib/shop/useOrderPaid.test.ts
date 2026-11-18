import { describe, expect, it } from 'vitest'
import type { PlacedOrder } from './checkout'
import { paidCheck, paidUsd } from './useOrderPaid'

const placedAt = '2026-11-18T10:00:00.000Z'
const t0 = Date.parse(placedAt)
const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const order = (extra: Partial<PlacedOrder> = {}): PlacedOrder => ({
  orderNumber: 'USP-MWMBN57A-4JGD',
  placedAt,
  paymentMethod: 'card',
  embedUrl: 'https://dashboard.chargx.io/payment-form/1',
  totals: { currency: 'USD', total: 90 },
  ...extra,
})

describe('paidCheck', () => {
  it('polls for the first 30 minutes', () => {
    expect(paidCheck(order(), t0)).toBe('poll')
    expect(paidCheck(order(), t0 + 30 * MIN)).toBe('poll')
  })

  it('still asks once on open after that, up to 7 days: a late payment shows', () => {
    expect(paidCheck(order(), t0 + 31 * MIN)).toBe('once')
    expect(paidCheck(order(), t0 + 7 * DAY)).toBe('once')
    expect(paidCheck(order(), t0 + 7 * DAY + MIN)).toBeNull()
  })

  it('does not ask for paid orders, WhatsApp orders, orders with no payment link, or none', () => {
    expect(paidCheck(order({ paid: true }), t0)).toBeNull()
    expect(paidCheck(order({ paymentMethod: 'whatsapp' }), t0)).toBeNull()
    expect(paidCheck(order({ embedUrl: undefined }), t0)).toBeNull()
    expect(paidCheck(order({ embedUrl: undefined, paymentUrl: 'https://store.example/pay' }), t0)).toBe('poll')
    expect(paidCheck(null, t0)).toBeNull()
    expect(paidCheck(order({ placedAt: 'not a date' }), t0)).toBeNull()
  })
})

describe('paidUsd', () => {
  it('is the store total in dollars only', () => {
    expect(paidUsd(order())).toBe(90)
    expect(paidUsd(order({ totals: { currency: 'CRC', total: 45000 } }))).toBeUndefined()
    expect(paidUsd(order({ totals: undefined }))).toBeUndefined()
  })
})

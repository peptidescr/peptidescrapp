import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { findOrderNumber, handleStatusRequest, handleWebhookRequest, type PaidRecord, type PaymentStore } from './payments.ts'

// A made-up secret; no real key appears anywhere in the repo.
const SECRET = 'test-webhook-secret-not-real'
const NOW = new Date('2026-10-27T12:00:00Z')
const TS = String(Math.floor(NOW.getTime() / 1000))

function memoryStore(): PaymentStore & { records: Map<string, PaidRecord> } {
  const records = new Map<string, PaidRecord>()
  return {
    records,
    get: async (n) => records.get(n) ?? null,
    set: async (n, r) => {
      records.set(n, r)
    },
  }
}

function webhook(payload: unknown, { secret = SECRET, ts = TS } = {}) {
  const body = JSON.stringify(payload)
  const signature = 'v1=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  return new Request('https://app.example.com/api/chargx-webhook', {
    method: 'POST',
    headers: { 'Webhook-Id': 'evt_1', 'Webhook-Timestamp': ts, 'Webhook-Signature': signature },
    body,
  })
}

describe('findOrderNumber', () => {
  it('finds the brand\'s order number wherever it sits', () => {
    expect(findOrderNumber({ data: { metadata: { order: 'PTR-1042' } } }, 'pcr')).toBe('PTR-1042')
    expect(findOrderNumber({ description: 'Order USP-55 from the app' }, 'upd')).toBe('USP-55')
    expect(findOrderNumber({ ref: 'USP-55' }, 'pcr')).toBeUndefined()
  })

  it('never takes a SKU, which shares UPD\'s prefix, and prefers a field named for the order', () => {
    expect(findOrderNumber({ items: [{ sku: 'USP-BPC157-5' }] }, 'upd')).toBeUndefined()
    expect(findOrderNumber({ a: { sku: 'USP-BPC157-5', note: 'USP-9' }, order_number: 'USP-1001' }, 'upd')).toBe('USP-1001')
  })
})

describe('handleWebhookRequest', () => {
  it('records a verified payment.succeeded as paid', async () => {
    const store = memoryStore()
    const res = await handleWebhookRequest(webhook({ type: 'payment.succeeded', data: { orderNumber: 'PTR-1' } }), 'pcr', SECRET, store, NOW)
    expect(res.status).toBe(200)
    expect(store.records.get('PTR-1')).toEqual({ paidAt: NOW.toISOString(), eventId: 'evt_1' })
  })

  it('refuses a bad signature, a stale one, or no secret, and records nothing', async () => {
    const store = memoryStore()
    const event = { type: 'payment.succeeded', orderNumber: 'PTR-1' }
    expect((await handleWebhookRequest(webhook(event, { secret: 'wrong' }), 'pcr', SECRET, store, NOW)).status).toBe(400)
    expect((await handleWebhookRequest(webhook(event, { ts: String(Number(TS) - 3600) }), 'pcr', SECRET, store, NOW)).status).toBe(400)
    expect((await handleWebhookRequest(webhook(event), 'pcr', undefined, store, NOW)).status).toBe(503)
    expect(store.records.size).toBe(0)
  })

  it('ignores other events and events with no order number, without failing them', async () => {
    const store = memoryStore()
    expect((await handleWebhookRequest(webhook({ type: 'payment.failed', orderNumber: 'PTR-1' }), 'pcr', SECRET, store, NOW)).status).toBe(200)
    expect((await handleWebhookRequest(webhook({ type: 'payment.succeeded', amount: 300 }), 'pcr', SECRET, store, NOW)).status).toBe(200)
    expect(store.records.size).toBe(0)
  })
})

describe('handleStatusRequest', () => {
  it('answers paid or not, for this brand\'s order numbers only', async () => {
    const store = memoryStore()
    store.records.set('PTR-1', { paidAt: NOW.toISOString(), eventId: 'evt_1' })
    const get = (order: string) => handleStatusRequest(new Request(`https://app.example.com/api/order-status?order=${order}`), 'pcr', store)
    expect(await (await get('PTR-1')).json()).toEqual({ paid: true })
    expect(await (await get('PTR-2')).json()).toEqual({ paid: false })
    expect((await get('USP-1')).status).toBe(400)
  })
})

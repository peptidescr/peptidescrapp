import { getStore } from '@netlify/blobs'
import type { ScheduleStore } from './pushHandlers.ts'
import type { StoredSchedule } from './pushLogic.ts'
import type { PaidRecord, PaymentStore } from './payments.ts'

/** Orders the payment webhook has heard are paid, by order number. */
export function blobPaymentStore(): PaymentStore {
  const store = getStore('order-payments')
  return {
    get: async (orderNumber) => (await store.get(orderNumber, { type: 'json' })) as PaidRecord | null,
    set: async (orderNumber, record) => {
      await store.setJSON(orderNumber, record)
    },
  }
}

/** The production ScheduleStore, backed by Netlify Blobs. */
export function blobScheduleStore(): ScheduleStore {
  const store = getStore('push-schedules')
  return {
    get: async (key) => (await store.get(key, { type: 'json' })) as StoredSchedule | null,
    set: async (key, value) => {
      await store.setJSON(key, value)
    },
    delete: async (key) => {
      await store.delete(key)
    },
    keys: async () => (await store.list()).blobs.map((b) => b.key),
  }
}

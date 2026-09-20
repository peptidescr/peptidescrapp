import { getStore } from '@netlify/blobs'
import type { ScheduleStore } from './pushHandlers.ts'
import type { StoredSchedule } from './pushLogic.ts'

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

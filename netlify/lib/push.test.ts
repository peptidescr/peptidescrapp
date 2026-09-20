import { describe, expect, it } from 'vitest'
import { handleScheduleRequest, sendDueReminders, type ScheduleStore } from './pushHandlers.ts'
import {
  endpointKey,
  isAllowedEndpoint,
  MAX_HORIZON_MS,
  MAX_ITEMS,
  parseScheduleRequest,
  selectDue,
  STALE_AFTER_MS,
  type StoredSchedule,
} from './pushLogic.ts'

const NOW = Date.parse('2026-03-05T12:00:00Z')
const MIN = 60_000
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const subscription = { endpoint: ENDPOINT, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' } }

function memoryStore(initial: Record<string, StoredSchedule> = {}): ScheduleStore & { data: Map<string, StoredSchedule> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
    keys: async () => [...data.keys()],
  }
}

function post(body: unknown): Request {
  return new Request('https://example.test/api/push/schedule', { method: 'POST', body: JSON.stringify(body) })
}

describe('isAllowedEndpoint', () => {
  it('accepts the real push services', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/x',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/x',
      'https://par02p.notify.windows.com/x',
    ]) {
      expect(isAllowedEndpoint(url)).toBe(true)
    }
  })

  it('rejects anything else, so the server can not be aimed at arbitrary URLs', () => {
    for (const url of [
      'http://fcm.googleapis.com/x',
      'https://evil.example.com/x',
      'https://fcm.googleapis.com.evil.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'not a url',
    ]) {
      expect(isAllowedEndpoint(url)).toBe(false)
    }
  })
})

describe('parseScheduleRequest', () => {
  it('accepts a valid upload and sorts its items', () => {
    const parsed = parseScheduleRequest(
      { subscription, items: [{ at: NOW + 2 * MIN, tag: 'b' }, { at: NOW + MIN, tag: 'a' }] },
      NOW,
    )
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) expect(parsed.items.map((i) => i.tag)).toEqual(['a', 'b'])
  })

  it('rejects a bad endpoint, bad keys and malformed items', () => {
    const bad = (body: unknown) => parseScheduleRequest(body, NOW).ok
    expect(bad({ subscription: { ...subscription, endpoint: 'https://evil.example.com/x' }, items: [] })).toBe(false)
    expect(bad({ subscription: { ...subscription, keys: { p256dh: '<script>', auth: 'x' } }, items: [] })).toBe(false)
    expect(bad({ subscription, items: 'nope' })).toBe(false)
    expect(bad({ subscription, items: [{ at: 'soon', tag: 'a' }] })).toBe(false)
    expect(bad({ subscription, items: [{ at: NOW, tag: 'x'.repeat(201) }] })).toBe(false)
    expect(bad(null)).toBe(false)
  })

  it('quietly drops stale and too-distant items and caps the total', () => {
    const items = [
      { at: NOW - STALE_AFTER_MS - MIN, tag: 'stale' },
      { at: NOW + MAX_HORIZON_MS + MIN, tag: 'far' },
      ...Array.from({ length: MAX_ITEMS + 50 }, (_, i) => ({ at: NOW + (i + 1) * MIN, tag: `t${i}` })),
    ]
    const parsed = parseScheduleRequest({ subscription, items }, NOW)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.items).toHaveLength(MAX_ITEMS)
      expect(parsed.items.some((i) => i.tag === 'stale' || i.tag === 'far')).toBe(false)
      expect(parsed.items[0]?.tag).toBe('t0')
    }
  })
})

describe('selectDue', () => {
  it('sends what is due, keeps the future, and drops what is too stale to be useful', () => {
    const { due, remaining } = selectDue(
      [
        { at: NOW - STALE_AFTER_MS - 1, tag: 'stale' },
        { at: NOW - 5 * MIN, tag: 'late' },
        { at: NOW, tag: 'now' },
        { at: NOW + MIN, tag: 'later' },
      ],
      NOW,
    )
    expect(due.map((i) => i.tag)).toEqual(['late', 'now'])
    expect(remaining.map((i) => i.tag)).toEqual(['later'])
  })
})

describe('handleScheduleRequest', () => {
  it('stores a device under a hash of its endpoint, never the raw endpoint', async () => {
    const store = memoryStore()
    const res = await handleScheduleRequest(post({ subscription, items: [{ at: NOW + MIN, tag: 'a' }] }), store, NOW)
    expect(res.status).toBe(200)
    expect([...store.data.keys()]).toEqual([endpointKey(ENDPOINT)])
    expect(endpointKey(ENDPOINT)).not.toContain('fcm')
  })

  it('replaces the previous list, and forgets the device when nothing is left', async () => {
    const store = memoryStore()
    await handleScheduleRequest(post({ subscription, items: [{ at: NOW + MIN, tag: 'a' }] }), store, NOW)
    await handleScheduleRequest(post({ subscription, items: [{ at: NOW + 2 * MIN, tag: 'b' }] }), store, NOW)
    expect(store.data.get(endpointKey(ENDPOINT))?.items.map((i) => i.tag)).toEqual(['b'])
    await handleScheduleRequest(post({ subscription, items: [] }), store, NOW)
    expect(store.data.size).toBe(0)
  })

  it('rejects wrong methods, oversize bodies, bad JSON and bad input', async () => {
    const store = memoryStore()
    expect((await handleScheduleRequest(new Request('https://x.test/', { method: 'GET' }), store, NOW)).status).toBe(405)
    expect((await handleScheduleRequest(new Request('https://x.test/', { method: 'POST', body: '{nope' }), store, NOW)).status).toBe(400)
    expect((await handleScheduleRequest(new Request('https://x.test/', { method: 'POST', body: 'x'.repeat(100_001) }), store, NOW)).status).toBe(413)
    expect((await handleScheduleRequest(post({ subscription: { endpoint: 'https://evil.example.com' }, items: [] }), store, NOW)).status).toBe(400)
    expect(store.data.size).toBe(0)
  })
})

describe('sendDueReminders', () => {
  function seeded(items: { at: number; tag: string }[]) {
    return memoryStore({ [endpointKey(ENDPOINT)]: { subscription, items, updatedAt: NOW } })
  }

  it('sends only a tag — no dose or compound data — and removes what it sent', async () => {
    const store = seeded([{ at: NOW - MIN, tag: 'p1|2026-03-05T11:59:00.000Z' }, { at: NOW + 60 * MIN, tag: 'later' }])
    const sent: string[] = []
    const result = await sendDueReminders(store, async (_s, payload) => void sent.push(payload), NOW)
    expect(sent).toEqual([JSON.stringify({ tag: 'p1|2026-03-05T11:59:00.000Z' })])
    expect(result).toMatchObject({ sent: 1, failed: 0, devicesRemoved: 0 })
    expect(store.data.get(endpointKey(ENDPOINT))?.items.map((i) => i.tag)).toEqual(['later'])
  })

  it('does not resend on the next run', async () => {
    const store = seeded([{ at: NOW - MIN, tag: 'a' }, { at: NOW + 60 * MIN, tag: 'later' }])
    const sent: string[] = []
    const send = async (_s: unknown, payload: string) => void sent.push(payload)
    await sendDueReminders(store, send, NOW)
    await sendDueReminders(store, send, NOW + MIN)
    expect(sent).toHaveLength(1)
  })

  it('does nothing for devices with nothing due', async () => {
    const store = seeded([{ at: NOW + 60 * MIN, tag: 'later' }])
    const result = await sendDueReminders(store, async () => {
      throw new Error('should not send')
    }, NOW)
    expect(result).toEqual({ sent: 0, devicesRemoved: 0, failed: 0 })
  })

  it('forgets a device the push service says is gone (404/410)', async () => {
    const store = seeded([{ at: NOW - MIN, tag: 'a' }, { at: NOW + 60 * MIN, tag: 'later' }])
    const result = await sendDueReminders(store, async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 })
    }, NOW)
    expect(result.devicesRemoved).toBe(1)
    expect(store.data.size).toBe(0)
  })

  it('drops a reminder after a transient failure instead of retrying it forever', async () => {
    const store = seeded([{ at: NOW - MIN, tag: 'a' }, { at: NOW + 60 * MIN, tag: 'later' }])
    const result = await sendDueReminders(store, async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 })
    }, NOW)
    expect(result).toMatchObject({ sent: 0, failed: 1, devicesRemoved: 0 })
    expect(store.data.get(endpointKey(ENDPOINT))?.items.map((i) => i.tag)).toEqual(['later'])
  })
})

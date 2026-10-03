import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol, Vial } from './db'
import {
  buildPushSchedule,
  PUSH_HORIZON_DAYS,
  PUSH_MAX_ITEMS,
  reminderTag,
  TAG_SEPARATOR,
  vialReminderTag,
} from './pushSchedule'

function protocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: 'p1',
    name: 'Secret name',
    compoundId: 'bpc-157',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00', '20:00'],
    startDate: '2026-03-01',
    route: 'subcutaneous',
    isActive: true,
    ...overrides,
  }
}

const NOW = new Date(2026, 2, 5, 12, 0, 0) // 5 Mar 2026, 12:00 local

describe('buildPushSchedule', () => {
  it('lists only future doses of active protocols, soonest first', () => {
    const items = buildPushSchedule([protocol(), protocol({ id: 'paused', isActive: false })], [], NOW)
    expect(items[0]).toEqual({ at: new Date(2026, 2, 5, 20, 0).getTime(), tag: reminderTag('p1', new Date(2026, 2, 5, 20, 0)) })
    expect(items.every((i) => i.at > NOW.getTime())).toBe(true)
    expect(items.some((i) => i.tag.startsWith('paused'))).toBe(false)
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort((a, b) => a - b))
  })

  it('covers the horizon and no more', () => {
    const items = buildPushSchedule([protocol({ reminderTimes: ['08:00'] })], [], NOW)
    const last = items[items.length - 1]!
    expect(last.at).toBeLessThanOrEqual(NOW.getTime() + PUSH_HORIZON_DAYS * 86_400_000)
    expect(items.length).toBeGreaterThan(PUSH_HORIZON_DAYS - 2)
  })

  it('leaves out a dose that is already logged, e.g. taken early', () => {
    const early: DoseLog = {
      id: 'l1',
      protocolId: 'p1',
      compoundId: 'bpc-157',
      doseMcg: 250,
      administeredAt: new Date(2026, 2, 5, 13, 0).toISOString(),
      status: 'taken',
      createdAt: '',
      updatedAt: '',
    }
    const items = buildPushSchedule([protocol({ reminderTimes: ['20:00'] })], [early], NOW)
    expect(items[0]?.at).toBe(new Date(2026, 2, 6, 20, 0).getTime())
  })

  it('never includes the protocol name, dose or compound — only an opaque tag and a time', () => {
    const items = buildPushSchedule([protocol()], [], NOW)
    const serialized = JSON.stringify(items)
    for (const secret of ['Secret name', 'bpc-157', '250', 'mcg']) expect(serialized).not.toContain(secret)
    expect(Object.keys(items[0]!).sort()).toEqual(['at', 'tag'])
  })

  it('respects the tracking cutoff and custom schedules', () => {
    const cutoff = buildPushSchedule([protocol({ trackingStartsAt: new Date(2026, 2, 7).toISOString() })], [], NOW)
    expect(cutoff[0]!.at).toBeGreaterThanOrEqual(new Date(2026, 2, 7).getTime())
    const custom = buildPushSchedule(
      [protocol({ schedule: { kind: 'custom', dates: ['2026-03-09', '2026-03-20'] }, reminderTimes: ['08:00'], startDate: '2026-03-09', endDate: '2026-03-20' })],
      [],
      NOW,
    )
    expect(custom.map((i) => i.at)).toEqual([new Date(2026, 2, 9, 8).getTime(), new Date(2026, 2, 20, 8).getTime()])
  })

  it('caps the list at the server limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => protocol({ id: `p${i}`, reminderTimes: ['06:00', '10:00', '14:00', '18:00', '22:00'] }))
    expect(buildPushSchedule(many, [], NOW)).toHaveLength(PUSH_MAX_ITEMS)
  })

  it('builds tags the service worker can split back apart', () => {
    const [id, iso] = reminderTag('abc-123', new Date(Date.UTC(2026, 2, 5, 20, 0))).split(TAG_SEPARATOR)
    expect(id).toBe('abc-123')
    expect(iso).toBe('2026-03-05T20:00:00.000Z')
  })
})

describe('buildPushSchedule — vial dates', () => {
  const vial: Vial = {
    id: 'v1',
    compoundId: 'bpc-157',
    totalMcg: 5000,
    openedOn: '2026-03-01',
    discardOn: '2026-03-20',
    status: 'active',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  }
  const vialItems = (vials: Vial[]) => buildPushSchedule([], [], NOW, vials)

  it('sends a discard-by reminder when the notice window opens and on the day, at 09:00', () => {
    expect(vialItems([vial])).toEqual([
      { at: new Date(2026, 2, 17, 9, 0).getTime(), tag: vialReminderTag('v1', 'discard', '2026-03-17') },
      { at: new Date(2026, 2, 20, 9, 0).getTime(), tag: vialReminderTag('v1', 'discard', '2026-03-20') },
    ])
  })

  it('skips past send times, closed vials, and dates beyond the horizon', () => {
    // Notice day (Mar 4) has passed; only the day itself (Mar 7) remains.
    expect(vialItems([{ ...vial, discardOn: '2026-03-07' }]).map((i) => i.tag)).toEqual([
      vialReminderTag('v1', 'discard', '2026-03-07'),
    ])
    expect(vialItems([{ ...vial, status: 'finished' }])).toEqual([])
    expect(vialItems([{ ...vial, discardOn: undefined, expiresOn: '2027-01-01' }])).toEqual([])
  })

  it('covers the printed expiry too, and names nothing about the vial', () => {
    const items = vialItems([{ ...vial, discardOn: undefined, expiresOn: '2026-03-10' }])
    expect(items.map((i) => i.tag)).toEqual([
      vialReminderTag('v1', 'expiry', '2026-03-07'),
      vialReminderTag('v1', 'expiry', '2026-03-10'),
    ])
    expect(JSON.stringify(items)).not.toContain('bpc')
    const [prefix, id, kind, day] = items[0]!.tag.split(TAG_SEPARATOR)
    expect([prefix, id, kind, day]).toEqual(['vial', 'v1', 'expiry', '2026-03-07'])
  })
})

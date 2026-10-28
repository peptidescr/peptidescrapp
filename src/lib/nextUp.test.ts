import { describe, expect, it } from 'vitest'
import type { Protocol } from './db'
import { describeNextUp } from './nextUp'
import type { Occurrence } from './schedule'

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key)

function protocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: 'p1',
    name: 'Test',
    compoundId: 'bpc-157',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['09:00'],
    startDate: '2026-10-01',
    route: 'subcutaneous',
    isActive: true,
    ...overrides,
  }
}

const occ = (day: number, hour: number): Occurrence => ({ scheduledAt: new Date(2026, 9, day, hour, 0) }) as Occurrence

describe('describeNextUp', () => {
  const now = new Date(2026, 9, 22, 9, 0)

  it('a dose later today can be logged now, and says today with a countdown', () => {
    const r = describeNextUp(protocol(), occ(22, 12), now, t)
    expect(r.isToday).toBe(true)
    expect(r.canLogNow).toBe(true)
    expect(r.statusLabel).toBe('home.today · home.inHoursMinutes {"hours":3,"minutes":0}')
  })

  it('a daily dose tomorrow is too far off to log now', () => {
    const r = describeNextUp(protocol(), occ(23, 9), now, t)
    expect(r.isToday).toBe(false)
    expect(r.canLogNow).toBe(false)
  })

  it('a weekly dose a few days out can be logged early', () => {
    const weekly = protocol({ schedule: { kind: 'everyNDays', n: 7 }, startDate: '2026-10-01' })
    // 3 days ahead of the 7-day slot is inside the 3.5-day early window.
    expect(describeNextUp(weekly, occ(25, 9), now, t).canLogNow).toBe(true)
  })
})

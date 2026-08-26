import { describe, expect, it } from 'vitest'
import {
  findUnloggedOccurrences,
  getDueOccurrences,
  getMissedOccurrences,
  getNextOccurrence,
  getOccurrencesInRange,
  isScheduledDay,
  type ScheduleContext,
  type Weekday,
} from './schedule'

function day(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

describe('isScheduledDay — daily', () => {
  const ctx = { schedule: { kind: 'daily' as const }, startDate: '2026-01-05' }

  it('is true on and after the start date', () => {
    expect(isScheduledDay(ctx, day(2026, 1, 5))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 1, 20))).toBe(true)
  })

  it('is false before the start date', () => {
    expect(isScheduledDay(ctx, day(2026, 1, 4))).toBe(false)
  })

  it('respects endDate', () => {
    const withEnd = { ...ctx, endDate: '2026-01-07' }
    expect(isScheduledDay(withEnd, day(2026, 1, 7))).toBe(true)
    expect(isScheduledDay(withEnd, day(2026, 1, 8))).toBe(false)
  })
})

describe('isScheduledDay — everyNDays', () => {
  const ctx = { schedule: { kind: 'everyNDays' as const, n: 3 }, startDate: '2026-01-01' }

  it('matches every third day starting from the anchor', () => {
    expect(isScheduledDay(ctx, day(2026, 1, 1))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 1, 2))).toBe(false)
    expect(isScheduledDay(ctx, day(2026, 1, 3))).toBe(false)
    expect(isScheduledDay(ctx, day(2026, 1, 4))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 1, 7))).toBe(true)
  })

  it('rejects a non-positive interval', () => {
    expect(() => isScheduledDay({ ...ctx, schedule: { kind: 'everyNDays', n: 0 } }, day(2026, 1, 1))).toThrow(
      RangeError,
    )
  })
})

describe('isScheduledDay — weekdays', () => {
  // Mon/Wed/Fri
  const ctx = {
    schedule: { kind: 'weekdays' as const, days: [1, 3, 5] as Weekday[] },
    startDate: '2026-01-01',
  }

  it('matches only the listed weekdays', () => {
    // 2026-01-05 is a Monday
    expect(isScheduledDay(ctx, day(2026, 1, 5))).toBe(true) // Mon
    expect(isScheduledDay(ctx, day(2026, 1, 6))).toBe(false) // Tue
    expect(isScheduledDay(ctx, day(2026, 1, 7))).toBe(true) // Wed
    expect(isScheduledDay(ctx, day(2026, 1, 8))).toBe(false) // Thu
    expect(isScheduledDay(ctx, day(2026, 1, 9))).toBe(true) // Fri
    expect(isScheduledDay(ctx, day(2026, 1, 10))).toBe(false) // Sat
  })

  it('rejects an empty day list', () => {
    expect(() =>
      isScheduledDay({ ...ctx, schedule: { kind: 'weekdays', days: [] } }, day(2026, 1, 5)),
    ).toThrow(RangeError)
  })
})

describe('isScheduledDay — cycle', () => {
  const ctx = { schedule: { kind: 'cycle' as const, daysOn: 2, daysOff: 3 }, startDate: '2026-01-01' }

  it('is on for daysOn then off for daysOff, repeating', () => {
    const onOff = Array.from({ length: 10 }, (_, i) => isScheduledDay(ctx, day(2026, 1, 1 + i)))
    expect(onOff).toEqual([true, true, false, false, false, true, true, false, false, false])
  })

  it('rejects an invalid on/off configuration', () => {
    expect(() =>
      isScheduledDay({ ...ctx, schedule: { kind: 'cycle', daysOn: 0, daysOff: 3 } }, day(2026, 1, 1)),
    ).toThrow(RangeError)
  })
})

describe('getOccurrencesInRange', () => {
  it('produces one occurrence per scheduled day per reminder time, in order', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'daily' },
      startDate: '2026-01-01',
      reminderTimes: ['20:00', '08:00'],
    }
    const occurrences = getOccurrencesInRange(ctx, day(2026, 1, 1), day(2026, 1, 1, 23, 59))
    expect(occurrences.map((o) => o.time)).toEqual(['08:00', '20:00'])
    expect(occurrences[0]!.scheduledAt).toEqual(day(2026, 1, 1, 8, 0))
  })

  it('spans multiple days for an everyNDays schedule', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'everyNDays', n: 2 },
      startDate: '2026-01-01',
      reminderTimes: ['09:00'],
    }
    const occurrences = getOccurrencesInRange(ctx, day(2026, 1, 1), day(2026, 1, 7, 23, 59))
    expect(occurrences.map((o) => o.date)).toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07'])
  })

  it('returns nothing when there are no reminder times', () => {
    const ctx: ScheduleContext = { schedule: { kind: 'daily' }, startDate: '2026-01-01', reminderTimes: [] }
    expect(getOccurrencesInRange(ctx, day(2026, 1, 1), day(2026, 1, 5))).toEqual([])
  })

  it('rejects a malformed reminder time', () => {
    const ctx: ScheduleContext = { schedule: { kind: 'daily' }, startDate: '2026-01-01', reminderTimes: ['9:00am'] }
    expect(() => getOccurrencesInRange(ctx, day(2026, 1, 1), day(2026, 1, 1))).toThrow(RangeError)
  })
})

describe('findUnloggedOccurrences', () => {
  it('excludes occurrences with a same-day matching log', () => {
    const occurrences = [
      { date: '2026-01-01', time: '08:00', scheduledAt: day(2026, 1, 1, 8, 0) },
      { date: '2026-01-02', time: '08:00', scheduledAt: day(2026, 1, 2, 8, 0) },
    ]
    const logged = [day(2026, 1, 1, 8, 5)] // logged 5 min late on day 1
    const unlogged = findUnloggedOccurrences(occurrences, logged)
    expect(unlogged).toHaveLength(1)
    expect(unlogged[0]!.date).toBe('2026-01-02')
  })

  it('pairs same-day logs with their nearest occurrence when there are two in a day', () => {
    const occurrences = [
      { date: '2026-01-01', time: '08:00', scheduledAt: day(2026, 1, 1, 8, 0) },
      { date: '2026-01-01', time: '20:00', scheduledAt: day(2026, 1, 1, 20, 0) },
    ]
    const logged = [day(2026, 1, 1, 8, 10)] // one log, closer to the morning dose
    const unlogged = findUnloggedOccurrences(occurrences, logged)
    expect(unlogged).toHaveLength(1)
    expect(unlogged[0]!.time).toBe('20:00')
  })

  it('leaves everything unlogged when there are no logs', () => {
    const occurrences = [{ date: '2026-01-01', time: '08:00', scheduledAt: day(2026, 1, 1, 8, 0) }]
    expect(findUnloggedOccurrences(occurrences, [])).toEqual(occurrences)
  })
})

describe('getMissedOccurrences', () => {
  const ctx: ScheduleContext = {
    schedule: { kind: 'daily' },
    startDate: '2026-01-01',
    reminderTimes: ['08:00'],
  }

  it('flags an occurrence more than 12 hours in the past with no log', () => {
    const now = day(2026, 1, 3, 21, 0) // 13h after today's 08:00
    const missed = getMissedOccurrences(ctx, now, [])
    expect(missed.some((o) => o.date === '2026-01-03')).toBe(true)
  })

  it('does not flag an occurrence within the last 12 hours', () => {
    const now = day(2026, 1, 3, 19, 0) // 11h after today's 08:00
    const missed = getMissedOccurrences(ctx, now, [])
    expect(missed.some((o) => o.date === '2026-01-03')).toBe(false)
  })

  it('excludes an occurrence that has a matching log', () => {
    const now = day(2026, 1, 3, 21, 0)
    const missed = getMissedOccurrences(ctx, now, [day(2026, 1, 3, 8, 2)])
    expect(missed.some((o) => o.date === '2026-01-03')).toBe(false)
  })
})

describe('getDueOccurrences', () => {
  const ctx: ScheduleContext = {
    schedule: { kind: 'daily' },
    startDate: '2026-01-01',
    reminderTimes: ['08:00'],
  }

  it('includes a dose due within the last 12 hours, unlike getMissedOccurrences', () => {
    const now = day(2026, 1, 3, 9, 0) // 1h after today's 08:00
    expect(getDueOccurrences(ctx, now, []).some((o) => o.date === '2026-01-03')).toBe(true)
    expect(getMissedOccurrences(ctx, now, []).some((o) => o.date === '2026-01-03')).toBe(false)
  })

  it('excludes a dose that has not come due yet', () => {
    const now = day(2026, 1, 3, 7, 0) // before today's 08:00
    expect(getDueOccurrences(ctx, now, []).some((o) => o.date === '2026-01-03')).toBe(false)
  })
})

describe('getNextOccurrence', () => {
  it('returns the soonest occurrence at or after now', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'everyNDays', n: 3 },
      startDate: '2026-01-01',
      reminderTimes: ['08:00'],
    }
    const now = day(2026, 1, 5, 12, 0)
    const next = getNextOccurrence(ctx, now)
    expect(next?.date).toBe('2026-01-07')
  })

  it('returns null once the protocol has ended', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'daily' },
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      reminderTimes: ['08:00'],
    }
    expect(getNextOccurrence(ctx, day(2026, 1, 5))).toBeNull()
  })
})

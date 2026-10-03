import { describe, expect, it } from 'vitest'
import {
  cyclePhase,
  findUnloggedInRange,
  findUnloggedOccurrences,
  getDueOccurrences,
  getMissedOccurrences,
  getNextOccurrence,
  getOccurrencesInRange,
  isScheduledDay,
  type ScheduleContext,
  type Weekday,
  wouldSettle,
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

  it('skips today\'s occurrence once it has a matching log, advancing to the next day', () => {
    // Regression: Home's "Next up" card lets a dose be logged ahead of its
    // reminder time. Without this filter, the same occurrence kept coming
    // back as "next" forever — the log button appeared to do nothing.
    const ctx: ScheduleContext = {
      schedule: { kind: 'daily' },
      startDate: '2026-01-01',
      reminderTimes: ['08:00'],
    }
    const now = day(2026, 1, 5, 6, 0) // before today's 08:00 reminder
    const loggedEarly = [day(2026, 1, 5, 6, 0)] // logged now, ahead of schedule
    const next = getNextOccurrence(ctx, now, loggedEarly)
    expect(next?.date).toBe('2026-01-06')
  })

  it('with no logs, still returns the first upcoming occurrence unfiltered', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'daily' },
      startDate: '2026-01-01',
      reminderTimes: ['08:00'],
    }
    const now = day(2026, 1, 5, 6, 0)
    expect(getNextOccurrence(ctx, now, [])?.date).toBe('2026-01-05')
    expect(getNextOccurrence(ctx, now)?.date).toBe('2026-01-05')
  })
})

describe('custom schedule', () => {
  const ctx: ScheduleContext = {
    schedule: { kind: 'custom', dates: ['2026-03-04', '2026-03-09', '2026-03-21'] },
    startDate: '2026-03-04',
    endDate: '2026-03-21',
    reminderTimes: ['08:00'],
  }

  it('is scheduled only on the hand-picked days', () => {
    expect(isScheduledDay(ctx, day(2026, 3, 4))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 3, 5))).toBe(false)
    expect(isScheduledDay(ctx, day(2026, 3, 9))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 3, 21))).toBe(true)
  })

  it('produces one occurrence per picked day per reminder time', () => {
    const occurrences = getOccurrencesInRange(ctx, day(2026, 3, 1), day(2026, 3, 31))
    expect(occurrences.map((o) => o.date)).toEqual(['2026-03-04', '2026-03-09', '2026-03-21'])
  })

  it('finds the next picked day and returns null once they have all passed', () => {
    expect(getNextOccurrence(ctx, day(2026, 3, 5))?.date).toBe('2026-03-09')
    expect(getNextOccurrence(ctx, day(2026, 3, 22))).toBeNull()
  })

  it('rejects an empty date list', () => {
    const empty: ScheduleContext = { ...ctx, schedule: { kind: 'custom', dates: [] } }
    expect(() => getOccurrencesInRange(empty, day(2026, 3, 1), day(2026, 3, 31))).toThrow(RangeError)
  })
})

describe('trackingStartsAt', () => {
  const base: ScheduleContext = {
    schedule: { kind: 'daily' },
    startDate: '2026-01-05',
    reminderTimes: ['08:00', '20:00'],
  }

  it('does not report a dose as due or missed when the protocol was saved after its reminder time', () => {
    // Regression: saving a protocol at 15:00 with an 08:00 reminder started today
    // used to show "1 missed" the moment it was saved.
    const now = day(2026, 1, 5, 15, 0)
    const ctx = { ...base, trackingStartsAt: now.toISOString() }
    expect(getDueOccurrences(base, now, []).map((o) => o.time)).toEqual(['08:00'])
    expect(getDueOccurrences(ctx, now, [])).toEqual([])
    expect(getMissedOccurrences(ctx, day(2026, 1, 6, 7, 0), [])).toEqual([])
    // ...while the same protocol without the cutoff does count the 08:00 as missed.
    expect(getMissedOccurrences(base, day(2026, 1, 6, 7, 0), []).map((o) => o.time)).toEqual(['08:00'])
  })

  it('still schedules and reports later occurrences normally', () => {
    const savedAt = day(2026, 1, 5, 15, 0)
    const ctx = { ...base, trackingStartsAt: savedAt.toISOString() }
    expect(getNextOccurrence(ctx, savedAt)?.time).toBe('20:00')
    // Tomorrow's 08:00 is a real miss once enough time has passed.
    expect(getMissedOccurrences(ctx, day(2026, 1, 6, 21, 0), []).map((o) => `${o.date} ${o.time}`)).toEqual([
      '2026-01-05 20:00',
      '2026-01-06 08:00',
    ])
  })

  it('leaves protocols without the field untouched', () => {
    expect(getOccurrencesInRange(base, day(2026, 1, 5), day(2026, 1, 5, 23, 59))).toHaveLength(2)
  })
})

describe('isScheduledDay — cycleWeeks', () => {
  // 2026-01-05 is a Monday.
  const start = '2026-01-05'

  it('runs the inner pattern for the on weeks, then nothing for the off weeks, repeating', () => {
    const ctx = { schedule: { kind: 'cycleWeeks' as const, inner: { kind: 'daily' as const }, weeksOn: 2, weeksOff: 1 }, startDate: start }
    expect(isScheduledDay(ctx, day(2026, 1, 5))).toBe(true)
    expect(isScheduledDay(ctx, day(2026, 1, 18))).toBe(true) // last on day (offset 13)
    expect(isScheduledDay(ctx, day(2026, 1, 19))).toBe(false) // off week
    expect(isScheduledDay(ctx, day(2026, 1, 25))).toBe(false)
    expect(isScheduledDay(ctx, day(2026, 1, 26))).toBe(true) // next cycle
  })

  it('follows the calendar for set weekdays', () => {
    const ctx = {
      schedule: { kind: 'cycleWeeks' as const, inner: { kind: 'weekdays' as const, days: [1, 3, 5] as Weekday[] }, weeksOn: 2, weeksOff: 1 },
      startDate: start,
    }
    expect(isScheduledDay(ctx, day(2026, 1, 5))).toBe(true) // Mon
    expect(isScheduledDay(ctx, day(2026, 1, 6))).toBe(false) // Tue
    expect(isScheduledDay(ctx, day(2026, 1, 16))).toBe(true) // Fri, week 2
    expect(isScheduledDay(ctx, day(2026, 1, 19))).toBe(false) // Mon, off week
    expect(isScheduledDay(ctx, day(2026, 1, 26))).toBe(true) // Mon, next cycle
  })

  it('restarts every N days at the start of each on-block', () => {
    const ctx = {
      schedule: { kind: 'cycleWeeks' as const, inner: { kind: 'everyNDays' as const, n: 3 }, weeksOn: 1, weeksOff: 1 },
      startDate: start,
    }
    expect([5, 8, 11].map((d) => isScheduledDay(ctx, day(2026, 1, d)))).toEqual([true, true, true])
    expect(isScheduledDay(ctx, day(2026, 1, 14))).toBe(false) // off week, even though 9 is a multiple of 3
    // Second block starts on offset 14 (Jan 19): a dose there, though 14 isn't a multiple of 3.
    expect([19, 20, 22].map((d) => isScheduledDay(ctx, day(2026, 1, d)))).toEqual([true, false, true])
  })

  it('stops after a set number of cycles, and has no next dose after the last', () => {
    const ctx: ScheduleContext = {
      schedule: { kind: 'cycleWeeks', inner: { kind: 'daily' }, weeksOn: 1, weeksOff: 1, cycles: 2, washoutWeeks: 2 },
      startDate: start,
      reminderTimes: ['08:00'],
    }
    expect(isScheduledDay(ctx, day(2026, 1, 25))).toBe(true) // last day of cycle 2
    expect(isScheduledDay(ctx, day(2026, 2, 2))).toBe(false) // would be cycle 3
    expect(getNextOccurrence(ctx, day(2026, 1, 26))).toBeNull()
    expect(getNextOccurrence(ctx, day(2026, 1, 13))?.date).toBe('2026-01-19')
  })

  it('rejects impossible cycles', () => {
    const bad = (schedule: object) => () =>
      isScheduledDay({ schedule: { kind: 'cycleWeeks', inner: { kind: 'daily' }, weeksOn: 1, weeksOff: 1, ...schedule } as never, startDate: start }, day(2026, 1, 5))
    expect(bad({ weeksOn: 0 })).toThrow(RangeError)
    expect(bad({ weeksOff: -1 })).toThrow(RangeError)
    expect(bad({ cycles: 0 })).toThrow(RangeError)
    expect(bad({ inner: { kind: 'everyNDays', n: 0 } })).toThrow(RangeError)
  })
})

describe('cyclePhase', () => {
  const start = '2026-01-05'
  const ctx = {
    schedule: { kind: 'cycleWeeks' as const, inner: { kind: 'daily' as const }, weeksOn: 2, weeksOff: 1, cycles: 2, washoutWeeks: 2 },
    startDate: start,
  }

  it('reports the on and off weeks, and when the next phase starts', () => {
    expect(cyclePhase(ctx, day(2026, 1, 12))).toEqual({
      phase: 'on', cycle: 1, totalCycles: 2, week: 2, weeks: 2, nextPhaseOn: day(2026, 1, 19),
    })
    expect(cyclePhase(ctx, day(2026, 1, 20))).toEqual({
      phase: 'off', cycle: 1, totalCycles: 2, week: 1, weeks: 1, nextPhaseOn: day(2026, 1, 26),
    })
  })

  it('reports the washout after the last cycle, then done', () => {
    // Cycle 2's on-block is Jan 26 – Feb 8; the washout replaces its off week.
    expect(cyclePhase(ctx, day(2026, 2, 8))?.phase).toBe('on')
    expect(cyclePhase(ctx, day(2026, 2, 16))).toEqual({
      phase: 'washout', cycle: 2, totalCycles: 2, week: 2, weeks: 2, nextPhaseOn: day(2026, 2, 23),
    })
    expect(cyclePhase(ctx, day(2026, 2, 23))?.phase).toBe('done')
  })

  it('goes straight to done after the last cycle without a washout, or past the end date', () => {
    const noWashout = { ...ctx, schedule: { ...ctx.schedule, washoutWeeks: undefined } }
    expect(cyclePhase(noWashout, day(2026, 2, 9))?.phase).toBe('done')
    expect(cyclePhase({ ...ctx, endDate: '2026-01-10' }, day(2026, 1, 11))?.phase).toBe('done')
  })

  it('repeats forever without a set number of cycles', () => {
    const forever = { ...ctx, schedule: { ...ctx.schedule, cycles: undefined, washoutWeeks: undefined } }
    expect(cyclePhase(forever, day(2027, 1, 4))?.phase).toBeDefined()
    expect(cyclePhase(forever, day(2026, 3, 9))).toMatchObject({ phase: 'on', cycle: 4, totalCycles: undefined })
  })

  it('is null for other schedules and before the start', () => {
    expect(cyclePhase({ schedule: { kind: 'daily' }, startDate: start }, day(2026, 1, 6))).toBeNull()
    expect(cyclePhase(ctx, day(2026, 1, 4))).toBeNull()
  })
})

describe('late and early doses', () => {
  // Weekly on Mondays at 09:00, from Mon 2026-01-05.
  const weekly: ScheduleContext = {
    schedule: { kind: 'weekdays', days: [1] },
    startDate: '2026-01-05',
    reminderTimes: ['09:00'],
  }

  it('counts a weekly dose taken a day or two late for its week', () => {
    const now = day(2026, 1, 21, 12) // Wednesday after the Jan 19 dose
    const lateLog = day(2026, 1, 20, 18) // Tuesday evening
    const logged = [day(2026, 1, 5, 9), day(2026, 1, 12, 9), lateLog]
    expect(getMissedOccurrences(weekly, now, logged)).toEqual([])
    expect(getMissedOccurrences(weekly, now, logged.slice(0, 2)).map((o) => o.date)).toEqual(['2026-01-19'])
  })

  it('counts a weekly dose taken early, so it isn’t next any more', () => {
    const now = day(2026, 1, 18, 10) // Sunday
    const early = day(2026, 1, 18, 10)
    const logged = [day(2026, 1, 5, 9), day(2026, 1, 12, 9), early]
    expect(getNextOccurrence(weekly, now, logged)?.date).toBe('2026-01-26')
  })

  it('does not stretch further than 3½ days, or across to a dose that has its own log', () => {
    const logged = [day(2026, 1, 5, 9), day(2026, 1, 16, 9)] // Friday, 4 days after Jan 12
    expect(getMissedOccurrences(weekly, day(2026, 1, 17), logged).map((o) => o.date)).toEqual(['2026-01-12'])
  })

  it('keeps daily doses same-day only', () => {
    const daily: ScheduleContext = { schedule: { kind: 'daily' }, startDate: '2026-01-05', reminderTimes: ['08:00'] }
    // An extra log the evening before doesn't stand in for the next morning.
    const logged = [day(2026, 1, 5, 8), day(2026, 1, 5, 21)]
    expect(getMissedOccurrences(daily, day(2026, 1, 7), logged).map((o) => o.date)).toEqual(['2026-01-06'])
  })

  it('sees logs just outside the range it is asked about', () => {
    // Asking only about Monday Jan 19: the Tuesday log falls outside, but still settles it.
    const logged = [day(2026, 1, 20, 18)]
    expect(findUnloggedInRange(weekly, day(2026, 1, 19), day(2026, 1, 19, 23, 59), logged)).toEqual([])
  })

  it('wouldSettle says whether logging now counts for a dose', () => {
    const occurrence = getNextOccurrence(weekly, day(2026, 1, 17, 10), [day(2026, 1, 5, 9), day(2026, 1, 12, 9)])!
    expect(occurrence.date).toBe('2026-01-19')
    expect(wouldSettle(weekly, occurrence, [], day(2026, 1, 17, 10))).toBe(true) // Saturday, 2 days early
    expect(wouldSettle(weekly, occurrence, [], day(2026, 1, 15, 10))).toBe(false) // 4 days early
  })
})

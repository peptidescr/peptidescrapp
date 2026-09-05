import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol, Settings } from './db'
import {
  computeGetStartedSteps,
  computeProtocolStats,
  computeRecentActivity,
  computeTodayProgress,
  computeTodayStatus,
  computeUpcoming,
} from './homeData'

function at(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function protocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: 'p1',
    name: '',
    compoundId: 'bpc-157',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00'],
    startDate: '2026-01-01',
    route: 'subcutaneous',
    isActive: true,
    ...overrides,
  }
}

function log(protocolId: string, administeredAt: Date): DoseLog {
  const iso = administeredAt.toISOString()
  return {
    id: `l-${iso}-${protocolId}`,
    protocolId,
    compoundId: 'bpc-157',
    doseMcg: 250,
    administeredAt: iso,
    status: 'taken',
    createdAt: iso,
    updatedAt: iso,
  }
}

describe('computeTodayProgress', () => {
  it('counts every occurrence scheduled for the local calendar day', () => {
    const p = protocol({ reminderTimes: ['08:00', '20:00'] })
    const progress = computeTodayProgress([p], [], at(2026, 3, 10, 12, 0))
    expect(progress.total).toBe(2)
    expect(progress.completed).toBe(0)
  })

  it('counts a logged occurrence as completed and not overdue', () => {
    const p = protocol({ reminderTimes: ['08:00', '20:00'] })
    const logs = [log('p1', at(2026, 3, 10, 8, 5))]
    const progress = computeTodayProgress([p], logs, at(2026, 3, 10, 12, 0))
    expect(progress.completed).toBe(1)
    expect(progress.overdue).toBe(0)
    expect(progress.nextToday?.time).toBe('20:00')
  })

  it('counts an unlogged past-time occurrence as overdue', () => {
    const p = protocol({ reminderTimes: ['08:00', '20:00'] })
    const progress = computeTodayProgress([p], [], at(2026, 3, 10, 12, 0))
    expect(progress.overdue).toBe(1)
    expect(progress.nextToday?.time).toBe('20:00')
  })

  it('ignores paused protocols entirely', () => {
    const progress = computeTodayProgress([protocol({ isActive: false })], [], at(2026, 3, 10, 12, 0))
    expect(progress.total).toBe(0)
  })

  it('treats a late-evening dose as belonging to today, not tomorrow', () => {
    // A dose at 23:00 is part of today's schedule even when read at 00:30 the
    // next morning it must NOT still be counted — that's tomorrow's problem.
    const p = protocol({ reminderTimes: ['23:00'] })
    expect(computeTodayProgress([p], [], at(2026, 3, 10, 22, 0)).total).toBe(1)
    expect(computeTodayProgress([p], [], at(2026, 3, 11, 0, 30)).total).toBe(1)
    // ...and the one counted on the 11th is the 11th's occurrence, still ahead.
    expect(computeTodayProgress([p], [], at(2026, 3, 11, 0, 30)).overdue).toBe(0)
  })
})

describe('computeTodayStatus', () => {
  const base = { completed: 0, total: 0, overdue: 0, nextToday: null }

  it('reports nothing scheduled', () => {
    expect(computeTodayStatus({ ...base })).toEqual({ kind: 'none' })
  })

  it('ranks overdue above an upcoming dose', () => {
    const p = protocol({ reminderTimes: ['08:00', '20:00'] })
    const progress = computeTodayProgress([p], [], at(2026, 3, 10, 12, 0))
    expect(computeTodayStatus(progress)).toEqual({ kind: 'overdue', count: 1 })
  })

  it('reports all done once every occurrence is logged', () => {
    expect(computeTodayStatus({ ...base, completed: 2, total: 2 })).toEqual({ kind: 'allDone', count: 2 })
  })

  it('reports the next time and how many remain', () => {
    const p = protocol({ reminderTimes: ['08:00', '20:00'] })
    const progress = computeTodayProgress([p], [log('p1', at(2026, 3, 10, 8, 1))], at(2026, 3, 10, 9, 0))
    const status = computeTodayStatus(progress)
    expect(status.kind).toBe('upcoming')
    if (status.kind === 'upcoming') expect(status.remaining).toBe(1)
  })
})

describe('computeUpcoming', () => {
  it('returns one entry per protocol, soonest first', () => {
    const early = protocol({ id: 'early', reminderTimes: ['06:00'] })
    const late = protocol({ id: 'late', reminderTimes: ['22:00'] })
    const items = computeUpcoming([late, early], [], at(2026, 3, 10, 0, 30))
    expect(items.map((i) => i.protocol.id)).toEqual(['early', 'late'])
  })

  it("doesn't let one twice-daily protocol crowd out the others", () => {
    const busy = protocol({ id: 'busy', reminderTimes: ['06:00', '07:00', '08:00'] })
    const other = protocol({ id: 'other', reminderTimes: ['09:00'] })
    const items = computeUpcoming([busy, other], [], at(2026, 3, 10, 0, 30))
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.protocol.id)).toEqual(['busy', 'other'])
  })

  it('skips paused protocols and respects the limit', () => {
    const active = protocol({ id: 'a' })
    const paused = protocol({ id: 'b', isActive: false })
    expect(computeUpcoming([active, paused], [], at(2026, 3, 10, 0, 30))).toHaveLength(1)
    expect(computeUpcoming([active], [], at(2026, 3, 10, 0, 30), 0)).toHaveLength(0)
  })
})

describe('computeRecentActivity', () => {
  it('returns the most recent logs first without mutating the input', () => {
    const logs = [
      log('p1', at(2026, 3, 8, 8, 0)),
      log('p1', at(2026, 3, 10, 8, 0)),
      log('p1', at(2026, 3, 9, 8, 0)),
    ]
    const snapshot = logs.map((l) => l.id)
    const recent = computeRecentActivity(logs, 2)
    expect(recent).toHaveLength(2)
    expect(new Date(recent[0]!.administeredAt).getDate()).toBe(10)
    expect(new Date(recent[1]!.administeredAt).getDate()).toBe(9)
    expect(logs.map((l) => l.id)).toEqual(snapshot)
  })
})

describe('computeGetStartedSteps', () => {
  const settings = (o: Partial<Settings> = {}): Settings => ({
    id: 1,
    locale: 'es-CR',
    syringeType: 'U-100',
    ...o,
  })

  it('is all incomplete on a fresh install', () => {
    expect(computeGetStartedSteps([], [], settings()).every((s) => !s.done)).toBe(true)
  })

  it('derives protocol/dose/backup steps from real data, not from flags', () => {
    const steps = computeGetStartedSteps(
      [protocol()],
      [log('p1', at(2026, 3, 10, 8, 0))],
      settings({ lastBackupAt: at(2026, 3, 10, 9, 0).toISOString() }),
    )
    const done = new Set(steps.filter((s) => s.done).map((s) => s.id))
    expect(done).toEqual(new Set(['createProtocol', 'logDose', 'backUp']))
  })

  it('needs the stored flag for the calculator, which records nothing', () => {
    expect(computeGetStartedSteps([], [], settings({ hasUsedCalculator: true }))).toContainEqual({
      id: 'tryCalculator',
      done: true,
    })
  })
})

describe('computeProtocolStats', () => {
  it('summarises an active protocol', () => {
    const p = protocol({ startDate: '2026-03-01' })
    const stats = computeProtocolStats(p, [], at(2026, 3, 10, 12, 0))
    expect(stats.isPerpetual).toBe(true)
    expect(stats.nextOccurrence?.date).toBe('2026-03-11')
    expect(stats.missedCount).toBeGreaterThan(0)
    expect(stats.upcomingCount).toBe(7)
  })

  it('reports no schedule activity for a paused protocol but keeps its history', () => {
    const p = protocol({ isActive: false, startDate: '2026-03-01' })
    const stats = computeProtocolStats(p, [log('p1', at(2026, 3, 5, 8, 0))], at(2026, 3, 10, 12, 0))
    expect(stats.nextOccurrence).toBeNull()
    expect(stats.missedCount).toBe(0)
    expect(stats.upcomingCount).toBe(0)
    expect(stats.loggedCount).toBe(1)
  })

  it('is not perpetual once an end date is set', () => {
    const p = protocol({ endDate: '2026-04-01' })
    expect(computeProtocolStats(p, [], at(2026, 3, 10, 12, 0)).isPerpetual).toBe(false)
  })
})

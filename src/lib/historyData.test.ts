import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol } from './db'
import { computeDayActivity, groupLogsByDay, relativeDayKey } from './historyData'

function at(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function log(id: string, administeredAt: Date, status: 'taken' | 'skipped' = 'taken'): DoseLog {
  const iso = administeredAt.toISOString()
  return {
    id,
    protocolId: 'p1',
    compoundId: 'bpc-157',
    doseMcg: 250,
    administeredAt: iso,
    status,
    createdAt: iso,
    updatedAt: iso,
  }
}

const protocol: Protocol = {
  id: 'p1',
  name: '',
  compoundId: 'bpc-157',
  doseAmount: 250,
  doseUnit: 'mcg',
  schedule: { kind: 'daily' },
  reminderTimes: ['08:00', '20:00'],
  startDate: '2026-03-01',
  route: 'subcutaneous',
  isActive: true,
}

describe('groupLogsByDay', () => {
  it('buckets by local calendar day, newest day first', () => {
    const groups = groupLogsByDay([
      log('a', at(2026, 3, 8, 8, 0)),
      log('b', at(2026, 3, 10, 8, 0)),
      log('c', at(2026, 3, 10, 20, 0)),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-03-10', '2026-03-08'])
    expect(groups[0]!.logs.map((l) => l.id)).toEqual(['c', 'b'])
  })

  it('counts taken and skipped separately per day', () => {
    const groups = groupLogsByDay([
      log('a', at(2026, 3, 10, 8, 0), 'taken'),
      log('b', at(2026, 3, 10, 20, 0), 'skipped'),
      log('c', at(2026, 3, 10, 12, 0), 'taken'),
    ])
    expect(groups[0]).toMatchObject({ takenCount: 2, skippedCount: 1 })
  })

  it('groups on administeredAt, not createdAt, so backfills land on the right day', () => {
    // Recorded on the 10th, but administered on the 8th — it belongs to the 8th.
    const backfilled = log('late', at(2026, 3, 8, 8, 0))
    backfilled.createdAt = at(2026, 3, 10, 22, 0).toISOString()
    const groups = groupLogsByDay([backfilled])
    expect(groups[0]!.date).toBe('2026-03-08')
  })

  it('returns nothing for no logs, and does not mutate its input', () => {
    const logs = [log('b', at(2026, 3, 10, 8, 0)), log('a', at(2026, 3, 8, 8, 0))]
    const order = logs.map((l) => l.id)
    groupLogsByDay(logs)
    expect(logs.map((l) => l.id)).toEqual(order)
    expect(groupLogsByDay([])).toEqual([])
  })
})

describe('relativeDayKey', () => {
  it('labels today and yesterday, and nothing else', () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    expect(relativeDayKey(now)).toBe('today')
    expect(relativeDayKey(yesterday)).toBe('yesterday')
    expect(relativeDayKey(at(2020, 1, 1))).toBeNull()
  })
})

describe('computeDayActivity', () => {
  it('surfaces the scheduled slots that never got logged, for backfill', () => {
    const activity = computeDayActivity([protocol], [log('a', at(2026, 3, 10, 8, 2))], at(2026, 3, 10))
    expect(activity.logs).toHaveLength(1)
    expect(activity.missedSlots).toHaveLength(1)
    expect(activity.missedSlots[0]!.occurrence.time).toBe('20:00')
  })

  it('has no missed slots once every slot is logged', () => {
    const activity = computeDayActivity(
      [protocol],
      [log('a', at(2026, 3, 10, 8, 2)), log('b', at(2026, 3, 10, 20, 5))],
      at(2026, 3, 10),
    )
    expect(activity.missedSlots).toEqual([])
  })

  it('still offers backfill for a protocol that has since been paused', () => {
    // Pausing stops future reminders; it doesn't retroactively unschedule a
    // day that was live at the time, and that history should stay fillable.
    const paused: Protocol = { ...protocol, isActive: false }
    const activity = computeDayActivity([paused], [], at(2026, 3, 10))
    expect(activity.missedSlots).toHaveLength(2)
  })

  it('sorts missed slots chronologically and ignores other days', () => {
    const activity = computeDayActivity([protocol], [log('other', at(2026, 3, 9, 8, 0))], at(2026, 3, 10))
    expect(activity.logs).toEqual([])
    expect(activity.missedSlots.map((s) => s.occurrence.time)).toEqual(['08:00', '20:00'])
  })
})

import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol } from './db'
import { buildReport } from './report'
import type { CheckIn, WeightEntry } from './results'

const day = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h)
const protocol = (id: string, isActive = true): Protocol => ({
  id,
  name: id,
  compoundId: 'semaglutide',
  doseAmount: 0.25,
  doseUnit: 'mg',
  schedule: { kind: 'daily' },
  reminderTimes: ['09:00'],
  startDate: '2026-03-01',
  route: 'subcutaneous',
  isActive,
  trackingStartsAt: day(3, 1, 0).toISOString(),
})
const log = (id: string, protocolId: string, at: Date, status: DoseLog['status'] = 'taken'): DoseLog => ({
  id,
  protocolId,
  compoundId: 'semaglutide',
  doseMcg: 250,
  administeredAt: at.toISOString(),
  status,
  createdAt: 'x',
  updatedAt: 'x',
})
const w = (id: string, at: Date, kg: number): WeightEntry => ({ id, measuredAt: at.toISOString(), grams: kg * 1000, createdAt: 'x' })
const c = (date: string, sideEffects: CheckIn['sideEffects']): CheckIn => ({ date, sideEffects, updatedAt: 'x' })

describe('buildReport', () => {
  const now = day(3, 10, 20)
  const from = day(3, 5, 0)
  const logs = [log('a', 'p1', day(3, 4)), log('b', 'p1', day(3, 6)), log('c', 'p1', day(3, 7), 'skipped'), log('d', 'old', day(3, 8))]
  const report = buildReport(
    [protocol('p1'), protocol('old', false), protocol('idle', false)],
    logs,
    [w('w0', day(3, 1), 101), w('w1', day(3, 5), 100), w('w2', day(3, 9), 99.2)],
    [c('2026-03-04', { nausea: 3 }), c('2026-03-06', { nausea: 1 }), c('2026-03-08', { nausea: 2, headache: 1 }), c('2026-03-09', {})],
    from,
    now,
  )

  it('keeps only the period, newest dose first', () => {
    expect(report.doses.map((d) => d.id)).toEqual(['d', 'c', 'b'])
    expect(report.weights.map((x) => x.id)).toEqual(['w1', 'w2'])
    expect([report.startGrams, report.latestGrams]).toEqual([100_000, 99_200])
    expect(report.checkInDays).toBe(3)
  })

  it('includes active protocols and any that logged in the period, with adherence over it', () => {
    expect(report.protocols.map((p) => p.protocol.id)).toEqual(['p1', 'old'])
    // Mar 5–10 at 09:00: Mar 5 missed, 6 taken, 7 skipped, 8–9 missed; Mar 10's dose is still inside its 12h window.
    expect(report.protocols[0]!.adherence).toMatchObject({ taken: 1, skipped: 1, missed: 3 })
  })

  it('summarises side effects by how often, worst and mean severity', () => {
    expect(report.symptoms).toEqual([
      { id: 'nausea', days: 2, worst: 2, mean: 1.5 },
      { id: 'headache', days: 1, worst: 1, mean: 1 },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol } from './db'
import {
  BASELINE_KEY,
  defaultFocusProtocol,
  niceTicks,
  rangeStart,
  resultsByDoseStep,
  resultsBySite,
  sideEffectTimeline,
  stepsShaded,
  stepOn,
  weightPoints,
} from './progressCharts'
import type { CheckIn, WeightEntry } from './results'

const day = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h)
// Started Jan 5: 2.5 mg for 2 weeks, then 5 mg.
const titrated: Protocol = {
  id: 'p1',
  name: 'GLP',
  compoundId: 'tirzepatide',
  doseAmount: 2.5,
  doseUnit: 'mg',
  schedule: { kind: 'weekdays', days: [1] },
  reminderTimes: ['09:00'],
  startDate: '2026-01-05',
  route: 'subcutaneous',
  isActive: true,
  titration: { steps: [{ doseAmount: 2.5, weeks: 2 }, { doseAmount: 5, weeks: 4 }] },
}
const w = (id: string, at: Date, kg: number): WeightEntry => ({ id, measuredAt: at.toISOString(), grams: kg * 1000, createdAt: 'x' })
const taken = (id: string, at: Date, over: Partial<DoseLog> = {}): DoseLog => ({
  id,
  protocolId: 'p1',
  compoundId: 'tirzepatide',
  administeredAt: at.toISOString(),
  status: 'taken',
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
})
const checkIn = (date: string, sideEffects: CheckIn['sideEffects']): CheckIn => ({ date, sideEffects, updatedAt: 'x' })

describe('stepOn / stepsShaded', () => {
  it('names the dose step in force, and the baseline before the protocol started', () => {
    expect(stepOn(titrated, day(1, 3)).key).toBe(BASELINE_KEY)
    expect(stepOn(titrated, day(1, 6)).key).toBe('2.5 mg')
    expect(stepOn(titrated, day(1, 20)).key).toBe('5 mg')
    expect(stepOn(null, day(1, 20)).key).toBe(BASELINE_KEY)
  })

  it('shades steps lowest dose first, sharing four shades in order past four', () => {
    const steps = [5, 2.5, 7.5].map((a) => ({ key: `${a} mg`, amount: a, unit: 'mg' as const }))
    expect(stepsShaded([...steps, { key: BASELINE_KEY, amount: null, unit: null }]).map((s) => [s.key, s.shade])).toEqual([
      [BASELINE_KEY, 0],
      ['2.5 mg', 1],
      ['5 mg', 3],
      ['7.5 mg', 4],
    ])
    const two = stepsShaded(steps.slice(0, 2)).map((x) => x.shade)
    expect(two).toEqual([1, 4]) // 2.5 mg then 5 mg: the two ends of the ramp
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((a) => ({ key: `${a} mg`, amount: a, unit: 'mg' as const }))
    expect(stepsShaded(many).map((s) => s.shade)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('weightPoints', () => {
  it('keeps the range, oldest first, tagged with the step', () => {
    const points = weightPoints(
      [w('c', day(1, 20), 96), w('a', day(1, 1), 100), w('b', day(1, 10), 98)],
      titrated,
      day(1, 2),
      day(1, 25),
    )
    expect(points.map((p) => [p.grams, p.step])).toEqual([
      [98_000, '2.5 mg'],
      [96_000, '5 mg'],
    ])
  })
})

describe('resultsByDoseStep', () => {
  it('measures weight change and side effects per step', () => {
    const weights = [w('a', day(1, 4), 100), w('b', day(1, 12), 99), w('c', day(1, 18), 98.5), w('d', day(2, 1), 96.5)]
    const checkIns = [
      checkIn('2026-01-07', { nausea: 2 }),
      checkIn('2026-01-08', {}),
      checkIn('2026-01-21', { nausea: 1, fatigue: 3 }),
    ]
    const results = resultsByDoseStep(titrated, weights, checkIns, day(2, 1, 20))
    expect(results).toEqual([
      // 100 (the day before it started) → 98.5 at its end.
      { key: '2.5 mg', amount: 2.5, unit: 'mg', days: 14, weightChangeGrams: -1500, perWeekGrams: -750, checkInDays: 2, sideEffectDays: 1, meanSeverity: 2 },
      // 98.5 → 96.5.
      { key: '5 mg', amount: 5, unit: 'mg', days: 14, weightChangeGrams: -2000, perWeekGrams: -1000, checkInDays: 1, sideEffectDays: 1, meanSeverity: 3 },
    ])
  })

  it('has nothing before the protocol starts', () => {
    expect(resultsByDoseStep(titrated, [], [], day(1, 1))).toEqual([])
  })
})

describe('resultsBySite', () => {
  it('counts doses per site and the ones followed by a site reaction that day', () => {
    const logs = [
      taken('1', day(1, 5), { site: 'thigh-left' }),
      taken('2', day(1, 12), { site: 'thigh-left' }),
      taken('3', day(1, 19), { site: 'abdomen-upper-left' }),
      taken('4', day(1, 26), { site: 'thigh-left', status: 'skipped' }),
    ]
    const checkIns = [checkIn('2026-01-12', { 'injection-site-reaction': 2, nausea: 3 })]
    expect(resultsBySite(logs, checkIns, day(1, 1))).toEqual([
      { site: 'thigh-left', doses: 2, reactionDoses: 1, meanSeverity: 2, lastUsed: day(1, 12) },
      { site: 'abdomen-upper-left', doses: 1, reactionDoses: 0, meanSeverity: null, lastUsed: day(1, 19) },
    ])
  })
})

describe('sideEffectTimeline', () => {
  it('lays out a column per day, with doses and the worst severity per symptom', () => {
    const t = sideEffectTimeline(
      [checkIn('2026-01-06', { nausea: 1 }), checkIn('2026-01-07', { nausea: 3, headache: 1 })],
      [taken('1', day(1, 5)), taken('x', day(1, 6), { protocolId: 'other' })],
      titrated,
      day(1, 5),
      day(1, 8),
    )
    expect(t.bin).toBe('day')
    expect(t.columns).toHaveLength(4)
    expect(t.columns[0]).toMatchObject({ doses: 1, doseStep: '2.5 mg' })
    expect(t.columns[1]!.doses).toBe(0) // the other protocol's dose isn't drawn
    expect(t.columns[2]!.severity).toEqual({ nausea: 3, headache: 1 })
    expect(t.symptoms).toEqual(['nausea', 'headache'])
  })

  it('bins by week past 60 days, keeping the worst severity of the week', () => {
    const t = sideEffectTimeline(
      [checkIn('2026-03-02', { nausea: 1 }), checkIn('2026-03-04', { nausea: 2 })],
      [],
      null,
      day(1, 1),
      day(4, 1),
    )
    expect(t.bin).toBe('week')
    const week = t.columns.find((c) => c.from <= day(3, 2, 0) && c.to >= day(3, 4, 0))
    expect(week?.severity).toEqual({ nausea: 2 })
  })
})

describe('helpers', () => {
  it('picks an active titration to focus on, else the most-used active protocol', () => {
    const plain = { ...titrated, id: 'p2', titration: undefined }
    expect(defaultFocusProtocol([plain, titrated], [])?.id).toBe('p1')
    const other = { ...titrated, id: 'p3', titration: undefined }
    expect(defaultFocusProtocol([plain, other], [taken('a', day(1, 5), { protocolId: 'p3' })])?.id).toBe('p3')
    expect(defaultFocusProtocol([], [])).toBeNull()
  })

  it('computes range starts and round ticks', () => {
    expect(rangeStart('30d', day(3, 31), null)).toEqual(new Date(2026, 2, 2))
    expect(rangeStart('all', day(3, 31), day(1, 5))).toEqual(new Date(2026, 0, 5))
    expect(niceTicks(92.3, 101.7)).toEqual([92.5, 95, 97.5, 100])
    expect(niceTicks(180, 214)).toEqual([180, 190, 200, 210])
  })
})

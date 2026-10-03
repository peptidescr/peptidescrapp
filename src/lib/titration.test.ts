import { addDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
// The service worker's own source, to test its copy of doseOn (see the last describe).
import swSource from '../../public/shared/sw-notifications.js?raw'
import { doseChangeNotice, doseOn, formatDose, nextDoseChange, sameDose, stepStartsOn } from './titration'

// 2026-01-05 is a Monday. 2.5 mg for 4 weeks, 5 mg for 4 weeks, then 7.5 mg on.
const protocol = {
  doseAmount: 2.5,
  doseUnit: 'mg' as const,
  startDate: '2026-01-05',
  titration: {
    steps: [
      { doseAmount: 2.5, weeks: 4 },
      { doseAmount: 5, weeks: 4 },
      { doseAmount: 7.5, weeks: 99 }, // the last step's weeks never matter
    ],
  },
}
const day = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h)

describe('doseOn', () => {
  it('steps through the doses by calendar weeks from the start, holding the last', () => {
    expect(doseOn(protocol, day(2026, 1, 5))).toEqual({ amount: 2.5, unit: 'mg', stepIndex: 0 })
    expect(doseOn(protocol, day(2026, 2, 1, 23))).toMatchObject({ amount: 2.5, stepIndex: 0 }) // day 27
    expect(doseOn(protocol, day(2026, 2, 2, 0))).toMatchObject({ amount: 5, stepIndex: 1 }) // day 28
    expect(doseOn(protocol, day(2026, 3, 2))).toMatchObject({ amount: 7.5, stepIndex: 2 })
    expect(doseOn(protocol, day(2027, 6, 1))).toMatchObject({ amount: 7.5, stepIndex: 2 })
  })

  it('uses the first step before the start date', () => {
    expect(doseOn(protocol, day(2025, 12, 1))).toMatchObject({ amount: 2.5, stepIndex: 0 })
  })

  it('is the plain dose for a protocol without titration, or with a single step', () => {
    expect(doseOn({ ...protocol, titration: undefined }, day(2026, 6, 1))).toEqual({ amount: 2.5, unit: 'mg', stepIndex: null })
    const single = { ...protocol, titration: { steps: [{ doseAmount: 9, weeks: 4 }] } }
    expect(doseOn(single, day(2026, 6, 1))).toEqual({ amount: 2.5, unit: 'mg', stepIndex: null })
  })
})

describe('stepStartsOn / nextDoseChange', () => {
  it('knows when each step starts', () => {
    expect(stepStartsOn(protocol, 0)).toEqual(day(2026, 1, 5, 0))
    expect(stepStartsOn(protocol, 1)).toEqual(day(2026, 2, 2, 0))
    expect(stepStartsOn(protocol, 2)).toEqual(day(2026, 3, 2, 0))
  })

  it('reports the next change, and none on the last step', () => {
    expect(nextDoseChange(protocol, day(2026, 1, 20))).toEqual({
      on: day(2026, 2, 2, 0),
      from: 2.5,
      to: 5,
      unit: 'mg',
      stepIndex: 1,
    })
    expect(nextDoseChange(protocol, day(2026, 3, 2))).toBeNull()
    expect(nextDoseChange({ ...protocol, titration: undefined }, day(2026, 1, 20))).toBeNull()
  })
})

describe('doseChangeNotice', () => {
  it('announces a change from three days ahead, and on the day itself', () => {
    expect(doseChangeNotice(protocol, day(2026, 1, 29))).toBeNull() // 4 days out
    expect(doseChangeNotice(protocol, day(2026, 1, 30))?.on).toEqual(day(2026, 2, 2, 0)) // 3 days out
    expect(doseChangeNotice(protocol, day(2026, 2, 2, 21))).toMatchObject({ from: 2.5, to: 5 }) // the day
    expect(doseChangeNotice(protocol, day(2026, 2, 3))).toBeNull() // the day after
  })

  it('never announces the start of the first step', () => {
    expect(doseChangeNotice(protocol, day(2026, 1, 5))).toBeNull()
  })
})

describe("the service worker's copy of doseOn", () => {
  // public/shared/sw-notifications.js runs outside the bundle, so it carries
  // its own doseOnDay. Lifted out of the file as-is and checked against the real one.
  const fn = /function doseOnDay\(protocol, iso\) \{[\s\S]*?\n\}/.exec(swSource)?.[0]
  const doseOnDay = new Function(`${fn}; return doseOnDay`)() as (p: unknown, iso: string) => number

  it('agrees with doseOn on every day of a year, at morning and late-evening times', () => {
    expect(fn).toBeDefined()
    for (let d = -3; d < 365; d++) {
      for (const hour of [7, 23]) {
        const at = addDays(day(2026, 1, 5, hour), d)
        expect(doseOnDay(protocol, at.toISOString()), at.toISOString()).toBe(doseOn(protocol, at).amount)
      }
    }
  })

  it('falls back to the plain dose without a titration or with a bad time', () => {
    expect(doseOnDay({ ...protocol, titration: undefined }, new Date().toISOString())).toBe(2.5)
    expect(doseOnDay(protocol, 'not a time')).toBe(2.5)
  })
})

describe('sameDose', () => {
  it('compares across mg and mcg, never IU against mass', () => {
    expect(sameDose({ doseAmount: 0.25, doseUnit: 'mg' }, { amount: 250, unit: 'mcg', stepIndex: null })).toBe(true)
    expect(sameDose({ doseAmount: 2.5, doseUnit: 'mg' }, { amount: 5, unit: 'mg', stepIndex: 1 })).toBe(false)
    expect(sameDose({ doseAmount: 2, doseUnit: 'IU' }, { amount: 2, unit: 'mg', stepIndex: null })).toBe(false)
  })
})

describe('formatDose', () => {
  it('joins amount and unit with a non-breaking space', () => {
    const nbsp = String.fromCharCode(0xa0)
    expect(formatDose({ amount: 2.5, unit: 'mg' })).toBe(`2.5${nbsp}mg`)
    expect(formatDose({ amount: 250, unit: 'mcg' }).replace(nbsp, ' ')).toBe('250 mcg')
  })
})

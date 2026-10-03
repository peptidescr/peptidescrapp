import { describe, expect, it } from 'vitest'
import type { Protocol } from './db'
import { shiftScheduleTo } from './lateDose'

const base: Protocol = {
  id: 'p1',
  name: '',
  compoundId: 'semaglutide',
  doseAmount: 0.25,
  doseUnit: 'mg',
  schedule: { kind: 'weekdays', days: [1] },
  reminderTimes: ['09:00'],
  startDate: '2026-01-05',
  route: 'subcutaneous',
  isActive: true,
}
const tuesday = new Date(2026, 0, 20, 18, 30)

describe('shiftScheduleTo', () => {
  it('moves a once-a-week schedule to the day the dose was taken', () => {
    expect(shiftScheduleTo(base, tuesday)).toEqual({
      schedule: { kind: 'weekdays', days: [2] },
      trackingStartsAt: new Date(2026, 0, 20).toISOString(),
    })
  })

  it('restarts an every-N-days count from that day', () => {
    expect(shiftScheduleTo({ ...base, schedule: { kind: 'everyNDays', n: 7 } }, tuesday)).toEqual({
      startDate: '2026-01-20',
      trackingStartsAt: new Date(2026, 0, 20).toISOString(),
    })
  })

  it('has nothing to move for other schedules, or when it is already that day', () => {
    expect(shiftScheduleTo({ ...base, schedule: { kind: 'daily' } }, tuesday)).toBeNull()
    expect(shiftScheduleTo({ ...base, schedule: { kind: 'weekdays', days: [1, 4] } }, tuesday)).toBeNull()
    expect(shiftScheduleTo({ ...base, schedule: { kind: 'everyNDays', n: 1 } }, tuesday)).toBeNull()
    expect(shiftScheduleTo({ ...base, schedule: { kind: 'weekdays', days: [2] } }, tuesday)).toBeNull()
  })
})

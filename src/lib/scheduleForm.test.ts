import { describe, expect, it } from 'vitest'
import type { Schedule } from './schedule'
import { parseScheduleFields, scheduleFields } from './scheduleForm'

describe('scheduleFields / parseScheduleFields', () => {
  it.each<Schedule>([
    { kind: 'daily' },
    { kind: 'everyNDays', n: 3 },
    { kind: 'weekdays', days: [1, 3, 5] },
    { kind: 'cycle', daysOn: 5, daysOff: 2 },
    { kind: 'custom', dates: ['2026-10-02', '2026-10-09'] },
    { kind: 'cycleWeeks', inner: { kind: 'weekdays', days: [1, 4] }, weeksOn: 8, weeksOff: 4 },
    { kind: 'cycleWeeks', inner: { kind: 'everyNDays', n: 2 }, weeksOn: 6, weeksOff: 0, cycles: 3, washoutWeeks: 2 },
    { kind: 'cycleWeeks', inner: { kind: 'daily' }, weeksOn: 4, weeksOff: 4, cycles: 1 },
  ])('round-trips %o', (schedule) => {
    expect(parseScheduleFields(scheduleFields(schedule)).schedule).toEqual(schedule)
  })

  it('starts a new protocol daily, with sensible values waiting in the other fields', () => {
    const fields = scheduleFields()
    expect(parseScheduleFields(fields).schedule).toEqual({ kind: 'daily' })
    expect(parseScheduleFields({ ...fields, kind: 'cycleWeeks' }).schedule).toEqual({
      kind: 'cycleWeeks',
      inner: { kind: 'daily' },
      weeksOn: 8,
      weeksOff: 4,
    })
  })

  it('refuses invalid input instead of defaulting it', () => {
    const cycle = scheduleFields({ kind: 'cycleWeeks', inner: { kind: 'daily' }, weeksOn: 8, weeksOff: 4 })
    expect(parseScheduleFields({ ...cycle, weeksOn: '0' }).schedule).toBeNull()
    expect(parseScheduleFields({ ...cycle, weeksOff: '' }).schedule).toBeNull()
    expect(parseScheduleFields({ ...cycle, weeksOn: '200' }).weeksOn).toBeNull()
    expect(parseScheduleFields({ ...cycle, cycleInner: 'weekdays', weekdays: [] }).schedule).toBeNull()
    expect(parseScheduleFields({ ...cycle, cycleInner: 'everyNDays', everyN: '0' }).schedule).toBeNull()
    expect(parseScheduleFields({ ...cycle, fixedCycles: true, cycleCount: '0' }).schedule).toBeNull()
    expect(parseScheduleFields({ ...cycle, fixedCycles: true, washoutWeeks: '0' }).schedule).toBeNull()
    expect(parseScheduleFields({ ...scheduleFields(), kind: 'weekdays', weekdays: [] }).schedule).toBeNull()
  })

  it('ignores the cycle count and washout unless a fixed number of cycles is on', () => {
    const cycle = scheduleFields({ kind: 'cycleWeeks', inner: { kind: 'daily' }, weeksOn: 8, weeksOff: 4 })
    expect(parseScheduleFields({ ...cycle, cycleCount: 'x', washoutWeeks: '0' }).schedule).toEqual({
      kind: 'cycleWeeks',
      inner: { kind: 'daily' },
      weeksOn: 8,
      weeksOff: 4,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { formatClock, formatDateTime, formatTime, from12Hour, to12Hour, toHHmm } from './dates'

describe('12-hour time', () => {
  it('displays stored 24h times as a 12-hour clock with AM/PM', () => {
    expect(formatClock('00:00')).toBe('12:00 AM')
    expect(formatClock('00:05')).toBe('12:05 AM')
    expect(formatClock('08:30')).toBe('8:30 AM')
    expect(formatClock('12:00')).toBe('12:00 PM')
    expect(formatClock('12:45')).toBe('12:45 PM')
    expect(formatClock('16:35')).toBe('4:35 PM')
    expect(formatClock('23:59')).toBe('11:59 PM')
  })

  it('formats Dates the same way, and keeps the stored form 24h', () => {
    const d = new Date(2026, 2, 5, 16, 5)
    expect(formatTime(d)).toBe('4:05 PM')
    expect(formatDateTime(d)).toBe('05/03/2026 4:05 PM')
    expect(toHHmm(d)).toBe('16:05')
    expect(toHHmm(new Date(2026, 2, 5, 0, 7))).toBe('00:07')
  })

  it('round-trips every minute of the day between 24h storage and 12h pieces', () => {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const stored = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const { hour, minute, period } = to12Hour(stored)
        expect(hour).toBeGreaterThanOrEqual(1)
        expect(hour).toBeLessThanOrEqual(12)
        expect(from12Hour(hour, minute, period)).toBe(stored)
      }
    }
  })

  it('treats 12 AM as midnight and 12 PM as noon', () => {
    expect(from12Hour(12, '00', 'AM')).toBe('00:00')
    expect(from12Hour(12, '00', 'PM')).toBe('12:00')
    expect(from12Hour(1, '30', 'PM')).toBe('13:30')
  })
})

import { describe, expect, it } from 'vitest'
import { formatCountdown, greetingKey } from './homeText'

const at = (hour: number, minute = 0) => new Date(2026, 9, 22, hour, minute)
// A stand-in for i18n's t: the key and its options, so the test sees which string was chosen.
const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key)

describe('greetingKey', () => {
  it('is morning until noon, afternoon until 7pm, evening after', () => {
    expect(greetingKey(at(0))).toBe('home.greetingMorning')
    expect(greetingKey(at(11, 59))).toBe('home.greetingMorning')
    expect(greetingKey(at(12))).toBe('home.greetingAfternoon')
    expect(greetingKey(at(18, 59))).toBe('home.greetingAfternoon')
    expect(greetingKey(at(19))).toBe('home.greetingEvening')
    expect(greetingKey(at(23, 59))).toBe('home.greetingEvening')
  })
})

describe('formatCountdown', () => {
  it('says due now at or past the time', () => {
    expect(formatCountdown(at(9), at(9), t)).toBe('home.dueNow')
    expect(formatCountdown(at(10), at(9), t)).toBe('home.dueNow')
  })

  it('counts minutes under an hour and hours with minutes above it', () => {
    expect(formatCountdown(at(9), at(9, 25), t)).toBe('home.inMinutes {"minutes":25}')
    expect(formatCountdown(at(9), at(11, 59), t)).toBe('home.inHoursMinutes {"hours":2,"minutes":59}')
    expect(formatCountdown(at(9), at(10), t)).toBe('home.inHoursMinutes {"hours":1,"minutes":0}')
  })
})

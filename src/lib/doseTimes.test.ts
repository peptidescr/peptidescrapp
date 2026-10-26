import { describe, expect, it } from 'vitest'
import { MAX_DOSE_TIMES, hasDuplicateDoseTimes, normalizeDoseTimes, suggestNextDoseTime } from './doseTimes'

describe('normalizeDoseTimes', () => {
  it('sorts earliest first', () => {
    expect(normalizeDoseTimes(['21:00', '08:00', '13:30'])).toEqual(['08:00', '13:30', '21:00'])
  })

  it('keeps each time once', () => {
    expect(normalizeDoseTimes(['08:00', '20:00', '08:00'])).toEqual(['08:00', '20:00'])
  })

  it('does not change what it is given', () => {
    const times = ['20:00', '08:00']
    normalizeDoseTimes(times)
    expect(times).toEqual(['20:00', '08:00'])
  })
})

describe('hasDuplicateDoseTimes', () => {
  it('spots the same time set twice', () => {
    expect(hasDuplicateDoseTimes(['08:00', '08:00'])).toBe(true)
    expect(hasDuplicateDoseTimes(['08:00', '08:01'])).toBe(false)
    expect(hasDuplicateDoseTimes([])).toBe(false)
  })
})

describe('suggestNextDoseTime', () => {
  it('starts at 08:00', () => {
    expect(suggestNextDoseTime([])).toBe('08:00')
  })

  it('offers twelve hours after the latest dose', () => {
    expect(suggestNextDoseTime(['08:00'])).toBe('20:00')
    expect(suggestNextDoseTime(['21:00'])).toBe('09:00')
  })

  it('never offers a time that is already taken', () => {
    expect(suggestNextDoseTime(['08:00', '20:00'])).not.toBe('08:00')
    expect(suggestNextDoseTime(['08:00', '20:00'])).not.toBe('20:00')
  })

  it('can fill the day without repeating a time', () => {
    let times = ['08:00']
    while (times.length < MAX_DOSE_TIMES) {
      const next = suggestNextDoseTime(times)
      expect(times).not.toContain(next)
      times = [...times, next]
    }
    expect(hasDuplicateDoseTimes(times)).toBe(false)
  })
})

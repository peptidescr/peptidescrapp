import { describe, expect, it } from 'vitest'
import { parseTypedDate, toIsoDate } from './dates'

describe('parseTypedDate', () => {
  it('reads day-month-year with common separators and shorthand', () => {
    for (const text of ['5/3/2026', '05-03-2026', '5.3.26', '05032026', ' 5 3 2026 ']) {
      expect(toIsoDate(parseTypedDate(text)!)).toBe('2026-03-05')
    }
  })

  it('rejects impossible or malformed dates instead of rolling them over', () => {
    for (const text of ['31/02/2026', '32/01/2026', '1/13/2026', '', 'abc', '5/3']) {
      expect(parseTypedDate(text)).toBeNull()
    }
  })
})

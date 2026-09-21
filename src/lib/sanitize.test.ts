import { describe, expect, it } from 'vitest'
import {
  csvSafeText,
  MAX_DAY_COUNT,
  MAX_DOSE_AMOUNT,
  MAX_NAME_LENGTH,
  parseBoundedInteger,
  parsePositiveAmount,
  sanitizeDecimal,
  sanitizeInteger,
  sanitizeMultiline,
  sanitizeText,
} from './sanitize'

describe('sanitizeDecimal', () => {
  it('keeps digits and one separator, dropping everything else', () => {
    expect(sanitizeDecimal('12.5')).toBe('12.5')
    expect(sanitizeDecimal('12,5')).toBe('12,5')
    expect(sanitizeDecimal('abc1x2.5mg')).toBe('12.5')
    expect(sanitizeDecimal('-5')).toBe('5')
    expect(sanitizeDecimal('1e5')).toBe('15')
    expect(sanitizeDecimal('١٢٣')).toBe('') // non-ASCII digits are not accepted
    expect(sanitizeDecimal('😀5')).toBe('5')
  })

  it('ignores a second separator and pads a leading one', () => {
    expect(sanitizeDecimal('1.5.')).toBe('1.5')
    expect(sanitizeDecimal('1.2.3')).toBe('1.23')
    expect(sanitizeDecimal('.5')).toBe('0.5')
    expect(sanitizeDecimal(',')).toBe('0,')
  })

  it('caps the length', () => {
    expect(sanitizeDecimal('123456789012345')).toHaveLength(10)
  })
})

describe('sanitizeInteger', () => {
  it('keeps digits only', () => {
    expect(sanitizeInteger('7')).toBe('7')
    expect(sanitizeInteger('1.5')).toBe('15')
    expect(sanitizeInteger('-3')).toBe('3')
    expect(sanitizeInteger('abc')).toBe('')
    expect(sanitizeInteger('12345')).toBe('123')
  })
})

describe('parsePositiveAmount / parseBoundedInteger', () => {
  it('accepts real amounts in either decimal style and rejects everything else, never coercing to 0', () => {
    expect(parsePositiveAmount('0.25')).toBe(0.25)
    expect(parsePositiveAmount('2,5')).toBe(2.5)
    for (const bad of ['', '0', '0.0', '0,', '.', 'abc', `${MAX_DOSE_AMOUNT + 1}`]) {
      expect(parsePositiveAmount(bad)).toBeNull()
    }
  })

  it('enforces integer bounds', () => {
    expect(parseBoundedInteger('7', 1, MAX_DAY_COUNT)).toBe(7)
    expect(parseBoundedInteger('0', 0, MAX_DAY_COUNT)).toBe(0)
    expect(parseBoundedInteger('0', 1, MAX_DAY_COUNT)).toBeNull()
    expect(parseBoundedInteger('366', 1, MAX_DAY_COUNT)).toBeNull()
    expect(parseBoundedInteger('', 1, 9)).toBeNull()
    expect(parseBoundedInteger('1.5', 1, 9)).toBeNull()
  })
})

describe('sanitizeText', () => {
  it('strips control, invisible and direction-override characters and collapses whitespace', () => {
    expect(sanitizeText('  Knee\u0000 \n\tstack  ')).toBe(' Knee stack ')
    expect(sanitizeText('a\u202Eb\u200Bc\uFEFF')).toBe('abc')
  })

  it('caps the length', () => {
    expect(sanitizeText('x'.repeat(500))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('leaves ordinary text, accents and symbols alone', () => {
    expect(sanitizeText('Sueño – BPC-157 (10 mg)')).toBe('Sueño – BPC-157 (10 mg)')
  })
})

describe('sanitizeMultiline', () => {
  it('keeps line breaks and tabs but removes other control characters', () => {
    expect(sanitizeMultiline('line 1\r\nline 2\u0000\tend\u202E')).toBe('line 1\nline 2\tend')
  })
})

describe('csvSafeText', () => {
  it('neutralises spreadsheet formulas', () => {
    for (const cell of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvSafeText(cell).startsWith("'")).toBe(true)
    }
  })

  it('leaves normal text untouched', () => {
    expect(csvSafeText('felt fine')).toBe('felt fine')
    expect(csvSafeText('')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { parseTitrationFields, titrationFields } from './titrationForm'

const titration = {
  steps: [
    { doseAmount: 2.5, weeks: 4 },
    { doseAmount: 5, weeks: 4 },
    { doseAmount: 7.5, weeks: 4 },
  ],
}

describe('titrationFields / parseTitrationFields', () => {
  it('round-trips a titration, with the first dose coming from the main dose field', () => {
    expect(parseTitrationFields(titrationFields(titration), 2.5).titration).toEqual(titration)
  })

  it('is off, with one blank step waiting, for a protocol without one', () => {
    const fields = titrationFields()
    expect(fields).toEqual({ on: false, firstWeeks: '4', later: [{ dose: '', weeks: '4' }] })
    expect(parseTitrationFields(fields, 2.5).titration).toBeUndefined()
  })

  it('accepts comma decimals and ignores the last step’s hidden weeks', () => {
    const parsed = parseTitrationFields(
      { on: true, firstWeeks: '4', later: [{ dose: '5,5', weeks: 'whatever' }] },
      2.5,
    )
    expect(parsed.titration).toEqual({ steps: [{ doseAmount: 2.5, weeks: 4 }, { doseAmount: 5.5, weeks: 4 }] })
  })

  it('refuses invalid steps instead of defaulting them', () => {
    const on = titrationFields(titration)
    expect(parseTitrationFields(on, null).titration).toBeNull()
    expect(parseTitrationFields({ ...on, firstWeeks: '0' }, 2.5).titration).toBeNull()
    expect(parseTitrationFields({ ...on, later: [{ dose: '', weeks: '4' }, { dose: '7', weeks: '4' }] }, 2.5).titration).toBeNull()
    expect(parseTitrationFields({ ...on, later: [{ dose: '5', weeks: '0' }, { dose: '7', weeks: '4' }] }, 2.5).titration).toBeNull()
    expect(parseTitrationFields({ ...on, later: [] }, 2.5).titration).toBeNull()
    expect(
      parseTitrationFields({ ...on, later: Array.from({ length: 12 }, () => ({ dose: '5', weeks: '4' })) }, 2.5).titration,
    ).toBeNull()
  })
})

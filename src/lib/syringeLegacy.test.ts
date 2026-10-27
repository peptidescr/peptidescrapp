import { describe, expect, it } from 'vitest'
import { readLegacyMix, readLegacySyringeType } from './syringeLegacy'

describe('readLegacySyringeType', () => {
  it('reads the old 3 mL type as a 3 mL U-100', () => {
    expect(readLegacySyringeType('3mL')).toEqual({ type: 'U-100', sizeMl: 3 })
  })

  it('passes anything else through, with no size', () => {
    expect(readLegacySyringeType('U-50')).toEqual({ type: 'U-50' })
    expect(readLegacySyringeType(undefined)).toEqual({ type: undefined })
  })
})

describe('readLegacyMix', () => {
  it('turns marks of 0.1 mL into U-100 units, which is the same volume', () => {
    // 7 marks = 0.7 mL = 70 units on a U-100.
    expect(readLegacyMix('3mL', 7)).toEqual({ syringeType: 'U-100', drawSyringeUnits: 70, syringeSizeMl: 3 })
  })

  it('leaves a mix from a real unit type untouched', () => {
    expect(readLegacyMix('U-40', 12)).toEqual({ syringeType: 'U-40', drawSyringeUnits: 12 })
  })
})
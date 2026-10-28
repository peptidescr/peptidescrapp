import { describe, expect, it } from 'vitest'
import { DILUENT_PRESETS_ML, DOSE_PRESETS_MCG, MASS_PRESETS_MG, vialChipValues } from './calculatorPresets'

describe('the approved presets', () => {
  it('are the ones on the screen', () => {
    expect([...MASS_PRESETS_MG]).toEqual([2, 5, 10, 15, 50])
    expect([...DILUENT_PRESETS_ML]).toEqual([1, 2, 3, 5])
    expect([...DOSE_PRESETS_MCG]).toEqual([100, 250, 500, 1000])
  })
})

describe('vialChipValues', () => {
  it('is just the presets for a compound whose size is already one of them', () => {
    expect(vialChipValues('mg', [10])).toEqual([2, 5, 10, 15, 50])
  })

  it('adds a mass compound\'s own sizes, in order and without repeats', () => {
    expect(vialChipValues('mg', [10, 15, 20, 30, 40, 60])).toEqual([2, 5, 10, 15, 20, 30, 40, 50, 60])
    expect(vialChipValues('mg', [1500])).toEqual([2, 5, 10, 15, 50, 1500])
  })

  it('uses only the compound\'s own sizes for IU and for a ready-made solution\'s bottle volume', () => {
    expect(vialChipValues('IU', [50, 12, 24, 30])).toEqual([12, 24, 30, 50])
    expect(vialChipValues('IU', [10000])).toEqual([10000])
    expect(vialChipValues('mL', [10, 30])).toEqual([10, 30])
  })

  it('uses microgram presets for a compound sold in micrograms', () => {
    expect(vialChipValues('mcg', [250])).toEqual([250, 500, 1000, 2500, 5000, 10000])
  })
})

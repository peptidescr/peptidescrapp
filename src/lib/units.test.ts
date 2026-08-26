import { describe, expect, it } from 'vitest'
import * as units from './units'
import {
  formatDecimal,
  formatIU,
  formatMass,
  formatSyringeUnits,
  formatVolumeMl,
  massFromMicrograms,
  mgFromMicrograms,
  microgramsFromMass,
  microgramsFromMg,
  microlitersFromMl,
  microlitersFromSyringeUnits,
  microlitersPerSyringeUnit,
  mlFromMicroliters,
  parseDecimal,
  quantizeVolumeToSyringe,
  roundInt,
  syringeUnitsFromMicroliters,
  syringeUnitsPerMl,
  iuFromMilliIU,
  milliIUFromIU,
  type Microgram,
  type Microliter,
} from './units'

describe('roundInt', () => {
  it('rounds down', () => {
    expect(roundInt(2.9, 'down')).toBe(2)
    expect(roundInt(2.1, 'down')).toBe(2)
  })
  it('rounds up', () => {
    expect(roundInt(2.1, 'up')).toBe(3)
    expect(roundInt(2.9, 'up')).toBe(3)
  })
  it('rounds to nearest, defaulting when no direction given', () => {
    expect(roundInt(2.4)).toBe(2)
    expect(roundInt(2.5)).toBe(3)
    expect(roundInt(2.6)).toBe(3)
  })
  it('rejects non-finite input', () => {
    expect(() => roundInt(NaN)).toThrow(RangeError)
    expect(() => roundInt(Infinity)).toThrow(RangeError)
  })
})

describe('mass conversions', () => {
  it('converts mg to integer micrograms', () => {
    expect(microgramsFromMg(5)).toBe(5000)
    expect(microgramsFromMg(2.5)).toBe(2500)
    expect(microgramsFromMg(0)).toBe(0)
  })

  it('converts micrograms back to mg', () => {
    expect(mgFromMicrograms(5000 as Microgram)).toBe(5)
    expect(mgFromMicrograms(2500 as Microgram)).toBe(2.5)
  })

  it('round-trips fractional mg through integer microgram storage', () => {
    const stored = microgramsFromMg(2.345)
    expect(stored).toBe(2345)
    expect(formatDecimal(mgFromMicrograms(stored), 'en', 3)).toBe('2.345')
  })

  it('honours the rounding direction on sub-microgram precision', () => {
    // 1.23412 mg -> 1234.12 µg
    expect(microgramsFromMg(1.23412, 'down')).toBe(1234)
    expect(microgramsFromMg(1.23412, 'up')).toBe(1235)
    expect(microgramsFromMg(1.23412, 'nearest')).toBe(1234)
  })

  it('microgramsFromMass passes mcg straight through and scales mg', () => {
    expect(microgramsFromMass(250, 'mcg')).toBe(250)
    expect(microgramsFromMass(0.25, 'mg')).toBe(250)
  })

  it('massFromMicrograms reflects the requested display unit', () => {
    expect(massFromMicrograms(2500 as Microgram, 'mcg')).toBe(2500)
    expect(massFromMicrograms(2500 as Microgram, 'mg')).toBe(2.5)
  })

  it('rejects negative or non-finite mass input', () => {
    expect(() => microgramsFromMg(-1)).toThrow(RangeError)
    expect(() => microgramsFromMass(-1, 'mcg')).toThrow(RangeError)
    expect(() => microgramsFromMg(NaN)).toThrow(RangeError)
  })
})

describe('volume conversions', () => {
  it('converts mL to integer microlitres and back', () => {
    expect(microlitersFromMl(2)).toBe(2000)
    expect(microlitersFromMl(0.1)).toBe(100)
    expect(mlFromMicroliters(2000 as Microliter)).toBe(2)
    expect(mlFromMicroliters(100 as Microliter)).toBe(0.1)
  })

  it('rejects negative volume', () => {
    expect(() => microlitersFromMl(-0.5)).toThrow(RangeError)
  })
})

describe('IU conversions', () => {
  it('converts IU to milli-IU and back', () => {
    expect(milliIUFromIU(12)).toBe(12000)
    expect(milliIUFromIU(2.5)).toBe(2500)
    expect(iuFromMilliIU(12000 as units.MilliIU)).toBe(12)
  })

  it('rejects negative IU', () => {
    expect(() => milliIUFromIU(-1)).toThrow(RangeError)
  })

  it('never exposes a function that converts IU to or from a mass unit', () => {
    // IU is compound-specific potency with no universal mass equivalence.
    // This guards against ever accidentally adding one.
    const exportNames = Object.keys(units)
    const crossesMassAndIU = exportNames.filter(
      (name) => /iu/i.test(name) && /(mcg|milligram|microgram|(?<![a-z])mg(?![a-z]))/i.test(name),
    )
    expect(crossesMassAndIU).toEqual([])
  })
})

describe('syringe conversions', () => {
  it('knows units-per-mL for each syringe type', () => {
    expect(syringeUnitsPerMl('U-100')).toBe(100)
    expect(syringeUnitsPerMl('U-50')).toBe(50)
    expect(syringeUnitsPerMl('U-40')).toBe(40)
  })

  it('knows µL-per-unit for each syringe type', () => {
    expect(microlitersPerSyringeUnit('U-100')).toBe(10)
    expect(microlitersPerSyringeUnit('U-50')).toBe(20)
    expect(microlitersPerSyringeUnit('U-40')).toBe(25)
  })

  it('converts a volume to an exact (unrounded) syringe-unit reading', () => {
    expect(syringeUnitsFromMicroliters(250 as Microliter, 'U-100')).toBe(25)
    expect(syringeUnitsFromMicroliters(250 as Microliter, 'U-50')).toBe(12.5)
    expect(syringeUnitsFromMicroliters(250 as Microliter, 'U-40')).toBe(10)
  })

  it('converts syringe units to microlitres', () => {
    expect(microlitersFromSyringeUnits(25, 'U-100')).toBe(250)
    expect(microlitersFromSyringeUnits(25, 'U-50')).toBe(500)
    expect(microlitersFromSyringeUnits(25, 'U-40')).toBe(625)
  })

  it('quantizes a raw volume down to the nearest markable graduation by default', () => {
    // 253 µL on a U-100 (10 µL/unit) sits between the 25 and 26 marks.
    expect(quantizeVolumeToSyringe(253, 'U-100')).toBe(250)
    expect(quantizeVolumeToSyringe(253, 'U-100', 'up')).toBe(260)
    expect(quantizeVolumeToSyringe(253, 'U-100', 'nearest')).toBe(250)
  })

  it('quantizes correctly for U-50 and U-40 graduations', () => {
    expect(quantizeVolumeToSyringe(253, 'U-50', 'down')).toBe(240)
    expect(quantizeVolumeToSyringe(253, 'U-50', 'up')).toBe(260)
    expect(quantizeVolumeToSyringe(253, 'U-40', 'down')).toBe(250)
    expect(quantizeVolumeToSyringe(253, 'U-40', 'up')).toBe(275)
  })

  it('rejects negative volumes and unit counts', () => {
    expect(() => quantizeVolumeToSyringe(-1, 'U-100')).toThrow(RangeError)
    expect(() => microlitersFromSyringeUnits(-1, 'U-100')).toThrow(RangeError)
  })
})

describe('parseDecimal — locale-blind, safety-first', () => {
  it('treats a comma as the decimal separator when it is the only one', () => {
    expect(parseDecimal('2,5')).toBe(2.5)
  })

  it('treats a period as the decimal separator when it is the only one', () => {
    expect(parseDecimal('2.5')).toBe(2.5)
  })

  it('uses the rightmost separator as the decimal point when both appear', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56) // European-style grouping
    expect(parseDecimal('1,234.56')).toBe(1234.56) // US-style grouping
  })

  it('parses plain integers', () => {
    expect(parseDecimal('10000')).toBe(10000)
  })

  it('trims surrounding whitespace', () => {
    expect(parseDecimal(' 12,50 ')).toBe(12.5)
  })

  it('parses a leading minus sign', () => {
    expect(parseDecimal('-5,5')).toBe(-5.5)
  })

  it('rejects empty, blank, and non-numeric input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })

  it('rejects malformed numbers with stray separators', () => {
    expect(parseDecimal('1.2.3')).toBeNull()
    expect(parseDecimal('12,,5')).toBeNull()
  })
})

describe('formatDecimal — locale-driven, app-controlled output', () => {
  it('formats with a comma for es-CR', () => {
    expect(formatDecimal(2.5, 'es-CR', 2)).toBe('2,5')
  })

  it('formats with a period for en', () => {
    expect(formatDecimal(2.5, 'en', 2)).toBe('2.5')
  })

  it('trims trailing zeros but not the whole number', () => {
    expect(formatDecimal(2, 'es-CR', 3)).toBe('2')
    expect(formatDecimal(100.1, 'en', 2)).toBe('100.1')
  })

  it('keeps zero decimal places whole with no trimming applied', () => {
    expect(formatDecimal(2500, 'es-CR', 0)).toBe('2500')
  })
})

describe('display helpers', () => {
  it('formatMass shows mg with up to 3 decimals and mcg as a whole number', () => {
    expect(formatMass(microgramsFromMg(5), 'mg', 'es-CR')).toBe('5')
    expect(formatMass(microgramsFromMg(2.5), 'mg', 'es-CR')).toBe('2,5')
    expect(formatMass(2500 as Microgram, 'mcg', 'en')).toBe('2500')
  })

  it('formatVolumeMl shows mL with locale decimals', () => {
    expect(formatVolumeMl(microlitersFromMl(1.5), 'es-CR')).toBe('1,5')
    expect(formatVolumeMl(microlitersFromMl(1.5), 'en')).toBe('1.5')
  })

  it('formatSyringeUnits shows one decimal place', () => {
    expect(formatSyringeUnits(25.3, 'en')).toBe('25.3')
    expect(formatSyringeUnits(25, 'es-CR')).toBe('25')
  })

  it('formatIU round-trips through milli-IU storage', () => {
    expect(formatIU(milliIUFromIU(12), 'en')).toBe('12')
    expect(formatIU(milliIUFromIU(2.5), 'es-CR')).toBe('2,5')
  })
})

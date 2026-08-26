import { describe, expect, it } from 'vitest'
import * as reconstitution from './reconstitution'
import {
  mixFromSolutionIU,
  mixFromSolutionMass,
  mixFromVialIU,
  mixFromVialMass,
} from './reconstitution'
import {
  microgramsFromMg,
  microlitersFromMl,
  milliIUFromIU,
  type Microgram,
  type MilliIU,
} from './units'

describe('mixFromVialMass', () => {
  it('computes an exact draw when the dose divides evenly onto a graduation', () => {
    // 10 mg in 2 mL -> 5000 mcg/mL. 250 mcg dose -> 50 µL -> 5 units on U-100.
    const result = mixFromVialMass({
      vialAmountMcg: microgramsFromMg(10),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMcg: microgramsFromMg(0.25),
      syringeType: 'U-100',
    })
    expect(result.concentrationPerMl).toBe(5000)
    expect(result.drawVolumeUl).toBe(50)
    expect(result.drawVolumeMl).toBe(0.05)
    expect(result.drawSyringeUnits).toBe(5)
    expect(result.dosesRemaining).toBe(40)
    expect(result.lowVolumeWarning).toBe(false)
  })

  it('rounds the draw down when it lands between two graduations', () => {
    // 5 mg in 2 mL -> 2500 mcg/mL. 333 mcg dose -> 133.2 µL -> floor to 130 µL (13 units).
    const result = mixFromVialMass({
      vialAmountMcg: microgramsFromMg(5),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMcg: 333 as Microgram,
      syringeType: 'U-100',
    })
    expect(result.drawVolumeUl).toBe(130)
    expect(result.drawSyringeUnits).toBe(13)
    expect(result.dosesRemaining).toBe(15)
    expect(result.lowVolumeWarning).toBe(false)
  })

  it('never rounds a draw UP past what was asked for', () => {
    const result = mixFromVialMass({
      vialAmountMcg: microgramsFromMg(5),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMcg: 333 as Microgram,
      syringeType: 'U-100',
    })
    const exactUl = (333 / 2500) * 1000
    expect(result.drawVolumeUl).toBeLessThanOrEqual(exactUl)
  })

  it('flags a low-volume draw that is hard to measure precisely', () => {
    // 5 mg in 1 mL -> 5000 mcg/mL. 20 mcg dose -> 4 µL -> 0.4 units -> floors to 0.
    const result = mixFromVialMass({
      vialAmountMcg: microgramsFromMg(5),
      diluentVolumeUl: microlitersFromMl(1),
      desiredDoseMcg: 20 as Microgram,
      syringeType: 'U-100',
    })
    expect(result.drawSyringeUnits).toBe(0)
    expect(result.drawVolumeUl).toBe(0)
    expect(result.dosesRemaining).toBe(0)
    expect(result.lowVolumeWarning).toBe(true)
  })

  it('respects the syringe type when quantizing the draw', () => {
    const base = {
      vialAmountMcg: microgramsFromMg(5),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMcg: 333 as Microgram,
    } as const
    // 133.2 µL: U-50 (20 µL/unit) -> floor(6.66)=6 units -> 120 µL.
    expect(mixFromVialMass({ ...base, syringeType: 'U-50' }).drawVolumeUl).toBe(120)
    expect(mixFromVialMass({ ...base, syringeType: 'U-50' }).drawSyringeUnits).toBe(6)
    // U-40 (25 µL/unit) -> floor(5.328)=5 units -> 125 µL.
    expect(mixFromVialMass({ ...base, syringeType: 'U-40' }).drawVolumeUl).toBe(125)
    expect(mixFromVialMass({ ...base, syringeType: 'U-40' }).drawSyringeUnits).toBe(5)
  })

  it('rejects a zero or negative vial amount, volume, or dose', () => {
    const base = {
      vialAmountMcg: microgramsFromMg(5),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMcg: microgramsFromMg(0.1),
      syringeType: 'U-100' as const,
    }
    expect(() => mixFromVialMass({ ...base, vialAmountMcg: 0 as Microgram })).toThrow(RangeError)
    expect(() =>
      mixFromVialMass({ ...base, diluentVolumeUl: microlitersFromMl(0) }),
    ).toThrow(RangeError)
    expect(() => mixFromVialMass({ ...base, desiredDoseMcg: 0 as Microgram })).toThrow(
      RangeError,
    )
  })
})

describe('mixFromSolutionMass — form: solution, no reconstitution', () => {
  it('uses the entered concentration directly', () => {
    // Fat Blaster-style: 3000 mcg/mL entered directly, 10 mL bottle, 150 mcg dose.
    const result = mixFromSolutionMass({
      concentrationMcgPerMl: 3000,
      totalVolumeUl: microlitersFromMl(10),
      desiredDoseMcg: 150 as Microgram,
      syringeType: 'U-100',
    })
    expect(result.concentrationPerMl).toBe(3000)
    expect(result.drawVolumeUl).toBe(50)
    expect(result.drawSyringeUnits).toBe(5)
    expect(result.dosesRemaining).toBe(200)
  })
})

describe('mixFromVialIU — stays in IU end to end', () => {
  it('computes a draw without ever touching a mass unit', () => {
    // 30 IU in 2 mL -> 15 IU/mL. 4 IU dose -> 266.67 µL -> floors to 260 µL (26 units on U-100).
    const result = mixFromVialIU({
      vialAmountMilliIU: milliIUFromIU(30),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMilliIU: milliIUFromIU(4),
      syringeType: 'U-100',
    })
    expect(result.concentrationPerMl).toBe(15000) // milli-IU/mL == 15 IU/mL
    expect(result.drawVolumeUl).toBe(260)
    expect(result.drawSyringeUnits).toBe(26)
    expect(result.dosesRemaining).toBe(7)
  })

  it('rejects a non-positive vial amount, volume, or dose', () => {
    const base = {
      vialAmountMilliIU: milliIUFromIU(30),
      diluentVolumeUl: microlitersFromMl(2),
      desiredDoseMilliIU: milliIUFromIU(4),
      syringeType: 'U-100' as const,
    }
    expect(() => mixFromVialIU({ ...base, desiredDoseMilliIU: 0 as MilliIU })).toThrow(
      RangeError,
    )
  })
})

describe('mixFromSolutionIU', () => {
  it('uses the entered IU/mL concentration directly', () => {
    // HCG-style: 10,000 IU in 10 mL -> 1000 IU/mL, 250 IU dose.
    const result = mixFromSolutionIU({
      concentrationMilliIUPerMl: 1_000_000, // 1000 IU/mL in milli-IU
      totalVolumeUl: microlitersFromMl(10),
      desiredDoseMilliIU: milliIUFromIU(250),
      syringeType: 'U-100',
    })
    expect(result.concentrationPerMl).toBe(1_000_000)
    // 250 IU / 1000 IU/mL = 0.25 mL = 250 µL = 25 units.
    expect(result.drawVolumeUl).toBe(250)
    expect(result.drawSyringeUnits).toBe(25)
  })
})

describe('mass/IU separation', () => {
  it('never exposes a function that mixes an IU parameter with a mass parameter', () => {
    const exportNames = Object.keys(reconstitution)
    const suspicious = exportNames.filter(
      (name) => /iu/i.test(name) && /(mcg|milligram|microgram)/i.test(name),
    )
    expect(suspicious).toEqual([])
  })
})

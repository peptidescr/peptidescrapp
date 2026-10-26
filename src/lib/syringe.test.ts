import { describe, expect, it } from 'vitest'
import { barrelCapacities, layoutSyringe } from './syringe'

describe('layoutSyringe', () => {
  it('picks the smallest barrel that holds the draw', () => {
    expect(layoutSyringe('U-100', 12).capacityUnits).toBe(30)
    expect(layoutSyringe('U-100', 30).capacityUnits).toBe(30)
    expect(layoutSyringe('U-100', 31).capacityUnits).toBe(50)
    expect(layoutSyringe('U-100', 80).capacityUnits).toBe(100)
    expect(layoutSyringe('U-40', 25).capacityUnits).toBe(40)
  })

  it('fills in proportion to the draw', () => {
    expect(layoutSyringe('U-100', 15).fillFraction).toBeCloseTo(0.5)
    expect(layoutSyringe('U-100', 0).fillFraction).toBe(0)
  })

  it('shows a too-large draw as a full largest barrel and flags it', () => {
    const layout = layoutSyringe('U-50', 70)
    expect(layout.capacityUnits).toBe(50)
    expect(layout.fillFraction).toBe(1)
    expect(layout.overflow).toBe(true)
    expect(layoutSyringe('U-50', 50).overflow).toBe(false)
  })

  it('marks every graduation and numbers the major ones', () => {
    const small = layoutSyringe('U-100', 10)
    expect(small.ticks).toHaveLength(31) // 0..30 in 1-unit steps
    expect(small.ticks.filter((t) => t.major).map((t) => t.units)).toEqual([
      0, 5, 10, 15, 20, 25, 30,
    ])
    const large = layoutSyringe('U-100', 90)
    expect(large.ticks).toHaveLength(51) // 0..100 in 2-unit steps
    expect(large.ticks.filter((t) => t.major)).toHaveLength(11)
  })

  it('numbers the 1 mL barrel at 0, 25, 50, 75 and 100, and the small ones at every major mark', () => {
    expect(layoutSyringe('U-100', 90).labels).toEqual([0, 25, 50, 75, 100])
    expect(layoutSyringe('U-100', 10).labels).toEqual([0, 5, 10, 15, 20, 25, 30])
    expect(layoutSyringe('U-50', 10).labels).toEqual([0, 5, 10, 15, 20, 25])
  })
})

describe('layoutSyringe with a chosen barrel', () => {
  it('draws the chosen barrel when the draw fits it, however small the draw', () => {
    expect(layoutSyringe('U-100', 10, 100).capacityUnits).toBe(100)
    expect(layoutSyringe('U-100', 10, 100).fillFraction).toBeCloseTo(0.1)
    expect(layoutSyringe('U-100', 10, 50).capacityUnits).toBe(50)
  })

  it('moves up to the next barrel rather than overflowing the chosen one', () => {
    expect(layoutSyringe('U-100', 35, 30).capacityUnits).toBe(50)
    expect(layoutSyringe('U-100', 70, 50).capacityUnits).toBe(100)
  })

  it('still flags a draw that fits no barrel', () => {
    expect(layoutSyringe('U-50', 70, 25).overflow).toBe(true)
  })
})

describe('barrelCapacities', () => {
  it('lists each type\'s barrels, smallest first', () => {
    expect(barrelCapacities('U-100')).toEqual([30, 50, 100])
    expect(barrelCapacities('U-50')).toEqual([25, 50])
    expect(barrelCapacities('U-40')).toEqual([20, 40])
  })
})

describe('layoutSyringe for a 3 mL syringe', () => {
  it('is one 3 mL barrel of thirty 0.1 mL marks, numbered every 1 mL', () => {
    expect(barrelCapacities('3mL')).toEqual([30])
    const layout = layoutSyringe('3mL', 4)
    expect(layout.capacityUnits).toBe(30)
    expect(layout.ticks).toHaveLength(31)
    expect(layout.labels).toEqual([0, 10, 20, 30])
    expect(layout.fillFraction).toBeCloseTo(4 / 30)
    expect(layout.overflow).toBe(false)
  })

  it('flags a draw bigger than 3 mL', () => {
    expect(layoutSyringe('3mL', 45).overflow).toBe(true)
  })
})
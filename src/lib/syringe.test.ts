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
    const layout = layoutSyringe('U-50', 170)
    expect(layout.capacityUnits).toBe(150)
    expect(layout.fillFraction).toBe(1)
    expect(layout.overflow).toBe(true)
    expect(layoutSyringe('U-50', 150).overflow).toBe(false)
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
    expect(layoutSyringe('U-50', 170, 25).overflow).toBe(true)
  })
})

describe('barrelCapacities', () => {
  it('lists each type\'s barrels, smallest first', () => {
    expect(barrelCapacities('U-100')).toEqual([30, 50, 100, 300])
    expect(barrelCapacities('U-50')).toEqual([25, 50, 150])
    expect(barrelCapacities('U-40')).toEqual([20, 40, 120])
  })
})

describe('layoutSyringe for a 3 mL barrel', () => {
  it('is 300 units of U-100, marked every 0.1 mL (10 units) and numbered every 1 mL', () => {
    const layout = layoutSyringe('U-100', 40, 300)
    expect(layout.capacityUnits).toBe(300)
    expect(layout.ticks).toHaveLength(31)
    expect(layout.labels).toEqual([0, 100, 200, 300])
    expect(layout.fillFraction).toBeCloseTo(40 / 300)
    expect(layout.overflow).toBe(false)
  })

  it('marks every 0.1 mL on U-50 and U-40 too', () => {
    expect(layoutSyringe('U-50', 0, 150).minorStep).toBe(5)
    expect(layoutSyringe('U-40', 0, 120).minorStep).toBe(4)
  })

  it('takes a draw too big for a 1 mL barrel, and flags one bigger than 3 mL', () => {
    expect(layoutSyringe('U-100', 160).capacityUnits).toBe(300)
    expect(layoutSyringe('U-100', 450).overflow).toBe(true)
  })
})

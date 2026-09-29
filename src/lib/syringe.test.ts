import { describe, expect, it } from 'vitest'
import { layoutSyringe } from './syringe'

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
})

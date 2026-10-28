import { describe, expect, it } from 'vitest'
import { segmentedProgress } from './segmented-progress-track'

describe('segmentedProgress', () => {
  // Bench 0 -> Lab 1,500 -> Institute 5,000: two equal halves on screen.
  const tiers = [0, 1500, 5000]

  it('is 0 at or below the first stop and 1 at or above the last', () => {
    expect(segmentedProgress(-10, tiers)).toBe(0)
    expect(segmentedProgress(0, tiers)).toBe(0)
    expect(segmentedProgress(5000, tiers)).toBe(1)
    expect(segmentedProgress(9000, tiers)).toBe(1)
  })

  it('puts the middle stop at exactly half, however far apart the numbers are', () => {
    expect(segmentedProgress(1500, tiers)).toBeCloseTo(0.5)
  })

  it('interpolates inside a gap: 940 of 1,500 is 31% of the whole track', () => {
    expect(segmentedProgress(940, tiers)).toBeCloseTo(0.3133, 3)
    expect(segmentedProgress(3250, tiers)).toBeCloseTo(0.75)
  })

  it('has nothing to measure without two stops', () => {
    expect(segmentedProgress(5, [])).toBe(0)
    expect(segmentedProgress(5, [10])).toBe(0)
  })
})

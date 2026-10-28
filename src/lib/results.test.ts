import { describe, expect, it } from 'vitest'
import {
  baselineWeights,
  cleanCheckIn,
  gramsFrom,
  isEmptyCheckIn,
  lengthIn,
  mmFrom,
  symptomList,
  weightIn,
  weightProgress,
  type WeightEntry,
} from './results'

const w = (id: string, day: number, kg: number): WeightEntry => ({
  id,
  measuredAt: new Date(2026, 2, day, 7).toISOString(),
  grams: kg * 1000,
  createdAt: 'x',
})

describe('units', () => {
  it('converts kg and lb to whole grams and back to one decimal', () => {
    expect(gramsFrom(98.5, 'kg')).toBe(98_500)
    expect(gramsFrom(200, 'lb')).toBe(90_718)
    expect(weightIn(90_718, 'lb')).toBe(200)
    expect(weightIn(98_500, 'kg')).toBe(98.5)
    expect(mmFrom(36.5, 'in')).toBe(927)
    expect(lengthIn(940, 'cm')).toBe(94)
  })
})

describe('weightProgress', () => {
  it('measures change from the earliest weight, and progress toward the goal', () => {
    const p = weightProgress([w('b', 10, 95), w('a', 1, 100), w('c', 20, 92)], 80_000)
    expect(p.start?.id).toBe('a')
    expect(p.latest?.id).toBe('c')
    expect(p.changeGrams).toBe(-8000)
    expect(p.changePct).toBe(-8)
    expect(p.toGoal).toBeCloseTo(0.4)
  })

  it('is empty without weights, and has no goal share without a goal', () => {
    expect(weightProgress([], undefined)).toMatchObject({ start: null, changeGrams: null, toGoal: null })
    expect(weightProgress([w('a', 1, 100)], undefined).toGoal).toBeNull()
  })
})

describe('baselineWeights', () => {
  it('keeps the weights logged before the first dose', () => {
    const weights = [w('a', 1, 100), w('b', 3, 99), w('c', 10, 97)]
    expect(baselineWeights(weights, new Date(2026, 2, 5).toISOString()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(baselineWeights(weights, undefined)).toHaveLength(3)
  })
})

describe('cleanCheckIn', () => {
  it('keeps only answered, in-range fields', () => {
    const c = cleanCheckIn(
      { date: '2026-03-02', energy: 3, mood: 7 as never, sideEffects: { nausea: 2, headache: 0 as never }, note: '  ', bodyFatPct: 24.44 },
      'now',
    )
    expect(c).toEqual({ date: '2026-03-02', energy: 3, sideEffects: { nausea: 2 }, bodyFatPct: 24.4, updatedAt: 'now' })
    expect(isEmptyCheckIn(cleanCheckIn({ date: '2026-03-02' }, 'now'))).toBe(true)
  })
})

describe('symptomList', () => {
  it('is the built-ins minus hidden ones, then the user’s own', () => {
    const list = symptomList({ hidden: ['nausea'], custom: [{ id: 'custom-1', name: 'Hiccups' }] })
    expect(list.some((s) => s.id === 'nausea')).toBe(false)
    expect(list.at(-1)).toEqual({ id: 'custom-1', name: 'Hiccups' })
    expect(symptomList(undefined).map((s) => s.id)).toContain('injection-site-reaction')
  })
})

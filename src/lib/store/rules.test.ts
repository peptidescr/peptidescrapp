import { describe, expect, it } from 'vitest'
import {
  canRedeem,
  creditToNextMilestone,
  hundredPointsUsd,
  nextReferralMilestone,
  pointsForSpend,
  pointsToCover,
  pointsValue,
  referralCreditEarned,
  TEST_RULES,
  tierAbove,
  tierForSpend,
  tierMilestone,
  tierRule,
  type StoreRules,
} from './rules'

const rules = TEST_RULES
const referral = TEST_RULES.referral!

describe('points', () => {
  it('earns at the rules\' rate, whole points only, times a tier multiplier', () => {
    expect(pointsForSpend(0.99, rules)).toBe(0)
    expect(pointsForSpend(272.85, rules)).toBe(272)
    expect(pointsForSpend(90, rules, 1.5)).toBe(135)
    expect(pointsForSpend(-10, rules)).toBe(0)
    expect(pointsForSpend(100, { ...rules, pointsPerDollar: 2 })).toBe(200)
  })

  it('is worth the rules\' point value', () => {
    expect(pointsValue(100, rules)).toBe(3)
    expect(pointsValue(333, rules)).toBe(9.99)
    expect(pointsValue(100, { ...rules, pointValueUsd: 0.05 })).toBe(5)
    expect(hundredPointsUsd(rules)).toBe(3)
  })

  it('can be spent from the rules\' minimum', () => {
    expect(canRedeem(249, rules)).toBe(false)
    expect(canRedeem(250, rules)).toBe(true)
    expect(canRedeem(100, { ...rules, minimumRedeem: 100 })).toBe(true)
    expect(canRedeem(0, { ...rules, minimumRedeem: 0 })).toBe(false)
  })

  it('works out the fewest points that cover an amount', () => {
    expect(pointsToCover(3, rules)).toBe(100)
    expect(pointsToCover(0.01, rules)).toBe(1)
    expect(pointsToCover(0, rules)).toBe(0)
  })
})

describe('tiers', () => {
  it('finds the highest tier a spend reaches, whatever tiers the store sends', () => {
    expect(tierForSpend(rules, 1499.99)).toBe('bench')
    expect(tierForSpend(rules, 1500)).toBe('lab')
    expect(tierForSpend(rules, 9000)).toBe('institute')
    const other: StoreRules = { ...rules, tiers: [{ ...rules.tiers[0]!, tier: 'base' }, { ...rules.tiers[2]!, tier: 'gold', spendUsd: 800 }] }
    expect(tierForSpend(other, 900)).toBe('gold')
  })

  it('looks tiers up by id, and the one above', () => {
    expect(tierRule(rules, 'lab')?.discountPercent).toBe(5)
    expect(tierRule(rules, 'unknown')).toBeUndefined()
    expect(tierAbove(rules, 'bench')?.tier).toBe('lab')
    expect(tierAbove(rules, 'institute')).toBeUndefined()
  })
})

describe('referrals', () => {
  it('adds per-referral credit and milestone bonuses ($20, +$25 at 5, +$75 at 10)', () => {
    expect(referralCreditEarned(1, referral)).toBe(20)
    expect(referralCreditEarned(5, referral)).toBe(125)
    expect(referralCreditEarned(10, referral)).toBe(300)
    expect(referralCreditEarned(25, referral)).toBe(600)
  })

  it('says what comes next, and what reaching it adds', () => {
    expect(nextReferralMilestone(3, referral)).toEqual({ milestone: { referrals: 5, bonusCreditUsd: 25 }, remaining: 2 })
    expect(nextReferralMilestone(25, referral)).toBeNull()
    expect(creditToNextMilestone(3, referral)).toBe(65)
    expect(creditToNextMilestone(25, referral)).toBe(0)
    expect(tierMilestone(referral)).toEqual({ referrals: 25, tier: 'lab', months: 12 })
  })
})

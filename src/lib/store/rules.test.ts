import { describe, expect, it } from 'vitest'
import {
  canRedeem,
  creditToNextMilestone,
  FIXED_REWARDS,
  labMilestone,
  nextReferralMilestone,
  pointsForSpend,
  pointsToCover,
  pointsValue,
  redeemableValue,
  referralCreditEarned,
  TIER_RULES,
  tierForSpend,
} from './rules'

describe('points (the marketing proposal)', () => {
  it('earns one point per $1, whole points only, 1.5× at Institute', () => {
    expect(pointsForSpend(0.99)).toBe(0)
    expect(pointsForSpend(272.85)).toBe(272)
    expect(pointsForSpend(90, 1.5)).toBe(135)
    expect(pointsForSpend(99.99, 1.5)).toBe(149)
    expect(pointsForSpend(-10)).toBe(0)
    expect(pointsForSpend(Number.NaN)).toBe(0)
  })

  it('is worth 3¢ a point: 100 points = $3', () => {
    expect(pointsValue(100)).toBe(3)
    expect(pointsValue(900)).toBe(27)
    expect(pointsValue(333)).toBe(9.99)
    expect(pointsValue(-1)).toBe(0)
  })

  it('can be spent from 250 points, and not below', () => {
    expect(canRedeem(249)).toBe(false)
    expect(canRedeem(250)).toBe(true)
    expect(redeemableValue(249)).toBe(0)
    expect(redeemableValue(250)).toBe(7.5)
  })

  it('works out the fewest points that cover an amount', () => {
    expect(pointsToCover(3)).toBe(100)
    expect(pointsToCover(7.5)).toBe(250)
    expect(pointsToCover(0.01)).toBe(1)
    expect(pointsToCover(0)).toBe(0)
  })

  it('has the placeholder fixed rewards', () => {
    expect(FIXED_REWARDS.map((r) => r.id)).toEqual(['free_delivery', 'reconstitution_solution'])
  })
})

describe('tiers', () => {
  it('reaches Lab at $1,500 and Institute at $5,000 of 12-month spend', () => {
    expect(tierForSpend(1499.99)).toBe('bench')
    expect(tierForSpend(1500)).toBe('lab')
    expect(tierForSpend(5000)).toBe('institute')
  })

  it('gives Lab 5% + free delivery, Institute 10% + free delivery + 1.5× points + early access', () => {
    expect(TIER_RULES.lab).toMatchObject({ discountPercent: 5, freeDelivery: true, pointsMultiplier: 1, referrals: 25 })
    expect(TIER_RULES.institute).toMatchObject({ discountPercent: 10, freeDelivery: true, pointsMultiplier: 1.5, earlyAccess: true })
  })

  it('grants Lab at 25 referrals for 12 months, with Lab\'s perks', () => {
    expect(labMilestone()).toEqual({ referrals: 25, tier: { tier: 'lab', months: 12, discountPercent: 5, freeDelivery: true } })
  })
})

describe('referrals', () => {
  it('matches the referral model\'s payouts: $20 each, +$25 at 5, +$75 at 10', () => {
    // The spreadsheet's "Payouts by milestone" table.
    expect(referralCreditEarned(1)).toBe(20)
    expect(referralCreditEarned(5)).toBe(125)
    expect(referralCreditEarned(10)).toBe(300)
    expect(referralCreditEarned(25)).toBe(600)
  })

  it('says what comes next and how far away it is', () => {
    expect(nextReferralMilestone(3)).toEqual({ milestone: { referrals: 5, bonusCredit: 25 }, remaining: 2 })
    expect(nextReferralMilestone(10)?.milestone.referrals).toBe(25)
    expect(nextReferralMilestone(25)).toBeNull()
  })

  it('works out the credit reaching the next milestone adds', () => {
    // 2 more friends at $20, plus the 5-referral bonus of $25.
    expect(creditToNextMilestone(3)).toBe(65)
    // 15 more friends at $20 to reach Lab, which adds no credit of its own.
    expect(creditToNextMilestone(10)).toBe(300)
    expect(creditToNextMilestone(25)).toBe(0)
  })
})

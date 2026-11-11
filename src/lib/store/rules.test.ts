import { describe, expect, it } from 'vitest'
import { creditToNextMilestone, labMilestone, nextReferralMilestone, pointsForSpend, pointsValue, referralCreditEarned } from './rules'

describe('points', () => {
  it('earns one point per $50, whole points only', () => {
    expect(pointsForSpend(49.99)).toBe(0)
    expect(pointsForSpend(50)).toBe(1)
    expect(pointsForSpend(272.85)).toBe(5)
    expect(pointsForSpend(-10)).toBe(0)
    expect(pointsForSpend(Number.NaN)).toBe(0)
  })

  it('is worth a dollar a point', () => {
    expect(pointsValue(18)).toBe(18)
    expect(pointsValue(2.7)).toBe(2)
    expect(pointsValue(-1)).toBe(0)
  })
})

describe('tiers', () => {
  it('grants Lab at 25 referrals: 10% off and free delivery for 12 months', () => {
    expect(labMilestone()).toEqual({ referrals: 25, tier: { tier: 'lab', months: 12, discountPercent: 10, freeDelivery: true } })
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

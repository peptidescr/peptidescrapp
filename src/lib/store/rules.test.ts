import { describe, expect, it } from 'vitest'
import { nextReferralMilestone, pointsForSpend, pointsValue, referralCreditEarned, tierForSpend } from './rules'

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
  it('follows a year of spend', () => {
    expect(tierForSpend(0)).toBe('bench')
    expect(tierForSpend(2499)).toBe('bench')
    expect(tierForSpend(2500)).toBe('lab')
    expect(tierForSpend(7500)).toBe('institute')
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
})

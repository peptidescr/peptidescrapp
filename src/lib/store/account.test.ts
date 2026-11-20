import { describe, expect, it } from 'vitest'
import { SAMPLE_STATE, testAccount, testTier, withOrderPoints, withReferrals, withSpent, type TestState } from './account'
import { referralCreditEarned, TEST_RULES } from './rules'

const now = new Date('2026-11-18T12:00:00Z')
const start = (completed: number, creditUsd = 0): TestState => ({ ...SAMPLE_STATE, creditUsd, completed, activity: [] })

describe('the test account', () => {
  it('shows the sample under the placeholder rules: 900 points worth $27, Bench, $600 or 22 referrals to Lab', () => {
    const a = testAccount(SAMPLE_STATE, now)
    expect(a).toMatchObject({ source: 'test', enabled: true, points: 900, pointsValueUsd: 27, creditUsd: 60 })
    expect(a.tier).toEqual({ current: 'bench', earnedBy: 'spend', spend12moUsd: 900, next: { tier: 'lab', spendToGoUsd: 600, referralsToGo: 22 } })
    expect(a.rules).toBe(TEST_RULES)
    expect(a.referral.link).toMatch(/\/\?ref=MORGAN20$/)
  })

  it('reaches tiers by spend, or Lab by referrals while it runs', () => {
    expect(testTier({ ...SAMPLE_STATE, spend12moUsd: 1500 }, now).current).toBe('lab')
    expect(testTier({ ...SAMPLE_STATE, spend12moUsd: 5000 }, now)).toMatchObject({ current: 'institute' })
    expect(testTier({ ...SAMPLE_STATE, spend12moUsd: 5000 }, now).next).toBeUndefined()
    expect(testTier({ ...SAMPLE_STATE, labUntil: '2027-06-01' }, now)).toMatchObject({ current: 'lab', earnedBy: 'referrals', until: '2027-06-01' })
    expect(testTier({ ...SAMPLE_STATE, labUntil: '2026-10-01' }, now).current).toBe('bench')
  })
})

describe('withOrderPoints', () => {
  it('adds a point per $1 paid and counts the spend towards the tier', () => {
    const next = withOrderPoints({ ...SAMPLE_STATE, points: 18, spend12moUsd: 900 }, 149.99, now)
    expect(next.points).toBe(167)
    expect(next.spend12moUsd).toBe(1049.99)
  })

  it('earns the tier\'s multiplier (Institute 1.5×, the tier before this order)', () => {
    expect(withOrderPoints({ ...SAMPLE_STATE, points: 0, spend12moUsd: 5000 }, 100, now).points).toBe(150)
  })

  it('ignores a non-positive amount', () => {
    expect(withOrderPoints(SAMPLE_STATE, 0, now)).toBe(SAMPLE_STATE)
  })
})

describe('withSpent', () => {
  it('takes the credit and points spent, and the fixed rewards\' points', () => {
    expect(withSpent({ ...SAMPLE_STATE, creditUsd: 60, points: 900 }, { creditUsd: 60, pointsUsd: 3, rewardPoints: 300 })).toMatchObject({ creditUsd: 0, points: 500 })
  })

  it('leaves points below the minimum alone', () => {
    expect(withSpent({ ...SAMPLE_STATE, creditUsd: 10, points: 200 }, { creditUsd: 10, pointsUsd: 5, rewardPoints: 0 })).toMatchObject({ creditUsd: 0, points: 200 })
  })
})

describe('withReferrals', () => {
  it('adds $20 per friend and logs each one', () => {
    const next = withReferrals(start(0), 2, now)
    expect(next.completed).toBe(2)
    expect(next.creditUsd).toBe(40)
    expect(next.activity[0]).toMatchObject({ name: 'Test friend 2', at: '2026-11-18', status: 'earned', amountUsd: 20 })
  })

  it('adds the milestone bonuses at 5 and 10, matching the rules total', () => {
    expect(withReferrals(start(4), 1, now).activity[0]!.amountUsd).toBe(45)
    expect(withReferrals(start(0), 10, now).creditUsd).toBe(referralCreditEarned(10, TEST_RULES.referral!))
  })

  it('grants Lab for 12 months at 25, and not before', () => {
    expect(withReferrals(start(23), 1, now).labUntil).toBeUndefined()
    expect(withReferrals(start(24), 1, now).labUntil).toBe('2027-11-18')
  })

  it('ignores a non-positive count', () => {
    const a = start(3, 60)
    expect(withReferrals(a, 0, now)).toBe(a)
  })
})

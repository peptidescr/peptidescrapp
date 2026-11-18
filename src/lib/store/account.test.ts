import { describe, expect, it } from 'vitest'
import { SAMPLE_ACCOUNT, withOrderPoints, withReferrals, type StoreAccount } from './account'
import { referralCreditEarned } from './rules'

const start = (completed: number, creditUsd = 0): StoreAccount => ({
  ...SAMPLE_ACCOUNT,
  creditUsd,
  referral: { ...SAMPLE_ACCOUNT.referral, completed, activity: [] },
})

describe('withOrderPoints', () => {
  it('adds whole points per $50 paid', () => {
    expect(withOrderPoints({ ...SAMPLE_ACCOUNT, points: 18 }, 149.99).points).toBe(20)
    expect(withOrderPoints({ ...SAMPLE_ACCOUNT, points: 18 }, 49).points).toBe(18)
  })
})

describe('withReferrals', () => {
  const today = new Date('2026-11-18T12:00:00Z')

  it('adds $20 per friend and logs each one', () => {
    const next = withReferrals(start(0), 2, today)
    expect(next.referral.completed).toBe(2)
    expect(next.creditUsd).toBe(40)
    expect(next.referral.activity.map((a) => a.amountUsd)).toEqual([20, 20])
    expect(next.referral.activity[0]).toMatchObject({ name: 'Test friend 2', at: '2026-11-18', status: 'earned' })
  })

  it('adds the milestone bonuses at 5 and 10, matching the rules total', () => {
    const at5 = withReferrals(start(4), 1, today)
    expect(at5.referral.activity[0]!.amountUsd).toBe(45)
    const at10 = withReferrals(start(0), 10, today)
    expect(at10.creditUsd).toBe(referralCreditEarned(10))
    expect(at10.creditUsd).toBe(300)
  })

  it('grants Lab for 12 months at 25, and not before', () => {
    expect(withReferrals(start(23), 1, today).labUntil).toBeUndefined()
    expect(withReferrals(start(24), 1, today).labUntil).toBe('2027-11-18')
  })

  it('ignores a non-positive count', () => {
    const a = start(3, 60)
    expect(withReferrals(a, 0, today)).toBe(a)
    expect(withReferrals(a, -2, today)).toBe(a)
  })
})

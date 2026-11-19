import { describe, expect, it } from 'vitest'
import { SAMPLE_ACCOUNT, withBalanceSpent, withOrderPoints, withReferrals, type StoreAccount } from './account'
import { referralCreditEarned } from './rules'

const start = (completed: number, creditUsd = 0): StoreAccount => ({
  ...SAMPLE_ACCOUNT,
  creditUsd,
  referral: { ...SAMPLE_ACCOUNT.referral, completed, activity: [] },
})

describe('withOrderPoints', () => {
  const now = new Date('2026-11-18T12:00:00Z')

  it('adds a point per $1 paid and counts the spend towards the tier', () => {
    const next = withOrderPoints({ ...SAMPLE_ACCOUNT, points: 18, spend12moUsd: 900 }, 149.99, now)
    expect(next.points).toBe(167)
    expect(next.spend12moUsd).toBe(1049.99)
  })

  it('earns 1.5× at Institute (the tier before this order)', () => {
    expect(withOrderPoints({ ...SAMPLE_ACCOUNT, points: 0, spend12moUsd: 5000 }, 100, now).points).toBe(150)
  })

  it('ignores a non-positive amount', () => {
    expect(withOrderPoints(SAMPLE_ACCOUNT, 0, now)).toBe(SAMPLE_ACCOUNT)
  })
})

describe('withBalanceSpent', () => {
  it('takes credit first, then points at 3¢ each', () => {
    const next = withBalanceSpent({ ...SAMPLE_ACCOUNT, creditUsd: 60, points: 900 }, 63)
    expect(next.creditUsd).toBe(0)
    expect(next.points).toBe(800)
  })

  it('leaves points below 250 alone', () => {
    expect(withBalanceSpent({ ...SAMPLE_ACCOUNT, creditUsd: 10, points: 200 }, 15)).toMatchObject({ creditUsd: 0, points: 200 })
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

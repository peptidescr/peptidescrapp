import { describe, expect, it } from 'vitest'
import { balanceUsd, SAMPLE_ACCOUNT, type StoreAccount } from './account'
import {
  creditEarnedUsd,
  creditUnlockedByNext,
  labProgress,
  ladderRows,
  nextMilestone,
  pointsEarnedFor,
  pointsWorthUsd,
  referralsToLab,
  rungs,
  tierOf,
} from './loyaltyView'

const account = SAMPLE_ACCOUNT
const withReferrals = (completed: number): StoreAccount => ({ ...account, referral: { ...account.referral, completed } })

describe('points', () => {
  it('earns a point per $50 and is worth $1 each', () => {
    expect(pointsEarnedFor(272.85)).toBe(5)
    expect(pointsEarnedFor(49.99)).toBe(0)
    expect(pointsWorthUsd(account)).toBe(18)
  })

  it('adds points and credit into one balance', () => {
    expect(balanceUsd(account)).toBe(18 + 60)
    expect(balanceUsd({ ...account, points: 0, creditUsd: 12.5 })).toBe(12.5)
  })
})

describe('tiers', () => {
  it('is Bench until Lab is earned, and Lab only while its 12 months run', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    expect(tierOf(account, now)).toBe('bench')
    expect(tierOf({ ...account, labUntil: '2027-06-01' }, now)).toBe('lab')
    expect(tierOf({ ...account, labUntil: '2026-10-01' }, now)).toBe('bench')
  })

  it('measures the way to Lab in referrals, 25 of them', () => {
    expect(labProgress(account)).toBeCloseTo(3 / 25)
    expect(referralsToLab(account)).toBe(22)
    expect(labProgress(withReferrals(40))).toBe(1)
    expect(referralsToLab(withReferrals(40))).toBe(0)
  })
})

describe('the referral ladder', () => {
  it('has the model\'s rungs: $20 for the first, +$25 at 5, +$75 at 10, Lab at 25', () => {
    expect(rungs()).toEqual([
      { referrals: 1, creditUsd: 20 },
      { referrals: 5, bonusUsd: 25, tier: undefined },
      { referrals: 10, bonusUsd: 75, tier: undefined },
      { referrals: 25, bonusUsd: undefined, tier: { months: 12, discountPercent: 10, freeDelivery: true } },
    ])
  })

  it('marks what is earned, the next rung, and what is locked', () => {
    expect(ladderRows(account).map((r) => r.state)).toEqual(['earned', 'next', 'locked', 'locked'])
    expect(ladderRows(account).map((r) => r.toGo)).toEqual([0, 2, 7, 22])
    expect(ladderRows(account).map((r) => r.lineFill)).toEqual([0.45, 0, 0, 0])
    expect(ladderRows(withReferrals(25)).every((r) => r.state === 'earned')).toBe(true)
  })

  it('adds up credit earned as the model\'s payouts table does', () => {
    expect(creditEarnedUsd(account)).toBe(60)
    expect(creditEarnedUsd(withReferrals(5))).toBe(125)
    expect(creditEarnedUsd(withReferrals(10))).toBe(300)
    expect(creditEarnedUsd(withReferrals(25))).toBe(600)
  })

  it('says what the next milestone is and what reaching it adds', () => {
    expect(nextMilestone(account)).toEqual({ referrals: 5, remaining: 2, bonusUsd: 25, grantsLab: false })
    expect(creditUnlockedByNext(account)).toBe(65)
    expect(nextMilestone(withReferrals(12))).toEqual({ referrals: 25, remaining: 13, bonusUsd: undefined, grantsLab: true })
    expect(nextMilestone(withReferrals(25))).toBeNull()
  })
})

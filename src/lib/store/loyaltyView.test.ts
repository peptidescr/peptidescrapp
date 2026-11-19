import { describe, expect, it } from 'vitest'
import { balanceUsd, SAMPLE_ACCOUNT, type StoreAccount } from './account'
import {
  creditEarnedUsd,
  creditUnlockedByNext,
  fixedRewards,
  ladderRows,
  nextMilestone,
  nextTier,
  nextTierProgress,
  perksLine,
  pointsEarnedFor,
  pointsToRedeem,
  pointsWorthUsd,
  rungs,
  tierOf,
} from './loyaltyView'

const account = SAMPLE_ACCOUNT
const now = new Date('2026-11-18T12:00:00Z')
const withReferrals = (completed: number): StoreAccount => ({ ...account, referral: { ...account.referral, completed } })
const spending = (spend12moUsd: number): StoreAccount => ({ ...account, spend12moUsd })

describe('points', () => {
  it('earns a point per $1, 1.5× at Institute', () => {
    expect(pointsEarnedFor(272.85)).toBe(272)
    expect(pointsEarnedFor(100, account, now)).toBe(100)
    expect(pointsEarnedFor(100, spending(5000), now)).toBe(150)
  })

  it('is worth 3¢ each, spendable from 250', () => {
    expect(pointsWorthUsd(account)).toBe(27)
    expect(pointsToRedeem(account)).toBe(0)
    expect(pointsToRedeem({ ...account, points: 200 })).toBe(50)
  })

  it('adds credit and spendable points into one balance', () => {
    expect(balanceUsd(account)).toBe(27 + 60)
    // Below 250 points, only the credit can be spent.
    expect(balanceUsd({ ...account, points: 249, creditUsd: 12.5 })).toBe(12.5)
  })

  it('says how far each fixed reward is', () => {
    expect(fixedRewards({ ...account, points: 350 }).map((r) => r.pointsShort)).toEqual([0, 50])
  })
})

describe('tiers', () => {
  it('follows the 12-month spend: Bench, Lab at $1,500, Institute at $5,000', () => {
    expect(tierOf(account, now)).toBe('bench')
    expect(tierOf(spending(1500), now)).toBe('lab')
    expect(tierOf(spending(5000), now)).toBe('institute')
  })

  it('gives Lab while a referral Lab runs, and never lowers a spend tier', () => {
    expect(tierOf({ ...account, labUntil: '2027-06-01' }, now)).toBe('lab')
    expect(tierOf({ ...account, labUntil: '2026-10-01' }, now)).toBe('bench')
    expect(tierOf({ ...spending(6000), labUntil: '2027-06-01' }, now)).toBe('institute')
  })

  it('says what the next tier takes: spend or referrals for Lab, spend for Institute', () => {
    expect(nextTier(account, now)).toEqual({ tier: 'lab', spendToGo: 600, referralsToGo: 22 })
    expect(nextTier(spending(2000), now)).toEqual({ tier: 'institute', spendToGo: 3000 })
    expect(nextTier(spending(5000), now)).toBeNull()
  })

  it('fills the ring by whichever is further along', () => {
    expect(nextTierProgress(account, now)).toBeCloseTo(900 / 1500)
    expect(nextTierProgress({ ...spending(0), referral: { ...account.referral, completed: 20 } }, now)).toBeCloseTo(20 / 25)
    // From Lab, the way to Institute starts at Lab's $1,500.
    expect(nextTierProgress(spending(3250), now)).toBeCloseTo(0.5)
    expect(nextTierProgress(spending(9000), now)).toBe(1)
  })

  it('writes a tier\'s perks on one line', () => {
    const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`
    expect(perksLine('bench', t)).toBe('loyalty.perk.points')
    expect(perksLine('institute', t)).toBe('loyalty.perk.discount{"percent":10} + loyalty.perk.freeDelivery + loyalty.perk.multiplier{"times":1.5}')
  })
})

describe('the referral ladder', () => {
  it('has the model\'s rungs: $20 for the first, +$25 at 5, +$75 at 10, Lab at 25', () => {
    expect(rungs()).toEqual([
      { referrals: 1, creditUsd: 20 },
      { referrals: 5, bonusUsd: 25, tier: undefined },
      { referrals: 10, bonusUsd: 75, tier: undefined },
      { referrals: 25, bonusUsd: undefined, tier: { months: 12, discountPercent: 5, freeDelivery: true } },
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

import { describe, expect, it } from 'vitest'
import { SAMPLE_STATE, testAccount, type StoreAccount } from './account'
import {
  canSpendPoints,
  creditEarnedUsd,
  creditUnlockedByNext,
  fixedRewards,
  ladderRows,
  nextMilestone,
  nextTierProgress,
  perksLine,
  pointsEarnedFor,
  pointsToRedeem,
  rungs,
  spendableUsd,
  tierFromReferrals,
  tierName,
  trackSpend,
} from './loyaltyView'
import { TEST_RULES, tierRule } from './rules'

const now = new Date('2026-11-18T12:00:00Z')
const account = testAccount(SAMPLE_STATE, now)
const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`

/** A store account as UPD would send it, with its own (different) numbers. */
const store: StoreAccount = {
  ...account,
  source: 'store',
  points: 400,
  pointsValueUsd: 20,
  creditUsd: 10,
  tier: { current: 'silver', spend12moUsd: 500, next: { tier: 'gold', spendToGoUsd: 500 } },
  rules: {
    pointsPerDollar: 2,
    pointValueUsd: 0.05,
    minimumRedeem: 500,
    tierWindowMonths: 6,
    tiers: [
      { tier: 'silver', name: 'Silver', spendUsd: 0, discountPercent: 0, freeDelivery: false, pointsMultiplier: 1, earlyAccess: false },
      { tier: 'gold', name: 'Gold', spendUsd: 1000, discountPercent: 7, freeDelivery: true, pointsMultiplier: 2, earlyAccess: false },
    ],
  },
}

describe('points, from the account\'s own rules', () => {
  it('earns at the store\'s rate and tier multiplier', () => {
    expect(pointsEarnedFor(100, account)).toBe(100)
    expect(pointsEarnedFor(100, store)).toBe(200)
    expect(pointsEarnedFor(100, { ...store, tier: { current: 'gold' } })).toBe(400)
  })

  it('spends from the store\'s minimum', () => {
    expect(canSpendPoints(account)).toBe(true)
    expect(canSpendPoints(store)).toBe(false)
    expect(pointsToRedeem(store)).toBe(100)
    expect(spendableUsd(account)).toBe(27 + 60)
    expect(spendableUsd(store)).toBe(10)
  })

  it('says how far each fixed reward is', () => {
    expect(fixedRewards({ ...account, points: 350 }).map((r) => r.pointsShort)).toEqual([0, 50])
  })
})

describe('tiers', () => {
  it('fills the ring by spend, or referrals when they count, whichever is further', () => {
    expect(nextTierProgress(account)).toBeCloseTo(900 / 1500)
    expect(nextTierProgress({ ...account, tier: { ...account.tier, spend12moUsd: 0, next: { tier: 'lab', spendToGoUsd: 1500, referralsToGo: 5 } } })).toBeCloseTo(20 / 25)
    expect(nextTierProgress(store)).toBeCloseTo(0.5)
    expect(nextTierProgress({ ...store, tier: { current: 'gold' } })).toBe(1)
  })

  it('works without the 12-month spend, from what is left', () => {
    expect(nextTierProgress({ ...store, tier: { current: 'silver', next: { tier: 'gold', spendToGoUsd: 250 } } })).toBeCloseTo(0.75)
  })

  it('places a referral tier on the track at its threshold', () => {
    const referred = { ...account, tier: { current: 'lab', earnedBy: 'referrals', until: '2027-06-01', spend12moUsd: 200 } }
    expect(tierFromReferrals(referred)).toBe(true)
    expect(trackSpend(referred)).toBe(1500)
    expect(trackSpend(account)).toBe(900)
  })

  it('names tiers: ours when we have one, else the store\'s, else the id', () => {
    const real = (key: string, o?: Record<string, unknown>) => (key === 'loyalty.tierName.lab' ? 'Lab' : String(o?.defaultValue))
    expect(tierName('lab', TEST_RULES, real)).toBe('Lab')
    expect(tierName('gold', store.rules, real)).toBe('Gold')
    expect(tierName('platinum', store.rules, real)).toBe('Platinum')
  })

  it('writes a tier\'s perks on one line', () => {
    expect(perksLine(tierRule(TEST_RULES, 'bench'), t)).toBe('loyalty.perk.none')
    expect(perksLine(tierRule(TEST_RULES, 'institute'), t)).toBe('loyalty.perk.discount{"percent":10} + loyalty.perk.freeDelivery + loyalty.perk.multiplier{"times":1.5}')
  })
})

describe('the referral ladder', () => {
  const withReferrals = (completed: number): StoreAccount => ({ ...account, referral: { ...account.referral, completed } })

  it('has a rung for the first referral and one per milestone', () => {
    expect(rungs(TEST_RULES)).toEqual([
      { referrals: 1, creditUsd: 20 },
      { referrals: 5, bonusUsd: 25 },
      { referrals: 10, bonusUsd: 75 },
      { referrals: 25, tier: { tier: 'lab', months: 12, discountPercent: 5, freeDelivery: true } },
    ])
    expect(rungs(store.rules)).toEqual([])
  })

  it('marks what is earned, the next rung, and what is locked', () => {
    expect(ladderRows(account).map((r) => r.state)).toEqual(['earned', 'next', 'locked', 'locked'])
    expect(ladderRows(account).map((r) => r.toGo)).toEqual([0, 2, 7, 22])
    expect(ladderRows(withReferrals(25)).every((r) => r.state === 'earned')).toBe(true)
  })

  it('adds up credit and says what the next milestone adds', () => {
    expect(creditEarnedUsd(account)).toBe(60)
    expect(creditEarnedUsd(store)).toBe(0)
    expect(nextMilestone(account)).toEqual({ referrals: 5, remaining: 2, bonusUsd: 25, grantsTier: undefined })
    expect(creditUnlockedByNext(account)).toBe(65)
    expect(nextMilestone(withReferrals(12))).toMatchObject({ referrals: 25, remaining: 13, grantsTier: 'lab' })
    expect(nextMilestone(store)).toBeNull()
  })
})

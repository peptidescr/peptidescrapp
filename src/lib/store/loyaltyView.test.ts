import { describe, expect, it } from 'vitest'
import { SAMPLE_ACCOUNT, type StoreAccount } from './account'
import {
  creditEarnedUsd,
  creditUnlockedByNext,
  ladderRows,
  nextStep,
  pointsEarnedFor,
  pointsShort,
  ringProgress,
  rewardState,
  trackProgress,
} from './loyaltyView'

const account = SAMPLE_ACCOUNT
const withPoints = (points: number): StoreAccount => ({ ...account, points })
const withReferrals = (completed: number): StoreAccount => ({ ...account, referral: { ...account.referral, completed } })

describe('tier progress', () => {
  it('draws Bench -> Lab -> Institute as two equal halves', () => {
    expect(trackProgress(withPoints(0))).toBe(0)
    expect(trackProgress(withPoints(750))).toBeCloseTo(0.25)
    expect(trackProgress(withPoints(1500))).toBeCloseTo(0.5)
    expect(trackProgress(withPoints(5000))).toBe(1)
    expect(trackProgress(withPoints(9000))).toBe(1)
  })

  it('fills the ring towards the next tier, and fully at the top', () => {
    expect(ringProgress(withPoints(940))).toBeCloseTo(940 / 1500)
    expect(ringProgress({ ...account, tier: 'institute', points: 6000 })).toBe(1)
    expect(ringProgress(withPoints(-5))).toBe(0)
  })
})

describe('rewards', () => {
  it('is redeemable when the balance covers it, locked when not, and redeemed once taken', () => {
    const [ship, bac, d10, d25] = account.rewards
    expect([ship, bac, d10, d25].map((r) => rewardState(account, r!))).toEqual(['available', 'available', 'available', 'locked'])
    expect(rewardState(account, { ...ship!, redeemed: true })).toBe('redeemed')
  })

  it('says how many points a locked reward still needs', () => {
    expect(pointsShort(account, account.rewards[3]!)).toBe(160)
    expect(pointsShort(account, account.rewards[0]!)).toBe(0)
  })
})

describe('the referral ladder', () => {
  it('marks what is earned, the next rung, and what is locked', () => {
    expect(ladderRows(account).map((r) => r.state)).toEqual(['earned', 'earned', 'next', 'locked', 'locked'])
    expect(ladderRows(account).map((r) => r.toGo)).toEqual([0, 0, 2, 7, 22])
  })

  it('fills the connector fully between two earned rungs, part-way after the last earned one, and not at all beyond', () => {
    expect(ladderRows(account).map((r) => r.lineFill)).toEqual([1, 0.45, 0, 0, 0])
  })

  it('has no next rung once every one is reached', () => {
    expect(nextStep(withReferrals(25))).toBeNull()
    expect(ladderRows(withReferrals(25)).every((r) => r.state === 'earned')).toBe(true)
    expect(creditUnlockedByNext(withReferrals(25))).toBe(0)
  })

  it('works out the credit that reaching the next rung unlocks', () => {
    // Two more friends at $15 each, plus the 5-friend bonus of $50.
    expect(creditUnlockedByNext(account)).toBe(80)
  })

  it('adds up the credit earned: the latest stated credit, plus bonuses reached', () => {
    expect(creditEarnedUsd(account)).toBe(45)
    expect(creditEarnedUsd(withReferrals(5))).toBe(45 + 50)
    expect(creditEarnedUsd(withReferrals(10))).toBe(45 + 50 + 100)
    // Between rungs it falls back to the per-friend credit.
    expect(creditEarnedUsd(withReferrals(0))).toBe(0)
  })
})

describe('points an order earns', () => {
  it('rounds to whole points and ignores nothing-orders', () => {
    expect(pointsEarnedFor(account, 272.85)).toBe(273)
    expect(pointsEarnedFor({ ...account, pointsPerDollar: 1.5 }, 100)).toBe(150)
    expect(pointsEarnedFor(account, 0)).toBe(0)
    expect(pointsEarnedFor(account, Number.NaN)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { SAMPLE_REWARDS } from './rewardsSample'
import { readRewards, readRules } from './storeRewards'

describe('readRewards (UPD\'s answer, as its developer described it)', () => {
  it('reads the described answer into the account the screens draw', () => {
    const a = readRewards(SAMPLE_REWARDS, { email: 'jane@example.com', name: 'Jane' })
    expect(a).toMatchObject({
      source: 'store',
      enabled: true,
      displayName: 'Jane',
      points: 1200,
      pointsValueUsd: 36,
      creditUsd: 25,
      tier: { current: 'bench', earnedBy: 'spend', spend12moUsd: 1100, next: { tier: 'lab', spendToGoUsd: 400, referralsToGo: 23 } },
      referral: { code: 'JANE20', link: 'https://www.usapeptidedepot.com/?ref=JANE20', completed: 2 },
    })
    expect(a?.referral.activity).toEqual([
      { name: 'R.L.', at: '2026-11-02', status: 'earned', amountUsd: 20 },
      { name: 'J.C.', at: '2026-10-21', status: 'earned', amountUsd: 20 },
      { name: 'P.M.', at: '2026-11-15', status: 'pending' },
    ])
    expect(a?.rewards).toEqual([
      { id: 'free_delivery', name: 'Free delivery', points: 300 },
      { id: 'reconstitution_solution', name: 'Reconstitution Solution vial', points: 400 },
    ])
    expect(a?.history[2]).toEqual({ at: '2026-10-30', label: 'Order USP-XYZ789', points: -300 })
  })

  it('takes every number from the rules sent', () => {
    const rules = readRules(SAMPLE_REWARDS.rules)
    expect(rules).toMatchObject({ pointsPerDollar: 1, pointValueUsd: 0.03, minimumRedeem: 250, tierWindowMonths: 12 })
    expect(rules?.tiers.map((t) => [t.tier, t.spendUsd, t.discountPercent, t.pointsMultiplier])).toEqual([
      ['bench', 0, 0, 1],
      ['lab', 1500, 5, 1],
      ['institute', 5000, 10, 1.5],
    ])
    expect(rules?.referral).toEqual({
      creditPerReferralUsd: 20,
      minimumFirstOrderUsd: 100,
      milestones: [{ referrals: 5, bonusCreditUsd: 25 }, { referrals: 10, bonusCreditUsd: 75 }, { referrals: 25, tier: 'lab', months: 12 }],
    })
  })

  it('reads tiers sent as an object keyed by id, and a plain number of points', () => {
    const rules = { ...SAMPLE_REWARDS.rules, tiers: { bench: { spendUsd: 0 }, gold: { spendUsd: 900, discountPercent: 8 } } }
    const a = readRewards({ ...SAMPLE_REWARDS, points: 300, rules })
    expect(a?.rules.tiers.map((t) => t.tier)).toEqual(['bench', 'gold'])
    expect(a?.points).toBe(300)
    expect(a?.pointsValueUsd).toBe(9)
  })

  it('hides earning and spending when the store says enabled: false', () => {
    expect(readRewards({ ...SAMPLE_REWARDS, enabled: false })?.enabled).toBe(false)
  })

  it('refuses an answer without the core rules or a balance, rather than using numbers of its own', () => {
    expect(readRewards({ ...SAMPLE_REWARDS, rules: { ...SAMPLE_REWARDS.rules, pointValueUsd: undefined } })).toBeNull()
    expect(readRewards({ ...SAMPLE_REWARDS, rules: { ...SAMPLE_REWARDS.rules, tiers: [] } })).toBeNull()
    expect(readRewards({ ...SAMPLE_REWARDS, points: undefined })).toBeNull()
    expect(readRewards(null)).toBeNull()
  })

  it('drops a share link that isn\'t https, and activity it can\'t read', () => {
    const a = readRewards({
      ...SAMPLE_REWARDS,
      referral: { ...SAMPLE_REWARDS.referral, link: 'javascript:alert(1)', activity: [{ initials: 'X', status: 'maybe', date: '2026-01-01' }] },
    })
    expect(a?.referral.link).toBeUndefined()
    expect(a?.referral.activity).toEqual([])
  })
})

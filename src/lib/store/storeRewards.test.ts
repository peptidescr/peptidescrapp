import { describe, expect, it } from 'vitest'
import type { StoreAccount } from './account'
import { SAMPLE_REWARDS } from './rewardsSample'
import { readRewards, readRules } from './storeRewards'

const data = SAMPLE_REWARDS.data
const withData = (patch: Record<string, unknown>) => ({ data: { ...data, ...patch } })
const account = (body: unknown) => readRewards(body) as StoreAccount | null

describe("readRewards (UPD's sample reply, exact field names)", () => {
  it('reads the sample into the account the screens draw', () => {
    const a = readRewards(SAMPLE_REWARDS, { email: 'jane@example.com', name: 'Jane' })
    expect(a).toMatchObject({
      source: 'store',
      enabled: true,
      displayName: 'Jane',
      points: 1240,
      pointsValueUsd: 37.2,
      creditUsd: 25,
      tier: {
        current: 'lab',
        earnedBy: 'spend',
        until: '2027-10-02T00:00:00.000Z',
        spend12moUsd: 1820.5,
        referrals12mo: 3,
        next: { tier: 'institute', spendToGoUsd: 3179.5 },
      },
      referral: { code: 'JANE7K2Q', link: 'https://app.usapeptidedepot.com/?ref=JANE7K2Q', completed: 1 },
    })
    const tier = (a as StoreAccount).tier
    // referralsNeeded: null (Institute isn't reached by referrals).
    expect(tier.next).not.toHaveProperty('referralsToGo')
    expect((a as StoreAccount).referral.activity).toEqual([
      { name: 'M.K.', at: '2026-11-18', status: 'pending', amountUsd: 20 },
      { name: 'D.R.', at: '2026-11-02', status: 'earned', amountUsd: 20 },
    ])
    expect((a as StoreAccount).rewards).toEqual([
      { id: 'free_delivery', name: 'Free delivery', points: 400 },
      { id: 'reconstitution_solution', name: 'Reconstitution Solution vial', points: 400 },
    ])
    expect((a as StoreAccount).history).toEqual([
      { at: '2026-11-02', reason: 'referral', note: 'Referral D.R. (USP-MWOZCCCC-DD33)', creditUsd: 20 },
      { at: '2026-10-20', reason: 'redeemed', points: -300 },
    ])
  })

  it('takes every number from the rules sent', () => {
    const rules = readRules(data.rules)
    expect(rules).toMatchObject({ pointsPerDollar: 1, pointValueUsd: 0.03, minimumRedeem: 250, tierWindowMonths: 12, countsFrom: '2026-11-19' })
    expect(rules?.tiers.map((t) => [t.tier, t.name, t.spendUsd, t.referrals, t.discountPercent, t.freeDelivery, t.pointsMultiplier, t.earlyAccess])).toEqual([
      ['bench', 'Bench', 0, undefined, 0, false, 1, false],
      ['lab', 'Lab', 1500, 25, 5, true, 1, false],
      ['institute', 'Institute', 5000, undefined, 10, true, 1.5, true],
    ])
    // The bonuses, then Lab by 25 referrals (from the tiers) as the ladder's last rung.
    expect(rules?.referral).toEqual({
      creditPerReferralUsd: 20,
      milestones: [{ referrals: 5, bonusCreditUsd: 25 }, { referrals: 10, bonusCreditUsd: 75 }, { referrals: 25, tier: 'lab' }],
    })
  })

  it('leaves the referral rules out when the per-friend credit is missing', () => {
    expect(readRules({ ...data.rules, referralCreditUsd: undefined })?.referral).toBeUndefined()
  })

  it('marks a fixed reward the store says is not available', () => {
    const a = account(withData({ rewards: [{ id: 'free_delivery', name: 'Free delivery', points: 400, available: false }] }))
    expect(a?.rewards).toEqual([{ id: 'free_delivery', name: 'Free delivery', points: 400, available: false }])
  })

  it('hides earning and spending when the store says enabled: false', () => {
    expect(account(withData({ enabled: false }))?.enabled).toBe(false)
  })

  it('says "not set up" when the store answers configured: false', () => {
    expect(readRewards({ data: { configured: false, message: 'Rewards are not set up yet.' } })).toBe('not-set-up')
  })

  it('refuses an answer without the core rules or a balance, rather than using numbers of its own', () => {
    expect(readRewards(withData({ rules: { ...data.rules, pointValueUsd: undefined } }))).toBeNull()
    expect(readRewards(withData({ rules: { ...data.rules, tiers: [] } }))).toBeNull()
    expect(readRewards(withData({ points: undefined }))).toBeNull()
    expect(readRewards(data)).toBeNull()
    expect(readRewards(null)).toBeNull()
  })

  it("drops a share link that isn't https, and activity and history it can't read", () => {
    const a = account(
      withData({
        referral: { ...data.referral, link: 'javascript:alert(1)', activity: [{ name: 'X', status: 'maybe', date: '2026-01-01' }] },
        history: [{ kind: 'gold', amount: 5, date: '2026-01-01' }, { kind: 'points', date: '2026-01-01' }],
      }),
    )
    expect(a?.referral.link).toBeUndefined()
    expect(a?.referral.activity).toEqual([])
    expect(a?.history).toEqual([])
  })
})

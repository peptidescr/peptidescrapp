/**
 * UPD's rewards reply, exactly as its developer's sample (20 November 2026: made-up values, exact field names).
 * Used by the local pretend store (netlify/lib/mockStore.ts) and the reader's tests.
 */
export const SAMPLE_REWARDS = {
  data: {
    configured: true,
    enabled: true,
    points: { balance: 1240, valueUsd: 37.2 },
    storeCreditUsd: 25,
    tier: {
      key: 'lab',
      name: 'Lab',
      earnedBy: 'spend',
      until: '2027-10-02T00:00:00.000Z',
      spend12MonthsUsd: 1820.5,
      referrals12Months: 3,
      benefits: { extraDiscountPercent: 5, freeDelivery: true, pointsMultiplier: 1, earlyRestockAccess: false },
      next: { key: 'institute', name: 'Institute', spendNeededUsd: 3179.5, referralsNeeded: null },
    },
    referral: {
      code: 'JANE7K2Q',
      link: 'https://app.usapeptidedepot.com/?ref=JANE7K2Q',
      completed: 1,
      activity: [
        { name: 'M.K.', date: '2026-11-18T15:04:00.000Z', status: 'pending', amountUsd: 20 },
        { name: 'D.R.', date: '2026-11-02T10:12:00.000Z', status: 'earned', amountUsd: 20 },
      ],
    },
    rewards: [
      { id: 'free_delivery', name: 'Free delivery', points: 400, available: true },
      { id: 'reconstitution_solution', name: 'Reconstitution Solution vial', points: 400, available: true },
    ],
    history: [
      { kind: 'credit', amount: 20, reason: 'referral', note: 'Referral D.R. (USP-MWOZCCCC-DD33)', date: '2026-11-02T10:12:00.000Z' },
      { kind: 'points', amount: -300, reason: 'redeemed', note: null, date: '2026-10-20T09:30:00.000Z' },
    ],
    rules: {
      pointsPerDollar: 1,
      pointValueUsd: 0.03,
      minimumRedeemPoints: 250,
      referralCreditUsd: 20,
      referralBonuses: [
        { referrals: 5, creditUsd: 25 },
        { referrals: 10, creditUsd: 75 },
      ],
      tierWindowMonths: 12,
      countsFrom: '2026-11-19',
      tiers: [
        { key: 'bench', name: 'Bench', spendUsd: 0, referrals: null, extraDiscountPercent: 0, freeDelivery: false, pointsMultiplier: 1, earlyRestockAccess: false },
        { key: 'lab', name: 'Lab', spendUsd: 1500, referrals: 25, extraDiscountPercent: 5, freeDelivery: true, pointsMultiplier: 1, earlyRestockAccess: false },
        { key: 'institute', name: 'Institute', spendUsd: 5000, referrals: null, extraDiscountPercent: 10, freeDelivery: true, pointsMultiplier: 1.5, earlyRestockAccess: true },
      ],
    },
  },
}

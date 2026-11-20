/**
 * A sample of UPD's rewards answer, as its developer described it (19 November 2026; the field names are our
 * reading of that description). Used by the local pretend store (netlify/lib/mockStore.ts) and the reader's tests.
 * Made-up values only.
 */
export const SAMPLE_REWARDS = {
  enabled: true,
  points: { balance: 1200, valueUsd: 36 },
  storeCreditUsd: 25,
  tier: {
    current: 'bench',
    earnedBy: 'spend',
    until: null,
    spend12moUsd: 1100,
    next: { tier: 'lab', spendToGoUsd: 400, referralsToGo: 23 },
  },
  referral: {
    code: 'JANE20',
    link: 'https://www.usapeptidedepot.com/?ref=JANE20',
    completed: 2,
    activity: [
      { initials: 'R.L.', date: '2026-11-02', status: 'earned', amountUsd: 20 },
      { initials: 'J.C.', date: '2026-10-21', status: 'earned', amountUsd: 20 },
      { initials: 'P.M.', date: '2026-11-15', status: 'pending', amountUsd: null },
    ],
  },
  rewards: [
    { id: 'free_delivery', name: 'Free delivery', points: 300 },
    { id: 'reconstitution_solution', name: 'Reconstitution Solution vial', points: 400 },
  ],
  rules: {
    pointsPerDollar: 1,
    pointValueUsd: 0.03,
    minimumRedeem: 250,
    tiers: [
      { id: 'bench', name: 'Bench', spendUsd: 0, discountPercent: 0, freeDelivery: false, pointsMultiplier: 1, earlyAccess: false },
      { id: 'lab', name: 'Lab', spendUsd: 1500, referrals: 25, months: 12, discountPercent: 5, freeDelivery: true, pointsMultiplier: 1, earlyAccess: false },
      { id: 'institute', name: 'Institute', spendUsd: 5000, discountPercent: 10, freeDelivery: true, pointsMultiplier: 1.5, earlyAccess: true },
    ],
    referral: {
      creditPerReferralUsd: 20,
      minimumFirstOrderUsd: 100,
      milestones: [
        { referrals: 5, bonusUsd: 25 },
        { referrals: 10, bonusUsd: 75 },
        { referrals: 25, tier: 'lab', months: 12 },
      ],
    },
  },
  history: [
    { date: '2026-11-12', type: 'earned', description: 'Order USP-ABC123 delivered', points: 120 },
    { date: '2026-11-02', type: 'referral', description: 'Referral credit', creditUsd: 20 },
    { date: '2026-10-30', type: 'spent', description: 'Order USP-XYZ789', points: -300 },
  ],
}

/**
 * The loyalty and referral rules (Part B): their shape, and the arithmetic the
 * Home, Rewards, Refer and checkout screens use to explain and preview them.
 *
 * The store sets the numbers. UPD's developer (19 November 2026): "Please don't
 * hard-code any numbers. I can change them any time from my dashboard, so always
 * read them from rules." So a real account carries the rules UPD sent with it
 * (src/lib/store/storeRewards.ts), and every function here takes the rules it
 * works with. TEST_RULES are placeholders for the staging test account only: the
 * marketing lead's proposal as the developer chose it on 18 November (1 point
 * per $1, 100 points = $3, spent from 250; Bench / Lab at $1,500 a year or 25
 * referrals / Institute at $5,000; the Referral Model's $20, +$25 at 5, +$75 at
 * 10; fixed rewards at placeholder prices).
 *
 * These are for explaining and previewing ("this order earns 90 points"), never
 * for deciding what anyone is owed: the store does that.
 */

/** A tier's id as the store names it ('bench', 'lab', 'institute' today). */
export type Tier = string

export interface TierRule {
  tier: Tier
  /** The store's display name, when it sends one. */
  name?: string
  /** Spend over the last 12 months that reaches it, in dollars; 0 for the first tier. */
  spendUsd: number
  /** Completed referrals that also reach it (Lab). */
  referrals?: number
  /** How long a tier reached by referrals lasts. */
  months?: number
  /** Extra off every order, on top of the store's volume discounts. */
  discountPercent: number
  freeDelivery: boolean
  /** Points earned per dollar are multiplied by this. */
  pointsMultiplier: number
  /** Early access to restocks. */
  earlyAccess: boolean
}

export interface ReferralMilestone {
  /** Completed referrals that unlock it. */
  referrals: number
  /** One-time extra credit, in dollars. */
  bonusCreditUsd?: number
  /** A tier it grants, and for how long. */
  tier?: Tier
  months?: number
}

export interface ReferralRules {
  /** Store credit to the referrer per friend whose first order is paid and delivered, in dollars. */
  creditPerReferralUsd: number
  /** The friend's first order must be at least this, in dollars, when the store says so. */
  minimumFirstOrderUsd?: number
  milestones: ReferralMilestone[]
}

export interface StoreRules {
  /** Points earned per dollar spent (before a tier's multiplier). */
  pointsPerDollar: number
  /** What one point is worth off an order, in dollars. */
  pointValueUsd: number
  /** Points can be spent once the balance reaches this many. */
  minimumRedeem: number
  /** Lowest first. */
  tiers: TierRule[]
  /** How many months of spend set the tier (UPD's field is "12-month spend"). */
  tierWindowMonths: number
  /** Absent when the store sends no referral rules: the ladder isn't shown. */
  referral?: ReferralRules
}

export interface FixedReward {
  /** The id the store's `redeem.rewards` takes. */
  id: string
  /** The store's name for it, when it sends one. */
  name?: string
  /** Points it costs. */
  points: number
}

/** PLACEHOLDER rules for the staging test account (see the header). Real accounts use the store's. */
export const TEST_RULES: StoreRules = {
  pointsPerDollar: 1,
  pointValueUsd: 0.03,
  minimumRedeem: 250,
  tiers: [
    { tier: 'bench', spendUsd: 0, discountPercent: 0, freeDelivery: false, pointsMultiplier: 1, earlyAccess: false },
    { tier: 'lab', spendUsd: 1500, referrals: 25, months: 12, discountPercent: 5, freeDelivery: true, pointsMultiplier: 1, earlyAccess: false },
    { tier: 'institute', spendUsd: 5000, discountPercent: 10, freeDelivery: true, pointsMultiplier: 1.5, earlyAccess: true },
  ],
  tierWindowMonths: 12,
  referral: {
    creditPerReferralUsd: 20,
    minimumFirstOrderUsd: 100,
    milestones: [
      { referrals: 5, bonusCreditUsd: 25 },
      { referrals: 10, bonusCreditUsd: 75 },
      { referrals: 25, tier: 'lab', months: 12 },
    ],
  },
}

/** PLACEHOLDER fixed rewards for the staging test account. */
export const TEST_FIXED_REWARDS: FixedReward[] = [
  { id: 'free_delivery', points: 300 },
  { id: 'reconstitution_solution', points: 400 },
]

const round2 = (n: number) => Math.round(n * 100) / 100

/** A tier's rule; undefined when the store sent none for it. */
export function tierRule(rules: StoreRules, tier: Tier): TierRule | undefined {
  return rules.tiers.find((t) => t.tier === tier)
}

/** The tier above this one; undefined at the top. */
export function tierAbove(rules: StoreRules, tier: Tier): TierRule | undefined {
  const i = rules.tiers.findIndex((t) => t.tier === tier)
  return i >= 0 ? rules.tiers[i + 1] : undefined
}

/** The highest tier this 12-month spend reaches, without referrals. */
export function tierForSpend(rules: StoreRules, spendUsd: number): Tier {
  let reached = rules.tiers[0]?.tier ?? ''
  for (const t of rules.tiers) if (spendUsd >= t.spendUsd) reached = t.tier
  return reached
}

/** Points an order of this many dollars earns: whole points only, times the tier's multiplier. */
export function pointsForSpend(dollars: number, rules: StoreRules, multiplier = 1): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0
  // The small nudge keeps $90 × 1.5 at 135 whatever the float rounding.
  return Math.floor(dollars * rules.pointsPerDollar * multiplier + 1e-9)
}

/** What a balance of points is worth, in dollars, whether or not it can be spent yet. */
export function pointsValue(points: number, rules: StoreRules): number {
  if (!Number.isFinite(points) || points <= 0) return 0
  return round2(Math.floor(points) * rules.pointValueUsd)
}

/** Whether a balance of points can be spent. */
export function canRedeem(points: number, rules: StoreRules): boolean {
  return Number.isFinite(points) && points > 0 && points >= rules.minimumRedeem
}

/** What 100 points are worth, rounded so float error never shows ("100 points = $3"). */
export function hundredPointsUsd(rules: StoreRules): number {
  return Math.round(rules.pointValueUsd * 100 * 100) / 100
}

/** The fewest whole points that cover this many dollars. */
export function pointsToCover(dollars: number, rules: StoreRules): number {
  if (!Number.isFinite(dollars) || dollars <= 0 || rules.pointValueUsd <= 0) return 0
  return Math.ceil(round2(dollars) / rules.pointValueUsd - 1e-9)
}

/** The milestone that grants a tier (Lab at 25), if any. */
export function tierMilestone(referral: ReferralRules): ReferralMilestone | undefined {
  return referral.milestones.find((m) => m.tier !== undefined)
}

/** The next milestone after this many completed referrals, and how many more it takes; null past the last. */
export function nextReferralMilestone(completed: number, referral: ReferralRules): { milestone: ReferralMilestone; remaining: number } | null {
  const milestone = [...referral.milestones].sort((a, b) => a.referrals - b.referrals).find((m) => m.referrals > completed)
  return milestone ? { milestone, remaining: milestone.referrals - Math.max(0, completed) } : null
}

/** Total credit, in dollars, earned by this many completed referrals: per-referral credit plus bonuses reached. */
export function referralCreditEarned(completed: number, referral: ReferralRules): number {
  const n = Math.max(0, Math.floor(completed))
  const bonuses = referral.milestones.filter((m) => m.referrals <= n).reduce((sum, m) => sum + (m.bonusCreditUsd ?? 0), 0)
  return round2(n * referral.creditPerReferralUsd + bonuses)
}

/** Credit that reaching the next milestone adds: per-referral credit for each friend still needed, plus its bonus. */
export function creditToNextMilestone(completed: number, referral: ReferralRules): number {
  const next = nextReferralMilestone(completed, referral)
  return next ? round2(next.remaining * referral.creditPerReferralUsd + (next.milestone.bonusCreditUsd ?? 0)) : 0
}

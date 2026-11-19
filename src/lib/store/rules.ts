/**
 * The loyalty and referral rules, as data (Part B). One place to change a
 * number when the client changes their mind, and the numbers the Home, Rewards
 * and Refer screens explain to the customer.
 *
 * The stores keep the actual balances (accounts, points, credit, referrals live
 * with each store's orders; the app only shows them). These rules are for
 * explaining and previewing ("this order earns 90 points", "$600 more to Lab"),
 * never for deciding what anyone is owed.
 *
 * Sources (November 2026):
 * - Points and tiers: the marketing lead's points proposal, chosen by the
 *   developer on 2026-11-18: 1 point per $1, 100 points = $3 off (3¢ each),
 *   spent from 250, never cash; Bench / Lab / Institute on the last 12 months'
 *   spend, or Lab by 25 referrals.
 * - Referral credit: the head of growth's Referral Model, sections 4 and 5
 *   ($20 per friend, +$25 at 5, +$75 at 10, Lab for 12 months at 25).
 * - Fixed rewards' point prices are PLACEHOLDERS (the developer's choice) until
 *   the store sets them.
 * The tier discounts stack on the store's own volume discounts, which the store
 * applies itself.
 */
import type { Tier } from './types'

export interface LoyaltyRules {
  /** Points earned per dollar spent (before a tier's multiplier). */
  pointsPerDollar: number
  /** What one point is worth off an order, in dollars. */
  pointValueUsd: number
  /** Points can be spent once the balance reaches this many. */
  minimumRedeem: number
}

export interface TierRule {
  tier: Tier
  /** Spend over the last 12 months that reaches it, in dollars; 0 for Bench. */
  spendUsd: number
  /** Completed referrals that also reach it (Lab only). */
  referrals?: number
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
  bonusCredit?: number
  /** A tier granted for a while, and its perks (from TIER_RULES). */
  tier?: { tier: Tier; months: number; discountPercent: number; freeDelivery: boolean }
}

export interface ReferralRules {
  /** Store credit to the referrer per friend whose first order is paid and delivered, in dollars. */
  creditPerReferral: number
  /** The friend's first order must be at least this, in dollars (the model: $100). */
  minimumFirstOrder: number
  /** What the friend gets; the model says nothing, only the store's regular offers. */
  friendDiscount: number
  milestones: ReferralMilestone[]
  /** One reward per order: if an affiliate link brought it, the affiliate is paid and there's no referral credit. */
  affiliateWins: true
}

export type FixedRewardId = 'free_delivery' | 'reconstitution_solution'

export interface FixedReward {
  /** The id the store's `redeem.rewards` takes. */
  id: FixedRewardId
  /** Points it costs. PLACEHOLDER until the store sets it. */
  points: number
}

export const LOYALTY_RULES: LoyaltyRules = {
  pointsPerDollar: 1,
  pointValueUsd: 0.03,
  minimumRedeem: 250,
}

/** How far back the spend that sets the tier is counted. */
export const TIER_WINDOW_MONTHS = 12

export const TIER_RULES: Record<Tier, TierRule> = {
  bench: { tier: 'bench', spendUsd: 0, discountPercent: 0, freeDelivery: false, pointsMultiplier: 1, earlyAccess: false },
  lab: { tier: 'lab', spendUsd: 1500, referrals: 25, discountPercent: 5, freeDelivery: true, pointsMultiplier: 1, earlyAccess: false },
  institute: { tier: 'institute', spendUsd: 5000, discountPercent: 10, freeDelivery: true, pointsMultiplier: 1.5, earlyAccess: true },
}

/** Lowest to highest. */
export const TIERS: readonly Tier[] = ['bench', 'lab', 'institute']

/** PLACEHOLDER point prices (2026-11-18), easy to change here when the store sets them. */
export const FIXED_REWARDS: readonly FixedReward[] = [
  { id: 'free_delivery', points: 300 },
  { id: 'reconstitution_solution', points: 400 },
]

export const REFERRAL_RULES: ReferralRules = {
  creditPerReferral: 20,
  minimumFirstOrder: 100,
  friendDiscount: 0,
  milestones: [
    { referrals: 5, bonusCredit: 25 },
    { referrals: 10, bonusCredit: 75 },
    {
      referrals: 25,
      tier: { tier: 'lab', months: 12, discountPercent: TIER_RULES.lab.discountPercent, freeDelivery: TIER_RULES.lab.freeDelivery },
    },
  ],
  affiliateWins: true,
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The milestone that grants the Lab tier (25 referrals: Lab's perks for 12 months). */
export function labMilestone(rules: ReferralRules = REFERRAL_RULES): ReferralMilestone & { tier: NonNullable<ReferralMilestone['tier']> } {
  const milestone = rules.milestones.find((m) => m.tier?.tier === 'lab')
  if (!milestone?.tier) throw new Error('referral rules have no Lab milestone')
  return milestone as ReferralMilestone & { tier: NonNullable<ReferralMilestone['tier']> }
}

/** Points an order of this many dollars earns: whole points only, times the tier's multiplier (Institute 1.5×). */
export function pointsForSpend(dollars: number, multiplier = 1, rules: LoyaltyRules = LOYALTY_RULES): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0
  // The small nudge keeps $90 × 1.5 at 135 whatever the float rounding.
  return Math.floor(dollars * rules.pointsPerDollar * multiplier + 1e-9)
}

/** What a balance of points is worth, in dollars (3¢ each), whether or not it can be spent yet. */
export function pointsValue(points: number, rules: LoyaltyRules = LOYALTY_RULES): number {
  if (!Number.isFinite(points) || points <= 0) return 0
  return round2(Math.floor(points) * rules.pointValueUsd)
}

/** Whether a balance of points can be spent (250 or more). */
export function canRedeem(points: number, rules: LoyaltyRules = LOYALTY_RULES): boolean {
  return Number.isFinite(points) && points >= rules.minimumRedeem
}

/** What the points can take off an order now: their value from 250 points, nothing below. */
export function redeemableValue(points: number, rules: LoyaltyRules = LOYALTY_RULES): number {
  return canRedeem(points, rules) ? pointsValue(points, rules) : 0
}

/** The fewest whole points that cover this many dollars. */
export function pointsToCover(dollars: number, rules: LoyaltyRules = LOYALTY_RULES): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0
  return Math.ceil(round2(dollars) / rules.pointValueUsd - 1e-9)
}

/** The tier the last 12 months' spend reaches, without referrals. */
export function tierForSpend(spendUsd: number): Tier {
  if (spendUsd >= TIER_RULES.institute.spendUsd) return 'institute'
  if (spendUsd >= TIER_RULES.lab.spendUsd) return 'lab'
  return 'bench'
}

/** The next milestone after this many completed referrals, and how many more it takes; null past the last. */
export function nextReferralMilestone(
  completed: number,
  rules: ReferralRules = REFERRAL_RULES,
): { milestone: ReferralMilestone; remaining: number } | null {
  const milestone = rules.milestones.find((m) => m.referrals > completed)
  return milestone ? { milestone, remaining: milestone.referrals - Math.max(0, completed) } : null
}

/** Total credit, in dollars, earned by this many completed referrals: per-referral credit plus bonuses reached. */
export function referralCreditEarned(completed: number, rules: ReferralRules = REFERRAL_RULES): number {
  const n = Math.max(0, Math.floor(completed))
  const bonuses = rules.milestones.filter((m) => m.referrals <= n).reduce((sum, m) => sum + (m.bonusCredit ?? 0), 0)
  return n * rules.creditPerReferral + bonuses
}

/** Credit that reaching the next milestone adds: per-referral credit for each friend still needed, plus its bonus. */
export function creditToNextMilestone(completed: number, rules: ReferralRules = REFERRAL_RULES): number {
  const next = nextReferralMilestone(completed, rules)
  return next ? next.remaining * rules.creditPerReferral + (next.milestone.bonusCredit ?? 0) : 0
}

/**
 * The loyalty and referral rules, as data (Part B). One place to change a
 * number when the client changes their mind, and the numbers the Rewards and
 * Refer screens explain to the customer.
 *
 * The stores keep the actual balances (accounts, points, credit, referrals live
 * with each store's orders; the app only shows them). These rules are for
 * explaining and previewing ("this order earns 5 points", "2 more to the next
 * bonus"), never for deciding what anyone is owed.
 *
 * Sources, October 2026: the client's answers ("$50 spent = 1 point, 1 point =
 * $1") and the head of growth's referral model (spreadsheet). Marked
 * UNCONFIRMED where those two disagree or say nothing.
 */
import type { Tier } from './types'

export interface LoyaltyRules {
  /** Dollars spent per point earned. */
  dollarsPerPoint: number
  /** What one point is worth off an order, in dollars. */
  dollarsPerPointRedeemed: number
  /**
   * What moves a customer up a tier: dollars spent in the last 12 months.
   * UNCONFIRMED: the approved screens set these in points (Lab 1,500, Institute
   * 5,000), which at $50 a point would mean $75,000 of orders. Placeholders in
   * dollars until the head of growth sets them.
   */
  tierSpend: Record<Tier, number>
}

export interface ReferralMilestone {
  /** Completed referrals that unlock it. */
  referrals: number
  /** One-time extra credit, in dollars. */
  bonusCredit?: number
  /** A tier granted for a while, and its perks as the model states them. */
  tier?: { tier: Tier; months: number; discountPercent: number; freeDelivery: boolean }
}

export interface ReferralRules {
  /** Store credit to the referrer per friend whose first order is paid and delivered, in dollars. */
  creditPerReferral: number
  /**
   * The friend's first order must be at least this, in dollars.
   * UNCONFIRMED: the spreadsheet says $100, the client's summary of it says $75.
   */
  minimumFirstOrder: number
  /** Whether the friend gets anything; the model says no, only the store's regular offers. */
  friendDiscount: number
  milestones: ReferralMilestone[]
  /** If an affiliate link brought the order, the affiliate is paid and there's no referral credit. */
  affiliateWins: true
}

export const LOYALTY_RULES: LoyaltyRules = {
  dollarsPerPoint: 50,
  dollarsPerPointRedeemed: 1,
  tierSpend: { bench: 0, lab: 2500, institute: 7500 },
}

export const REFERRAL_RULES: ReferralRules = {
  creditPerReferral: 20,
  minimumFirstOrder: 100,
  friendDiscount: 0,
  milestones: [
    { referrals: 5, bonusCredit: 25 },
    { referrals: 10, bonusCredit: 75 },
    { referrals: 25, tier: { tier: 'lab', months: 12, discountPercent: 10, freeDelivery: true } },
  ],
  affiliateWins: true,
}

/** Points an order of this many dollars earns: whole points only, so $99 earns 1. */
export function pointsForSpend(dollars: number, rules: LoyaltyRules = LOYALTY_RULES): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0
  return Math.floor(dollars / rules.dollarsPerPoint)
}

/** What a balance of points is worth off an order, in dollars. */
export function pointsValue(points: number, rules: LoyaltyRules = LOYALTY_RULES): number {
  if (!Number.isFinite(points) || points <= 0) return 0
  return Math.floor(points) * rules.dollarsPerPointRedeemed
}

/** The tier a year's spend puts someone in. */
export function tierForSpend(dollarsLast12Months: number, rules: LoyaltyRules = LOYALTY_RULES): Tier {
  if (dollarsLast12Months >= rules.tierSpend.institute) return 'institute'
  if (dollarsLast12Months >= rules.tierSpend.lab) return 'lab'
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

/**
 * What the Home, Rewards and Refer screens draw, worked out from a StoreAccount
 * (src/lib/store/account.ts) and the rules (rules.ts): the tier and how far to
 * the next one, what the points are worth, the fixed rewards within reach, the
 * referral ladder's state, and the credit still to unlock. Pure, so the
 * arithmetic is testable apart from the screens.
 */
import type { StoreAccount } from './account'
import {
  canRedeem,
  creditToNextMilestone,
  FIXED_REWARDS,
  LOYALTY_RULES,
  nextReferralMilestone,
  pointsForSpend,
  pointsValue,
  REFERRAL_RULES,
  referralCreditEarned,
  TIER_RULES,
  TIERS,
  tierForSpend,
  type FixedReward,
  type ReferralRules,
} from './rules'
import type { Tier } from './types'

/** Whether a Lab earned by referrals is still running. */
export function labByReferrals(account: StoreAccount, now: Date = new Date()): boolean {
  return account.labUntil !== undefined && Date.parse(account.labUntil) > now.getTime()
}

/** The tier: Institute at $5,000 of spend in 12 months; Lab at $1,500, or while a referral Lab runs; else Bench. */
export function tierOf(account: StoreAccount, now: Date = new Date()): Tier {
  const bySpend = tierForSpend(account.spend12moUsd)
  return bySpend === 'bench' && labByReferrals(account, now) ? 'lab' : bySpend
}

/** The tier above this one; null at the top. */
export function tierAbove(tier: Tier): Tier | null {
  return TIERS[TIERS.indexOf(tier) + 1] ?? null
}

export interface NextTier {
  tier: Tier
  /** Spend still needed in the 12 months, in dollars. */
  spendToGo: number
  /** Referrals still needed, when referrals can reach it too (Lab). */
  referralsToGo?: number
}

/** The next tier and what's left to reach it; null at Institute. */
export function nextTier(account: StoreAccount, now: Date = new Date()): NextTier | null {
  const above = tierAbove(tierOf(account, now))
  if (!above) return null
  const rule = TIER_RULES[above]
  const spendToGo = Math.max(0, Math.round((rule.spendUsd - account.spend12moUsd) * 100) / 100)
  return rule.referrals !== undefined ? { tier: above, spendToGo, referralsToGo: Math.max(0, rule.referrals - account.referral.completed) } : { tier: above, spendToGo }
}

/** How far to the next tier, 0..1 (the ring on Home): spend, or referrals for Lab, whichever is further along. */
export function nextTierProgress(account: StoreAccount, now: Date = new Date()): number {
  const tier = tierOf(account, now)
  const above = tierAbove(tier)
  if (!above) return 1
  const from = TIER_RULES[tier].spendUsd
  const rule = TIER_RULES[above]
  const bySpend = (account.spend12moUsd - from) / (rule.spendUsd - from)
  const byReferrals = rule.referrals ? account.referral.completed / rule.referrals : 0
  return Math.min(1, Math.max(0, bySpend, byReferrals))
}

/** A tier's perks in one line: "5% off every order + free delivery", "… + 1.5× points"; Bench: its points. */
export function perksLine(tier: Tier, t: (key: string, options?: Record<string, unknown>) => string): string {
  const rule = TIER_RULES[tier]
  const parts = [
    rule.discountPercent > 0 ? t('loyalty.perk.discount', { percent: rule.discountPercent }) : null,
    rule.freeDelivery ? t('loyalty.perk.freeDelivery') : null,
    rule.pointsMultiplier !== 1 ? t('loyalty.perk.multiplier', { times: rule.pointsMultiplier }) : null,
  ].filter((p): p is string => p !== null)
  return parts.length > 0 ? parts.join(' + ') : t('loyalty.perk.points')
}

/** The spend thresholds of every tier, lowest first (the Bench -> Lab -> Institute track). */
export function tierThresholds(): number[] {
  return TIERS.map((t) => TIER_RULES[t].spendUsd)
}

/** What the points are worth, in dollars (3¢ each). */
export function pointsWorthUsd(account: StoreAccount): number {
  return pointsValue(account.points)
}

/** Points still needed before any can be spent (250); 0 once there. */
export function pointsToRedeem(account: StoreAccount): number {
  return canRedeem(account.points) ? 0 : LOYALTY_RULES.minimumRedeem - account.points
}

/** Points an order of this many dollars earns this account (1 per $1, 1.5× at Institute). */
export function pointsEarnedFor(dollars: number, account?: StoreAccount, now: Date = new Date()): number {
  return pointsForSpend(dollars, account ? TIER_RULES[tierOf(account, now)].pointsMultiplier : 1)
}

/** Each fixed reward, and how many more points it takes (0 when the balance covers it). */
export function fixedRewards(account: StoreAccount): { reward: FixedReward; pointsShort: number }[] {
  return FIXED_REWARDS.map((reward) => ({ reward, pointsShort: Math.max(0, reward.points - account.points) }))
}

export type StepState = 'earned' | 'next' | 'locked'

/** One rung of the referral ladder: the first referral's credit, then the model's milestones. */
export interface Rung {
  referrals: number
  /** Credit for the first referral, or a milestone's bonus. */
  creditUsd?: number
  bonusUsd?: number
  /** The tier a milestone grants, for how long, and its perks. */
  tier?: { months: number; discountPercent: number; freeDelivery: boolean }
}

export interface LadderRow {
  rung: Rung
  state: StepState
  /** Friends still needed to reach it; 0 when earned. */
  toGo: number
  /** How full the connector below this rung is: 1 between two earned rungs, part-way after the last earned one. */
  lineFill: number
}

export function rungs(rules: ReferralRules = REFERRAL_RULES): Rung[] {
  return [
    { referrals: 1, creditUsd: rules.creditPerReferral },
    ...rules.milestones.map((m) => ({
      referrals: m.referrals,
      bonusUsd: m.bonusCredit,
      tier: m.tier ? { months: m.tier.months, discountPercent: m.tier.discountPercent, freeDelivery: m.tier.freeDelivery } : undefined,
    })),
  ]
}

/** The ladder with each rung marked earned, next (the first not yet reached) or locked. */
export function ladderRows(account: StoreAccount): LadderRow[] {
  const done = account.referral.completed
  const all = rungs()
  const nextIndex = all.findIndex((r) => r.referrals > done)
  return all.map((rung, i) => {
    const earned = rung.referrals <= done
    const following = all[i + 1]
    return {
      rung,
      state: earned ? 'earned' : i === nextIndex ? 'next' : 'locked',
      toGo: Math.max(0, rung.referrals - done),
      lineFill: !earned || !following ? 0 : following.referrals <= done ? 1 : 0.45,
    }
  })
}

/** Referral credit earned so far, from the rules ($20 each plus the bonuses reached). */
export function creditEarnedUsd(account: StoreAccount): number {
  return referralCreditEarned(account.referral.completed)
}

/** The next milestone and how many more friends it takes; null once all are reached. */
export function nextMilestone(account: StoreAccount): { referrals: number; remaining: number; bonusUsd?: number; grantsLab: boolean } | null {
  const next = nextReferralMilestone(account.referral.completed)
  if (!next) return null
  return { referrals: next.milestone.referrals, remaining: next.remaining, bonusUsd: next.milestone.bonusCredit, grantsLab: next.milestone.tier?.tier === 'lab' }
}

/** Credit that reaching the next milestone would add ("2 more labs unlock +$65"). */
export function creditUnlockedByNext(account: StoreAccount): number {
  return creditToNextMilestone(account.referral.completed)
}

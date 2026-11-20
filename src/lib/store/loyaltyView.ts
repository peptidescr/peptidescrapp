/**
 * What the Home, Rewards, Refer and checkout screens draw, worked out from a
 * StoreAccount (src/lib/store/account.ts): its tier and the way to the next,
 * what its points can do, the fixed rewards within reach, and the referral
 * ladder. Every number comes from the account and the rules it carries (the
 * store's for a real account), never from constants here. Pure, so the
 * arithmetic is testable apart from the screens.
 */
import type { StoreAccount } from './account'
import {
  canRedeem,
  creditToNextMilestone,
  nextReferralMilestone,
  pointsForSpend,
  referralCreditEarned,
  tierRule,
  type FixedReward,
  type ReferralMilestone,
  type StoreRules,
  type Tier,
  type TierRule,
} from './rules'

type T = (key: string, options?: Record<string, unknown>) => string

/** A tier's name: ours when we have one for its id, else the store's, else the id itself. */
export function tierName(tier: Tier, rules: StoreRules, t: T): string {
  const fallback = tierRule(rules, tier)?.name ?? (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '')
  return t(`loyalty.tierName.${tier}`, { defaultValue: fallback })
}

/** The account's current tier rule; undefined when the store sent none for it. */
export function currentTierRule(account: StoreAccount): TierRule | undefined {
  return tierRule(account.rules, account.tier.current)
}

/** Whether the current tier came from referrals and runs out (a referral Lab). */
export function tierFromReferrals(account: StoreAccount): boolean {
  return account.tier.earnedBy === 'referrals' && account.tier.until !== undefined
}

/** How far to the next tier, 0..1 (the ring on Home): spend, or referrals when they count, whichever is further. */
export function nextTierProgress(account: StoreAccount): number {
  const next = account.tier.next
  if (!next) return 1
  const from = currentTierRule(account)?.spendUsd ?? 0
  const to = tierRule(account.rules, next.tier)
  const toSpend = to?.spendUsd
  const spend = account.tier.spend12moUsd ?? (toSpend !== undefined && next.spendToGoUsd !== undefined ? toSpend - next.spendToGoUsd : undefined)
  const bySpend = spend !== undefined && toSpend !== undefined && toSpend > from ? (spend - from) / (toSpend - from) : 0
  const referrals = to?.referrals
  const byReferrals = referrals && next.referralsToGo !== undefined ? (referrals - next.referralsToGo) / referrals : 0
  return Math.min(1, Math.max(0, bySpend, byReferrals))
}

/** Where the 12-month spend sits on the Bench -> Lab -> Institute track (a referral tier counts as reached). */
export function trackSpend(account: StoreAccount): number {
  const spend = account.tier.spend12moUsd ?? 0
  return tierFromReferrals(account) ? Math.max(spend, currentTierRule(account)?.spendUsd ?? 0) : spend
}

/** The spend thresholds of every tier, lowest first. */
export function tierThresholds(rules: StoreRules): number[] {
  return rules.tiers.map((t) => t.spendUsd)
}

/** A tier's perks in one line: "5% off every order + free delivery", "… + 1.5× points"; none: its points. */
export function perksLine(rule: TierRule | undefined, t: T): string {
  const parts = rule
    ? [
        rule.discountPercent > 0 ? t('loyalty.perk.discount', { percent: rule.discountPercent }) : null,
        rule.freeDelivery ? t('loyalty.perk.freeDelivery') : null,
        rule.pointsMultiplier !== 1 ? t('loyalty.perk.multiplier', { times: rule.pointsMultiplier }) : null,
      ].filter((p): p is string => p !== null)
    : []
  return parts.length > 0 ? parts.join(' + ') : t('loyalty.perk.none')
}

/** Whether the points can be spent now (the store's minimum reached). */
export function canSpendPoints(account: StoreAccount): boolean {
  return canRedeem(account.points, account.rules)
}

/** Points still needed before any can be spent; 0 once there. */
export function pointsToRedeem(account: StoreAccount): number {
  return canSpendPoints(account) ? 0 : Math.max(0, account.rules.minimumRedeem - account.points)
}

/** The most an order can take off the balance: the credit, plus the points' value once they can be spent. */
export function spendableUsd(account: StoreAccount): number {
  return Math.round((account.creditUsd + (canSpendPoints(account) ? account.pointsValueUsd : 0)) * 100) / 100
}

/** Points an order of this many dollars earns this account (the rules' rate, times its tier's multiplier). */
export function pointsEarnedFor(dollars: number, account: StoreAccount): number {
  return pointsForSpend(dollars, account.rules, currentTierRule(account)?.pointsMultiplier ?? 1)
}

/** Each fixed reward, and how many more points it takes (0 when the balance covers it). */
export function fixedRewards(account: StoreAccount): { reward: FixedReward; pointsShort: number }[] {
  return account.rewards.map((reward) => ({ reward, pointsShort: Math.max(0, reward.points - account.points) }))
}

export type StepState = 'earned' | 'next' | 'locked'

/** One rung of the referral ladder: the first referral's credit, then the store's milestones. */
export interface Rung {
  referrals: number
  /** Credit for the first referral, or a milestone's bonus. */
  creditUsd?: number
  bonusUsd?: number
  /** The tier a milestone grants, for how long, and its perks. */
  tier?: { tier: Tier; months?: number; discountPercent: number; freeDelivery: boolean }
}

export interface LadderRow {
  rung: Rung
  state: StepState
  /** Friends still needed to reach it; 0 when earned. */
  toGo: number
  /** How full the connector below this rung is: 1 between two earned rungs, part-way after the last earned one. */
  lineFill: number
}

function rungFor(m: ReferralMilestone, rules: StoreRules): Rung {
  const rule = m.tier ? tierRule(rules, m.tier) : undefined
  return {
    referrals: m.referrals,
    ...(m.bonusCreditUsd !== undefined ? { bonusUsd: m.bonusCreditUsd } : {}),
    ...(m.tier ? { tier: { tier: m.tier, months: m.months ?? rule?.months, discountPercent: rule?.discountPercent ?? 0, freeDelivery: rule?.freeDelivery ?? false } } : {}),
  }
}

/** The ladder's rungs; empty when the store sent no referral rules. */
export function rungs(rules: StoreRules): Rung[] {
  if (!rules.referral) return []
  const milestones = [...rules.referral.milestones].sort((a, b) => a.referrals - b.referrals).filter((m) => m.referrals > 1)
  return [{ referrals: 1, creditUsd: rules.referral.creditPerReferralUsd }, ...milestones.map((m) => rungFor(m, rules))]
}

/** The ladder with each rung marked earned, next (the first not yet reached) or locked. */
export function ladderRows(account: StoreAccount): LadderRow[] {
  const done = account.referral.completed
  const all = rungs(account.rules)
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

/** Referral credit earned so far, from the rules (per-referral credit plus the bonuses reached). */
export function creditEarnedUsd(account: StoreAccount): number {
  return account.rules.referral ? referralCreditEarned(account.referral.completed, account.rules.referral) : 0
}

/** The next milestone and how many more friends it takes; null once all are reached or without rules. */
export function nextMilestone(account: StoreAccount): { referrals: number; remaining: number; bonusUsd?: number; grantsTier?: Tier } | null {
  const referral = account.rules.referral
  const next = referral ? nextReferralMilestone(account.referral.completed, referral) : null
  if (!next) return null
  return { referrals: next.milestone.referrals, remaining: next.remaining, bonusUsd: next.milestone.bonusCreditUsd, grantsTier: next.milestone.tier }
}

/** Credit that reaching the next milestone would add ("2 more labs unlock +$65"). */
export function creditUnlockedByNext(account: StoreAccount): number {
  return account.rules.referral ? creditToNextMilestone(account.referral.completed, account.rules.referral) : 0
}

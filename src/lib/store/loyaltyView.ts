/**
 * What the Home, Rewards and Refer screens draw, worked out from a StoreAccount
 * (src/lib/store/account.ts) and the rules (rules.ts): the tier and how far to
 * Lab, what the points are worth, the referral ladder's state, and the credit
 * still to unlock. Pure, so the arithmetic is testable apart from the screens.
 */
import type { StoreAccount } from './account'
import { creditToNextMilestone, labMilestone, nextReferralMilestone, pointsForSpend, pointsValue, REFERRAL_RULES, referralCreditEarned, type ReferralRules } from './rules'
import type { Tier } from './types'

/** Lab while its 12 months run, otherwise Bench. */
export function tierOf(account: StoreAccount, now: Date = new Date()): Tier {
  return account.labUntil && Date.parse(account.labUntil) > now.getTime() ? 'lab' : 'bench'
}

/** Referrals that earn Lab (the model: 25). */
export function labReferrals(rules: ReferralRules = REFERRAL_RULES): number {
  return labMilestone(rules).referrals
}

/** How far to Lab, 0..1 (the ring on Home, the track on Rewards). */
export function labProgress(account: StoreAccount): number {
  return Math.min(1, Math.max(0, account.referral.completed / labReferrals()))
}

export function referralsToLab(account: StoreAccount): number {
  return Math.max(0, labReferrals() - account.referral.completed)
}

/** What the points are worth off an order, in dollars. */
export function pointsWorthUsd(account: StoreAccount): number {
  return pointsValue(account.points)
}

/** Points an order of this many dollars earns (whole points per $50). */
export function pointsEarnedFor(dollars: number): number {
  return pointsForSpend(dollars)
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

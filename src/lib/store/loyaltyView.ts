/**
 * What the Home, Rewards and Refer screens draw, worked out from a StoreAccount
 * (src/lib/store/account.ts): progress along the tier track, which rewards can
 * be redeemed, the referral ladder's state, and the credit still to unlock.
 * Pure, so the arithmetic is testable apart from the screens.
 */
import { segmentedProgress } from '@/components/ui/segmented-progress-track'
import type { LadderStep, RewardInfo, StoreAccount } from './account'

/** How far through Bench -> Lab -> Institute the balance is (each gap drawn equal), 0..1. */
export function trackProgress(account: StoreAccount): number {
  return segmentedProgress(account.points, account.tiers.map((t) => t.minPoints))
}

/** The ring on Home: how far to the next tier from the tier's own floor, 0..1; full at the top. */
export function ringProgress(account: StoreAccount): number {
  const index = account.tiers.findIndex((t) => t.id === account.tier)
  const upper = account.tiers[index + 1]
  if (index < 0 || !upper) return 1
  const floor = account.tiers[index]!.minPoints
  return Math.min(1, Math.max(0, (account.points - floor) / (upper.minPoints - floor)))
}

export type RewardState = 'redeemed' | 'available' | 'locked'

export function rewardState(account: StoreAccount, reward: RewardInfo): RewardState {
  if (reward.redeemed) return 'redeemed'
  return account.points >= reward.cost ? 'available' : 'locked'
}

/** Points still needed for a reward; 0 once it can be redeemed. */
export function pointsShort(account: StoreAccount, reward: RewardInfo): number {
  return Math.max(0, reward.cost - account.points)
}

export type StepState = 'earned' | 'next' | 'locked'

export interface LadderRow {
  step: LadderStep
  state: StepState
  /** Friends still needed to reach it; 0 when earned. */
  toGo: number
  /** How full the connector below this step is: 1 when this and the next are earned, part-way when only this is. */
  lineFill: number
}

/** The ladder with each rung marked earned, next (the first not yet reached) or locked. */
export function ladderRows(account: StoreAccount): LadderRow[] {
  const done = account.referral.completed
  const steps = account.referral.ladder
  const nextIndex = steps.findIndex((s) => s.referrals > done)
  return steps.map((step, i) => {
    const earned = step.referrals <= done
    const following = steps[i + 1]
    return {
      step,
      state: earned ? 'earned' : i === nextIndex ? 'next' : 'locked',
      toGo: Math.max(0, step.referrals - done),
      lineFill: !earned || !following ? 0 : following.referrals <= done ? 1 : 0.45,
    }
  })
}

/** The first rung not yet reached, or null past the last. */
export function nextStep(account: StoreAccount): LadderStep | null {
  return account.referral.ladder.find((s) => s.referrals > account.referral.completed) ?? null
}

/**
 * Credit that reaching the next rung would add: the credit for each friend still
 * needed plus that rung's own bonus ("2 more labs unlocks +$80").
 */
export function creditUnlockedByNext(account: StoreAccount): number {
  const step = nextStep(account)
  if (!step) return 0
  const remaining = step.referrals - account.referral.completed
  return remaining * account.referral.creditPerReferralUsd + (step.bonusUsd ?? 0)
}

/** Total referral credit earned so far, from the latest rung that states it plus the bonuses reached. */
export function creditEarnedUsd(account: StoreAccount): number {
  const done = account.referral.completed
  const reached = account.referral.ladder.filter((s) => s.referrals <= done)
  const base = [...reached].reverse().find((s) => s.creditUsd !== undefined)?.creditUsd ?? done * account.referral.creditPerReferralUsd
  return base + reached.reduce((sum, s) => sum + (s.bonusUsd ?? 0), 0)
}

/** Points an order of this many dollars earns, rounded to whole points. */
export function pointsEarnedFor(account: StoreAccount, dollars: number): number {
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * account.pointsPerDollar) : 0
}

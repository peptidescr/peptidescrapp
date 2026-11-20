/**
 * Spending rewards at checkout (the developer's choice, 19 November 2026): a
 * switch for the credit, a switch for the points, and a box per fixed reward.
 * The store uses only what the order needs (UPD: "uses credit and points only up
 * to what the order needs"), so a real account sends what's available and UPD
 * decides; the estimate here is only what the confirmation shows before the
 * store's own total comes back.
 */
import type { Redeem } from '../shop/checkout'
import type { StoreAccount } from './account'
import { canSpendPoints } from './loyaltyView'

export interface SpendChoice {
  useCredit: boolean
  usePoints: boolean
  /** Fixed rewards ticked, by id. */
  rewards: string[]
}

export const NO_SPEND: SpendChoice = { useCredit: false, usePoints: false, rewards: [] }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Points the ticked fixed rewards cost. */
export function rewardPointsFor(account: StoreAccount, ids: string[]): number {
  return account.rewards.filter((r) => ids.includes(r.id)).reduce((sum, r) => sum + r.points, 0)
}

/**
 * Our estimate of what the choice takes off an order of `subtotal` dollars: credit first, then points (once the
 * store's minimum is reached, less the points the fixed rewards cost), never more than the order needs.
 */
export function spendEstimate(account: StoreAccount | null, subtotal: number, choice: SpendChoice): { creditUsd: number; pointsUsd: number; rewardPoints: number } {
  if (!account) return { creditUsd: 0, pointsUsd: 0, rewardPoints: 0 }
  const rewardPoints = rewardPointsFor(account, choice.rewards)
  const creditUsd = choice.useCredit ? round2(Math.min(account.creditUsd, subtotal)) : 0
  const pointsLeft = account.points - rewardPoints
  const pointsUsd =
    choice.usePoints && canSpendPoints(account) && pointsLeft > 0
      ? round2(Math.min(pointsLeft * account.rules.pointValueUsd, Math.max(0, subtotal - creditUsd)))
      : 0
  return { creditUsd, pointsUsd, rewardPoints }
}

/** UPD's `redeem` for the choice: the whole credit and the points left after the fixed rewards; UPD uses what's needed. */
export function redeemFor(account: StoreAccount | null, choice: SpendChoice): Redeem | undefined {
  if (!account) return undefined
  const pointsLeft = account.points - rewardPointsFor(account, choice.rewards)
  const redeem: Redeem = {
    ...(choice.useCredit && account.creditUsd > 0 ? { creditUsd: account.creditUsd } : {}),
    ...(choice.usePoints && canSpendPoints(account) && pointsLeft > 0 ? { points: pointsLeft } : {}),
    ...(choice.rewards.length > 0 ? { rewards: choice.rewards } : {}),
  }
  return Object.keys(redeem).length > 0 ? redeem : undefined
}

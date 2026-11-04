/**
 * The customer's store account as the Home, Rewards and Refer screens show it
 * (Part B). The stores keep the real balances; the app only displays them
 * (see rules.ts and types.ts), so this is a view model: everything the three
 * screens print, already worked out by whoever supplies it.
 *
 * Nobody supplies it yet. The stores don't have customer accounts, so for real
 * customers `useStoreAccount()` returns null and every screen that needs it
 * shows nothing. The one source today is a sample account that reproduces the
 * approved screens' numbers, switched on with VITE_STORE_DEMO=true on a staging
 * build so the client can review the look. It is never on in production, and
 * `redeem` below only moves the sample's own numbers: the real call will go to
 * the store.
 *
 * Money is in dollars (both stores charge in USD).
 */
import { useSyncExternalStore } from 'react'
import { BRAND } from '@/brand'
import type { Tier } from './types'

export interface TierInfo {
  id: Tier
  /** Points that put a customer in this tier; the first (Bench) is 0. */
  minPoints: number
  /** Perk keys, shown through loyalty.perk.<key> (an unknown key is shown as it is). */
  perks: string[]
}

export interface RewardInfo {
  id: string
  /** The badge on its tile ("SHIP", "$10"). */
  short: string
  cost: number
  /** Already redeemed: waiting on the customer's next order. */
  redeemed?: boolean
}

/** One rung of the referral ladder: what unlocks when this many friends have ordered. */
export interface LadderStep {
  referrals: number
  /** Total referral credit earned once reached ("$45 credit"), when the step states one. */
  creditUsd?: number
  /** A one-time bonus on top ("+$50 bonus credit"). */
  bonusUsd?: number
  /** A tier it grants, and for how many months (absent = for good). */
  tier?: { id: Tier; months?: number }
}

export interface ReferralActivity {
  name: string
  /** ISO date. */
  at: string
  status: 'earned' | 'pending'
  amountUsd?: number
}

export interface StoreAccount {
  /** What Home greets them by. */
  displayName?: string
  points: number
  tier: Tier
  /** Ascending, Bench first. */
  tiers: TierInfo[]
  /** What the balance is worth off the next order. */
  worthUsd: number
  /** Points one dollar of orders earns, for "earns 273 pts". */
  pointsPerDollar: number
  /** The next tier: absent at the top. */
  next?: { id: Tier; pointsToGo: number; aboutOrdersUsd: number; unlockKey: string }
  /** Store credit ready to use. */
  creditUsd: number
  rewards: RewardInfo[]
  referral: {
    link: string
    /** Friends whose first order has shipped. */
    completed: number
    creditPerReferralUsd: number
    /** What the friend gets off a first order (0 = nothing). */
    friendOffUsd: number
    ladder: LadderStep[]
    activity: ReferralActivity[]
  }
}

// ---------------------------------------------------------------------------
// The sample account (the approved screens' numbers), for review builds only.
// ---------------------------------------------------------------------------

export const SAMPLE_ACCOUNT: StoreAccount = {
  displayName: 'Dr. Morgan',
  points: 940,
  tier: 'bench',
  tiers: [
    { id: 'bench', minPoints: 0, perks: ['pointPerDollar', 'freeBacWater', 'birthdayBonus'] },
    { id: 'lab', minPoints: 1500, perks: ['fivePercentOff', 'freeShipping', 'earlyRestocks'] },
    { id: 'institute', minPoints: 5000, perks: ['tenPercentOff', 'pointsAndAHalf', 'priorityDispatch'] },
  ],
  worthUsd: 18,
  pointsPerDollar: 1,
  next: { id: 'lab', pointsToGo: 560, aboutOrdersUsd: 62, unlockKey: 'fivePercentOffFreeShipping' },
  creditUsd: 45,
  rewards: [
    { id: 'ship', short: 'SHIP', cost: 250 },
    { id: 'bac', short: 'BAC', cost: 300 },
    { id: 'd10', short: '$10', cost: 500 },
    { id: 'd25', short: '$25', cost: 1100 },
  ],
  referral: {
    link: `${BRAND.id}.link/MORGAN15`,
    completed: 3,
    creditPerReferralUsd: 15,
    friendOffUsd: 15,
    ladder: [
      { referrals: 1, creditUsd: 15 },
      { referrals: 3, creditUsd: 45 },
      { referrals: 5, bonusUsd: 50 },
      { referrals: 10, bonusUsd: 100, tier: { id: 'lab', months: 12 } },
      { referrals: 25, bonusUsd: 250, tier: { id: 'institute' } },
    ],
    activity: [
      { name: 'Rivera Lab', at: '2026-10-09', status: 'earned', amountUsd: 15 },
      { name: 'J. Chen', at: '2026-09-27', status: 'earned', amountUsd: 15 },
      { name: 'Patel Lab', at: '2026-09-12', status: 'earned', amountUsd: 15 },
      { name: 'Okafor Lab', at: '2026-10-14', status: 'pending' },
    ],
  },
}

const demoOn = import.meta.env.VITE_STORE_DEMO === 'true'

let account: StoreAccount | null = demoOn ? SAMPLE_ACCOUNT : null
const listeners = new Set<() => void>()

function set(next: StoreAccount): void {
  account = next
  for (const listener of listeners) listener()
}

/**
 * Redeems a reward: its points are spent and it waits on the next order. False
 * when it can't be (not enough points, already redeemed, unknown).
 */
export function redeemReward(id: string): boolean {
  if (!account) return false
  const reward = account.rewards.find((r) => r.id === id)
  if (!reward || reward.redeemed || account.points < reward.cost) return false
  set({
    ...account,
    points: account.points - reward.cost,
    rewards: account.rewards.map((r) => (r.id === id ? { ...r, redeemed: true } : r)),
  })
  return true
}

/** The signed-in customer's account; null for everyone until the stores have accounts. */
export function useStoreAccount(): StoreAccount | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => account,
  )
}

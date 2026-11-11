/**
 * The customer's store account as the Home, Rewards, Refer and checkout
 * screens show it (Part B). The stores keep the real balances; the app only
 * displays them and sends what the customer chooses to apply with an order.
 * Everything else (what points are worth, the referral ladder, how far to Lab)
 * is worked out from the rules in rules.ts (src/lib/store/loyaltyView.ts).
 *
 * Nobody supplies a real account yet: neither store's API has sign-in, points
 * or referrals (November 2026). Until one does, a **test account** stands in,
 * on staging only: VITE_STORE_TEST_SIGNIN=true, which vite.config.ts forces off
 * for a live-site build whatever the environment says. Its balance lives on
 * this device, so spending it at checkout can be tried end to end; the real
 * connection replaces it per store when that store's API is documented.
 *
 * Money is in dollars (both stores charge in USD).
 */
import { useSyncExternalStore } from 'react'
import { BRAND } from '@/brand'
import { pointsValue, REFERRAL_RULES } from './rules'

export interface ReferralActivity {
  name: string
  /** ISO date. */
  at: string
  /** Earned once the friend's first order (at least the model's minimum) is paid and delivered. */
  status: 'earned' | 'pending'
  amountUsd?: number
}

export interface StoreAccount {
  /** What Home greets them by. */
  displayName?: string
  /** Whole points; each is worth $1 off (rules.ts). */
  points: number
  /** Referral credit ready to use, in dollars. */
  creditUsd: number
  /** Lab tier until this ISO date (12 months from the 25th referral); absent means Bench. */
  labUntil?: string
  referral: {
    link: string
    /** Friends whose first order has been paid and delivered. */
    completed: number
    activity: ReferralActivity[]
  }
}

/** The test account: three referrals made, $900 of past orders. */
export const SAMPLE_ACCOUNT: StoreAccount = {
  displayName: 'Dr. Morgan',
  points: 18,
  creditUsd: 3 * REFERRAL_RULES.creditPerReferral,
  referral: {
    link: `${BRAND.id}.link/MORGAN20`,
    completed: 3,
    activity: [
      { name: 'Rivera Lab', at: '2026-10-09', status: 'earned', amountUsd: REFERRAL_RULES.creditPerReferral },
      { name: 'J. Chen', at: '2026-09-27', status: 'earned', amountUsd: REFERRAL_RULES.creditPerReferral },
      { name: 'Patel Lab', at: '2026-09-12', status: 'earned', amountUsd: REFERRAL_RULES.creditPerReferral },
      { name: 'Okafor Lab', at: '2026-10-14', status: 'pending' },
    ],
  },
}

/** Whether this build offers the test sign-in (staging only; see the header). */
export const TEST_SIGN_IN = import.meta.env.VITE_STORE_TEST_SIGNIN === 'true'

const STORAGE_KEY = 'store-test-account-v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function load(): StoreAccount | null {
  if (!TEST_SIGN_IN) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(raw) || typeof raw.points !== 'number' || typeof raw.creditUsd !== 'number') return null
    return { ...SAMPLE_ACCOUNT, points: Math.max(0, Math.floor(raw.points)), creditUsd: Math.max(0, Math.round(raw.creditUsd * 100) / 100) }
  } catch {
    return null
  }
}

let account: StoreAccount | null | undefined
const listeners = new Set<() => void>()

function current(): StoreAccount | null {
  if (account === undefined) account = load()
  return account
}

function set(next: StoreAccount | null): void {
  account = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify({ points: next.points, creditUsd: next.creditUsd }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: the test account lasts this visit.
  }
  for (const listener of listeners) listener()
}

/** Signs in to the test account (staging only). */
export function signInTestAccount(): void {
  if (TEST_SIGN_IN) set({ ...SAMPLE_ACCOUNT })
}

export function signOutStore(): void {
  set(null)
}

/**
 * Takes an amount the customer applied to an order out of the balance: credit
 * first, then points (whole dollars). Only the test account moves its own
 * numbers; a real store does this on its side when the order is placed.
 */
export function spendBalance(amountUsd: number): void {
  const now = current()
  if (!now || !(amountUsd > 0)) return
  const fromCredit = Math.min(now.creditUsd, amountUsd)
  const rest = Math.round((amountUsd - fromCredit) * 100) / 100
  const pointsUsed = Math.min(now.points, Math.ceil(rest))
  set({ ...now, creditUsd: Math.round((now.creditUsd - fromCredit) * 100) / 100, points: now.points - pointsUsed })
}

/** The most that can be applied to an order: the whole balance, in dollars. */
export function balanceUsd(a: StoreAccount): number {
  return Math.round((a.creditUsd + pointsValue(a.points)) * 100) / 100
}

/** The signed-in customer's account; null when signed out (and for everyone until the stores have accounts). */
export function useStoreAccount(): StoreAccount | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current,
  )
}

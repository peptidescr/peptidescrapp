/**
 * The customer's store account as the Home, Rewards, Refer and checkout
 * screens show it (Part B). The stores keep the real balances; the app only
 * displays them and sends what the customer chooses to apply with an order.
 * Everything else (what points are worth, the referral ladder, how far to Lab)
 * is worked out from the rules in rules.ts (src/lib/store/loyaltyView.ts).
 *
 * UPD customers can now sign in with their own account (src/lib/store/session.ts),
 * but no store serves points, credit or referrals yet (November 2026: UPD is
 * building GET /api/customer/rewards). Until one does, a **test account** stands in,
 * on staging only: VITE_STORE_TEST_SIGNIN=true, which vite.config.ts forces off
 * for a live-site build whatever the environment says. Its balance lives on
 * this device, so spending it at checkout can be tried end to end; the real
 * connection replaces it per store when that store's API is documented.
 *
 * Money is in dollars (both stores charge in USD).
 */
import { addMonths } from 'date-fns'
import { useSyncExternalStore } from 'react'
import { BRAND } from '@/brand'
import { tierOf } from './loyaltyView'
import { canRedeem, pointsForSpend, pointsToCover, redeemableValue, REFERRAL_RULES, TIER_RULES, type ReferralRules } from './rules'

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
  /** Whole points; each is worth 3¢ off, spendable from 250 (rules.ts). */
  points: number
  /** What was spent over the last 12 months, in dollars: sets the tier (Lab $1,500, Institute $5,000). */
  spend12moUsd: number
  /** Referral credit ready to use, in dollars. */
  creditUsd: number
  /** Lab tier until this ISO date (12 months from the 25th referral), whatever the spend. */
  labUntil?: string
  referral: {
    link: string
    /** Friends whose first order has been paid and delivered. */
    completed: number
    activity: ReferralActivity[]
  }
}

/** The test account: three referrals made, $900 of orders this year ($600 short of Lab). */
export const SAMPLE_ACCOUNT: StoreAccount = {
  displayName: 'Dr. Morgan',
  points: 900,
  spend12moUsd: 900,
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

// v3: the marketing proposal's points (1 per $1) and the 12-month spend; a v2 balance (1 per $50) starts over.
const STORAGE_KEY = 'store-test-account-v3'
/** Enough to recognise a repeat "paid" for recent orders; older ones can't come back. */
const MAX_EARNED_ORDERS = 50
const MAX_ACTIVITY = 30

const round2 = (n: number) => Math.round(n * 100) / 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readActivity(value: unknown): ReferralActivity[] {
  if (!Array.isArray(value)) return SAMPLE_ACCOUNT.referral.activity
  return value
    .filter(isRecord)
    .filter((a) => typeof a.name === 'string' && typeof a.at === 'string' && (a.status === 'earned' || a.status === 'pending'))
    .slice(0, MAX_ACTIVITY)
    .map((a) => ({
      name: a.name as string,
      at: a.at as string,
      status: a.status as ReferralActivity['status'],
      ...(typeof a.amountUsd === 'number' ? { amountUsd: a.amountUsd } : {}),
    }))
}

interface Saved {
  account: StoreAccount
  /** Order numbers that already earned points, so a repeated "paid" never pays twice. */
  earnedOrders: string[]
}

function load(): Saved | null {
  if (!TEST_SIGN_IN) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(raw) || typeof raw.points !== 'number' || typeof raw.creditUsd !== 'number') return null
    const completed = typeof raw.completed === 'number' ? Math.max(0, Math.floor(raw.completed)) : SAMPLE_ACCOUNT.referral.completed
    return {
      account: {
        ...SAMPLE_ACCOUNT,
        points: Math.max(0, Math.floor(raw.points)),
        spend12moUsd: typeof raw.spend12moUsd === 'number' ? Math.max(0, round2(raw.spend12moUsd)) : SAMPLE_ACCOUNT.spend12moUsd,
        creditUsd: Math.max(0, round2(raw.creditUsd)),
        ...(typeof raw.labUntil === 'string' ? { labUntil: raw.labUntil } : {}),
        referral: { ...SAMPLE_ACCOUNT.referral, completed, activity: readActivity(raw.activity) },
      },
      earnedOrders: Array.isArray(raw.earnedOrders) ? raw.earnedOrders.filter((n): n is string => typeof n === 'string').slice(-MAX_EARNED_ORDERS) : [],
    }
  } catch {
    return null
  }
}

let saved: Saved | null | undefined
const listeners = new Set<() => void>()

function currentSaved(): Saved | null {
  if (saved === undefined) saved = load()
  return saved
}

function current(): StoreAccount | null {
  return currentSaved()?.account ?? null
}

function set(next: StoreAccount | null, earnedOrders: string[] = currentSaved()?.earnedOrders ?? []): void {
  saved = next ? { account: next, earnedOrders: earnedOrders.slice(-MAX_EARNED_ORDERS) } : null
  try {
    if (saved) {
      const { account: a } = saved
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          points: a.points,
          spend12moUsd: a.spend12moUsd,
          creditUsd: a.creditUsd,
          completed: a.referral.completed,
          activity: a.referral.activity,
          labUntil: a.labUntil,
          earnedOrders: saved.earnedOrders,
        }),
      )
    } else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: the test account lasts this visit.
  }
  for (const listener of listeners) listener()
}

/** Signs in to the test account (staging only). Signing out and in again starts over from the sample. */
export function signInTestAccount(): void {
  if (TEST_SIGN_IN) set({ ...SAMPLE_ACCOUNT }, [])
}

/** Points a paid order of this many dollars earns this account: 1 per $1, 1.5× at Institute (rules.ts). */
export function orderPointsFor(a: StoreAccount, paidUsd: number, now: Date = new Date()): number {
  return pointsForSpend(paidUsd, TIER_RULES[tierOf(a, now)].pointsMultiplier)
}

/** The account after a paid order of this many dollars: its points, and the spend counted towards the tier. */
export function withOrderPoints(a: StoreAccount, paidUsd: number, now: Date = new Date()): StoreAccount {
  if (!Number.isFinite(paidUsd) || paidUsd <= 0) return a
  return { ...a, points: a.points + orderPointsFor(a, paidUsd, now), spend12moUsd: round2(a.spend12moUsd + paidUsd) }
}

/**
 * The account after `count` more friends' first orders were paid and delivered, under the Referral Model: the
 * per-referral credit each, a milestone's bonus credit when reached, and Lab for its months from `today` at 25.
 */
export function withReferrals(a: StoreAccount, count: number, today: Date, rules: ReferralRules = REFERRAL_RULES): StoreAccount {
  let next = a
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const n = next.referral.completed + 1
    const reached = rules.milestones.filter((m) => m.referrals === n)
    const amountUsd = rules.creditPerReferral + reached.reduce((sum, m) => sum + (m.bonusCredit ?? 0), 0)
    const tier = reached.find((m) => m.tier)?.tier
    next = {
      ...next,
      creditUsd: round2(next.creditUsd + amountUsd),
      ...(tier ? { labUntil: addMonths(today, tier.months).toISOString().slice(0, 10) } : {}),
      referral: {
        ...next.referral,
        completed: n,
        activity: [{ name: `Test friend ${n}`, at: today.toISOString().slice(0, 10), status: 'earned' as const, amountUsd }, ...next.referral.activity].slice(
          0,
          MAX_ACTIVITY,
        ),
      },
    }
  }
  return next
}

/**
 * The test account earns points for an order the store reports paid, once per order number. Returns the points
 * added (0 when signed out, already counted, or not in dollars). A real store does this on its side.
 */
export function earnForPaidOrder(orderNumber: string, paidUsd: number | undefined): number {
  const now = currentSaved()
  if (!now || paidUsd === undefined || now.earnedOrders.includes(orderNumber)) return 0
  const points = orderPointsFor(now.account, paidUsd)
  set(withOrderPoints(now.account, paidUsd), [...now.earnedOrders, orderNumber])
  return points
}

/** Staging only: pretend `count` friends' first orders were paid and delivered, to try the referral ladder. */
export function simulateReferrals(count: number): void {
  const now = current()
  if (!TEST_SIGN_IN || !now) return
  set(withReferrals(now, count, new Date()))
}

export function signOutStore(): void {
  set(null)
}

/**
 * The account after an amount applied to an order comes out of the balance:
 * credit first, then points (3¢ each, only from 250). Only the test account
 * moves its own numbers; a real store does this on its side.
 */
export function withBalanceSpent(a: StoreAccount, amountUsd: number): StoreAccount {
  if (!(amountUsd > 0)) return a
  const fromCredit = Math.min(a.creditUsd, amountUsd)
  const rest = round2(amountUsd - fromCredit)
  const pointsUsed = canRedeem(a.points) ? Math.min(a.points, pointsToCover(rest)) : 0
  return { ...a, creditUsd: round2(a.creditUsd - fromCredit), points: a.points - pointsUsed }
}

export function spendBalance(amountUsd: number): void {
  const now = current()
  if (now) set(withBalanceSpent(now, amountUsd))
}

/** The most that can be applied to an order: the credit, plus the points' value once there are 250. */
export function balanceUsd(a: StoreAccount): number {
  return round2(a.creditUsd + redeemableValue(a.points))
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

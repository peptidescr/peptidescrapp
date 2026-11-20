/**
 * The customer's store account as the Home, Rewards, Refer and checkout
 * screens show it (Part B). The store keeps the real balances and every rule;
 * the app only displays them and sends what the customer chooses to spend with
 * an order.
 *
 * Two sources fill the same StoreAccount:
 * - A UPD customer signed in with their own account (src/lib/store/session.ts):
 *   UPD's GET /api/customer/rewards, read through our /api/rewards
 *   (src/lib/store/storeRewards.ts), with the rules UPD sent.
 * - The **test account**, on staging only (VITE_STORE_TEST_SIGNIN=true, which
 *   vite.config.ts forces off for a live-site build): a sample whose balance
 *   lives on this device under the placeholder TEST_RULES, so the screens can be
 *   tried without a store account. Kept until UPD's test customers work.
 * A signed-in UPD customer's account wins over the test account.
 *
 * Money is in dollars (both stores charge in USD).
 */
import { addMonths } from 'date-fns'
import { useSyncExternalStore } from 'react'
import { BRAND } from '@/brand'
import {
  canRedeem,
  pointsForSpend,
  pointsToCover,
  pointsValue,
  TEST_FIXED_REWARDS,
  TEST_RULES,
  tierAbove,
  tierForSpend,
  tierRule,
  type FixedReward,
  type StoreRules,
  type Tier,
} from './rules'
import { useStoreRewards } from './storeRewards'

export interface ReferralActivity {
  /** The friend's name or initials, as the store gives it. */
  name: string
  /** ISO date. */
  at: string
  /** Earned once the friend's first order is paid and delivered. */
  status: 'earned' | 'pending'
  amountUsd?: number
}

export interface TierStatus {
  current: Tier
  /** How it was reached: 'spend' or 'referrals' (the store's word, kept as sent). */
  earnedBy?: string
  /** ISO date it lasts until, when it runs out (a referral Lab). */
  until?: string
  /** Spend over the last 12 months, in dollars. */
  spend12moUsd?: number
  /** The next tier and what's left to reach it; absent at the top. */
  next?: { tier: Tier; spendToGoUsd?: number; referralsToGo?: number }
}

/** One change to the balance (UPD sends the last 50). */
export interface HistoryEntry {
  /** ISO date. */
  at: string
  /** What happened, in the store's words. */
  label?: string
  /** Points added (positive) or spent (negative). */
  points?: number
  /** Credit added or spent, in dollars. */
  creditUsd?: number
}

export interface StoreAccount {
  source: 'test' | 'store'
  /** False when the store has rewards switched off: the app hides earning and spending. */
  enabled: boolean
  /** What Home greets them by. */
  displayName?: string
  points: number
  /** What the points are worth, in dollars (the store's figure). */
  pointsValueUsd: number
  /** Store credit ready to use, in dollars. */
  creditUsd: number
  tier: TierStatus
  referral: {
    code?: string
    /** The full share link. */
    link?: string
    /** Friends whose first order has been paid and delivered. */
    completed: number
    activity: ReferralActivity[]
  }
  rewards: FixedReward[]
  rules: StoreRules
  history: HistoryEntry[]
}

// ---------------------------------------------------------------------------
// The staging test account.
// ---------------------------------------------------------------------------

/** What the test account keeps on the device; the rest is worked out from TEST_RULES. */
export interface TestState {
  points: number
  /** What was spent over the last 12 months, in dollars: sets the tier. */
  spend12moUsd: number
  creditUsd: number
  /** Lab until this ISO date (12 months from the 25th referral), whatever the spend. */
  labUntil?: string
  completed: number
  activity: ReferralActivity[]
}

const TEST_CODE = 'MORGAN20'

/** The test account: three referrals made, $900 of orders this year ($600 short of Lab). */
export const SAMPLE_STATE: TestState = {
  points: 900,
  spend12moUsd: 900,
  creditUsd: 60,
  completed: 3,
  activity: [
    { name: 'Rivera Lab', at: '2026-10-09', status: 'earned', amountUsd: 20 },
    { name: 'J. Chen', at: '2026-09-27', status: 'earned', amountUsd: 20 },
    { name: 'Patel Lab', at: '2026-09-12', status: 'earned', amountUsd: 20 },
    { name: 'Okafor Lab', at: '2026-10-14', status: 'pending' },
  ],
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

/** The test account's tier: spend, or Lab while a referral Lab runs. */
export function testTier(state: TestState, now: Date = new Date(), rules: StoreRules = TEST_RULES): TierStatus {
  const bySpend = tierForSpend(rules, state.spend12moUsd)
  const byReferrals = state.labUntil !== undefined && Date.parse(state.labUntil) > now.getTime() && bySpend === rules.tiers[0]?.tier
  const current = byReferrals ? 'lab' : bySpend
  const above = tierAbove(rules, current)
  const next = above
    ? {
        tier: above.tier,
        spendToGoUsd: Math.max(0, round2(above.spendUsd - state.spend12moUsd)),
        ...(above.referrals !== undefined ? { referralsToGo: Math.max(0, above.referrals - state.completed) } : {}),
      }
    : undefined
  return {
    current,
    earnedBy: byReferrals ? 'referrals' : 'spend',
    ...(byReferrals ? { until: state.labUntil } : {}),
    spend12moUsd: state.spend12moUsd,
    ...(next ? { next } : {}),
  }
}

/** The test account as the screens see it. */
export function testAccount(state: TestState, now: Date = new Date()): StoreAccount {
  return {
    source: 'test',
    enabled: true,
    displayName: 'Dr. Morgan',
    points: state.points,
    pointsValueUsd: pointsValue(state.points, TEST_RULES),
    creditUsd: state.creditUsd,
    tier: testTier(state, now),
    referral: { code: TEST_CODE, link: `${BRAND.siteUrl}/?ref=${TEST_CODE}`, completed: state.completed, activity: state.activity },
    rewards: TEST_FIXED_REWARDS,
    rules: TEST_RULES,
    history: [],
  }
}

function readActivity(value: unknown): ReferralActivity[] {
  if (!Array.isArray(value)) return SAMPLE_STATE.activity
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
  state: TestState
  /** Order numbers that already earned points, so a repeated "paid" never pays twice. */
  earnedOrders: string[]
  /** The screens' view, kept so the same object is handed out until something changes. */
  view: StoreAccount
}

function load(): Saved | null {
  if (!TEST_SIGN_IN) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(raw) || typeof raw.points !== 'number' || typeof raw.creditUsd !== 'number') return null
    const state: TestState = {
      points: Math.max(0, Math.floor(raw.points)),
      spend12moUsd: typeof raw.spend12moUsd === 'number' ? Math.max(0, round2(raw.spend12moUsd)) : SAMPLE_STATE.spend12moUsd,
      creditUsd: Math.max(0, round2(raw.creditUsd)),
      ...(typeof raw.labUntil === 'string' ? { labUntil: raw.labUntil } : {}),
      completed: typeof raw.completed === 'number' ? Math.max(0, Math.floor(raw.completed)) : SAMPLE_STATE.completed,
      activity: readActivity(raw.activity),
    }
    const earnedOrders = Array.isArray(raw.earnedOrders) ? raw.earnedOrders.filter((n): n is string => typeof n === 'string').slice(-MAX_EARNED_ORDERS) : []
    return { state, earnedOrders, view: testAccount(state) }
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

function currentTest(): StoreAccount | null {
  return currentSaved()?.view ?? null
}

function set(next: TestState | null, earnedOrders: string[] = currentSaved()?.earnedOrders ?? []): void {
  saved = next ? { state: next, earnedOrders: earnedOrders.slice(-MAX_EARNED_ORDERS), view: testAccount(next) } : null
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved.state, earnedOrders: saved.earnedOrders }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: the test account lasts this visit.
  }
  for (const listener of listeners) listener()
}

/** Signs in to the test account (staging only). Signing out and in again starts over from the sample. */
export function signInTestAccount(): void {
  if (TEST_SIGN_IN) set({ ...SAMPLE_STATE }, [])
}

export function signOutStore(): void {
  set(null)
}

/** Points a paid order earns the test account: the rules' rate, times its tier's multiplier. */
export function orderPointsFor(state: TestState, paidUsd: number, now: Date = new Date()): number {
  return pointsForSpend(paidUsd, TEST_RULES, tierRule(TEST_RULES, testTier(state, now).current)?.pointsMultiplier ?? 1)
}

/** The test state after a paid order of this many dollars: its points, and the spend counted towards the tier. */
export function withOrderPoints(state: TestState, paidUsd: number, now: Date = new Date()): TestState {
  if (!Number.isFinite(paidUsd) || paidUsd <= 0) return state
  return { ...state, points: state.points + orderPointsFor(state, paidUsd, now), spend12moUsd: round2(state.spend12moUsd + paidUsd) }
}

/**
 * The test state after `count` more friends' first orders were paid and delivered, under the test rules: the
 * per-referral credit each, a milestone's bonus when reached, and its tier for its months from `today`.
 */
export function withReferrals(state: TestState, count: number, today: Date, rules: StoreRules = TEST_RULES): TestState {
  const referral = rules.referral
  if (!referral) return state
  let next = state
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const n = next.completed + 1
    const reached = referral.milestones.filter((m) => m.referrals === n)
    const amountUsd = referral.creditPerReferralUsd + reached.reduce((sum, m) => sum + (m.bonusCreditUsd ?? 0), 0)
    const tier = reached.find((m) => m.tier)
    next = {
      ...next,
      creditUsd: round2(next.creditUsd + amountUsd),
      ...(tier ? { labUntil: addMonths(today, tier.months ?? 12).toISOString().slice(0, 10) } : {}),
      completed: n,
      activity: [{ name: `Test friend ${n}`, at: today.toISOString().slice(0, 10), status: 'earned' as const, amountUsd }, ...next.activity].slice(0, MAX_ACTIVITY),
    }
  }
  return next
}

/**
 * The test account earns points for an order the store reports paid, once per order number. Returns the points
 * added (0 when not signed in to it, already counted, or not in dollars). A real store earns on its side.
 */
export function earnForPaidOrder(orderNumber: string, paidUsd: number | undefined): number {
  const now = currentSaved()
  if (!now || paidUsd === undefined || now.earnedOrders.includes(orderNumber)) return 0
  const points = orderPointsFor(now.state, paidUsd)
  set(withOrderPoints(now.state, paidUsd), [...now.earnedOrders, orderNumber])
  return points
}

/** Staging only: pretend `count` friends' first orders were paid and delivered, to try the referral ladder. */
export function simulateReferrals(count: number): void {
  const now = currentSaved()
  if (!TEST_SIGN_IN || !now) return
  set(withReferrals(now.state, count, new Date()))
}

/**
 * The test state after spending at checkout: the credit and points chosen (credit first, only what the order
 * needs, points only from the minimum) and the points of the fixed rewards chosen. A real store does this itself.
 */
export function withSpent(state: TestState, spend: { creditUsd: number; pointsUsd: number; rewardPoints: number }): TestState {
  const pointsUsed = canRedeem(state.points, TEST_RULES) ? Math.min(state.points, pointsToCover(spend.pointsUsd, TEST_RULES)) : 0
  return {
    ...state,
    creditUsd: round2(Math.max(0, state.creditUsd - spend.creditUsd)),
    points: Math.max(0, state.points - pointsUsed - spend.rewardPoints),
  }
}

export function spendTestBalance(spend: { creditUsd: number; pointsUsd: number; rewardPoints: number }): void {
  const now = currentSaved()
  if (now) set(withSpent(now.state, spend))
}

/** The account to show: the signed-in UPD customer's, else the staging test account; null when neither. */
export function useStoreAccount(): StoreAccount | null {
  const test = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    currentTest,
  )
  const real = useStoreRewards()
  return real.account ?? test
}

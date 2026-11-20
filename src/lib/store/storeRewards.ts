/**
 * The signed-in USA Peptide Depot customer's rewards: read from our
 * /api/rewards (netlify/lib/rewards.ts), which asks UPD's GET
 * /api/customer/rewards with the customer's token, and turned into the
 * StoreAccount the screens draw (src/lib/store/account.ts).
 *
 * The field names are exactly those of the sample reply UPD's developer sent
 * (20 November 2026; rewardsSample.ts): `{ data: { configured, enabled, points
 * { balance, valueUsd }, storeCreditUsd, tier { key, name, earnedBy, until,
 * spend12MonthsUsd, referrals12Months, benefits, next { key, name,
 * spendNeededUsd, referralsNeeded } }, referral { code, link, completed,
 * activity[] }, rewards[] { id, name, points, available }, history[] { kind,
 * amount, reason, note, date }, rules { … } } }`. `configured: false` means not
 * set up yet; `enabled: false` hides earning and spending. Numbers come only
 * from the answer: when the core rules are missing, the rewards show as
 * unavailable rather than with numbers of our own.
 *
 * Read when the app opens or comes back (at most every 30 seconds), when the
 * customer signs in, and after an order. A token UPD refuses (401) is refreshed
 * once and asked again, as UPD asks.
 */
import { useSyncExternalStore } from 'react'
import type { HistoryEntry, ReferralActivity, StoreAccount, TierStatus } from './account'
import type { FixedReward, ReferralMilestone, ReferralRules, StoreRules, TierRule } from './rules'
import { onStoreCustomerChange, refreshStoreSession, storeAccessToken, STORE_SIGN_IN, type StoreCustomer } from './session'

/** 'not-set-up': UPD answered `configured: false` (rewards not set up on the store yet). */
export type RewardsStatus = 'none' | 'loading' | 'ready' | 'unavailable' | 'expired' | 'not-set-up'

export interface RewardsState {
  status: RewardsStatus
  /** The account, once read (kept while a later read is under way). */
  account: StoreAccount | null
}

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The first of these fields that is a finite number. */
function num(record: Rec, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

/** The first of these fields that is a non-empty string, trimmed and capped. */
function str(record: Rec, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 200)
  }
  return undefined
}

function bool(record: Rec, ...keys: string[]): boolean | undefined {
  for (const key of keys) if (typeof record[key] === 'boolean') return record[key] as boolean
  return undefined
}

function rec(record: Rec, key: string): Rec | undefined {
  return isRecord(record[key]) ? (record[key] as Rec) : undefined
}

function list(record: Rec, key: string): Rec[] {
  return Array.isArray(record[key]) ? (record[key] as unknown[]).filter(isRecord) : []
}

const tierId = (value: string) => value.toLowerCase().replace(/\s+/g, '_')

function readTierRule(raw: Rec): TierRule | undefined {
  const key = str(raw, 'key')
  const spendUsd = num(raw, 'spendUsd')
  if (!key || spendUsd === undefined) return undefined
  const referrals = num(raw, 'referrals')
  const name = str(raw, 'name')
  return {
    tier: tierId(key),
    ...(name ? { name } : {}),
    spendUsd,
    ...(referrals !== undefined ? { referrals } : {}),
    discountPercent: num(raw, 'extraDiscountPercent') ?? 0,
    freeDelivery: bool(raw, 'freeDelivery') ?? false,
    pointsMultiplier: num(raw, 'pointsMultiplier') ?? 1,
    earlyAccess: bool(raw, 'earlyRestockAccess') ?? false,
  }
}

/**
 * The referral rules: `referralCreditUsd` per friend, `referralBonuses` at 5 and 10, and a tier any of the
 * `tiers` grants by referrals (Lab at 25) as the ladder's last rung. Undefined without the per-friend credit.
 */
function readReferralRules(raw: Rec, tiers: TierRule[]): ReferralRules | undefined {
  const creditPerReferralUsd = num(raw, 'referralCreditUsd')
  if (creditPerReferralUsd === undefined) return undefined
  const bonuses = list(raw, 'referralBonuses')
    .map((b): ReferralMilestone | undefined => {
      const referrals = num(b, 'referrals')
      const creditUsd = num(b, 'creditUsd')
      return referrals !== undefined && creditUsd !== undefined ? { referrals, bonusCreditUsd: creditUsd } : undefined
    })
    .filter((m): m is ReferralMilestone => m !== undefined)
  const byReferrals = tiers.filter((t) => t.referrals !== undefined).map((t): ReferralMilestone => ({ referrals: t.referrals!, tier: t.tier }))
  return { creditPerReferralUsd, milestones: [...bonuses, ...byReferrals] }
}

/** The rules from UPD's `rules`; undefined when the numbers the screens can't do without are missing. */
export function readRules(raw: unknown): StoreRules | undefined {
  if (!isRecord(raw)) return undefined
  const pointsPerDollar = num(raw, 'pointsPerDollar')
  const pointValueUsd = num(raw, 'pointValueUsd')
  const minimumRedeem = num(raw, 'minimumRedeemPoints')
  const tiers = list(raw, 'tiers')
    .map(readTierRule)
    .filter((t): t is TierRule => t !== undefined)
    .sort((a, b) => a.spendUsd - b.spendUsd)
  if (pointsPerDollar === undefined || pointValueUsd === undefined || minimumRedeem === undefined || tiers.length === 0) return undefined
  const referral = readReferralRules(raw, tiers)
  const countsFrom = str(raw, 'countsFrom')
  return {
    pointsPerDollar,
    pointValueUsd,
    minimumRedeem,
    tiers,
    tierWindowMonths: num(raw, 'tierWindowMonths') ?? 12,
    ...(countsFrom && /^\d{4}-\d{2}-\d{2}/.test(countsFrom) ? { countsFrom: countsFrom.slice(0, 10) } : {}),
    ...(referral ? { referral } : {}),
  }
}

function readTier(raw: unknown, rules: StoreRules): TierStatus {
  const t: Rec = isRecord(raw) ? raw : {}
  const key = str(t, 'key')
  const next = rec(t, 'next')
  const nextKey = next ? str(next, 'key') : undefined
  const spendToGoUsd = next ? num(next, 'spendNeededUsd') : undefined
  const referralsToGo = next ? num(next, 'referralsNeeded') : undefined
  const earnedBy = str(t, 'earnedBy')
  const until = str(t, 'until')
  const spend = num(t, 'spend12MonthsUsd')
  const referrals = num(t, 'referrals12Months')
  return {
    current: key ? tierId(key) : (rules.tiers[0]?.tier ?? ''),
    ...(earnedBy ? { earnedBy: earnedBy.toLowerCase() } : {}),
    ...(until ? { until } : {}),
    ...(spend !== undefined ? { spend12moUsd: spend } : {}),
    ...(referrals !== undefined ? { referrals12mo: referrals } : {}),
    ...(nextKey
      ? { next: { tier: tierId(nextKey), ...(spendToGoUsd !== undefined ? { spendToGoUsd } : {}), ...(referralsToGo !== undefined ? { referralsToGo } : {}) } }
      : {}),
  }
}

function readActivity(raw: Rec[]): ReferralActivity[] {
  return raw
    .map((a): ReferralActivity | undefined => {
      const name = str(a, 'name')
      const at = str(a, 'date')
      const status = str(a, 'status')?.toLowerCase()
      if (!name || !at || (status !== 'earned' && status !== 'pending')) return undefined
      const amountUsd = num(a, 'amountUsd')
      return { name, at: at.slice(0, 10), status, ...(amountUsd !== undefined ? { amountUsd } : {}) }
    })
    .filter((a): a is ReferralActivity => a !== undefined)
    .slice(0, 50)
}

function readFixedRewards(raw: Rec[]): FixedReward[] {
  return raw
    .map((r): FixedReward | undefined => {
      const id = str(r, 'id')
      const points = num(r, 'points')
      if (!id || points === undefined) return undefined
      const name = str(r, 'name')
      return { id, points, ...(name ? { name } : {}), ...(r.available === false ? { available: false } : {}) }
    })
    .filter((r): r is FixedReward => r !== undefined)
}

/** UPD's history reasons; another one shows as a plain "Change". */
export const HISTORY_REASONS = ['order_earned', 'order_reversed', 'referral', 'referral_bonus', 'redeemed', 'redeem_returned', 'adjustment'] as const

function readHistory(raw: Rec[]): HistoryEntry[] {
  return raw
    .map((h): HistoryEntry | undefined => {
      const at = str(h, 'date')
      const amount = num(h, 'amount')
      const kind = h.kind
      if (!at || amount === undefined || (kind !== 'points' && kind !== 'credit')) return undefined
      const reason = str(h, 'reason')
      const note = str(h, 'note')
      return {
        at: at.slice(0, 10),
        ...(reason ? { reason } : {}),
        ...(note ? { note } : {}),
        ...(kind === 'points' ? { points: amount } : { creditUsd: amount }),
      }
    })
    .filter((h): h is HistoryEntry => h !== undefined)
    .slice(0, 50)
}

/**
 * UPD's rewards answer (`{ data: {...} }`) as a StoreAccount. 'not-set-up' when UPD says rewards aren't configured
 * yet; null when it can't be read (no balance, or no core rules).
 */
export function readRewards(body: unknown, customer?: StoreCustomer | null): StoreAccount | 'not-set-up' | null {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined
  if (!data) return null
  if (data.configured === false) return 'not-set-up'
  const rules = readRules(data.rules)
  if (!rules) return null
  const pointsRaw = isRecord(data.points) ? data.points : {}
  const points = num(pointsRaw, 'balance')
  if (points === undefined) return null
  const valueUsd = num(pointsRaw, 'valueUsd')
  const referral = rec(data, 'referral') ?? {}
  const code = str(referral, 'code')
  const link = str(referral, 'link')
  return {
    source: 'store',
    enabled: data.enabled !== false,
    ...(customer?.name ? { displayName: customer.name } : {}),
    points: Math.max(0, Math.floor(points)),
    pointsValueUsd: valueUsd ?? Math.round(Math.floor(points) * rules.pointValueUsd * 100) / 100,
    creditUsd: Math.max(0, num(data, 'storeCreditUsd') ?? 0),
    tier: readTier(data.tier, rules),
    referral: {
      ...(code ? { code } : {}),
      ...(link && /^https:\/\//.test(link) ? { link } : {}),
      completed: Math.max(0, Math.floor(num(referral, 'completed') ?? 0)),
      activity: readActivity(list(referral, 'activity')),
    },
    rewards: readFixedRewards(list(data, 'rewards')),
    rules,
    history: readHistory(list(data, 'history')),
  }
}

// ---------------------------------------------------------------------------
// The state, and when it's read.
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 30_000

let state: RewardsState = { status: 'none', account: null }
const listeners = new Set<() => void>()
let lastRead = 0
let reading: Promise<void> | null = null

function setState(next: RewardsState): void {
  state = next
  for (const listener of listeners) listener()
}

async function ask(token: string, fetchFn: typeof fetch): Promise<Response> {
  return fetchFn('/api/rewards', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
}

/**
 * Reads the signed-in customer's rewards. `force` skips the 30-second spacing (after sign-in or an order). A
 * failed read keeps the last account shown.
 */
export function refreshStoreRewards({ force = false, customer }: { force?: boolean; customer?: StoreCustomer | null } = {}, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!STORE_SIGN_IN) return Promise.resolve()
  if (reading) return reading
  if (!force && Date.now() - lastRead < MIN_INTERVAL_MS) return Promise.resolve()
  reading = (async () => {
    try {
      let token = await storeAccessToken()
      if (!token) {
        setState({ status: 'none', account: null })
        return
      }
      if (!state.account) setState({ status: 'loading', account: null })
      let response = await ask(token, fetchFn)
      if (response.status === 401) {
        token = await refreshStoreSession()
        if (token) response = await ask(token, fetchFn)
      }
      if (response.status === 401) {
        setState({ status: 'expired', account: null })
        return
      }
      const account = response.ok ? readRewards(await response.json().catch(() => null), customer) : null
      lastRead = Date.now()
      if (account === 'not-set-up') setState({ status: 'not-set-up', account: null })
      else setState(account ? { status: 'ready', account } : { status: 'unavailable', account: state.account })
    } catch {
      setState({ status: 'unavailable', account: state.account })
    } finally {
      reading = null
    }
  })()
  return reading
}

let started = false

/** From App when the app opens: reads now, again on sign-in, and clears on sign-out. */
export function startStoreRewards(customer: StoreCustomer | null): void {
  if (!STORE_SIGN_IN) return
  if (!started) {
    started = true
    onStoreCustomerChange((next) => {
      if (next) void refreshStoreRewards({ force: true, customer: next })
      else setState({ status: 'none', account: null })
    })
  }
  if (customer) void refreshStoreRewards({ customer })
}

export function useStoreRewards(): RewardsState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

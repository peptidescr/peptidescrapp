/**
 * The signed-in USA Peptide Depot customer's rewards: read from our
 * /api/rewards (netlify/lib/rewards.ts), which asks UPD's GET
 * /api/customer/rewards with the customer's token, and turned into the
 * StoreAccount the screens draw (src/lib/store/account.ts).
 *
 * UPD's developer described the answer in words (19 November 2026): `enabled`
 * (false: hide earning and spending), `points` (balance and dollar value),
 * `storeCreditUsd`, `tier` (current, how earned, until, 12-month spend, next
 * tier and what's left), `referral` (code, link, completed count, activity:
 * initials, date, pending or earned, amount), `rewards` (fixed rewards with
 * point prices), `rules` (every number) and `history` (the last 50 changes). The
 * reader takes those names first and a few likely spellings of the fields inside
 * them; our server logs the names UPD really sends, to check against. Numbers
 * come only from the answer: when the core rules are missing, the rewards show
 * as unavailable rather than with numbers of our own.
 *
 * Read when the app opens or comes back (at most every 30 seconds), when the
 * customer signs in, and after an order. A token UPD refuses (401) is refreshed
 * once and asked again, as UPD asks.
 */
import { useSyncExternalStore } from 'react'
import type { HistoryEntry, ReferralActivity, StoreAccount, TierStatus } from './account'
import type { FixedReward, ReferralMilestone, ReferralRules, StoreRules, TierRule } from './rules'
import { onStoreCustomerChange, refreshStoreSession, storeAccessToken, STORE_SIGN_IN, type StoreCustomer } from './session'

export type RewardsStatus = 'none' | 'loading' | 'ready' | 'unavailable' | 'expired'

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

function rec(record: Rec, ...keys: string[]): Rec | undefined {
  for (const key of keys) if (isRecord(record[key])) return record[key] as Rec
  return undefined
}

function list(record: Rec, ...keys: string[]): Rec[] {
  for (const key of keys) if (Array.isArray(record[key])) return (record[key] as unknown[]).filter(isRecord)
  return []
}

const tierId = (value: string) => value.toLowerCase().replace(/\s+/g, '_')

function readTierRule(raw: Rec, key?: string): TierRule | undefined {
  const id = str(raw, 'id', 'tier', 'key', 'slug') ?? key ?? str(raw, 'name')
  const spendUsd = num(raw, 'spendUsd', 'minSpendUsd', 'thresholdUsd', 'spend12moUsd', 'spend', 'threshold')
  if (!id || spendUsd === undefined) return undefined
  const referrals = num(raw, 'referrals', 'referralsRequired', 'minReferrals')
  const months = num(raw, 'months', 'durationMonths')
  const name = str(raw, 'name', 'label')
  return {
    tier: tierId(id),
    ...(name ? { name } : {}),
    spendUsd,
    ...(referrals !== undefined ? { referrals } : {}),
    ...(months !== undefined ? { months } : {}),
    discountPercent: num(raw, 'discountPercent', 'discountPct', 'discount') ?? 0,
    freeDelivery: bool(raw, 'freeDelivery', 'freeShipping') ?? false,
    pointsMultiplier: num(raw, 'pointsMultiplier', 'multiplier') ?? 1,
    earlyAccess: bool(raw, 'earlyAccess', 'earlyRestockAccess') ?? false,
  }
}

function readTiers(value: unknown): TierRule[] {
  const rules = Array.isArray(value)
    ? value.filter(isRecord).map((t) => readTierRule(t))
    : isRecord(value)
      ? Object.entries(value).map(([key, t]) => (isRecord(t) ? readTierRule(t, key) : undefined))
      : []
  return rules.filter((t): t is TierRule => t !== undefined).sort((a, b) => a.spendUsd - b.spendUsd)
}

function readReferralRules(raw: Rec | undefined): ReferralRules | undefined {
  if (!raw) return undefined
  const creditPerReferralUsd = num(raw, 'creditPerReferralUsd', 'creditPerReferral', 'perReferralUsd', 'creditUsd', 'amountUsd')
  if (creditPerReferralUsd === undefined) return undefined
  const minimum = num(raw, 'minimumFirstOrderUsd', 'minimumOrderUsd', 'minOrderUsd', 'minimumFirstOrder')
  const milestones = list(raw, 'milestones', 'bonuses')
    .map((m): ReferralMilestone | undefined => {
      const referrals = num(m, 'referrals', 'count', 'at')
      if (referrals === undefined) return undefined
      const bonus = num(m, 'bonusUsd', 'bonusCreditUsd', 'creditUsd', 'amountUsd')
      const tier = str(m, 'tier')
      const months = num(m, 'months', 'durationMonths')
      return {
        referrals,
        ...(bonus !== undefined ? { bonusCreditUsd: bonus } : {}),
        ...(tier ? { tier: tierId(tier) } : {}),
        ...(months !== undefined ? { months } : {}),
      }
    })
    .filter((m): m is ReferralMilestone => m !== undefined)
  return { creditPerReferralUsd, ...(minimum !== undefined ? { minimumFirstOrderUsd: minimum } : {}), milestones }
}

/** The rules from UPD's `rules`; undefined when the numbers the screens can't do without are missing. */
export function readRules(raw: unknown): StoreRules | undefined {
  if (!isRecord(raw)) return undefined
  const pointsPerDollar = num(raw, 'pointsPerDollar', 'pointsPerUsd', 'pointsRate', 'earnRate')
  const pointValueUsd = num(raw, 'pointValueUsd', 'pointValue', 'pointUsd')
  const minimumRedeem = num(raw, 'minimumRedeem', 'minimumRedeemPoints', 'minRedeem', 'redeemMinimum')
  const tiers = readTiers(raw.tiers)
  if (pointsPerDollar === undefined || pointValueUsd === undefined || minimumRedeem === undefined || tiers.length === 0) return undefined
  const referral = readReferralRules(rec(raw, 'referral', 'referrals'))
  // UPD's developer calls the tier spend the "12-month spend"; a window sent in the rules wins.
  const tierWindowMonths = num(raw, 'tierWindowMonths', 'windowMonths', 'spendWindowMonths') ?? 12
  return { pointsPerDollar, pointValueUsd, minimumRedeem, tiers, tierWindowMonths, ...(referral ? { referral } : {}) }
}

function readTier(raw: unknown, rules: StoreRules): TierStatus {
  const t: Rec = isRecord(raw) ? raw : typeof raw === 'string' ? { current: raw } : {}
  const current = str(t, 'current', 'tier', 'id', 'name')
  const next = rec(t, 'next', 'nextTier')
  const nextId = next ? str(next, 'tier', 'id', 'name') : undefined
  const spendToGoUsd = next ? num(next, 'spendToGoUsd', 'remainingUsd', 'spendRemainingUsd', 'leftUsd', 'remaining') : undefined
  const referralsToGo = next ? num(next, 'referralsToGo', 'referralsRemaining', 'referralsLeft') : undefined
  const earnedBy = str(t, 'earnedBy', 'earned', 'how', 'source', 'reason')
  const until = str(t, 'until', 'expiresAt', 'validUntil')
  const spend = num(t, 'spend12moUsd', 'spend12MonthsUsd', 'twelveMonthSpendUsd', 'spendUsd', 'spend')
  return {
    current: current ? tierId(current) : (rules.tiers[0]?.tier ?? ''),
    ...(earnedBy ? { earnedBy: earnedBy.toLowerCase() } : {}),
    ...(until ? { until } : {}),
    ...(spend !== undefined ? { spend12moUsd: spend } : {}),
    ...(nextId
      ? { next: { tier: tierId(nextId), ...(spendToGoUsd !== undefined ? { spendToGoUsd } : {}), ...(referralsToGo !== undefined ? { referralsToGo } : {}) } }
      : {}),
  }
}

function readActivity(raw: Rec[]): ReferralActivity[] {
  return raw
    .map((a): ReferralActivity | undefined => {
      const name = str(a, 'initials', 'name', 'friend')
      const at = str(a, 'date', 'at', 'createdAt')
      const status = str(a, 'status')?.toLowerCase()
      if (!name || !at || (status !== 'earned' && status !== 'pending')) return undefined
      const amountUsd = num(a, 'amountUsd', 'amount', 'creditUsd')
      return { name, at: at.slice(0, 10), status, ...(amountUsd !== undefined ? { amountUsd } : {}) }
    })
    .filter((a): a is ReferralActivity => a !== undefined)
    .slice(0, 50)
}

function readFixedRewards(raw: Rec[]): FixedReward[] {
  return raw
    .map((r): FixedReward | undefined => {
      const id = str(r, 'id', 'key', 'slug')
      const points = num(r, 'points', 'pointsCost', 'cost', 'price')
      if (!id || points === undefined) return undefined
      const name = str(r, 'name', 'title', 'label')
      return { id, points, ...(name ? { name } : {}) }
    })
    .filter((r): r is FixedReward => r !== undefined)
}

function readHistory(raw: Rec[]): HistoryEntry[] {
  return raw
    .map((h): HistoryEntry | undefined => {
      const at = str(h, 'date', 'at', 'createdAt')
      if (!at) return undefined
      const label = str(h, 'description', 'label', 'reason', 'type')
      const points = num(h, 'points', 'pointsDelta', 'pointsChange')
      const creditUsd = num(h, 'creditUsd', 'creditDeltaUsd', 'amountUsd')
      return { at: at.slice(0, 10), ...(label ? { label } : {}), ...(points !== undefined ? { points } : {}), ...(creditUsd !== undefined ? { creditUsd } : {}) }
    })
    .filter((h): h is HistoryEntry => h !== undefined)
    .slice(0, 50)
}

/** UPD's rewards answer as a StoreAccount; null when it can't be read (no balance, or no core rules). */
export function readRewards(body: unknown, customer?: StoreCustomer | null): StoreAccount | null {
  if (!isRecord(body)) return null
  const rules = readRules(body.rules)
  if (!rules) return null
  const pointsRaw = body.points
  const points = typeof pointsRaw === 'number' ? pointsRaw : isRecord(pointsRaw) ? num(pointsRaw, 'balance', 'points', 'total') : undefined
  if (points === undefined) return null
  const valueUsd = isRecord(pointsRaw) ? num(pointsRaw, 'valueUsd', 'dollarValue', 'value', 'usd') : undefined
  const referral = isRecord(body.referral) ? body.referral : isRecord(body.referrals) ? body.referrals : {}
  const code = str(referral, 'code')
  const link = str(referral, 'link', 'url', 'shareUrl')
  return {
    source: 'store',
    enabled: body.enabled !== false,
    ...(customer?.name ? { displayName: customer.name } : {}),
    points: Math.max(0, Math.floor(points)),
    pointsValueUsd: valueUsd ?? Math.round(Math.floor(points) * rules.pointValueUsd * 100) / 100,
    creditUsd: Math.max(0, num(body, 'storeCreditUsd', 'creditUsd', 'storeCredit') ?? 0),
    tier: readTier(body.tier, rules),
    referral: {
      ...(code ? { code } : {}),
      ...(link && /^https:\/\//.test(link) ? { link } : {}),
      completed: Math.max(0, Math.floor(num(referral, 'completed', 'completedCount', 'count') ?? 0)),
      activity: readActivity(list(referral, 'activity', 'history')),
    },
    rewards: readFixedRewards(list(body, 'rewards', 'fixedRewards')),
    rules,
    history: readHistory(list(body, 'history')),
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
      setState(account ? { status: 'ready', account } : { status: 'unavailable', account: state.account })
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

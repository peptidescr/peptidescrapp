/**
 * Vial tracking (Phase 2): how much is left in a vial, how many doses that
 * is, when it runs out on its protocol's schedule, and what needs the
 * user's attention (low, empty, past its discard-by or printed expiry date).
 *
 * Nothing here is stored. A vial records only its starting amount; what's
 * left is always the starting amount minus every `taken` dose logged
 * against it, so editing or deleting a dose in History corrects the vial
 * automatically and the two can never drift apart.
 *
 * Rounding follows units.ts's one rule — never overstate what someone has
 * left: doses left is floored, and the remaining amount never goes below zero.
 *
 * The pure functions are unit-tested; the few database writes are at the
 * bottom.
 */
import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { getCompoundById } from '../content/compounds'
import { toIsoDate } from './dates'
import { db, type DoseLog, type Protocol, type Vial } from './db'
import { contextOf, loggedTimesFor } from './homeData'
import { requestPushSync } from './push'
import { findUnloggedInRange } from './schedule'
import { doseOn } from './titration'
import { microgramsFromMass, milliIUFromIU, type MassUnit } from './units'

/** A vial is "low" at this many doses left or fewer… */
export const LOW_STOCK_DOSES = 3
/** …or when its last dose falls within this many days. */
export const LOW_STOCK_DAYS = 7
/** Discard-by and printed-expiry dates are flagged this many days ahead. */
export const DATE_NOTICE_DAYS = 3
/** How far ahead the run-out projection looks before giving up (a vial lasting longer isn't "low"). */
const RUN_OUT_HORIZON_DAYS = 366

export type VialKind = 'mass' | 'iu'

export interface VialState {
  vial: Vial
  kind: VialKind
  /** Starting amount: micrograms (mass) or milli-IU (IU). */
  total: number
  /** Taken doses logged against this vial, same unit. */
  used: number
  /** `total − used`, never below zero, same unit. */
  remaining: number
  /** 0..1, for a fill gauge. */
  remainingFraction: number
  /** Whole doses of the protocol's dose size still in the vial; null when the vial has no protocol to size doses by. */
  dosesLeft: number | null
  /**
   * The scheduled day of the last dose the vial can cover, following the
   * protocol's schedule from now. Null when there's no active protocol, the
   * vial can't cover even one more dose, or it lasts beyond the horizon.
   */
  lastDoseOn: Date | null
}

export function vialKind(vial: Vial): VialKind {
  return vial.totalMilliIU !== undefined ? 'iu' : 'mass'
}

function vialTotal(vial: Vial): number {
  return vial.totalMilliIU ?? vial.totalMcg ?? 0
}

/** The amount one log drew from a vial of the given kind (0 for a skipped dose or a mismatched unit). */
function logAmount(log: DoseLog, kind: VialKind): number {
  if (log.status !== 'taken') return 0
  return (kind === 'iu' ? log.doseIU : log.doseMcg) ?? 0
}

/**
 * The protocol's dose on a given day (titration can change it), in the vial's
 * storage unit; null if the two don't measure the same way (mass vs IU).
 */
export function protocolDoseInVialUnit(protocol: Protocol, kind: VialKind, day: Date): number | null {
  const dose = doseOn(protocol, day)
  if (kind === 'iu') return dose.unit === 'IU' ? milliIUFromIU(dose.amount) : null
  return dose.unit === 'IU' ? null : microgramsFromMass(dose.amount, dose.unit as MassUnit)
}

export function computeVialState(
  vial: Vial,
  protocol: Protocol | undefined,
  doseLogs: DoseLog[],
  now: Date,
): VialState {
  const kind = vialKind(vial)
  const total = vialTotal(vial)
  const used = doseLogs
    .filter((log) => log.vialId === vial.id)
    .reduce((sum, log) => sum + logAmount(log, kind), 0)
  const remaining = Math.max(0, total - used)
  const doseSize = protocol ? protocolDoseInVialUnit(protocol, kind, now) : null

  let dosesLeft: number | null = doseSize && doseSize > 0 ? Math.floor(remaining / doseSize) : null
  let lastDoseOn: Date | null = null
  if (protocol?.isActive && dosesLeft !== null && dosesLeft > 0) {
    const upcoming = findUnloggedInRange(
      contextOf(protocol),
      now,
      addDays(now, RUN_OUT_HORIZON_DAYS),
      loggedTimesFor(protocol, doseLogs),
    )
    if (protocol.titration) {
      // A stepped dose: walk the upcoming doses at the amount each will
      // actually be, so a step up shortens the vial's run rather than being
      // counted at today's (smaller) dose.
      let left = remaining
      let count = 0
      let ranOut = false
      for (const occurrence of upcoming) {
        const size = protocolDoseInVialUnit(protocol, kind, occurrence.scheduledAt) ?? 0
        if (size <= 0 || size > left) {
          ranOut = true
          break
        }
        left -= size
        count += 1
        lastDoseOn = startOfDay(occurrence.scheduledAt)
      }
      if (ranOut) {
        dosesLeft = count
      } else {
        // Outlasts the horizon: the rest counts at the latest step's dose, and
        // there's no run-out date to show — the same as the fixed-dose case.
        const laterSize = protocolDoseInVialUnit(protocol, kind, addDays(now, RUN_OUT_HORIZON_DAYS)) ?? 0
        dosesLeft = count + (laterSize > 0 ? Math.floor(left / laterSize) : 0)
        lastDoseOn = null
      }
    } else {
      const last = upcoming[dosesLeft - 1]
      if (last) lastDoseOn = startOfDay(last.scheduledAt)
    }
  }

  return {
    vial,
    kind,
    total,
    used,
    remaining,
    remainingFraction: total > 0 ? remaining / total : 0,
    dosesLeft,
    lastDoseOn,
  }
}

/** The vial a protocol is currently drawing from, if any. */
export function activeVialFor(protocolId: string, vials: Vial[]): Vial | undefined {
  return vials.find((v) => v.protocolId === protocolId && v.status === 'active')
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type VialAlertKind =
  'empty' | 'lowStock' | 'discardPassed' | 'discardSoon' | 'expired' | 'expirySoon'

export interface VialAlert {
  kind: VialAlertKind
  vial: Vial
  protocol?: Protocol
  /** For stock alerts. */
  dosesLeft?: number
  lastDoseOn?: Date
  /** For date alerts: the date in question, yyyy-MM-dd. */
  date?: string
  /** Whole days from today to `date` (negative once passed). */
  daysUntil?: number
}

/** Most urgent first — the order alerts are listed in. */
const SEVERITY: Record<VialAlertKind, number> = {
  empty: 0,
  discardPassed: 1,
  expired: 2,
  lowStock: 3,
  discardSoon: 4,
  expirySoon: 5,
}

function dateAlert(
  vial: Vial,
  protocol: Protocol | undefined,
  date: string | undefined,
  now: Date,
  passed: VialAlertKind,
  soon: VialAlertKind,
): VialAlert | null {
  if (!date) return null
  const daysUntil = differenceInCalendarDays(parseISO(date), now)
  if (daysUntil < 0) return { kind: passed, vial, protocol, date, daysUntil }
  if (daysUntil <= DATE_NOTICE_DAYS) return { kind: soon, vial, protocol, date, daysUntil }
  return null
}

/**
 * Everything about the user's active vials worth surfacing, most urgent
 * first. At most one stock alert per vial (empty outranks low); date alerts
 * are independent of it.
 */
export function computeVialAlerts(
  vials: Vial[],
  protocols: Protocol[],
  doseLogs: DoseLog[],
  now: Date,
): VialAlert[] {
  const protocolsById = new Map(protocols.map((p) => [p.id, p]))
  const alerts: VialAlert[] = []

  for (const vial of vials) {
    if (vial.status !== 'active') continue
    const protocol = vial.protocolId ? protocolsById.get(vial.protocolId) : undefined
    const state = computeVialState(vial, protocol, doseLogs, now)

    if (state.remaining <= 0 || state.dosesLeft === 0) {
      alerts.push({ kind: 'empty', vial, protocol, dosesLeft: 0 })
    } else if (
      state.dosesLeft !== null &&
      protocol?.isActive &&
      (state.dosesLeft <= LOW_STOCK_DOSES ||
        (state.lastDoseOn !== null &&
          differenceInCalendarDays(state.lastDoseOn, now) <= LOW_STOCK_DAYS))
    ) {
      alerts.push({
        kind: 'lowStock',
        vial,
        protocol,
        dosesLeft: state.dosesLeft,
        lastDoseOn: state.lastDoseOn ?? undefined,
      })
    }

    const discard = dateAlert(vial, protocol, vial.discardOn, now, 'discardPassed', 'discardSoon')
    if (discard) alerts.push(discard)
    const expiry = dateAlert(vial, protocol, vial.expiresOn, now, 'expired', 'expirySoon')
    if (expiry) alerts.push(expiry)
  }

  return alerts.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind])
}

/** Stable per-alert key (vial + kind), for "already notified" bookkeeping and React keys. */
export function vialAlertKey(alert: VialAlert): string {
  return `${alert.vial.id}:${alert.kind}`
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface NewVialInput {
  compoundId: string
  protocolId?: string
  /** Starting amount in the compound's own terms: mg/mcg for mass compounds, IU for IU compounds. */
  amount: number
  amountUnit: MassUnit | 'IU'
  diluentMl?: number
  lot?: string
  batch?: string
  expiresOn?: string
  openedOn: string
  discardOn?: string
}

/** Turns form input into a stored vial (pure — exported for tests). Throws RangeError on unusable input. */
export function buildVial(input: NewVialInput, id: string, nowIso: string): Vial {
  const compound = getCompoundById(input.compoundId)
  const isIU = compound ? compound.defaultUnit === 'IU' : input.amountUnit === 'IU'
  if (isIU !== (input.amountUnit === 'IU'))
    throw new RangeError('amount unit does not match the compound')
  if (!(input.amount > 0)) throw new RangeError('amount must be greater than zero')

  const vial: Vial = {
    id,
    compoundId: input.compoundId,
    openedOn: input.openedOn,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  if (isIU) vial.totalMilliIU = milliIUFromIU(input.amount)
  else vial.totalMcg = microgramsFromMass(input.amount, input.amountUnit as MassUnit)
  if (input.protocolId) vial.protocolId = input.protocolId
  if (input.diluentMl !== undefined && input.diluentMl > 0) vial.diluentMl = input.diluentMl
  const lot = input.lot?.trim()
  if (lot) vial.lot = lot
  const batch = input.batch?.trim()
  if (batch) vial.batch = batch
  if (input.expiresOn) vial.expiresOn = input.expiresOn
  if (input.discardOn) vial.discardOn = input.discardOn
  return vial
}

/**
 * Starts tracking a vial. If it's for a protocol that already has an active
 * vial, that one is closed as finished first — a protocol draws from one
 * vial at a time.
 */
export async function startVial(input: NewVialInput): Promise<Vial> {
  const now = new Date().toISOString()
  const vial = buildVial(input, crypto.randomUUID(), now)
  await db.transaction('rw', db.vials, async () => {
    if (vial.protocolId) {
      const current = await db.vials
        .where('protocolId')
        .equals(vial.protocolId)
        .filter((v) => v.status === 'active')
        .toArray()
      for (const old of current) {
        await db.vials.update(old.id, { status: 'finished', closedAt: now, updatedAt: now })
      }
    }
    await db.vials.add(vial)
  })
  requestPushSync()
  return vial
}

export async function updateVialDetails(
  id: string,
  changes: Pick<Vial, 'lot' | 'batch' | 'expiresOn' | 'discardOn' | 'openedOn'>,
): Promise<void> {
  await db.vials.update(id, { ...changes, updatedAt: new Date().toISOString() })
  requestPushSync()
}

export async function closeVial(id: string, status: 'finished' | 'discarded'): Promise<void> {
  const now = new Date().toISOString()
  await db.vials.update(id, { status, closedAt: now, updatedAt: now })
  requestPushSync()
}

/** The active vial a new dose for this protocol should be recorded against, if any. */
export async function findActiveVialId(protocolId: string): Promise<string | undefined> {
  const vial = await db.vials
    .where('protocolId')
    .equals(protocolId)
    .filter((v) => v.status === 'active')
    .first()
  return vial?.id
}

/** Today's date as the default "opened on" for a new vial. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now)
}

/**
 * Data behind the Progress charts (Tier 1 #2): results connected to doses —
 * weight coloured by the dose step in force, results grouped by dose step and
 * by injection site, and side effects on the dose timeline. Pure, so every
 * number a chart draws can be tested.
 *
 * "Dose step" means the dose of one chosen protocol (the one the charts are
 * focused on) on a given day, from doseOn — a titration's steps, or a fixed
 * dose's single step. Days before that protocol started are "before first dose".
 */
import { addDays, differenceInCalendarDays, startOfDay, startOfWeek } from 'date-fns'
import { toIsoDate } from './dates'
import type { DoseLog, Protocol } from './db'
import type { SiteId } from './injectionSites'
import type { CheckIn, Severity, WeightEntry } from './results'
import { doseOn } from './titration'

export type ChartRange = '30d' | '90d' | '6m' | 'all'

/** Where a range starts; 'all' starts at the earliest data point given. */
export function rangeStart(range: ChartRange, now: Date, earliest: Date | null): Date {
  const today = startOfDay(now)
  switch (range) {
    case '30d':
      return addDays(today, -29)
    case '90d':
      return addDays(today, -89)
    case '6m':
      return addDays(today, -182)
    case 'all':
      return earliest && earliest < today ? startOfDay(earliest) : addDays(today, -29)
  }
}

/** The protocol the charts follow by default: an active titration first, then the active one with most taken doses. */
export function defaultFocusProtocol(protocols: readonly Protocol[], doseLogs: readonly DoseLog[]): Protocol | null {
  const active = protocols.filter((p) => p.isActive)
  const pool = active.length ? active : [...protocols]
  const taken = (p: Protocol) => doseLogs.filter((l) => l.protocolId === p.id && l.status === 'taken').length
  return (
    pool.find((p) => (p.titration?.steps.length ?? 0) >= 2) ??
    [...pool].sort((a, b) => taken(b) - taken(a))[0] ??
    null
  )
}

export interface DoseStep {
  /** Stable key: the dose amount + unit, or 'baseline'. */
  key: string
  amount: number | null
  unit: Protocol['doseUnit'] | null
  /** 1–4: the ordinal colour slot (lowest dose 1). 0 for the baseline. */
  shade: number
}

export const BASELINE_KEY = 'baseline'

/** The dose step in force on a day, for the focus protocol (baseline before it started). */
export function stepOn(protocol: Protocol | null, day: Date): { key: string; amount: number | null; unit: Protocol['doseUnit'] | null } {
  if (!protocol || toIsoDate(day) < protocol.startDate) return { key: BASELINE_KEY, amount: null, unit: null }
  const dose = doseOn(protocol, day)
  return { key: `${dose.amount} ${dose.unit}`, amount: dose.amount, unit: dose.unit }
}

/**
 * Every dose step that appears, lowest dose first, each with its ordinal
 * shade (1–4). Fewer than four steps spread across the whole ramp so they're
 * easy to tell apart; more than four share the shades in order, so the ramp
 * still runs with dose. The legend names each one either way.
 */
export function stepsShaded(steps: { key: string; amount: number | null; unit: Protocol['doseUnit'] | null }[]): DoseStep[] {
  const seen = new Map<string, { key: string; amount: number | null; unit: Protocol['doseUnit'] | null }>()
  for (const s of steps) seen.set(s.key, s)
  const doses = [...seen.values()].filter((s) => s.amount !== null).sort((a, b) => a.amount! - b.amount!)
  const shaded: DoseStep[] = doses.map((s, i) => ({
    ...s,
    shade:
      doses.length === 1
        ? 3
        : doses.length <= 4
          ? // Spread across the whole ramp, so two or three steps aren't neighbouring shades.
            Math.round(1 + (i * 3) / (doses.length - 1))
          : Math.min(4, Math.floor((i * 4) / doses.length) + 1),
  }))
  if (seen.has(BASELINE_KEY)) shaded.unshift({ key: BASELINE_KEY, amount: null, unit: null, shade: 0 })
  return shaded
}

export interface WeightPoint {
  at: Date
  grams: number
  step: string
}

/** Weights in [from, now], oldest first, each tagged with the dose step it was measured on. */
export function weightPoints(weights: readonly WeightEntry[], protocol: Protocol | null, from: Date, now: Date): WeightPoint[] {
  return weights
    .map((w) => ({ at: new Date(w.measuredAt), grams: w.grams }))
    .filter((w) => w.at >= from && w.at <= now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((w) => ({ ...w, step: stepOn(protocol, w.at).key }))
}

// ---------------------------------------------------------------------------
// Results by dose step
// ---------------------------------------------------------------------------

export interface DoseStepResult {
  key: string
  amount: number | null
  unit: Protocol['doseUnit'] | null
  /** Days spent on this step (up to today), across the whole history. */
  days: number
  /** Weight change over the step: its last weight minus the last one before it (or its first). */
  weightChangeGrams: number | null
  /** The same, per week on the step. */
  perWeekGrams: number | null
  /** Check-ins on this step, and how many of those recorded any side effect. */
  checkInDays: number
  sideEffectDays: number
  /** Mean of the day's worst severity, over days with a side effect. */
  meanSeverity: number | null
}

/**
 * Results grouped by dose step (Shotsy's "results by dose"): for each step of
 * the focus protocol, how weight moved and how often side effects showed up.
 * Steps are contiguous runs of days in the protocol's history.
 */
export function resultsByDoseStep(
  protocol: Protocol,
  weights: readonly WeightEntry[],
  checkIns: readonly CheckIn[],
  now: Date,
): DoseStepResult[] {
  const start = new Date(`${protocol.startDate}T00:00:00`)
  const end = protocol.endDate ? new Date(`${protocol.endDate}T23:59:59`) : now
  const last = end < now ? end : now
  if (last < start) return []

  // Contiguous runs of the same step, day by day.
  const runs: { key: string; amount: number; unit: Protocol['doseUnit']; from: Date; to: Date }[] = []
  for (let day = startOfDay(start); day <= last; day = addDays(day, 1)) {
    const dose = doseOn(protocol, day)
    const key = `${dose.amount} ${dose.unit}`
    const run = runs[runs.length - 1]
    if (run && run.key === key) run.to = day
    else runs.push({ key, amount: dose.amount, unit: dose.unit, from: day, to: day })
  }

  const sortedWeights = [...weights]
    .map((w) => ({ at: new Date(w.measuredAt), grams: w.grams }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const checkInsByDate = new Map(checkIns.map((c) => [c.date, c]))

  const byKey = new Map<string, DoseStepResult>()
  for (const run of runs) {
    const runEnd = addDays(run.to, 1)
    const inRun = sortedWeights.filter((w) => w.at >= run.from && w.at < runEnd)
    const before = sortedWeights.filter((w) => w.at < run.from).at(-1)
    const base = before ?? inRun[0]
    const lastIn = inRun.at(-1)
    const change = base && lastIn && lastIn !== base ? lastIn.grams - base.grams : null

    let checkInDays = 0
    let sideEffectDays = 0
    let severitySum = 0
    for (let day = run.from; day < runEnd; day = addDays(day, 1)) {
      const c = checkInsByDate.get(toIsoDate(day))
      if (!c) continue
      checkInDays += 1
      const worst = Math.max(0, ...Object.values(c.sideEffects ?? {}))
      if (worst > 0) {
        sideEffectDays += 1
        severitySum += worst
      }
    }

    const days = differenceInCalendarDays(run.to, run.from) + 1
    const entry = byKey.get(run.key) ?? {
      key: run.key,
      amount: run.amount,
      unit: run.unit,
      days: 0,
      weightChangeGrams: null,
      perWeekGrams: null,
      checkInDays: 0,
      sideEffectDays: 0,
      meanSeverity: null,
    }
    entry.days += days
    if (change !== null) entry.weightChangeGrams = (entry.weightChangeGrams ?? 0) + change
    entry.checkInDays += checkInDays
    const prevSideDays = entry.sideEffectDays
    entry.sideEffectDays += sideEffectDays
    if (sideEffectDays > 0) {
      entry.meanSeverity = ((entry.meanSeverity ?? 0) * prevSideDays + severitySum) / entry.sideEffectDays
    }
    byKey.set(run.key, entry)
  }

  return [...byKey.values()].map((r) => ({
    ...r,
    perWeekGrams: r.weightChangeGrams === null ? null : Math.round((r.weightChangeGrams / r.days) * 7),
    meanSeverity: r.meanSeverity === null ? null : Math.round(r.meanSeverity * 10) / 10,
  }))
}

// ---------------------------------------------------------------------------
// Results by injection site
// ---------------------------------------------------------------------------

/** The symptoms that are about the injection itself. */
export const SITE_SYMPTOMS = ['injection-site-reaction', 'injection-pain'] as const

export interface SiteResult {
  site: SiteId
  doses: number
  /** Doses at this site whose day's check-in recorded a site reaction or pain. */
  reactionDoses: number
  /** Mean worst site-symptom severity over those doses. */
  meanSeverity: number | null
  lastUsed: Date
}

/** Results grouped by injection site (Shotsy's "by site" view), most used first. */
export function resultsBySite(doseLogs: readonly DoseLog[], checkIns: readonly CheckIn[], from: Date): SiteResult[] {
  const checkInsByDate = new Map(checkIns.map((c) => [c.date, c]))
  const bySite = new Map<SiteId, SiteResult & { severitySum: number }>()
  for (const log of doseLogs) {
    if (log.status !== 'taken' || !log.site) continue
    const at = new Date(log.administeredAt)
    if (at < from) continue
    const entry = bySite.get(log.site) ?? { site: log.site, doses: 0, reactionDoses: 0, meanSeverity: null, lastUsed: at, severitySum: 0 }
    entry.doses += 1
    if (at > entry.lastUsed) entry.lastUsed = at
    const c = checkInsByDate.get(toIsoDate(at))
    const worst = Math.max(0, ...SITE_SYMPTOMS.map((s) => c?.sideEffects?.[s] ?? 0))
    if (worst > 0) {
      entry.reactionDoses += 1
      entry.severitySum += worst
    }
    bySite.set(log.site, entry)
  }
  return [...bySite.values()]
    .map(({ severitySum, ...r }) => ({
      ...r,
      meanSeverity: r.reactionDoses ? Math.round((severitySum / r.reactionDoses) * 10) / 10 : null,
    }))
    .sort((a, b) => b.doses - a.doses || b.lastUsed.getTime() - a.lastUsed.getTime())
}

// ---------------------------------------------------------------------------
// Side effects on the dose timeline
// ---------------------------------------------------------------------------

export interface TimelineColumn {
  /** The first day this column covers. */
  from: Date
  /** The last day it covers (the same day, for daily columns). */
  to: Date
  /** The focus protocol's dose step (key) if a dose was taken in this column, else null. */
  doseStep: string | null
  doses: number
  /** Symptom id → the worst severity recorded in the column. */
  severity: Record<string, Severity>
}

export interface Timeline {
  /** 'day' up to 60 days; longer ranges are binned by week so columns stay tappable on a phone. */
  bin: 'day' | 'week'
  columns: TimelineColumn[]
  /** Symptoms that appear anywhere in the range, most frequent first. */
  symptoms: string[]
}

export const MAX_DAILY_COLUMNS = 60

export function sideEffectTimeline(
  checkIns: readonly CheckIn[],
  doseLogs: readonly DoseLog[],
  protocol: Protocol | null,
  from: Date,
  now: Date,
): Timeline {
  const today = startOfDay(now)
  const totalDays = differenceInCalendarDays(today, startOfDay(from)) + 1
  const bin: Timeline['bin'] = totalDays > MAX_DAILY_COLUMNS ? 'week' : 'day'
  const columns: TimelineColumn[] = []
  let cursor = bin === 'week' ? startOfWeek(from, { weekStartsOn: 1 }) : startOfDay(from)
  while (cursor <= today) {
    const to = bin === 'week' ? addDays(cursor, 6) : cursor
    columns.push({ from: cursor, to: to > today ? today : to, doseStep: null, doses: 0, severity: {} })
    cursor = addDays(to, 1)
  }
  const columnOf = (at: Date) => {
    const day = startOfDay(at)
    return columns.find((c) => day >= c.from && day <= c.to)
  }

  const counts = new Map<string, number>()
  for (const c of checkIns) {
    const day = new Date(`${c.date}T12:00:00`)
    const column = columnOf(day)
    if (!column) continue
    for (const [id, severity] of Object.entries(c.sideEffects ?? {})) {
      column.severity[id] = Math.max(column.severity[id] ?? 0, severity) as Severity
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  for (const log of doseLogs) {
    if (log.status !== 'taken') continue
    if (protocol && log.protocolId !== protocol.id) continue
    const at = new Date(log.administeredAt)
    const column = columnOf(at)
    if (!column) continue
    column.doses += 1
    column.doseStep = stepOn(protocol, at).key
  }
  const symptoms = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  return { bin, columns, symptoms }
}

/** Evenly spaced, round axis ticks between min and max (2–5 of them). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

/**
 * The report for a doctor (Tier 1 #5): one printable page summarising a
 * period — what was taken and how closely, weight with doses marked, and the
 * side effects reported. Printed through the browser (window.print → "Save as
 * PDF" or the share sheet), so no PDF library and nothing leaves the device
 * unless the person shares it.
 *
 * Deliberately a record, not an interpretation: counts, dates and amounts the
 * person logged, with no assessment of them.
 */
import { differenceInCalendarDays, startOfDay } from 'date-fns'
import { toIsoDate } from './dates'
import type { DoseLog, Protocol } from './db'
import { computeAdherence, type Adherence } from './homeData'
import type { CheckIn, Severity, WeightEntry } from './results'

export interface ReportProtocol {
  protocol: Protocol
  adherence: Adherence
}

export interface ReportSymptom {
  id: string
  /** Check-in days it was reported on. */
  days: number
  worst: Severity
  /** Mean severity over those days, one decimal. */
  mean: number
}

export interface Report {
  from: Date
  to: Date
  protocols: ReportProtocol[]
  /** Taken and skipped doses in the period, newest first. */
  doses: DoseLog[]
  weights: WeightEntry[]
  startGrams: number | null
  latestGrams: number | null
  checkInDays: number
  symptoms: ReportSymptom[]
}

/**
 * Everything for the period [from, now]. Adherence covers the same period
 * (computeAdherence over its length), for active protocols plus any that
 * logged a dose in it.
 */
export function buildReport(
  protocols: readonly Protocol[],
  doseLogs: readonly DoseLog[],
  weights: readonly WeightEntry[],
  checkIns: readonly CheckIn[],
  from: Date,
  now: Date,
): Report {
  const start = startOfDay(from)
  const inRange = (iso: string) => {
    const at = new Date(iso)
    return at >= start && at <= now
  }
  const doses = doseLogs.filter((l) => inRange(l.administeredAt)).sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))
  const days = differenceInCalendarDays(now, start) + 1
  const involved = protocols.filter((p) => p.isActive || doses.some((d) => d.protocolId === p.id))
  const reportProtocols = involved.map((protocol) => ({ protocol, adherence: computeAdherence(protocol, [...doseLogs], now, days) }))

  const periodWeights = weights.filter((w) => inRange(w.measuredAt)).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const firstDay = toIsoDate(start)
  const lastDay = toIsoDate(now)
  const periodCheckIns = checkIns.filter((c) => c.date >= firstDay && c.date <= lastDay)

  const bySymptom = new Map<string, { days: number; worst: number; sum: number }>()
  for (const c of periodCheckIns) {
    for (const [id, severity] of Object.entries(c.sideEffects ?? {})) {
      const entry = bySymptom.get(id) ?? { days: 0, worst: 0, sum: 0 }
      entry.days += 1
      entry.worst = Math.max(entry.worst, severity)
      entry.sum += severity
      bySymptom.set(id, entry)
    }
  }

  return {
    from: start,
    to: now,
    protocols: reportProtocols,
    doses,
    weights: periodWeights,
    startGrams: periodWeights[0]?.grams ?? null,
    latestGrams: periodWeights.at(-1)?.grams ?? null,
    checkInDays: periodCheckIns.length,
    symptoms: [...bySymptom.entries()]
      .map(([id, e]) => ({ id, days: e.days, worst: e.worst as Severity, mean: Math.round((e.sum / e.days) * 10) / 10 }))
      .sort((a, b) => b.days - a.days || b.worst - a.worst),
  }
}

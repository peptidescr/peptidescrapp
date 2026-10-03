/**
 * Titration (pulled into Phase 2): a protocol whose dose steps up — or down —
 * on a schedule, e.g. 2.5 mg for 4 weeks, then 5 mg for 4, then 7.5 mg. The
 * step in force advances on its own, by calendar weeks from the protocol's
 * start date, and the last step holds until the protocol ends.
 *
 * Calendar weeks, deliberately: off weeks in a weeks cycle still count. That
 * keeps "your dose changes on 12/10" a fixed date that can be announced in
 * advance, rather than one that moves with every skipped or paused stretch.
 *
 * `Protocol.doseAmount` stays equal to the first step, so anything that hasn't
 * been taught about titration still reads a real dose. Everything that shows
 * or records a dose for a particular day asks `doseOn` instead.
 * public/shared/sw-notifications.js carries a plain-JS copy of `doseOn` for
 * closed-app reminders — keep the two in step.
 */
import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { Protocol } from './db'

export interface TitrationStep {
  /** In the protocol's doseUnit. */
  doseAmount: number
  /** How long this step lasts. Ignored on the last step, which holds until the end. */
  weeks: number
}

export interface Titration {
  steps: TitrationStep[]
}

/** Most steps a titration can have. */
export const MAX_TITRATION_STEPS = 12

type DoseSource = Pick<Protocol, 'doseAmount' | 'doseUnit' | 'startDate' | 'titration'>

export interface DoseOnDay {
  amount: number
  unit: Protocol['doseUnit']
  /** Which titration step it comes from; null for a protocol with a single fixed dose. */
  stepIndex: number | null
}

/** A titration only means something with at least two steps; one step is just a fixed dose. */
function stepsOf(protocol: DoseSource): TitrationStep[] | null {
  const steps = protocol.titration?.steps
  return steps && steps.length >= 2 ? steps : null
}

function stepIndexOn(steps: TitrationStep[], startDate: string, day: Date): number {
  const offset = differenceInCalendarDays(day, parseISO(startDate))
  let stepEnd = 0
  for (let i = 0; i < steps.length - 1; i++) {
    stepEnd += steps[i]!.weeks * 7
    if (offset < stepEnd) return i
  }
  return steps.length - 1
}

/** The first day of a step. */
export function stepStartsOn(protocol: DoseSource, stepIndex: number): Date {
  const steps = stepsOf(protocol) ?? []
  const days = steps.slice(0, stepIndex).reduce((sum, step) => sum + step.weeks * 7, 0)
  return addDays(parseISO(protocol.startDate), days)
}

/** The dose in force on a given day (before the start date: the first step). */
export function doseOn(protocol: DoseSource, day: Date): DoseOnDay {
  const steps = stepsOf(protocol)
  if (!steps) return { amount: protocol.doseAmount, unit: protocol.doseUnit, stepIndex: null }
  const stepIndex = stepIndexOn(steps, protocol.startDate, day)
  return { amount: steps[stepIndex]!.doseAmount, unit: protocol.doseUnit, stepIndex }
}

const NBSP = String.fromCharCode(0xa0)

/** "2.5 mg", with a non-breaking space so a narrow screen never strands the unit on the next line. */
export function formatDose(dose: Pick<DoseOnDay, 'amount' | 'unit'>): string {
  return `${dose.amount}${NBSP}${dose.unit}`
}

export interface DoseChange {
  /** The first day the new dose applies. */
  on: Date
  from: number
  to: number
  unit: Protocol['doseUnit']
  stepIndex: number
}

/** The next time the dose changes after `now`'s step, or null when there are no more steps. */
export function nextDoseChange(protocol: DoseSource, now: Date): DoseChange | null {
  const steps = stepsOf(protocol)
  if (!steps) return null
  const current = stepIndexOn(steps, protocol.startDate, now)
  if (current >= steps.length - 1) return null
  return {
    on: stepStartsOn(protocol, current + 1),
    from: steps[current]!.doseAmount,
    to: steps[current + 1]!.doseAmount,
    unit: protocol.doseUnit,
    stepIndex: current + 1,
  }
}

/** How far ahead Home and the bell announce a dose change. */
export const DOSE_CHANGE_NOTICE_DAYS = 3

/**
 * A change worth announcing now: one starting within the next few days, or
 * one that started today (so the first dose at the new amount isn't a surprise).
 */
export function doseChangeNotice(protocol: DoseSource, now: Date): DoseChange | null {
  const steps = stepsOf(protocol)
  if (!steps) return null
  const today = startOfDay(now)
  const current = stepIndexOn(steps, protocol.startDate, today)
  if (current > 0 && differenceInCalendarDays(today, stepStartsOn(protocol, current)) === 0) {
    return {
      on: stepStartsOn(protocol, current),
      from: steps[current - 1]!.doseAmount,
      to: steps[current]!.doseAmount,
      unit: protocol.doseUnit,
      stepIndex: current,
    }
  }
  const next = nextDoseChange(protocol, today)
  return next && differenceInCalendarDays(next.on, today) <= DOSE_CHANGE_NOTICE_DAYS ? next : null
}

/** Whether two doses are the same amount, across mg/mcg (IU only matches IU). */
export function sameDose(a: { doseAmount: number; doseUnit: Protocol['doseUnit'] } | DoseOnDay, b: DoseOnDay): boolean {
  const amount = 'doseAmount' in a ? a.doseAmount : a.amount
  const unit = 'doseUnit' in a ? a.doseUnit : a.unit
  const inMcg = (value: number, u: Protocol['doseUnit']) => (u === 'mg' ? value * 1000 : value)
  if ((unit === 'IU') !== (b.unit === 'IU')) return false
  return Math.abs(inMcg(amount, unit) - inMcg(b.amount, b.unit)) < 1e-9
}

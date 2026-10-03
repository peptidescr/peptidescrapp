/**
 * The protocol form's titration editor, as typed text, and the ways between
 * it and a Titration — the same shape as scheduleForm.ts. The first step's
 * dose is the form's main dose field, so only its length lives here.
 */
import { MAX_WEEK_COUNT, parseBoundedInteger, parsePositiveAmount } from './sanitize'
import { MAX_TITRATION_STEPS, type Titration } from './titration'

export interface TitrationStepFields {
  dose: string
  /** Not shown (and ignored) on the last step, which holds until the protocol ends. */
  weeks: string
}

export interface TitrationFields {
  on: boolean
  /** How long the first step (the form's main dose) lasts. */
  firstWeeks: string
  /** Steps 2 onward. */
  later: TitrationStepFields[]
}

/** What a step's weeks become when there's nothing usable typed — only ever the hidden last step's. */
const HELD_STEP_WEEKS = 4

export function titrationFields(titration?: Titration): TitrationFields {
  const steps = titration?.steps
  if (!steps || steps.length < 2) return { on: false, firstWeeks: '4', later: [{ dose: '', weeks: '4' }] }
  return {
    on: true,
    firstWeeks: String(steps[0]!.weeks),
    later: steps.slice(1).map((step) => ({ dose: String(step.doseAmount), weeks: String(step.weeks) })),
  }
}

export interface ParsedTitrationFields {
  /** undefined: switched off. null: switched on but something's invalid. */
  titration: Titration | undefined | null
  firstWeeks: number | null
  later: { dose: number | null; weeks: number | null }[]
}

export function parseTitrationFields(fields: TitrationFields, firstDose: number | null): ParsedTitrationFields {
  const firstWeeks = parseBoundedInteger(fields.firstWeeks, 1, MAX_WEEK_COUNT)
  const later = fields.later.map((step) => ({
    dose: parsePositiveAmount(step.dose),
    weeks: parseBoundedInteger(step.weeks, 1, MAX_WEEK_COUNT),
  }))
  if (!fields.on) return { titration: undefined, firstWeeks, later }

  const lastIndex = later.length - 1
  const valid =
    firstDose !== null &&
    firstWeeks !== null &&
    later.length >= 1 &&
    later.length + 1 <= MAX_TITRATION_STEPS &&
    later.every((step, i) => step.dose !== null && (i === lastIndex || step.weeks !== null))
  return {
    titration: valid
      ? {
          steps: [
            { doseAmount: firstDose!, weeks: firstWeeks! },
            ...later.map((step) => ({ doseAmount: step.dose!, weeks: step.weeks ?? HELD_STEP_WEEKS })),
          ],
        }
      : null,
    firstWeeks,
    later,
  }
}

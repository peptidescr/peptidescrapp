/**
 * Mixing calculator core. Turns (vial amount + diluent volume) or (a directly
 * entered concentration, for solution-form compounds) plus a desired dose
 * into what to actually draw.
 *
 * Mass and IU paths are kept completely separate public functions — never a
 * shared one taking a plain `number` — so a mass amount can never be handed
 * to an IU calculation or vice versa; the compiler enforces it via the
 * branded types from units.ts.
 *
 * The calculator always rounds the drawn volume DOWN to the nearest
 * graduation the chosen syringe can actually show. This is a fixed rule, not
 * a setting — see units.ts's file header for why "down" is the safe
 * direction. Doses remaining in the vial also always rounds DOWN, so the
 * count never overstates supply.
 */

import {
  type Microgram,
  type Microliter,
  type MilliIU,
  type SyringeType,
  mlFromMicroliters,
  quantizeVolumeToSyringe,
  syringeUnitsFromMicroliters,
} from './units'

/** Below this many syringe units, a reading is hard to measure precisely — a measurement-accuracy note, not a health warning. */
const MIN_RELIABLE_SYRINGE_UNITS = 5

export interface MixResult {
  /** Mass (µg) or milli-IU per mL — exact, informational only (not rounded for a physical action). */
  concentrationPerMl: number
  /** Volume to draw, already quantized down to a graduation the syringe can show. */
  drawVolumeUl: Microliter
  /** Same value as `drawVolumeUl`, in mL, for display. */
  drawVolumeMl: number
  /** Same value as `drawVolumeUl`, in whole syringe units, for display. */
  drawSyringeUnits: number
  /** How many more doses of this size the remaining volume holds. Floored. */
  dosesRemaining: number
  /** True when `drawSyringeUnits` is small enough that reading the syringe precisely is difficult. */
  lowVolumeWarning: boolean
}

function buildMixResult(
  totalAmount: number,
  totalVolumeUl: Microliter,
  desiredDose: number,
  syringeType: SyringeType,
): MixResult {
  if (!(totalAmount > 0)) throw new RangeError('totalAmount must be greater than zero')
  if (!(totalVolumeUl > 0)) throw new RangeError('totalVolumeUl must be greater than zero')
  if (!(desiredDose > 0)) throw new RangeError('desiredDose must be greater than zero')

  const totalVolumeMl = mlFromMicroliters(totalVolumeUl)
  const concentrationPerMl = totalAmount / totalVolumeMl
  const rawDrawVolumeUl = (desiredDose / concentrationPerMl) * 1000
  const drawVolumeUl = quantizeVolumeToSyringe(rawDrawVolumeUl, syringeType, 'down')
  const drawSyringeUnits = syringeUnitsFromMicroliters(drawVolumeUl, syringeType)
  const dosesRemaining = drawVolumeUl > 0 ? Math.floor(totalVolumeUl / drawVolumeUl) : 0

  return {
    concentrationPerMl,
    drawVolumeUl,
    drawVolumeMl: mlFromMicroliters(drawVolumeUl),
    drawSyringeUnits,
    dosesRemaining,
    lowVolumeWarning: drawSyringeUnits < MIN_RELIABLE_SYRINGE_UNITS,
  }
}

// ---------------------------------------------------------------------------
// Mass path (mg/mcg powders reconstituted with diluent, and mass-dosed solutions)
// ---------------------------------------------------------------------------

export function mixFromVialMass(params: {
  vialAmountMcg: Microgram
  diluentVolumeUl: Microliter
  desiredDoseMcg: Microgram
  syringeType: SyringeType
}): MixResult {
  return buildMixResult(
    params.vialAmountMcg,
    params.diluentVolumeUl,
    params.desiredDoseMcg,
    params.syringeType,
  )
}

/** For form: 'solution' compounds — no reconstitution step, concentration is entered directly. */
export function mixFromSolutionMass(params: {
  concentrationMcgPerMl: number
  totalVolumeUl: Microliter
  desiredDoseMcg: Microgram
  syringeType: SyringeType
}): MixResult {
  const totalAmountMcg = params.concentrationMcgPerMl * mlFromMicroliters(params.totalVolumeUl)
  return buildMixResult(
    totalAmountMcg,
    params.totalVolumeUl,
    params.desiredDoseMcg,
    params.syringeType,
  )
}

// ---------------------------------------------------------------------------
// IU path — never converted to or from a mass unit.
// ---------------------------------------------------------------------------

export function mixFromVialIU(params: {
  vialAmountMilliIU: MilliIU
  diluentVolumeUl: Microliter
  desiredDoseMilliIU: MilliIU
  syringeType: SyringeType
}): MixResult {
  return buildMixResult(
    params.vialAmountMilliIU,
    params.diluentVolumeUl,
    params.desiredDoseMilliIU,
    params.syringeType,
  )
}

export function mixFromSolutionIU(params: {
  concentrationMilliIUPerMl: number
  totalVolumeUl: Microliter
  desiredDoseMilliIU: MilliIU
  syringeType: SyringeType
}): MixResult {
  const totalAmountMilliIU =
    params.concentrationMilliIUPerMl * mlFromMicroliters(params.totalVolumeUl)
  return buildMixResult(
    totalAmountMilliIU,
    params.totalVolumeUl,
    params.desiredDoseMilliIU,
    params.syringeType,
  )
}

/**
 * The one place unit conversion happens in this codebase.
 *
 * Storage rule: masses are integer micrograms, volumes are integer microlitres,
 * IU amounts are integer milli-IU (IU × 1000). Never floats in storage. Branded
 * number types below stop a Microgram and a Microliter (or a raw `number`) from
 * being passed to each other by accident — TypeScript will refuse the assignment
 * unless it went through a conversion function in this file.
 *
 * IU has no universal mass conversion (it's compound-specific potency, not a
 * mass). There is deliberately no function anywhere in this file that converts
 * between MilliIU and Microgram. IU protocols must stay in IU end to end.
 *
 * Rounding: values are rounded only at the final step before they're displayed
 * or used to size a physical draw — never in the middle of a calculation.
 * "Toward the safer value" (per the brief) is applied as one consistent rule
 * throughout the app: never round in a direction that overstates how much a
 * person has taken, is about to take, or has left. Concretely:
 *   - a volume/syringe reading to actually draw rounds DOWN to the nearest
 *     graduation the syringe can show (never round a draw up to more).
 *   - a count of doses remaining in a vial rounds DOWN (never claim more
 *     supply than truly remains).
 *   - reflecting a value the user themselves typed (e.g. showing their
 *     entered vial size back to them) rounds to NEAREST — there's no
 *     under/over direction to be safe about, it's just display precision.
 * Callers (reconstitution.ts, schedule.ts, UI) choose the direction per call;
 * this file only supplies the primitive.
 */

export type Microgram = number & { readonly __unit: 'Microgram' }
export type Microliter = number & { readonly __unit: 'Microliter' }
export type MilliIU = number & { readonly __unit: 'MilliIU' }

export type MassUnit = 'mg' | 'mcg'
export type SyringeType = 'U-100' | 'U-50' | 'U-40'
export type Locale = 'es-CR' | 'en'
export type RoundDirection = 'down' | 'up' | 'nearest'

const MCG_PER_MG = 1000
const UL_PER_ML = 1000
const MILLI_IU_PER_IU = 1000

const SYRINGE_UNITS_PER_ML: Record<SyringeType, number> = {
  'U-100': 100,
  'U-50': 50,
  'U-40': 40,
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`)
  }
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label)
  if (value < 0) {
    throw new RangeError(`${label} must not be negative, got ${value}`)
  }
}

/** The one rounding primitive. Every other rounding call in the app goes through this. */
export function roundInt(value: number, direction: RoundDirection = 'nearest'): number {
  assertFinite(value, 'value')
  switch (direction) {
    case 'down':
      return Math.floor(value)
    case 'up':
      return Math.ceil(value)
    case 'nearest':
      return Math.round(value)
  }
}

// ---------------------------------------------------------------------------
// Mass
// ---------------------------------------------------------------------------

export function microgramsFromMg(mg: number, direction: RoundDirection = 'nearest'): Microgram {
  assertNonNegative(mg, 'mg')
  return roundInt(mg * MCG_PER_MG, direction) as Microgram
}

export function mgFromMicrograms(mcg: Microgram): number {
  return mcg / MCG_PER_MG
}

/** Converts a user-facing mass amount (in either mg or mcg) to stored integer micrograms. */
export function microgramsFromMass(
  amount: number,
  unit: MassUnit,
  direction: RoundDirection = 'nearest',
): Microgram {
  if (unit === 'mcg') {
    assertNonNegative(amount, 'amount')
    return roundInt(amount, direction) as Microgram
  }
  return microgramsFromMg(amount, direction)
}

/** Converts stored integer micrograms back to a display amount in the requested unit. */
export function massFromMicrograms(mcg: Microgram, unit: MassUnit): number {
  return unit === 'mcg' ? mcg : mgFromMicrograms(mcg)
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export function microlitersFromMl(ml: number, direction: RoundDirection = 'nearest'): Microliter {
  assertNonNegative(ml, 'ml')
  return roundInt(ml * UL_PER_ML, direction) as Microliter
}

export function mlFromMicroliters(ul: Microliter): number {
  return ul / UL_PER_ML
}

// ---------------------------------------------------------------------------
// IU — compound-specific potency units. No mass conversion exists on purpose.
// ---------------------------------------------------------------------------

export function milliIUFromIU(iu: number, direction: RoundDirection = 'nearest'): MilliIU {
  assertNonNegative(iu, 'iu')
  return roundInt(iu * MILLI_IU_PER_IU, direction) as MilliIU
}

export function iuFromMilliIU(mIu: MilliIU): number {
  return mIu / MILLI_IU_PER_IU
}

// ---------------------------------------------------------------------------
// Syringes — a syringe "unit" is a volume, not a mass. U-100 = 100 units/mL,
// so 1 unit = 10 µL; U-50 = 20 µL/unit; U-40 = 25 µL/unit.
// ---------------------------------------------------------------------------

export function syringeUnitsPerMl(type: SyringeType): number {
  return SYRINGE_UNITS_PER_ML[type]
}

export function microlitersPerSyringeUnit(type: SyringeType): number {
  return UL_PER_ML / SYRINGE_UNITS_PER_ML[type]
}

/** Exact (possibly fractional) syringe-unit reading for a volume. Not rounded — see quantizeVolumeToSyringe. */
export function syringeUnitsFromMicroliters(ul: Microliter, type: SyringeType): number {
  return ul / microlitersPerSyringeUnit(type)
}

export function microlitersFromSyringeUnits(
  units: number,
  type: SyringeType,
  direction: RoundDirection = 'nearest',
): Microliter {
  assertNonNegative(units, 'units')
  return roundInt(units * microlitersPerSyringeUnit(type), direction) as Microliter
}

/**
 * Snaps a raw (possibly fractional) volume to the nearest graduation an actual
 * syringe of this type can show — i.e. the nearest whole syringe unit. Use
 * `direction: 'down'` when the result will tell someone what to draw.
 */
export function quantizeVolumeToSyringe(
  ul: number,
  type: SyringeType,
  direction: RoundDirection = 'down',
): Microliter {
  assertNonNegative(ul, 'ul')
  const perUnit = microlitersPerSyringeUnit(type)
  const wholeUnits = roundInt(ul / perUnit, direction)
  return (wholeUnits * perUnit) as Microliter
}

// ---------------------------------------------------------------------------
// Locale-aware decimal parsing / formatting
// ---------------------------------------------------------------------------
//
// Parsing is deliberately locale-BLIND: it accepts either ',' or '.' as the
// decimal separator and infers which one from the input itself, never from
// the active locale. Reasoning: on a dosing app, misreading a typed decimal
// point as a thousands separator (or vice versa) silently multiplies or
// divides a dose by ~1000. A phone's numeric keyboard produces whatever
// separator its own OS locale uses, which will not always match the app's
// locale — a user can be running the app in es-CR with a device keyboard that
// still types a period. Rule: if both separators appear, the rightmost one is
// the decimal point (matches both "1.234,56" and "1,234.56" conventions); if
// only one appears, treat it as the decimal point, never as grouping — real
// doses in this app are never large enough to need thousands grouping typed
// by hand. Flagged in NOTES.md as a deliberate deviation from a strict
// locale-driven parse; worth the client's sign-off.
//
// Formatting (output the app controls) stays strictly locale-driven, per the
// brief: es-CR uses a comma decimal separator, en uses a period.

const DECIMAL_SEPARATOR: Record<Locale, string> = {
  'es-CR': ',',
  en: '.',
}

export function parseDecimal(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '' || !/^-?[\d.,]+$/.test(trimmed)) return null

  const lastComma = trimmed.lastIndexOf(',')
  const lastDot = trimmed.lastIndexOf('.')
  let normalized: string
  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed
  } else if (lastComma > lastDot) {
    normalized = trimmed.split('.').join('').replace(',', '.')
  } else {
    normalized = trimmed.split(',').join('')
  }

  // Reject anything left with more than one decimal point (e.g. "1.2.3") or
  // a leftover separator character.
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatDecimal(value: number, locale: Locale, maximumFractionDigits = 2): string {
  assertFinite(value, 'value')
  const fixed = value.toFixed(maximumFractionDigits)
  const trimmed =
    maximumFractionDigits > 0 ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return DECIMAL_SEPARATOR[locale] === ',' ? trimmed.replace('.', ',') : trimmed
}

// ---------------------------------------------------------------------------
// Display helpers — thin wrappers that pick sensible decimal places per kind.
// ---------------------------------------------------------------------------

export function formatMass(mcg: Microgram, unit: MassUnit, locale: Locale): string {
  return formatDecimal(massFromMicrograms(mcg, unit), locale, unit === 'mcg' ? 0 : 3)
}

export function formatVolumeMl(ul: Microliter, locale: Locale): string {
  return formatDecimal(mlFromMicroliters(ul), locale, 2)
}

export function formatSyringeUnits(units: number, locale: Locale): string {
  return formatDecimal(units, locale, 1)
}

export function formatIU(mIu: MilliIU, locale: Locale): string {
  return formatDecimal(iuFromMilliIU(mIu), locale, 2)
}

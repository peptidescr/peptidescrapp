/**
 * The preset chips of the reconstitution calculator (Vial mass 2 / 5 / 10 / 15 /
 * 50 mg, Diluent volume 1 / 2 / 3 / 5 mL, Target aliquot 100 / 250 / 500 / 1000
 * mcg), and which chips a compound gets.
 *
 * The presets are conveniences, not suggestions: nothing is preselected, and
 * "Custom" on every row opens the free numeric input, so any value the old
 * calculator took still works. A compound's own vial sizes are added to the vial
 * row so its real vials (Tirzepatide 60 mg, HGH 24 IU) are always one tap away.
 */
import type { CompoundUnit } from '../content/compounds'

export const MASS_PRESETS_MG = [2, 5, 10, 15, 50] as const
/** For a compound sold in micrograms (custom compounds can be). */
export const MASS_PRESETS_MCG = [500, 1000, 2500, 5000, 10000] as const
export const DILUENT_PRESETS_ML = [1, 2, 3, 5] as const
export const DOSE_PRESETS_MCG = [100, 250, 500, 1000] as const

/** What a vial row's values are measured in: the compound's own unit, or mL for a ready-made solution. */
export type VialUnit = CompoundUnit | 'mL'

/** Sorted, de-duplicated. */
function union(...lists: readonly (readonly number[])[]): number[] {
  return [...new Set(lists.flat())].sort((a, b) => a - b)
}

/**
 * The values on the vial row for a compound. Mass compounds get the generic
 * presets plus their own sizes; IU compounds and ready-made solutions (bottle
 * volume, in mL) have no generic presets — a preset IU or mL amount would mean
 * something different for each product — so they get only their own sizes.
 */
export function vialChipValues(unit: VialUnit, compoundSizes: readonly number[]): number[] {
  if (unit === 'mg') return union(MASS_PRESETS_MG, compoundSizes)
  if (unit === 'mcg') return union(MASS_PRESETS_MCG, compoundSizes)
  return union(compoundSizes)
}

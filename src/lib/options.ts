import type { ComboboxOption } from '@/components/ui/combobox'
import { compareAlphabetical } from '../content/compounds'

/** Builds dropdown options from a list of values, labelled and ordered alphabetically by label (the app's rule for every picker). */
export function alphabeticalOptions<T extends string>(values: readonly T[], labelFor: (value: T) => string): ComboboxOption[] {
  return values
    .map((value) => ({ value, label: labelFor(value) }))
    .sort((a, b) => compareAlphabetical(a.label, b.label))
}

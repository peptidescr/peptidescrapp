import type { TFunction } from 'i18next'
import type { Symptom } from './results'

/** A symptom's display name: the user's own, or the built-in's translation. */
export function symptomName(symptom: Symptom, t: TFunction): string {
  return symptom.name ?? t(`symptoms.${symptom.id}`)
}

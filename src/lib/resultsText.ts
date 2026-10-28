import type { TFunction } from 'i18next'
import { BASELINE_KEY } from './progressCharts'
import { CHECK_IN_SCALES, type CheckIn, type Symptom } from './results'

/** A symptom's display name: the user's own, or the built-in's translation. */
export function symptomName(symptom: Symptom, t: TFunction): string {
  return symptom.name ?? t(`symptoms.${symptom.id}`)
}

const NBSP = String.fromCharCode(0xa0)

/** A dose step's name in charts: "2.5 mg" (kept on one line), or "Before first dose". */
export function stepLabel(step: { key: string }, t: TFunction): string {
  return step.key === BASELINE_KEY ? t('charts.beforeFirstDose') : step.key.replace(' ', NBSP)
}

/** "Energy 4 · Mood 3 · Nausea (Mild)" — what a check-in recorded, in one line. */
export function checkInSummary(c: CheckIn, symptoms: readonly Symptom[], t: TFunction): string {
  const parts: string[] = []
  for (const scale of CHECK_IN_SCALES) {
    if (c[scale]) parts.push(`${t(`checkIn.${scale}.label`)} ${c[scale]}`)
  }
  for (const [id, severity] of Object.entries(c.sideEffects ?? {})) {
    const symptom = symptoms.find((s) => s.id === id) ?? { id, name: t('symptoms.removed') }
    parts.push(`${symptomName(symptom, t)} (${t(`severity.${['', 'mild', 'moderate', 'severe'][severity]}`)})`)
  }
  if (c.note) parts.push(t('progress.hasNote'))
  return parts.length ? parts.join(' · ') : t('progress.emptyCheckIn')
}

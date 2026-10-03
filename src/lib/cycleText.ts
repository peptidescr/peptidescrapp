import { addDays } from 'date-fns'
import type { TFunction } from 'i18next'
import { formatDate } from './dates'
import type { CyclePhase } from './schedule'

/** "Off · week 2 of 4 · resumes 03/11/2026" — where a weeks-cycle protocol stands. */
export function cyclePhaseText(phase: CyclePhase, t: TFunction): string {
  const { week, weeks } = phase
  switch (phase.phase) {
    case 'on':
      return phase.totalCycles
        ? t('cycle.onOf', { week, weeks, cycle: phase.cycle, total: phase.totalCycles })
        : t('cycle.on', { week, weeks })
    case 'off':
      return t('cycle.off', { week, weeks, date: formatDate(phase.nextPhaseOn!) })
    case 'washout':
      // nextPhaseOn is the first day after it; people read "ends" as its last day.
      return t('cycle.washout', { week, weeks, date: formatDate(addDays(phase.nextPhaseOn!, -1)) })
    case 'done':
      return t('cycle.done')
  }
}

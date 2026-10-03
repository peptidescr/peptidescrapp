import type { TFunction } from 'i18next'

/** "rested 3 days", "used today", "not used yet" — from siteRest's restDays. */
export function restText(restDays: number | null, t: TFunction): string {
  if (restDays === null) return t('sites.neverUsed')
  if (restDays === 0) return t('sites.usedToday')
  return t('sites.restedDays', { count: restDays })
}

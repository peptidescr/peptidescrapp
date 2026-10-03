/**
 * Words for vials: an amount with its unit, and one sentence per alert. Kept
 * in one place so Home, the bell panel and notifications always describe a
 * vial the same way.
 */
import type { TFunction } from 'i18next'
import { getCompoundById } from '../content/compounds'
import { BRAND } from '../brand'
import { formatDate } from './dates'
import { orderByDate, sparesOf } from './reorder'
import { formatDecimal, iuFromMilliIU, type Locale, type MilliIU } from './units'
import type { VialAlert, VialKind } from './vials'

/** "4.5 mg", "450 mcg", "10 IU" — mass switches to mcg below 1 mg so small amounts stay readable. */
export function formatVialAmount(amount: number, kind: VialKind, locale: Locale): string {
  if (kind === 'iu') return `${formatDecimal(iuFromMilliIU(amount as MilliIU), locale, 2)} IU`
  if (amount >= 1000) return `${formatDecimal(amount / 1000, locale, 3)} mg`
  return `${formatDecimal(amount, locale, 0)} mcg`
}

function whenText(daysUntil: number, t: TFunction): string {
  if (daysUntil <= 0) return t('vialAlerts.whenToday')
  if (daysUntil === 1) return t('vialAlerts.whenTomorrow')
  return t('vialAlerts.whenInDays', { count: daysUntil })
}

/** The one-line description of an alert, named after the protocol (or compound, for a vial without one). */
export function describeVialAlert(alert: VialAlert, t: TFunction): string {
  const base = describeAlertOnly(alert, t)
  if (alert.kind !== 'lowStock' && alert.kind !== 'empty') return base
  // Stock alerts say what's to hand: unopened vials, or — once the shipping
  // time is known (BRAND.shippingDays) — the last day to order.
  const spares = sparesOf(alert.protocol)
  if (spares > 0) return `${base} ${t('vialAlerts.sparesOnHand', { count: spares })}`
  const orderBy = orderByDate(alert.lastDoseOn, BRAND.shippingDays)
  return orderBy ? `${base} ${t('vialAlerts.orderBy', { date: formatDate(orderBy) })}` : base
}

function describeAlertOnly(alert: VialAlert, t: TFunction): string {
  const name = alert.protocol?.name || getCompoundById(alert.vial.compoundId)?.name || ''
  switch (alert.kind) {
    case 'empty':
      return t('vialAlerts.empty', { name })
    case 'lowStock':
      // Days are the more useful framing when the last dose is close; the count otherwise.
      return alert.lastDoseOn && (alert.dosesLeft ?? 0) > 3
        ? t('vialAlerts.lowStockUntil', { name, date: formatDate(alert.lastDoseOn) })
        : t('vialAlerts.lowStock', { name, count: alert.dosesLeft ?? 0 })
    case 'discardSoon':
      return t('vialAlerts.discardSoon', { name, when: whenText(alert.daysUntil ?? 0, t) })
    case 'discardPassed':
      return t('vialAlerts.discardPassed', { name })
    case 'expirySoon':
      return t('vialAlerts.expirySoon', { name, when: whenText(alert.daysUntil ?? 0, t) })
    case 'expired':
      return t('vialAlerts.expired', { name })
  }
}

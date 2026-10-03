/**
 * The reorder loop (Tier 1 #4, the first piece of Phase 3): when a vial runs
 * low or empty and there are no unopened vials left, point the customer
 * straight at the product on the brand's own store — the moment they'd
 * otherwise go looking for a supplier.
 *
 * The link comes from the store catalogue the app already syncs
 * (Compound.storeProducts, src/lib/storeCatalogue.ts), so nothing is written
 * to the store and no customer data leaves the device: it's an ordinary link.
 *
 * "Order by <date>" needs the brand's shipping time. Until the client confirms
 * it (BrandConfig.shippingDays), no date is shown — only the button.
 */
import { addDays } from 'date-fns'
import { getCompoundById, vialSizeUnit, type StoreProductRef } from '../content/compounds'
import type { Protocol, Vial } from './db'
import type { VialAlert } from './vials'

/** The most unopened vials one protocol can have on record. */
export const MAX_SPARE_VIALS = 99

/** A vial's starting amount in its compound's vial-size unit (the unit store product sizes are in). */
function vialSize(vial: Vial): number | undefined {
  const compound = getCompoundById(vial.compoundId)
  if (!compound) return undefined
  const unit = vialSizeUnit(compound)
  if (unit === 'IU') return vial.totalMilliIU !== undefined ? vial.totalMilliIU / 1000 : undefined
  if (unit === 'mg') return vial.totalMcg !== undefined ? vial.totalMcg / 1000 : undefined
  if (unit === 'mcg') return vial.totalMcg
  return undefined
}

/**
 * The store product to reorder for a compound: the same vial size in stock,
 * then the same size, then anything in stock, then anything — as long as it
 * has a link. Null when the store doesn't sell it.
 */
export function reorderProduct(compoundId: string, vial?: Vial): StoreProductRef | null {
  const products = getCompoundById(compoundId)?.storeProducts?.filter((p) => p.url) ?? []
  if (products.length === 0) return null
  const size = vial ? vialSize(vial) : undefined
  return (
    products.find((p) => p.size === size && p.inStock) ??
    products.find((p) => p.size === size) ??
    products.find((p) => p.inStock) ??
    products[0]!
  )
}

/** Unopened vials on hand for a protocol. */
export function sparesOf(protocol: Pick<Protocol, 'spareVials'> | undefined): number {
  return protocol?.spareVials ?? 0
}

/** A stock alert with nothing unopened left to fall back on: the moment to reorder. */
export function shouldNudgeReorder(alert: VialAlert): boolean {
  return (alert.kind === 'lowStock' || alert.kind === 'empty') && sparesOf(alert.protocol) === 0
}

/** The last day to order and still have it arrive in time; null until a shipping time is known. */
export function orderByDate(lastDoseOn: Date | undefined, shippingDays: number | undefined): Date | null {
  if (!lastDoseOn || shippingDays === undefined) return null
  return addDays(lastDoseOn, -shippingDays)
}

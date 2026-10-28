import { afterEach, describe, expect, it } from 'vitest'
import { COMPOUNDS, setStoreCompounds, type Compound } from '../content/compounds'
import type { Protocol, Vial } from './db'
import { orderByDate, reorderProduct, shouldNudgeReorder, sparesOf } from './reorder'
import type { VialAlert } from './vials'

afterEach(() => setStoreCompounds([]))

const tirz = COMPOUNDS.find((c) => c.id === 'tirzepatide')!
const store: Compound = {
  ...tirz,
  source: 'store',
  listed: true,
  storeProducts: [
    { label: 'Tirzepatide 10mg', slug: 'tirz-10', size: 10, inStock: false, url: 'https://shop.example/tirz-10' },
    { label: 'Tirzepatide 30mg', slug: 'tirz-30', size: 30, inStock: true, url: 'https://shop.example/tirz-30' },
    { label: 'Tirzepatide 60mg', slug: 'tirz-60', size: 60, inStock: true },
  ],
}
const vial = (mg: number): Vial => ({
  id: 'v',
  compoundId: 'tirzepatide',
  totalMcg: mg * 1000,
  openedOn: '2026-01-01',
  status: 'active',
  createdAt: 'x',
  updatedAt: 'x',
})
const protocol = (spareVials?: number): Protocol => ({
  id: 'p',
  name: '',
  compoundId: 'tirzepatide',
  doseAmount: 2.5,
  doseUnit: 'mg',
  schedule: { kind: 'daily' },
  reminderTimes: ['09:00'],
  startDate: '2026-01-01',
  route: 'subcutaneous',
  isActive: true,
  spareVials,
})

describe('reorderProduct', () => {
  it('prefers the same vial size, even out of stock, over a different size', () => {
    setStoreCompounds([store])
    expect(reorderProduct('tirzepatide', vial(10))?.slug).toBe('tirz-10')
    expect(reorderProduct('tirzepatide', vial(30))?.slug).toBe('tirz-30')
  })

  it('falls back to something in stock with a link', () => {
    setStoreCompounds([store])
    expect(reorderProduct('tirzepatide', vial(60))?.slug).toBe('tirz-30') // the 60mg has no link
    expect(reorderProduct('tirzepatide')?.slug).toBe('tirz-30')
  })

  it('is null when the store does not sell it', () => {
    expect(reorderProduct('tirzepatide', vial(10))).toBeNull()
    expect(reorderProduct('custom-x')).toBeNull()
  })
})

describe('when to nudge', () => {
  const alert = (kind: VialAlert['kind'], spares?: number): VialAlert => ({ kind, vial: vial(10), protocol: protocol(spares) })

  it('nudges on low or empty stock with nothing unopened left', () => {
    expect(shouldNudgeReorder(alert('lowStock'))).toBe(true)
    expect(shouldNudgeReorder(alert('empty', 0))).toBe(true)
    expect(shouldNudgeReorder(alert('lowStock', 2))).toBe(false)
    expect(shouldNudgeReorder(alert('discardSoon'))).toBe(false)
    expect(sparesOf(undefined)).toBe(0)
  })

  it('gives an order-by date only once a shipping time is known', () => {
    const last = new Date(2026, 2, 20)
    expect(orderByDate(last, undefined)).toBeNull()
    expect(orderByDate(last, 5)).toEqual(new Date(2026, 2, 15))
    expect(orderByDate(undefined, 5)).toBeNull()
  })
})

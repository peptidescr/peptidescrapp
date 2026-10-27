import { describe, expect, it } from 'vitest'
import {
  categoriesOf,
  descriptionFor,
  filterProducts,
  formatPrice,
  loadShopCatalogue,
  parseShopProducts,
  type ShopProduct,
} from './catalogue'

const response = (products: unknown[], over: Record<string, unknown> = {}) => ({
  version: 1,
  brand: 'upd',
  fetchedAt: '2026-10-27T10:00:00.000Z',
  products,
  ...over,
})

describe('parseShopProducts', () => {
  it('keeps the shop fields, and only https links', () => {
    const [p] =
      parseShopProducts(
        response([
          {
            name: 'BPC-157 5mg',
            slug: 'bpc-157-5mg',
            inStock: true,
            price: { currency: 'USD', amount: 45 },
            regularPrice: { currency: 'USD', amount: 55 },
            imageUrl: 'https://example.com/a.png',
            coaUrl: 'javascript:alert(1)',
            stock: 7,
          },
        ]),
        'upd',
      ) ?? []
    expect(p).toMatchObject({ name: 'BPC-157 5mg', price: { currency: 'USD', amount: 45 }, regularPrice: { amount: 55 }, stock: 7 })
    expect(p?.imageUrl).toBe('https://example.com/a.png')
    expect(p?.coaUrl).toBeUndefined()
  })

  it('drops a "was" price that is not higher, or in another currency', () => {
    const parse = (regularPrice: unknown) =>
      parseShopProducts(response([{ name: 'A', slug: 'a', inStock: true, price: { currency: 'USD', amount: 45 }, regularPrice }]), 'upd')?.[0]
    expect(parse({ currency: 'USD', amount: 45 })?.regularPrice).toBeUndefined()
    expect(parse({ currency: 'CRC', amount: 99999 })?.regularPrice).toBeUndefined()
  })

  it('rejects another brand\'s catalogue or an unknown version whole', () => {
    expect(parseShopProducts(response([]), 'pcr')).toBeNull()
    expect(parseShopProducts(response([], { version: 2 }), 'upd')).toBeNull()
  })

  it('skips a product without a name, and prices that are not prices', () => {
    const list = parseShopProducts(
      response([{ slug: 'x', inStock: true }, { name: 'B', slug: 'b', inStock: true, price: { currency: 'EUR', amount: 5 } }]),
      'upd',
    )
    expect(list).toHaveLength(1)
    expect(list?.[0]?.price).toBeUndefined()
  })
})

describe('formatPrice', () => {
  it('shows whole dollars without cents and colones never with decimals', () => {
    expect(formatPrice({ currency: 'USD', amount: 79 }, 'en')).toBe('$79')
    expect(formatPrice({ currency: 'USD', amount: 79.5 }, 'en')).toBe('$79.50')
    expect(formatPrice({ currency: 'CRC', amount: 70176 }, 'es-CR')).toMatch(/^₡\s?70\s?176$/u)
  })
})

describe('descriptionFor', () => {
  const p: ShopProduct = { name: 'A', slug: 'a', inStock: true, description: 'store text', descriptionEs: 'texto' }
  it('prefers the reader\'s language, then the store\'s own text', () => {
    expect(descriptionFor(p, 'es-CR')).toBe('texto')
    expect(descriptionFor(p, 'en')).toBe('store text')
    expect(descriptionFor({ name: 'A', slug: 'a', inStock: true, descriptionEs: 'texto' }, 'en')).toBe('texto')
  })
})

describe('filtering', () => {
  const products: ShopProduct[] = [
    { name: 'Tirzepatide 10mg', slug: 't10', inStock: false, category: 'Metabolic' },
    { name: 'Tirzepatide 5mg', slug: 't5', inStock: true, category: 'Metabolic' },
    { name: 'GHK-Cu 50mg', slug: 'ghk', inStock: true, category: 'Péptidos de cobre' },
    { name: 'Semaglutide 5mg', slug: 's5', inStock: true, category: 'Metabolic' },
  ]

  it('lists categories by size, then name', () => {
    expect(categoriesOf(products)).toEqual(['Metabolic', 'Péptidos de cobre'])
  })

  it('searches every word, ignoring case and accents, and puts in-stock first', () => {
    expect(filterProducts(products, { query: 'tirz' }).map((p) => p.slug)).toEqual(['t5', 't10'])
    expect(filterProducts(products, { query: 'peptidos cobre' }).map((p) => p.slug)).toEqual(['ghk'])
    expect(filterProducts(products, { category: 'Metabolic' }).map((p) => p.slug)).toEqual(['s5', 't5', 't10'])
  })
})

describe('loadShopCatalogue', () => {
  it('ends in an error state, not a throw, when the request fails', async () => {
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(loadShopCatalogue('upd', failing)).resolves.toBeUndefined()
  })
})

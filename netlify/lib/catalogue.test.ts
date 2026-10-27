import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  decodeStoreText,
  fetchPcrPartnerProducts,
  fetchPcrProducts,
  fromPcrPartnerProduct,
  fetchUpdProducts,
  fromUpdProduct,
  fromWooProduct,
  handleCatalogueRequest,
  toCatalogueBrand,
  type CatalogueResponse,
  type FetchLike,
} from './catalogue.ts'

// Trimmed from the stores' real responses (October 2026).
const pcrFixture: unknown[] = JSON.parse(readFileSync(new URL('./fixtures/pcr-products.json', import.meta.url), 'utf8'))
const updFixture: unknown = JSON.parse(readFileSync(new URL('./fixtures/upd-products.json', import.meta.url), 'utf8'))

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } })
}

describe('decodeStoreText', () => {
  it('turns HTML-escaped store text back into plain text', () => {
    expect(decodeStoreText('Copper &amp; Dermatological Peptides')).toBe('Copper & Dermatological Peptides')
    expect(decodeStoreText('A &#8211; B &#x2014; C')).toBe('A – B — C')
    expect(decodeStoreText('<b>Bold</b>  name\n')).toBe('Bold name')
    expect(decodeStoreText('&unknown; &#0;')).toBe('&unknown;')
  })
})

describe('fromWooProduct', () => {
  it('flattens a real Peptides CR product', () => {
    const ghk = pcrFixture.find((p) => (p as { name: string }).name === 'GHK-CU 50mg')
    expect(fromWooProduct(ghk)).toEqual({
      name: 'GHK-CU 50mg',
      slug: 'ghk-cu-50mg',
      sku: 'GHK-CU-50MG',
      category: 'Collagen Peptides',
      inStock: true,
      url: 'https://peptidescostarica.net/product/ghk-cu-50mg/',
      id: '146',
    })
  })

  it('keeps a product the store files under no category', () => {
    const lipo = pcrFixture.find((p) => (p as { name: string }).name === 'Lipotropic Blend 10ml')
    expect(fromWooProduct(lipo)).toMatchObject({ name: 'Lipotropic Blend 10ml', slug: 'fat-blaster-10ml' })
    expect(fromWooProduct(lipo)?.category).toBeUndefined()
  })

  it('rejects anything without a name and slug, and drops non-https links', () => {
    expect(fromWooProduct(null)).toBeNull()
    expect(fromWooProduct({ name: 'X' })).toBeNull()
    expect(fromWooProduct({ name: 'X', slug: 'x', permalink: 'javascript:alert(1)' })).toEqual({
      name: 'X',
      slug: 'x',
      inStock: false,
    })
  })
})

describe('fromUpdProduct', () => {
  it('flattens a real USA Peptide Depot product and links its product page', () => {
    const [first] = (updFixture as { data: { products: unknown[] } }).data.products
    expect(fromUpdProduct(first)).toEqual({
      name: 'BPC-157 5mg',
      slug: 'bpc-157-5mg',
      orderRef: 'bpc-157-5mg',
      sku: 'USP-BPC157-5',
      category: 'Extracellular Matrix and Cell-Migration Peptides',
      inStock: true,
      url: 'https://www.usapeptidedepot.com/product/bpc-157-5mg',
      id: 'ccd695b8-0a3f-4669-bba7-33fbdfc4ae26',
      price: { currency: 'USD', amount: 45 },
    })
  })

  it('skips hidden or inactive products and unsafe slugs', () => {
    const base = { name: 'A 5mg', slug: 'a-5mg', in_stock: true }
    expect(fromUpdProduct({ ...base, is_hidden: true })).toBeNull()
    expect(fromUpdProduct({ ...base, is_active: false })).toBeNull()
    expect(fromUpdProduct({ ...base, slug: '../admin' })).toBeNull()
  })
})

describe('shop fields', () => {
  const woo = {
    id: 35150,
    name: 'Semax + Selank 20mg',
    slug: 'semax-selank-20mg',
    is_in_stock: true,
    low_stock_remaining: 3,
    prices: { price: '63000', regular_price: '70176', currency_code: 'CRC', currency_minor_unit: 0 },
    images: [{ src: 'https://peptidescostarica.net/a.webp', thumbnail: 'https://peptidescostarica.net/a-300x300.webp' }],
    short_description: '<p>A dual-peptide &amp; research blend.</p>',
  }

  it('reads a WooCommerce price in its own currency, with the list price only when it is a markdown', () => {
    const product = fromWooProduct(woo)
    expect(product?.price).toEqual({ currency: 'CRC', amount: 63000 })
    expect(product?.regularPrice).toEqual({ currency: 'CRC', amount: 70176 })
    const notOnSale = fromWooProduct({ ...woo, prices: { ...woo.prices, price: '70176' } })
    expect(notOnSale?.regularPrice).toBeUndefined()
  })

  it('scales minor units, and ignores a currency it does not know', () => {
    const usd = fromWooProduct({ ...woo, prices: { price: '4500', regular_price: '4500', currency_code: 'USD', currency_minor_unit: 2 } })
    expect(usd?.price).toEqual({ currency: 'USD', amount: 45 })
    const eur = fromWooProduct({ ...woo, prices: { price: '4500', currency_code: 'EUR', currency_minor_unit: 2 } })
    expect(eur?.price).toBeUndefined()
  })

  it('keeps the image, a plain-text description and the stock count', () => {
    const product = fromWooProduct(woo)
    expect(product?.imageUrl).toBe('https://peptidescostarica.net/a.webp')
    expect(product?.thumbnailUrl).toBe('https://peptidescostarica.net/a-300x300.webp')
    expect(product?.description).toBe('A dual-peptide & research blend.')
    expect(product?.stock).toBe(3)
  })

  const upd = {
    id: '5ef7f684-40c9-424e-a15c-d42cd6288623',
    slug: '5-amino-1-mq',
    name: '5 Amino 1 MQ 50mg',
    price: 79,
    sale_price: 69,
    in_stock: true,
    stock_count: 50,
    image: 'https://example.supabase.co/storage/v1/object/public/product-media/a.png',
    description_en: 'For research.',
    description_es: 'Para investigación.',
    coa_url: 'https://example.com/coa.pdf',
  }

  it('reads a UPD sale as the price now, with the list price as the "was" price', () => {
    const product = fromUpdProduct(upd)
    expect(product?.price).toEqual({ currency: 'USD', amount: 69 })
    expect(product?.regularPrice).toEqual({ currency: 'USD', amount: 79 })
    expect(fromUpdProduct({ ...upd, sale_price: null })?.price).toEqual({ currency: 'USD', amount: 79 })
  })

  it('keeps UPD\'s image, descriptions in both languages, stock and COA', () => {
    const product = fromUpdProduct(upd)
    expect(product?.imageUrl).toBe(upd.image)
    expect(product?.descriptionEn).toBe('For research.')
    expect(product?.descriptionEs).toBe('Para investigación.')
    expect(product?.stock).toBe(50)
    expect(product?.coaUrl).toBe('https://example.com/coa.pdf')
  })

  it('drops prices that are not positive numbers, and links that are not https', () => {
    for (const price of [0, -5, 'abc', null, 1e12]) {
      expect(fromUpdProduct({ ...upd, sale_price: null, price })?.price).toBeUndefined()
    }
    const unsafe = fromUpdProduct({ ...upd, image: 'javascript:alert(1)', coa_url: 'http://example.com/coa.pdf' })
    expect(unsafe?.imageUrl).toBeUndefined()
    expect(unsafe?.coaUrl).toBeUndefined()
  })
})

describe('fetchers', () => {
  it('pages through WooCommerce until X-WP-TotalPages', async () => {
    const urls: string[] = []
    const fetchFn: FetchLike = async (url) => {
      urls.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return json(page === 1 ? pcrFixture.slice(0, 5) : pcrFixture.slice(5), { 'X-WP-TotalPages': '2' })
    }
    const products = await fetchPcrProducts(fetchFn)
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe('https://peptidescostarica.net/wp-json/wc/store/v1/products?per_page=100&page=1')
    expect(products).toHaveLength(pcrFixture.length)
  })

  it('reads the UPD endpoint', async () => {
    const products = await fetchUpdProducts(async () => json(updFixture))
    expect(products.map((p) => p.slug)).toContain('glp3-10mg')
    expect(products).toHaveLength(7)
  })

  it('throws on an unexpected shape or a failed request', async () => {
    await expect(fetchUpdProducts(async () => json({ products: [] }))).rejects.toThrow()
    await expect(fetchPcrProducts(async () => new Response('nope', { status: 500 }))).rejects.toThrow()
  })
})

describe('handleCatalogueRequest', () => {
  const now = new Date('2026-10-02T12:00:00Z')

  it('returns the brand, a timestamp and the products, cached at the edge', async () => {
    const res = await handleCatalogueRequest('upd', async () => json(updFixture), now)
    expect(res.status).toBe(200)
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toContain('s-maxage=3600')
    const body = (await res.json()) as CatalogueResponse
    expect(body).toMatchObject({ version: 1, brand: 'upd', fetchedAt: '2026-10-02T12:00:00.000Z' })
    expect(body.products).toHaveLength(7)
  })

  it('answers 502, uncached, when the store fails or returns nothing', async () => {
    const failed = await handleCatalogueRequest('pcr', async () => new Response('down', { status: 503 }), now)
    expect(failed.status).toBe(502)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    const empty = await handleCatalogueRequest('pcr', async () => json([]), now)
    expect(empty.status).toBe(502)
  })

  it('defaults an unset or unknown brand to upd, like the build does', () => {
    expect(toCatalogueBrand(undefined)).toBe('upd')
    expect(toCatalogueBrand('pcr')).toBe('pcr')
    expect(toCatalogueBrand('PCR')).toBe('upd')
  })
})

// The partner API's documented product shape (partner integration doc, October 2026); not yet a real response.
const partnerProduct = (over: Record<string, unknown> = {}) => ({
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Sermorelin 10mg',
  category: 'Peptides',
  status: 'In Stock',
  inStock: true,
  stock: 4,
  priceUsd: 150,
  priceCrc: 75750,
  originalPriceUsd: null,
  discount: null,
  coa: 'https://example.com/coa.pdf',
  imageUrl: 'https://example.com/sermorelin.png',
  descriptionEn: 'English text',
  descriptionEs: 'Texto en español',
  ...over,
})

describe('Peptides CR partner products', () => {
  it('maps the documented shape, priced in USD, ordered by id', () => {
    expect(fromPcrPartnerProduct(partnerProduct({ originalPriceUsd: 180 }))).toEqual({
      name: 'Sermorelin 10mg',
      slug: 'sermorelin-10mg',
      id: '11111111-2222-4333-8444-555555555555',
      orderRef: '11111111-2222-4333-8444-555555555555',
      category: 'Peptides',
      inStock: true,
      stock: 4,
      price: { currency: 'USD', amount: 150 },
      regularPrice: { currency: 'USD', amount: 180 },
      imageUrl: 'https://example.com/sermorelin.png',
      thumbnailUrl: 'https://example.com/sermorelin.png',
      descriptionEn: 'English text',
      descriptionEs: 'Texto en español',
      coaUrl: 'https://example.com/coa.pdf',
    })
  })

  it('sends the partner key, reads a bare or wrapped list, and keeps same-named products apart', async () => {
    const seen: (Record<string, string> | undefined)[] = []
    const twins = [partnerProduct(), partnerProduct({ id: 'aaaaaaaa-0000-0000-0000-000000000000' })]
    const products = await fetchPcrPartnerProducts(async (_url, init) => {
      seen.push(init?.headers)
      return json({ products: twins })
    }, 'pk_sandbox_test-not-real')
    expect(seen[0]?.['X-Partner-Key']).toBe('pk_sandbox_test-not-real')
    expect(products.map((p) => p.slug)).toEqual(['sermorelin-10mg', 'sermorelin-10mg-aaaaaaaa'])
    expect(await fetchPcrPartnerProducts(async () => json(twins), 'k')).toHaveLength(2)
  })

  it('falls back to the public feed, browse only, when the partner API fails', async () => {
    const fetchFn: FetchLike = async (url) =>
      url.startsWith('https://catalog.') ? new Response('Not found', { status: 404 }) : json(pcrFixture, { 'X-WP-TotalPages': '1' })
    const res = await handleCatalogueRequest('pcr', fetchFn, new Date(), { pcrPartnerKey: 'k', checkout: true })
    const body = (await res.json()) as CatalogueResponse
    expect(body.products.length).toBeGreaterThan(0)
    expect(body.products.every((p) => p.orderRef === undefined)).toBe(true)
    expect(body.checkout).toBeUndefined()
  })

  it('says checkout is on only when asked and the products can be ordered', async () => {
    const partner = await handleCatalogueRequest('pcr', async () => json([partnerProduct()]), new Date(), { pcrPartnerKey: 'k', checkout: true })
    expect(((await partner.json()) as CatalogueResponse).checkout).toBe(true)
    const upd = await handleCatalogueRequest('upd', async () => json(updFixture), new Date())
    expect(((await upd.json()) as CatalogueResponse).checkout).toBeUndefined()
  })
})

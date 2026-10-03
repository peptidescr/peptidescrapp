import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  decodeStoreText,
  fetchPcrProducts,
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
      sku: 'USP-BPC157-5',
      category: 'Extracellular Matrix and Cell-Migration Peptides',
      inStock: true,
      url: 'https://www.usapeptidedepot.com/product/bpc-157-5mg',
    })
  })

  it('skips hidden or inactive products and unsafe slugs', () => {
    const base = { name: 'A 5mg', slug: 'a-5mg', in_stock: true }
    expect(fromUpdProduct({ ...base, is_hidden: true })).toBeNull()
    expect(fromUpdProduct({ ...base, is_active: false })).toBeNull()
    expect(fromUpdProduct({ ...base, slug: '../admin' })).toBeNull()
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

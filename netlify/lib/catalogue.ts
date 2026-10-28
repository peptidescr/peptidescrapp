/**
 * GET /api/catalogue — the brand's own store product list, flattened to one
 * shape. Each site's Netlify function reads only its own store (the brand is
 * the site's VITE_BRAND), and the upstream URLs below are constants: the
 * function takes no input from the caller, so it can't be pointed anywhere else.
 *
 * Deliberately thin: it fetches, checks types, decodes the store's HTML
 * entities and caps sizes, and nothing more. Parsing vial sizes out of names,
 * grouping sizes into one compound and matching store products to the app's
 * own compounds all happen in the app (src/lib/storeCatalogue.ts), which is
 * what knows those compounds.
 *
 * The response carries no customer data in either direction — it's the same
 * public product list for everyone, so it's cached at Netlify's edge.
 */

export type CatalogueBrand = 'pcr' | 'upd'

export interface StoreProduct {
  /** The store's own product name, e.g. "Tirzepatide 60mg". One product per vial size. */
  name: string
  slug: string
  sku?: string
  /** The store's category for it, if it gives one. */
  category?: string
  inStock: boolean
  /** The product page on the store. */
  url?: string
}

export interface CatalogueResponse {
  version: 1
  brand: CatalogueBrand
  fetchedAt: string
  products: StoreProduct[]
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>

const PCR_PRODUCTS_URL = 'https://peptidescostarica.net/wp-json/wc/store/v1/products'
/** The bare domain 308-redirects here; asking the final host directly saves a round trip. */
const UPD_PRODUCTS_URL = 'https://www.usapeptidedepot.com/api/products'
const UPD_PRODUCT_PAGE = 'https://www.usapeptidedepot.com/product/'

const PCR_PAGE_SIZE = 100
const MAX_PAGES = 10
export const MAX_PRODUCTS = 1000
const MAX_TEXT = 200
const UPSTREAM_TIMEOUT_MS = 8000

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
}

/** Store text is HTML-escaped ("Copper &amp; Dermatological Peptides"); this turns it back into plain text. */
export function decodeStoreText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === '#') {
        const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? entity
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const decoded = decodeStoreText(value).slice(0, MAX_TEXT)
  return decoded || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 500) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

/** One WooCommerce Store API product → StoreProduct, or null if it lacks a usable name/slug. */
export function fromWooProduct(raw: unknown): StoreProduct | null {
  if (!isRecord(raw)) return null
  const name = text(raw.name)
  const slug = text(raw.slug)
  if (!name || !slug) return null
  const product: StoreProduct = { name, slug, inStock: raw.is_in_stock === true }
  const sku = text(raw.sku)
  if (sku) product.sku = sku
  // Woo can file a product under several categories; the first is the one it lists first on the site.
  const firstCategory = Array.isArray(raw.categories) && isRecord(raw.categories[0]) ? text(raw.categories[0].name) : undefined
  if (firstCategory) product.category = firstCategory
  const url = httpsUrl(raw.permalink)
  if (url) product.url = url
  return product
}

/** One USA Peptide Depot /api/products entry → StoreProduct. Hidden/inactive products are skipped. */
export function fromUpdProduct(raw: unknown): StoreProduct | null {
  if (!isRecord(raw)) return null
  if (raw.is_hidden === true || raw.is_active === false) return null
  const name = text(raw.name)
  const slug = text(raw.slug)
  if (!name || !slug || !/^[a-z0-9-]+$/.test(slug)) return null
  const product: StoreProduct = { name, slug, inStock: raw.in_stock === true, url: UPD_PRODUCT_PAGE + slug }
  const sku = text(raw.sku)
  if (sku) product.sku = sku
  const category = text(raw.category)
  if (category) product.category = category
  return product
}

async function getJson(fetchFn: FetchLike, url: string): Promise<{ body: unknown; response: Response }> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`upstream ${response.status}`)
  return { body: await response.json(), response }
}

function dedupeBySlug(products: StoreProduct[]): StoreProduct[] {
  const seen = new Set<string>()
  return products.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true))).slice(0, MAX_PRODUCTS)
}

/** Peptides CR (WooCommerce): pages through the public Store API, 100 at a time. */
export async function fetchPcrProducts(fetchFn: FetchLike): Promise<StoreProduct[]> {
  const products: StoreProduct[] = []
  let totalPages = 1
  for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
    const { body, response } = await getJson(fetchFn, `${PCR_PRODUCTS_URL}?per_page=${PCR_PAGE_SIZE}&page=${page}`)
    if (!Array.isArray(body)) throw new Error('unexpected Woo response')
    for (const raw of body) {
      const product = fromWooProduct(raw)
      if (product) products.push(product)
    }
    const declared = Number(response.headers.get('X-WP-TotalPages'))
    totalPages = Number.isInteger(declared) && declared > 0 ? declared : 1
  }
  return dedupeBySlug(products)
}

/** USA Peptide Depot: its site's own product endpoint, `{ data: { products: [...] } }`. */
export async function fetchUpdProducts(fetchFn: FetchLike): Promise<StoreProduct[]> {
  const { body } = await getJson(fetchFn, UPD_PRODUCTS_URL)
  const list = isRecord(body) && isRecord(body.data) ? body.data.products : undefined
  if (!Array.isArray(list)) throw new Error('unexpected UPD response')
  return dedupeBySlug(list.map(fromUpdProduct).filter((p): p is StoreProduct => p !== null))
}

export function toCatalogueBrand(value: string | undefined): CatalogueBrand {
  // Same default as vite.config.ts's resolveBrandId.
  return value === 'pcr' ? 'pcr' : 'upd'
}

export async function handleCatalogueRequest(
  brand: CatalogueBrand,
  fetchFn: FetchLike,
  now: Date = new Date(),
): Promise<Response> {
  let products: StoreProduct[]
  try {
    products = brand === 'pcr' ? await fetchPcrProducts(fetchFn) : await fetchUpdProducts(fetchFn)
  } catch (err) {
    console.error('catalogue fetch failed', err)
    return new Response('Store unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  // An empty list is far likelier a store glitch than a store that sells
  // nothing; failing keeps the app on the list it already has.
  if (products.length === 0) {
    return new Response('Store returned no products', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  const body: CatalogueResponse = { version: 1, brand, fetchedAt: now.toISOString(), products }
  return Response.json(body, {
    headers: {
      // Browsers always revalidate; Netlify's edge serves one copy for an
      // hour, and a stale one for a day while it refetches in the background.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

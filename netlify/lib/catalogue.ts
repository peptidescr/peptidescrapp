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

export type StoreCurrency = 'USD' | 'CRC'

/**
 * A shelf price, in the currency's major units (79 is $79; 70176 is ₡70,176).
 * For showing only: an order is always priced by the store itself, which
 * ignores any price sent to it, so nothing here is ever charged.
 */
export interface StorePrice {
  currency: StoreCurrency
  amount: number
}

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
  // Shop fields (Part B). All optional, so the app's compound sync, which reads
  // only the ones above, is unaffected.
  /** The store's own id for the product (UPD's uuid; WooCommerce's number, as text). */
  id?: string
  /** What it sells for now. */
  price?: StorePrice
  /** What it sold for before a sale; only present when it's higher than `price`. */
  regularPrice?: StorePrice
  /** The store's own image links, loaded from there and never copied (both stores ask for that). */
  imageUrl?: string
  thumbnailUrl?: string
  /** Plain text. `description` is in whatever language the store wrote it; the other two say which. */
  description?: string
  descriptionEn?: string
  descriptionEs?: string
  /** Units in stock, when the store says. */
  stock?: number
  /** Certificate of analysis. */
  coaUrl?: string
  /**
   * What an order names this product by (guest checkout, Part B phase B1):
   * Peptides CR's partner id, or USA Peptide Depot's slug. Only set when the
   * product came from a source the store takes orders against, so a product
   * from PCR's public WooCommerce feed (whose ids the order API doesn't know)
   * can't go in a cart.
   */
  orderRef?: string
}

export interface CatalogueResponse {
  version: 1
  brand: CatalogueBrand
  fetchedAt: string
  products: StoreProduct[]
  /** Present (true) only when this site takes orders in the app; see netlify/lib/checkout.ts. */
  checkout?: true
}

export type FetchLike = (
  url: string,
  init?: { method?: string; signal?: AbortSignal; headers?: Record<string, string>; body?: string },
) => Promise<Response>

const PCR_PRODUCTS_URL = 'https://peptidescostarica.net/wp-json/wc/store/v1/products'
/** Peptides CR's partner API: ids the order API accepts, USD prices, and descriptions in both languages. */
const PCR_PARTNER_PRODUCTS_URL = 'https://catalog.peptidescostarica.net/api/partner/products'
/** The bare domain 308-redirects here; asking the final host directly saves a round trip. */
const UPD_PRODUCTS_URL = 'https://www.usapeptidedepot.com/api/products'
const UPD_PRODUCT_PAGE = 'https://www.usapeptidedepot.com/product/'

const PCR_PAGE_SIZE = 100
const MAX_PAGES = 10
export const MAX_PRODUCTS = 1000
const MAX_TEXT = 200
/** Descriptions run longer than names; past this the shop shows a cut-off and links the store's page. */
const MAX_DESCRIPTION = 1500
/** A price above this is a typo or a bad response, not a product. */
const MAX_PRICE = 100_000_000
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

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined
  const decoded = decodeStoreText(value).slice(0, max)
  return decoded || undefined
}

/** A price as the stores send it (a number, or a numeric string), or undefined. */
function amount(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 && n <= MAX_PRICE ? n : undefined
}

function wholeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : undefined
}

/** Sets `price`, and `regularPrice` only when it is a real markdown from it. */
function setPrices(product: StoreProduct, currency: StoreCurrency, now: number | undefined, regular: number | undefined): void {
  if (now === undefined) return
  product.price = { currency, amount: now }
  if (regular !== undefined && regular > now) product.regularPrice = { currency, amount: regular }
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
  if (typeof raw.id === 'number' && Number.isInteger(raw.id) && raw.id > 0) product.id = String(raw.id)
  // The Store API sends prices as strings in the currency's minor units, and says how many.
  const prices = isRecord(raw.prices) ? raw.prices : undefined
  const code = prices?.currency_code
  const minor = prices?.currency_minor_unit
  if (prices && (code === 'USD' || code === 'CRC') && typeof minor === 'number' && Number.isInteger(minor) && minor >= 0 && minor <= 4) {
    const scale = 10 ** minor
    const toMajor = (v: unknown) => {
      const n = amount(v)
      return n === undefined ? undefined : n / scale
    }
    setPrices(product, code, toMajor(prices.price), toMajor(prices.regular_price))
  }
  const image = Array.isArray(raw.images) && isRecord(raw.images[0]) ? raw.images[0] : undefined
  const imageUrl = httpsUrl(image?.src)
  if (imageUrl) product.imageUrl = imageUrl
  const thumbnailUrl = httpsUrl(image?.thumbnail)
  if (thumbnailUrl) product.thumbnailUrl = thumbnailUrl
  const description = text(raw.short_description, MAX_DESCRIPTION) ?? text(raw.description, MAX_DESCRIPTION)
  if (description) product.description = description
  const stock = wholeCount(raw.low_stock_remaining)
  if (stock !== undefined) product.stock = stock
  return product
}

/** One USA Peptide Depot /api/products entry → StoreProduct. Hidden/inactive products are skipped. */
export function fromUpdProduct(raw: unknown): StoreProduct | null {
  if (!isRecord(raw)) return null
  if (raw.is_hidden === true || raw.is_active === false) return null
  const name = text(raw.name)
  const slug = text(raw.slug)
  if (!name || !slug || !/^[a-z0-9-]+$/.test(slug)) return null
  const product: StoreProduct = { name, slug, inStock: raw.in_stock === true, url: UPD_PRODUCT_PAGE + slug, orderRef: slug }
  const sku = text(raw.sku)
  if (sku) product.sku = sku
  const category = text(raw.category)
  if (category) product.category = category
  const id = text(raw.id)
  if (id) product.id = id
  // A sale price is the price now, and the list price becomes the "was" price.
  const listPrice = amount(raw.price)
  const salePrice = amount(raw.sale_price)
  if (salePrice !== undefined && listPrice !== undefined && salePrice < listPrice) setPrices(product, 'USD', salePrice, listPrice)
  else setPrices(product, 'USD', listPrice, amount(raw.original_price_usd))
  const imageUrl = httpsUrl(raw.image) ?? httpsUrl(raw.detail_image)
  if (imageUrl) {
    product.imageUrl = imageUrl
    product.thumbnailUrl = imageUrl
  }
  const description = text(raw.description, MAX_DESCRIPTION)
  if (description) product.description = description
  const descriptionEn = text(raw.description_en, MAX_DESCRIPTION)
  if (descriptionEn) product.descriptionEn = descriptionEn
  const descriptionEs = text(raw.description_es, MAX_DESCRIPTION)
  if (descriptionEs) product.descriptionEs = descriptionEs
  const stock = wholeCount(raw.stock_count)
  if (stock !== undefined) product.stock = stock
  const coaUrl = httpsUrl(raw.coa_url)
  if (coaUrl) product.coaUrl = coaUrl
  return product
}

/** "Sermorelin 10mg" → "sermorelin-10mg": a slug for a store that gives none. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

/**
 * One Peptides CR partner-API product → StoreProduct. Shape from the partner
 * integration doc (October 2026): id, name, category, inStock, stock, priceUsd,
 * priceCrc, originalPriceUsd, coa, imageUrl, descriptionEn, descriptionEs. Not
 * yet checked against a real response: the endpoint wasn't live when this was
 * written.
 *
 * Prices are taken in USD, the currency PCR's orders are charged in.
 */
export function fromPcrPartnerProduct(raw: unknown): StoreProduct | null {
  if (!isRecord(raw)) return null
  const name = text(raw.name)
  const id = text(raw.id)
  if (!name || !id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return null
  const slug = slugify(name)
  if (!slug) return null
  const product: StoreProduct = { name, slug, id, orderRef: id, inStock: raw.inStock === true }
  const category = text(raw.category)
  if (category) product.category = category
  setPrices(product, 'USD', amount(raw.priceUsd), amount(raw.originalPriceUsd))
  const imageUrl = httpsUrl(raw.imageUrl)
  if (imageUrl) {
    product.imageUrl = imageUrl
    product.thumbnailUrl = imageUrl
  }
  const descriptionEn = text(raw.descriptionEn, MAX_DESCRIPTION)
  if (descriptionEn) product.descriptionEn = descriptionEn
  const descriptionEs = text(raw.descriptionEs, MAX_DESCRIPTION)
  if (descriptionEs) product.descriptionEs = descriptionEs
  const stock = wholeCount(raw.stock)
  if (stock !== undefined) product.stock = stock
  const coaUrl = httpsUrl(raw.coa)
  if (coaUrl) product.coaUrl = coaUrl
  return product
}

async function getJson(
  fetchFn: FetchLike,
  url: string,
  headers: Record<string, string> = {},
): Promise<{ body: unknown; response: Response }> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Accept: 'application/json', ...headers },
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

/**
 * Peptides CR's partner API, with the partner key (a server secret; see
 * netlify/lib/checkout.ts). The list may come bare or wrapped in
 * `products`/`data`; the doc doesn't show the envelope. Products are kept
 * apart by id, since two can share a name.
 */
export async function fetchPcrPartnerProducts(fetchFn: FetchLike, partnerKey: string): Promise<StoreProduct[]> {
  const { body } = await getJson(fetchFn, PCR_PARTNER_PRODUCTS_URL, { 'X-Partner-Key': partnerKey })
  let list: unknown
  if (Array.isArray(body)) list = body
  else if (isRecord(body)) list = body.products ?? (isRecord(body.data) ? body.data.products : body.data)
  if (!Array.isArray(list)) throw new Error('unexpected partner response')
  const products: StoreProduct[] = []
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const raw of list) {
    const product = fromPcrPartnerProduct(raw)
    if (!product?.id || ids.has(product.id)) continue
    // Two products with one name would share a slug; the id keeps them apart.
    if (slugs.has(product.slug)) product.slug = `${product.slug}-${product.id.slice(0, 8).toLowerCase()}`
    ids.add(product.id)
    slugs.add(product.slug)
    products.push(product)
  }
  return products.slice(0, MAX_PRODUCTS)
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

export interface CatalogueOptions {
  /** Peptides CR's partner key, when this site has one: the list then comes from the partner API. */
  pcrPartnerKey?: string
  /** Whether this site takes orders in the app (checkoutSettings(...).ok). */
  checkout?: boolean
}

/**
 * Peptides CR: the partner API when there's a key, falling back to the public
 * WooCommerce feed if it fails (browse only, then: those products have no orderRef).
 */
async function fetchPcr(fetchFn: FetchLike, partnerKey: string | undefined): Promise<StoreProduct[]> {
  if (partnerKey) {
    try {
      const products = await fetchPcrPartnerProducts(fetchFn, partnerKey)
      if (products.length > 0) return products
      console.error('catalogue: partner API returned no products; using the public feed')
    } catch (err) {
      console.error('catalogue: partner API failed; using the public feed:', err instanceof Error ? err.message : 'error')
    }
  }
  return fetchPcrProducts(fetchFn)
}

export async function handleCatalogueRequest(
  brand: CatalogueBrand,
  fetchFn: FetchLike,
  now: Date = new Date(),
  options: CatalogueOptions = {},
): Promise<Response> {
  let products: StoreProduct[]
  try {
    products = brand === 'pcr' ? await fetchPcr(fetchFn, options.pcrPartnerKey) : await fetchUpdProducts(fetchFn)
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
  // Checkout needs products the store's order API knows; without any, the shop stays browse-only.
  if (options.checkout && products.some((p) => p.orderRef)) body.checkout = true
  return Response.json(body, {
    headers: {
      // Browsers always revalidate; Netlify's edge serves one copy for an
      // hour, and a stale one for a day while it refetches in the background.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

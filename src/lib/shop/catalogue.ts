/**
 * The Shop's product list (Part B, browse only). Read from the same
 * /api/catalogue response the compound sync uses (netlify/lib/catalogue.ts),
 * but kept whole: prices, images and descriptions, which the compound sync
 * drops. Online only, by nature; nothing is stored on the device.
 *
 * Prices here are shelf prices for showing. An order is priced by the store
 * itself (both stores ignore any price sent to them), so nothing shown here is
 * ever what gets charged.
 */
import { useSyncExternalStore } from 'react'
import type { BrandId } from '../../brand'
import type { Locale } from '../units'
import { sanitizeText } from '../sanitize'

export type ShopCurrency = 'USD' | 'CRC'

export interface ShopPrice {
  currency: ShopCurrency
  amount: number
}

/** Mirrors netlify/lib/catalogue.ts's StoreProduct; the app and functions are separate builds. */
export interface ShopProduct {
  name: string
  slug: string
  category?: string
  inStock: boolean
  url?: string
  id?: string
  price?: ShopPrice
  regularPrice?: ShopPrice
  imageUrl?: string
  thumbnailUrl?: string
  description?: string
  descriptionEn?: string
  descriptionEs?: string
  stock?: number
  coaUrl?: string
}

const MAX_PRODUCTS = 1000
const MAX_TEXT = 200
const MAX_DESCRIPTION = 1500
const MAX_PRICE = 100_000_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = sanitizeText(value, max).trim()
  return text || undefined
}

/** Only https links leave the app, whatever the server sent. */
function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 500) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

function price(value: unknown): ShopPrice | undefined {
  if (!isRecord(value)) return undefined
  const { currency, amount } = value
  if (currency !== 'USD' && currency !== 'CRC') return undefined
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PRICE) return undefined
  return { currency, amount }
}

/**
 * The server's response, checked like any outside input: anything that isn't
 * this brand's catalogue is rejected whole (null), and a malformed product is
 * skipped.
 */
export function parseShopProducts(input: unknown, brand: BrandId): ShopProduct[] | null {
  if (!isRecord(input) || input.version !== 1 || input.brand !== brand) return null
  if (!Array.isArray(input.products) || input.products.length > MAX_PRODUCTS) return null
  const products: ShopProduct[] = []
  for (const raw of input.products) {
    if (!isRecord(raw)) continue
    const name = cleanText(raw.name)
    const slug = cleanText(raw.slug)
    if (!name || !slug) continue
    const product: ShopProduct = { name, slug, inStock: raw.inStock === true }
    const category = cleanText(raw.category)
    if (category) product.category = category
    const id = cleanText(raw.id)
    if (id) product.id = id
    for (const key of ['url', 'imageUrl', 'thumbnailUrl', 'coaUrl'] as const) {
      const url = httpsUrl(raw[key])
      if (url) product[key] = url
    }
    const now = price(raw.price)
    if (now) {
      product.price = now
      const was = price(raw.regularPrice)
      if (was && was.currency === now.currency && was.amount > now.amount) product.regularPrice = was
    }
    for (const key of ['description', 'descriptionEn', 'descriptionEs'] as const) {
      const text = cleanText(raw[key], MAX_DESCRIPTION)
      if (text) product[key] = text
    }
    if (typeof raw.stock === 'number' && Number.isInteger(raw.stock) && raw.stock >= 0) product.stock = raw.stock
    products.push(product)
  }
  return products
}

/** "$79", "$79.50", "₡70 176": whole amounts without decimals, and colones never with any. */
export function formatPrice(value: ShopPrice, locale: Locale): string {
  const whole = Number.isInteger(value.amount) || value.currency === 'CRC'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value.amount)
}

/** The description in the reader's language when the store wrote one, else whatever it wrote. */
export function descriptionFor(product: ShopProduct, locale: Locale): string | undefined {
  const own = locale === 'es-CR' ? product.descriptionEs : product.descriptionEn
  return own ?? product.description ?? product.descriptionEn ?? product.descriptionEs
}

/** Lower-case, accents off, so "peptido" finds "Péptido". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** The store's categories, by how many products each has, then by name. */
export function categoriesOf(products: readonly ShopProduct[]): string[] {
  const counts = new Map<string, number>()
  for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
}

/** Products matching a search and a category, in-stock first, then by name. */
export function filterProducts(
  products: readonly ShopProduct[],
  { query = '', category = null }: { query?: string; category?: string | null },
): ShopProduct[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return products
    .filter((p) => (category ? p.category === category : true))
    .filter((p) => {
      if (words.length === 0) return true
      const haystack = fold(`${p.name} ${p.category ?? ''}`)
      return words.every((w) => haystack.includes(w))
    })
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.name.localeCompare(b.name, undefined, { numeric: true }))
}

// ---------------------------------------------------------------------------
// Loading: once per page life, shared by every screen that asks.
// ---------------------------------------------------------------------------

export type ShopCatalogueState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; products: ShopProduct[] }

let state: ShopCatalogueState = { status: 'loading' }
let started = false
const listeners = new Set<() => void>()

function set(next: ShopCatalogueState): void {
  state = next
  for (const listener of listeners) listener()
}

/** Fetches the list (again, after an error). Never throws. */
export async function loadShopCatalogue(brand: BrandId, fetchFn: typeof fetch = fetch): Promise<void> {
  started = true
  set({ status: 'loading' })
  try {
    const response = await fetchFn('/api/catalogue', { headers: { Accept: 'application/json' } })
    const products = response.ok ? parseShopProducts(await response.json(), brand) : null
    set(products ? { status: 'ready', products } : { status: 'error' })
  } catch {
    set({ status: 'error' })
  }
}

export function useShopCatalogue(brand: BrandId): ShopCatalogueState {
  if (!started) void loadShopCatalogue(brand)
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

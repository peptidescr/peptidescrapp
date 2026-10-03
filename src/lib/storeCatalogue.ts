/**
 * The brand's store catalogue (Phase 2, "your full catalogue, kept in sync
 * with your store"). Each site's /api/catalogue (netlify/lib/catalogue.ts)
 * returns the store's product list flattened to one shape; this module turns
 * that into compounds and keeps them in the Dexie `compounds` table, where the
 * rest of the app — and the service worker's notification text — already
 * reads compound names from.
 *
 * Stores sell one product per vial size ("Tirzepatide 10mg", "Tirzepatide
 * 60mg"), so products are grouped into one compound with several vial sizes.
 * A store product that is one of the built-in compounds — by name, or through
 * the brand's alias table (src/content/storeAliases.ts) — keeps the built-in
 * id, so the templates, maths and existing records that use it still
 * resolve; it just shows under the store's name and category.
 *
 * Offline-first: the app works from whatever was last synced (or the
 * built-in list before the first sync). A failed or odd-looking response
 * changes nothing. A product the store drops keeps its row, marked
 * `listed: false`, so records that use it keep their name.
 */
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { BRAND, type BrandId } from '../brand'
import {
  COMPOUNDS,
  compareAlphabetical,
  setStoreCompounds,
  slugify,
  vialSizeUnit,
  type Compound,
  type CompoundForm,
  type CompoundUnit,
  type StoreProductRef,
} from '../content/compounds'
import { STORE_ALIASES } from '../content/storeAliases'
import { db } from './db'
import { sanitizeText } from './sanitize'

/** Mirrors netlify/lib/catalogue.ts's StoreProduct — the app and functions are separate builds. */
export interface StoreProduct {
  name: string
  slug: string
  sku?: string
  category?: string
  inStock: boolean
  url?: string
}

const MAX_PRODUCTS = 1000
const MAX_TEXT = 200
const SYNCED_AT_KEY = 'peptidescr:catalogueSyncedAt'
/** Matches the edge cache in netlify/lib/catalogue.ts — asking sooner would get the same answer. */
const REFRESH_AFTER_MS = 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = sanitizeText(value, MAX_TEXT).trim()
  return text || undefined
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 500) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The server's response, checked like any other outside input: anything that
 * isn't this brand's catalogue in the expected shape is rejected whole (null),
 * and a single malformed product is skipped.
 */
export function parseCatalogueResponse(input: unknown, brand: BrandId): StoreProduct[] | null {
  if (!isRecord(input) || input.version !== 1 || input.brand !== brand) return null
  if (!Array.isArray(input.products) || input.products.length === 0 || input.products.length > MAX_PRODUCTS) return null
  const products: StoreProduct[] = []
  for (const raw of input.products) {
    if (!isRecord(raw)) continue
    const name = cleanText(raw.name)
    const slug = cleanText(raw.slug)
    if (!name || !slug) continue
    const product: StoreProduct = { name, slug, inStock: raw.inStock === true }
    const sku = cleanText(raw.sku)
    if (sku) product.sku = sku
    const category = cleanText(raw.category)
    if (category) product.category = category
    const url = httpsUrl(raw.url)
    if (url) product.url = url
    products.push(product)
  }
  return products.length > 0 ? products : null
}

// ---------------------------------------------------------------------------
// Product names → compounds
// ---------------------------------------------------------------------------

type SizeUnit = CompoundUnit | 'mL'

const UNITS: Record<string, SizeUnit> = { mg: 'mg', mcg: 'mcg', µg: 'mcg', iu: 'IU', ml: 'mL' }

/**
 * A vial size in a product name: "10mg", "5 mg", "75 IU", "10,000 IU",
 * "10ml", "1.5mg". The lookbehind keeps it from starting mid-number, and the
 * unit must end the word, so "KissPeptin-10 10mg" reads as 10 mg, not "10 10".
 */
const SIZE_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(mcg|µg|mg|iu|ml)(?![a-z])/gi

export interface ParsedProductName {
  /** The name without its vial size, as the store writes it: "HGH (Pfizer Brand Genotropin)". */
  displayName: string
  /** What products of one compound share: the display name without parentheticals, slugged ("hgh"). */
  groupKey: string
  size?: number
  unit?: SizeUnit
}

export function parseProductName(name: string): ParsedProductName {
  const match = [...name.matchAll(SIZE_RE)].at(-1)
  let rest = name
  let size: number | undefined
  let unit: SizeUnit | undefined
  if (match && match.index !== undefined) {
    size = Number(match[1]!.replace(/,/g, ''))
    unit = UNITS[match[2]!.toLowerCase()]
    rest = name.slice(0, match.index) + ' ' + name.slice(match.index + match[0].length)
  }
  const displayName = rest
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\)/g, ')')
    .trim()
    .replace(/[\s,/–—-]+$/, '')
  return { displayName, groupKey: groupKeyFor(displayName), size, unit }
}

/** The key products of one compound share, and what the alias tables are keyed by. */
export function groupKeyFor(displayName: string): string {
  return slugify(displayName.replace(/\([^)]*\)/g, ' '))
}

/** A size in one unit, expressed in another; undefined when they don't measure the same thing. */
function convertSize(size: number, from: SizeUnit, to: SizeUnit): number | undefined {
  if (from === to) return size
  if (from === 'mg' && to === 'mcg') return size * 1000
  if (from === 'mcg' && to === 'mg') return size / 1000
  return undefined
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: string | undefined
  for (const [value, count] of counts) {
    const bestCount = best === undefined ? 0 : counts.get(best)!
    if (count > bestCount || (count === bestCount && best !== undefined && compareAlphabetical(value, best) < 0)) {
      best = value
    }
  }
  return best
}

const DILUENT_RE = /\bwater\b|\bdiluent\b|reconstitution solution/i
const BLEND_RE = /\+|\bblend\b|\bstack\b/i

interface Item {
  product: StoreProduct
  parsed: ParsedProductName
}

/** How a compound that isn't a built-in is measured, read off its products' sizes. */
function inferMeasure(items: Item[], isDiluent: boolean): { defaultUnit: CompoundUnit; form: CompoundForm } {
  const units = new Set(items.map((i) => i.parsed.unit).filter((u) => u !== undefined))
  // Same convention as the built-in BAC water and ready-to-use blends: liquids are 'mg' solutions sized in mL.
  if (isDiluent || units.has('mL')) return { defaultUnit: 'mg', form: 'solution' }
  if (units.has('IU')) return { defaultUnit: 'IU', form: 'powder' }
  if (units.has('mcg') && !units.has('mg')) return { defaultUnit: 'mcg', form: 'powder' }
  return { defaultUnit: 'mg', form: 'powder' }
}

/**
 * Groups store products into compounds. Built-in matches keep the built-in's
 * id and how it's measured (unit, form, blend/diluent flags — the maths
 * depends on those); everything shown — name, category, vial sizes — comes
 * from the store.
 */
export function buildStoreCompounds(
  products: StoreProduct[],
  aliases: Readonly<Record<string, string>>,
  builtIns: readonly Compound[] = COMPOUNDS,
): Compound[] {
  const builtInById = new Map(builtIns.map((c) => [c.id, c]))
  const groups = new Map<string, Item[]>()
  for (const product of products) {
    const parsed = parseProductName(product.name)
    if (!parsed.groupKey) continue
    const id =
      aliases[parsed.groupKey] ?? (builtInById.has(parsed.groupKey) ? parsed.groupKey : `store-${parsed.groupKey}`)
    groups.set(id, [...(groups.get(id) ?? []), { product, parsed }])
  }

  return [...groups].map(([id, unsorted]) => {
    const items = [...unsorted].sort(
      (a, b) => (a.parsed.size ?? Infinity) - (b.parsed.size ?? Infinity) || compareAlphabetical(a.product.name, b.product.name),
    )
    const builtIn = builtInById.get(id)

    // One shared display name keeps its parenthetical ("GHK-Cu (Copper
    // Tripeptide)"); sizes sold under differing ones fall back to the bare
    // name ("HGH", not "HGH (Pfizer Brand Genotropin)").
    const displayNames = [...new Set(items.map((i) => i.parsed.displayName))]
    const name =
      displayNames.length === 1
        ? displayNames[0]!
        : mostCommon(items.map((i) => i.parsed.displayName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()))!

    const isDiluent = builtIn?.isDiluent ?? items.some((i) => DILUENT_RE.test(i.product.name))
    const measure = builtIn ? { defaultUnit: builtIn.defaultUnit, form: builtIn.form } : inferMeasure(items, isDiluent)
    const sizeUnit = vialSizeUnit(measure)

    const storeProducts: StoreProductRef[] = items.map(({ product, parsed }) => {
      const ref: StoreProductRef = { label: product.name, slug: product.slug, inStock: product.inStock }
      const size = parsed.size !== undefined && parsed.unit ? convertSize(parsed.size, parsed.unit, sizeUnit) : undefined
      if (size !== undefined) ref.size = size
      if (product.sku) ref.sku = product.sku
      if (product.url) ref.url = product.url
      return ref
    })
    const storeSizes = [...new Set(storeProducts.map((p) => p.size).filter((s) => s !== undefined))].sort((a, b) => a - b)

    const compound: Compound = {
      id,
      name,
      category: mostCommon(items.map((i) => i.product.category).filter((c) => c !== undefined)) ?? builtIn?.category ?? '',
      defaultUnit: measure.defaultUnit,
      // A built-in the store sells without a readable size ("MT-II") keeps its own sizes.
      vialSizes: storeSizes.length > 0 ? storeSizes : (builtIn?.vialSizes ?? []),
      form: measure.form,
      isBlend: builtIn?.isBlend ?? BLEND_RE.test(name),
      isDiluent,
      source: 'store',
      listed: true,
      storeProducts,
    }
    if (builtIn && builtIn.name.toLowerCase() !== name.toLowerCase()) compound.aliases = [builtIn.name]
    return compound
  })
}

// ---------------------------------------------------------------------------
// Sync and in-memory mirror
// ---------------------------------------------------------------------------

/** Writes a fresh catalogue: new and changed rows replace old ones; rows the store dropped stay, unlisted. */
async function applyStoreCompounds(compounds: Compound[]): Promise<void> {
  const freshIds = new Set(compounds.map((c) => c.id))
  await db.transaction('rw', db.compounds, async () => {
    const dropped = await db.compounds.filter((c) => c.source === 'store' && !freshIds.has(c.id)).toArray()
    await db.compounds.bulkPut([...compounds, ...dropped.map((c) => ({ ...c, listed: false }))])
  })
}

function readSyncedAt(): number {
  try {
    return Number(localStorage.getItem(SYNCED_AT_KEY)) || 0
  } catch {
    return 0
  }
}

function writeSyncedAt(time: number): void {
  try {
    localStorage.setItem(SYNCED_AT_KEY, String(time))
  } catch {
    // Only costs an early re-fetch next time.
  }
}

let inFlight: Promise<boolean> | null = null

/**
 * Fetches the store catalogue if the last sync is over an hour old (or
 * `force`). Never throws: true when the catalogue was updated.
 */
export function syncStoreCatalogue({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  if (!force && Date.now() - readSyncedAt() < REFRESH_AFTER_MS) return Promise.resolve(false)
  inFlight ??= (async () => {
    try {
      const response = await fetch('/api/catalogue', { headers: { Accept: 'application/json' } })
      if (!response.ok) return false
      const products = parseCatalogueResponse(await response.json(), BRAND.id)
      if (!products) return false
      await applyStoreCompounds(buildStoreCompounds(products, STORE_ALIASES))
      writeSyncedAt(Date.now())
      return true
    } catch {
      // Offline, or no catalogue endpoint (a local dev server without it): keep what we have.
      return false
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Re-checks whenever the app comes back to the foreground; the hour throttle keeps that cheap. */
export function startStoreCatalogueRefresh(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncStoreCatalogue()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}

let loaded = false
const loadedListeners = new Set<() => void>()

/**
 * Mirrors the stored store compounds into memory for the life of the page
 * (see src/content/compounds.ts). Called once from main.tsx, like the custom
 * compound mirror, and the App's loading gate waits for its first result.
 */
export function startStoreCompoundSync(): void {
  liveQuery(() => db.compounds.filter((c) => c.source === 'store').toArray()).subscribe({
    next: (list) => {
      setStoreCompounds(list)
      if (!loaded) {
        loaded = true
        for (const listener of loadedListeners) listener()
      }
    },
    error: (err: unknown) => console.error('store compound sync failed', err),
  })
}

export function useStoreCompoundsLoaded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      loadedListeners.add(listener)
      return () => loadedListeners.delete(listener)
    },
    () => loaded,
  )
}

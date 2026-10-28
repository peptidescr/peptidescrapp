/**
 * The client's seeded compound catalogue, read-only at runtime, plus two
 * Phase 2 layers held in memory: the brand's store catalogue (which renames,
 * re-sizes and adds to the built-ins) and the user's own custom compounds —
 * see the bottom of this file. Every lookup below answers for all three, so
 * no caller has to know which kind a compound is.
 *
 * Vial size units are NOT uniform across `vialSizes` — they depend on the
 * compound, per this rule (see `vialSizeUnit` below):
 *   - defaultUnit === 'IU'         → vialSizes are IU counts (e.g. HGH 12/24/30/50 IU)
 *   - form === 'solution'          → vialSizes are millilitres of ready-to-use liquid
 *                                    (e.g. Fat Blaster, BAC Water) — nothing to reconstitute
 *   - otherwise (powder, mg/mcg)   → vialSizes are a mass in `defaultUnit`
 * The brief's 5-field Compound shape is kept exactly as specified; this is a
 * documented interpretation of `vialSizes`, not an extra field.
 *
 * Blends (`isBlend: true`) are single catalogue entries with one combined
 * amount — no per-component splitting in Phase 1, per the brief.
 * Diluents (`isDiluent: true`) never appear in the compound picker; the
 * calculator uses them only to prefill its diluent volume field.
 */

export type CompoundUnit = 'mg' | 'mcg' | 'IU'
export type CompoundForm = 'powder' | 'solution'

/** One store product a store compound groups — the store sells one product per vial size. */
export interface StoreProductRef {
  /** The store's full product name, e.g. "Tirzepatide 60mg". */
  label: string
  slug: string
  sku?: string
  /** This product's vial size, in the compound's vialSizeUnit; absent when the name doesn't say. */
  size?: number
  inStock: boolean
  url?: string
}

export interface Compound {
  id: string
  name: string
  category: string
  defaultUnit: CompoundUnit
  vialSizes: number[]
  form: CompoundForm
  isBlend: boolean
  isDiluent: boolean
  /** A compound the user created themselves (see src/lib/customCompounds.ts). Absent on catalogue entries. */
  isCustom?: boolean
  /**
   * Built from the brand's store catalogue (see src/lib/storeCatalogue.ts).
   * A store compound that is one of the built-in ones under the store's name
   * keeps the built-in id, so templates and existing records still resolve.
   */
  source?: 'store'
  /** False once the store stops listing it. The row stays so existing records keep their name. */
  listed?: boolean
  /** Other names it goes by (the app's own name for it): searchable, never shown as the name. */
  aliases?: string[]
  /** The store products behind it, smallest vial first — for the Phase 3 reorder and COA lookup. */
  storeProducts?: StoreProductRef[]
}

function powder(
  name: string,
  category: string,
  vialSizes: number[],
  opts: { isBlend?: boolean } = {},
): Compound {
  return {
    id: slugify(name),
    name,
    category,
    defaultUnit: 'mg',
    vialSizes,
    form: 'powder',
    isBlend: opts.isBlend ?? false,
    isDiluent: false,
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const COMPOUNDS: Compound[] = [
  // --- Client's standard mass-dosed catalogue ---
  powder('5-amino-1mq', 'Weight Loss', [5]),
  powder('Adamax', 'Cognitive', [5]),
  powder('AICAR', 'Weight Loss', [50]),
  powder('BPC-157', 'Healing', [10]),
  powder('Cartalax', 'Healing', [20]),
  powder('CJC with DAC', 'Cognitive', [5]),
  powder('DSIP', 'Sleep', [5, 10, 15]),
  powder('Epithalon', 'Anti Aging', [50]),
  powder('GHK-CU', 'Skin', [50, 100]),
  powder('Glutathione', 'Anti Aging', [1500]),
  powder('IGF-1LR3', 'Muscle Growth', [1]),
  powder('Ipamorelin', 'Anti Aging', [10]),
  powder('KissPeptin-10', 'Fertility', [10]),
  powder('KPV', 'Anti Aging', [10]),
  powder('Mots-C', 'Anti Aging', [10, 40]),
  powder('MT-II', 'Muscle Growth', [10]),
  powder('NAD+', 'Anti Aging', [500, 1000]),
  powder('Pinealon', 'Cognitive', [20]),
  powder('PT-141', 'Muscle Growth', [10]),
  powder('Retatrutide', 'Weight Loss', [5, 10, 12, 15, 20, 24, 25, 30, 40, 50, 60]),
  powder('Selank', 'Cognitive', [10]),
  powder('Semaglutide', 'Weight Loss', [10, 20, 30]),
  powder('Semax', 'Cognitive', [10]),
  powder('Sermorelin', 'Anti Aging', [10]),
  powder('SLU-PP-332', 'Muscle Growth', [5]),
  powder('SS-31', 'Anti Aging', [10]),
  powder('TB-4', 'Healing', [10]),
  powder('Tesamorelin', 'HGH', [10, 20]),
  powder('Thymalin', 'Healing', [10]),
  powder('Thymosin Alpha-1', 'Muscle Growth', [10]),
  powder('Tirzepatide', 'Weight Loss', [10, 15, 20, 30, 40, 60]),

  // --- IU-dosed (no mass equivalence — see src/lib/units.ts) ---
  // Category not given in the brief's table for these two; assigned to match
  // the closest existing client category. Confirm with the client — noted in
  // NOTES.md.
  {
    id: 'hgh',
    name: 'HGH',
    category: 'HGH',
    defaultUnit: 'IU',
    vialSizes: [12, 24, 30, 50],
    form: 'powder',
    isBlend: false,
    isDiluent: false,
  },
  {
    id: 'hcg',
    name: 'HCG',
    category: 'Fertility',
    defaultUnit: 'IU',
    vialSizes: [10000],
    form: 'powder',
    isBlend: false,
    isDiluent: false,
  },

  // --- Blends (single combined amount, no component splitting) ---
  // Categories assigned by best match to the blend's components; not given
  // explicitly in the brief — confirm with the client (see NOTES.md).
  powder('BPC-157 + TB-500 "Wolverine Stack"', 'Healing', [20], { isBlend: true }),
  powder('CJC-1295 no DAC + IPA', 'Anti Aging', [10], { isBlend: true }),
  powder('KLOW', 'Healing', [80], { isBlend: true }),
  powder('GLOW', 'Skin', [50, 70], { isBlend: true }),
  {
    id: 'fat-blaster',
    name: 'Fat Blaster',
    category: 'Weight Loss',
    defaultUnit: 'mg',
    vialSizes: [10], // millilitres — form is 'solution', see vialSizeUnit()
    form: 'solution',
    isBlend: true,
    isDiluent: false,
  },
  {
    id: 'super-human-blend',
    name: 'SUPER Human Blend',
    category: 'Anti Aging',
    defaultUnit: 'mg',
    vialSizes: [10], // millilitres — form is 'solution', see vialSizeUnit()
    form: 'solution',
    isBlend: true,
    isDiluent: false,
  },

  // --- Diluent (prefills the calculator; never shown in the compound picker) ---
  {
    id: 'bac-water',
    name: 'BAC Water',
    category: 'Diluent',
    defaultUnit: 'mg',
    vialSizes: [3, 10], // millilitres
    form: 'solution',
    isBlend: false,
    isDiluent: true,
  },
]

/** What unit a given compound's `vialSizes` entries are expressed in. */
export function vialSizeUnit(compound: Pick<Compound, 'defaultUnit' | 'form'>): CompoundUnit | 'mL' {
  if (compound.defaultUnit === 'IU') return 'IU'
  if (compound.form === 'solution') return 'mL'
  return compound.defaultUnit
}

/** Store rows first: a store compound with a built-in id is that compound under the store's name. */
export function getCompoundById(id: string): Compound | undefined {
  return storeCompoundsById.get(id) ?? COMPOUNDS.find((c) => c.id === id) ?? customCompounds.find((c) => c.id === id)
}

/** Listed by the brand's store right now — the picker's first group. */
export function isStoreListed(compound: Compound): boolean {
  return compound.source === 'store' && compound.listed !== false
}

/**
 * The app's ordering rule for anything a person picks from: alphabetical,
 * ignoring case, with digits compared as numbers ("TB-4" before "TB-10").
 * Every dropdown goes through this (or `sortLabels` below) rather than
 * relying on the order things happen to be declared in.
 */
export function compareAlphabetical(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })
}

/**
 * Every compound, once: built-ins (replaced by their store row where the
 * store has one), store-only compounds, and the user's custom ones.
 */
function allCompounds(): Compound[] {
  const storeOnly = storeCompounds.filter((c) => !COMPOUNDS.some((b) => b.id === c.id))
  return [...COMPOUNDS.map((c) => storeCompoundsById.get(c.id) ?? c), ...storeOnly, ...customCompounds]
}

/**
 * Compounds selectable in the UI's compound picker (no diluents): what the
 * brand's store sells first, alphabetical, then everything else (built-ins
 * the store doesn't list, products it no longer sells, the user's custom
 * compounds), alphabetical. With no store catalogue loaded yet it's one
 * alphabetical list. Returns the same array until the store or custom set
 * changes, so it's safe as a useSyncExternalStore snapshot (see useSelectableCompounds).
 */
export function listSelectableCompounds(): Compound[] {
  if (!selectableCache) {
    const byName = (a: Compound, b: Compound) => compareAlphabetical(a.name, b.name)
    const selectable = allCompounds().filter((c) => !c.isDiluent)
    selectableCache = [
      ...selectable.filter(isStoreListed).sort(byName),
      ...selectable.filter((c) => !isStoreListed(c)).sort(byName),
    ]
  }
  return selectableCache
}

/**
 * Diluents for the calculator's quick-fill: the store's own where it sells
 * them, plus any built-in ones it doesn't. Cached like listSelectableCompounds.
 */
export function listDiluents(): Compound[] {
  diluentCache ??= allCompounds()
    .filter((c) => c.isDiluent && (c.source !== 'store' || c.listed !== false))
    .sort((a, b) => compareAlphabetical(a.name, b.name))
  return diluentCache
}

/** Category names, alphabetical. */
export function listCategories(): string[] {
  return [...new Set(listSelectableCompounds().map((c) => c.category))].sort(compareAlphabetical)
}

// ---------------------------------------------------------------------------
// Custom compounds
// ---------------------------------------------------------------------------
//
// The user's own compounds live in Dexie (same `compounds` table as the
// catalogue, flagged `isCustom`), but every lookup above is synchronous and
// called from render and from plain functions alike. So the current set is
// mirrored here in memory: src/lib/customCompounds.ts keeps it in step with
// the database and calls setCustomCompounds on every change. Listeners let
// React re-render when it changes (useSelectableCompounds / useCustomCompounds).

/** Stored `category` for custom compounds; shown translated, never raw (see compoundCategoryLabel). */
export const CUSTOM_CATEGORY = 'custom'

let customCompounds: readonly Compound[] = []
let selectableCache: Compound[] | null = null
let diluentCache: Compound[] | null = null
const listeners = new Set<() => void>()

function changed(): void {
  selectableCache = null
  diluentCache = null
  for (const listener of listeners) listener()
}

export function setCustomCompounds(list: readonly Compound[]): void {
  customCompounds = list
  changed()
}

// ---------------------------------------------------------------------------
// Store compounds
// ---------------------------------------------------------------------------
//
// The brand's store catalogue, mirrored the same way as custom compounds:
// src/lib/storeCatalogue.ts keeps the rows in Dexie and calls
// setStoreCompounds whenever they change.

let storeCompounds: readonly Compound[] = []
let storeCompoundsById = new Map<string, Compound>()

export function setStoreCompounds(list: readonly Compound[]): void {
  storeCompounds = list
  storeCompoundsById = new Map(list.map((c) => [c.id, c]))
  changed()
}

export function getStoreCompounds(): readonly Compound[] {
  return storeCompounds
}

export function getCustomCompounds(): readonly Compound[] {
  return customCompounds
}

export function subscribeToCompounds(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

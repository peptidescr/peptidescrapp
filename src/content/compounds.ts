/**
 * The client's seeded compound catalogue. Read-only at runtime — there is no
 * "create a compound" feature in Phase 1 (see brief: no user-created compounds).
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

export interface Compound {
  id: string
  name: string
  category: string
  defaultUnit: CompoundUnit
  vialSizes: number[]
  form: CompoundForm
  isBlend: boolean
  isDiluent: boolean
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

function slugify(name: string): string {
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
export function vialSizeUnit(compound: Compound): CompoundUnit | 'mL' {
  if (compound.defaultUnit === 'IU') return 'IU'
  if (compound.form === 'solution') return 'mL'
  return compound.defaultUnit
}

export function getCompoundById(id: string): Compound | undefined {
  return COMPOUNDS.find((c) => c.id === id)
}

/** Compounds selectable in the UI's compound picker — excludes diluents. */
export function listSelectableCompounds(): Compound[] {
  return COMPOUNDS.filter((c) => !c.isDiluent)
}

export function listDiluents(): Compound[] {
  return COMPOUNDS.filter((c) => c.isDiluent)
}

/** Category names in catalogue order, for grouping the compound picker. */
export function listCategories(): string[] {
  const seen = new Set<string>()
  const categories: string[] = []
  for (const compound of listSelectableCompounds()) {
    if (!seen.has(compound.category)) {
      seen.add(compound.category)
      categories.push(compound.category)
    }
  }
  return categories
}

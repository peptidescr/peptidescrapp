/**
 * Store products that are one of the app's built-in compounds under another
 * name. Keyed by the store name's slug with the vial size and any
 * parenthetical removed ("GLP-1 / GIP / Glucagon 10mg" → "glp-1-gip-glucagon";
 * see groupKeyFor in src/lib/storeCatalogue.ts), valued by the built-in
 * compound's id.
 *
 * Only certain equivalents belong here. A store name that already slugs to a
 * built-in id ("BPC-157", "GHK-CU", "NAD+") matches without an entry, and
 * anything unlisted becomes its own store compound — so a wrong entry here
 * is worse than a missing one. Per brand, because the same name can mean
 * different things at different stores ("GLP-1" is Retatrutide at Peptides
 * CR). Confirm with the client (HANDOVER.md).
 */

/** Peptides CR (peptidescostarica.net). */
export const PCR_STORE_ALIASES: Readonly<Record<string, string>> = {
  // Sold as "GLP-1 5mg … 60mg"; the store's own product slugs are reta-* / retatrutide-*.
  'glp-1': 'retatrutide',
  // Renamed on the store; its product slug is still fat-blaster-10ml.
  'lipotropic-blend': 'fat-blaster',
  'bpc-157-plus-tb-500': 'bpc-157-plus-tb-500-wolverine-stack',
  'cjc-1295-without-dac-plus-ipa': 'cjc-1295-no-dac-plus-ipa',
  'bacteriostatic-water': 'bac-water',
}

/** USA Peptide Depot (usapeptidedepot.com). */
export const UPD_STORE_ALIASES: Readonly<Record<string, string>> = {
  // "GLP3" on the store's URLs.
  'glp-1-gip-glucagon': 'retatrutide',
  // Its /shop page lists glp-1-gip-5mg / -10mg; not in the product API yet.
  'glp-1-gip': 'tirzepatide',
  'melanotan-2': 'mt-ii',
  // Names below are inferred from /shop URLs (cjc1295-plus-ipamorelin-blend-10mg,
  // reconstitution-solution-bac-water-10ml); the API doesn't return these yet.
  'cjc-1295-plus-ipamorelin-blend': 'cjc-1295-no-dac-plus-ipa',
  'reconstitution-solution': 'bac-water',
}

/*
 * A literal VITE_BRAND ternary, as in src/brand/index.ts, so each build keeps
 * only its own table.
 */
export const STORE_ALIASES: Readonly<Record<string, string>> =
  import.meta.env.VITE_BRAND === 'pcr' ? PCR_STORE_ALIASES : UPD_STORE_ALIASES

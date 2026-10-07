/**
 * The two branded builds this codebase ships as. Everything here is plain
 * data with no imports, because it's read from two places: vite.config.ts
 * (Node, at build time: manifest, index.html, which public/ folder and
 * which CSS get bundled) and src/brand/index.ts (the app, at runtime).
 *
 * The brand is chosen once per build — `vite --mode pcr` / `--mode upd`, or
 * a VITE_BRAND env var (how the Netlify sites pick theirs). Each brand is
 * its own Netlify site on its own subdomain, so it also gets its own
 * origin: its own IndexedDB, localStorage, service worker and push store.
 * That's why storage identifiers ('peptidescr' Dexie DB, localStorage keys)
 * are deliberately the same in both — they can't collide across origins,
 * and renaming them would wipe existing installs.
 *
 * Only look-and-feel lives per brand. Screens, features and logic are
 * shared, and a new brand-specific difference belongs here (or in the
 * brand's own folder), not as an ad-hoc `if (brand === ...)` in a screen.
 */

export type BrandId = 'pcr' | 'upd'
export type BrandLocale = 'es-CR' | 'en'

export interface BrandConfig {
  id: BrandId
  /** Prose name, as it appears inside sentences ("Install {{appName}}"), and the manifest's full `name`. */
  appName: string
  /**
   * What the app is, as a heading: the <h1> on the loading splash (the one
   * piece of page text crawlers that don't run JavaScript can read) and the
   * first half of the tab title. In the default locale.
   */
  headline: string
  /**
   * Browser tab <title> (and share title) only — an SEO-oriented
   * "<headline> | <store name>" string, deliberately longer/keyword-fuller
   * than appName (which stays the short, plain name used mid-sentence
   * everywhere else, and as the manifest's install name).
   */
  title: string
  /**
   * Tight chrome only: manifest short_name (Android's under-icon caption)
   * and the iOS home-screen label — both genuinely space-constrained, so
   * this stays terse.
   */
  shortName: string
  /** Prefix for exported backup/history filenames. */
  filePrefix: string
  /** Languages this build offers. One entry = no language picker at all. */
  locales: readonly BrandLocale[]
  defaultLocale: BrandLocale
  /**
   * Manifest description and <meta name="description">, in the default
   * locale — so PCR's is Spanish (its default locale), not a translation
   * shown only on request; there's no way to swap it per visitor language,
   * since crawlers/install prompts read the static build output.
   */
  description: string
  /**
   * <meta name="theme-color"> per theme — mirrors each brand's tokens.css
   * --brand-surface-2 (the page background). Browser chrome can't read a
   * CSS custom property, so keep these in sync with tokens.css by hand.
   */
  themeColors: { dark: string; light: string }
  /**
   * The address this site is served from, no trailing slash: the canonical
   * link, share tags, structured data, robots.txt and the sitemap all use it.
   * Fixed rather than read from the request, so the netlify.app address and
   * deploy previews all point search engines at the one real address.
   */
  siteUrl: string
  /** The brand's store, which publishes the app (structured data, share tags, contact card). */
  store: { name: string; url: string }
}

const PCR_STORE = { name: 'Peptides Costa Rica', url: 'https://peptidescostarica.net' }
// Spanish (PCR's default locale — see the class comment above). Uses the
// same product-name phrasing as the description below ("Registro de
// Péptidos", "Calculadora de Reconstitución", "de investigación") so the
// tab title and the meta description read as one consistent phrase.
const PCR_HEADLINE = 'Registro de Péptidos de Investigación y Calculadora de Reconstitución'

export const PCR_BRAND: BrandConfig = {
  id: 'pcr',
  appName: 'Peptides CR',
  headline: PCR_HEADLINE,
  title: `${PCR_HEADLINE} | ${PCR_STORE.name}`,
  shortName: 'peptidescr',
  filePrefix: 'peptidescr',
  locales: ['es-CR', 'en'],
  defaultLocale: 'es-CR',
  // Spanish translation (PCR's default locale) of "Track research peptide
  // routines and calculate reconstitution amounts with the Peptides Costa
  // Rica Peptide Tracker & Reconstitution Calculator." — see the class
  // comment above for why this isn't swapped per visitor language.
  description:
    'Llevá el registro de tus rutinas de péptidos de investigación y calculá las cantidades de reconstitución con el Registro de Péptidos y Calculadora de Reconstitución de Peptides Costa Rica.',
  themeColors: { dark: '#060b1a', light: '#f0f5fa' },
  siteUrl: 'https://app.peptidescostarica.net',
  store: PCR_STORE,
}

const UPD_STORE = { name: 'USA Peptide Depot', url: 'https://www.usapeptidedepot.com' }
const UPD_HEADLINE = 'Research Peptide Tracker & Reconstitution Calculator'

export const UPD_BRAND: BrandConfig = {
  id: 'upd',
  appName: 'USA Peptide Depot',
  headline: UPD_HEADLINE,
  title: `${UPD_HEADLINE} | ${UPD_STORE.name}`,
  shortName: 'UPD',
  filePrefix: 'upd',
  locales: ['en'],
  defaultLocale: 'en',
  description:
    'Track research peptide routines and calculate reconstitution amounts with the USA Peptide Depot Peptide Tracker & Reconstitution Calculator.',
  themeColors: { dark: '#060f0a', light: '#fdfbf0' },
  siteUrl: 'https://app.usapeptidedepot.com',
  store: UPD_STORE,
}

/**
 * Build-time lookup for vite.config.ts. The app itself must NOT use this —
 * it picks its brand with a literal ternary on import.meta.env.VITE_BRAND
 * (see ./index.ts) so the bundler can drop the other brand entirely.
 */
export function getBrand(id: string): BrandConfig {
  if (id === 'pcr') return PCR_BRAND
  if (id === 'upd') return UPD_BRAND
  throw new Error(`Unknown brand "${id}" — expected "pcr" or "upd" (set VITE_BRAND or --mode).`)
}

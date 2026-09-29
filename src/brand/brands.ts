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
  /** Prose name, as it appears inside sentences ("Install {{appName}}"). */
  appName: string
  /** Tight chrome: manifest short_name, <title>, iOS home-screen label. */
  shortName: string
  /** Prefix for exported backup/history filenames. */
  filePrefix: string
  /** Languages this build offers. One entry = no language picker at all. */
  locales: readonly BrandLocale[]
  defaultLocale: BrandLocale
  /** Manifest + meta description, in the default locale. */
  description: string
  /**
   * <meta name="theme-color"> per theme — mirrors each brand's tokens.css
   * --brand-surface-2 (the page background). Browser chrome can't read a
   * CSS custom property, so keep these in sync with tokens.css by hand.
   */
  themeColors: { dark: string; light: string }
}

export const PCR_BRAND: BrandConfig = {
  id: 'pcr',
  appName: 'Peptides CR',
  shortName: 'peptidescr',
  filePrefix: 'peptidescr',
  locales: ['es-CR', 'en'],
  defaultLocale: 'es-CR',
  description: 'Registro de dosis y calculadora de reconstitución — Peptides Costa Rica.',
  themeColors: { dark: '#060b1a', light: '#f0f5fa' },
}

export const UPD_BRAND: BrandConfig = {
  id: 'upd',
  appName: 'USA Peptide Depot',
  shortName: 'UPD',
  filePrefix: 'upd',
  locales: ['en'],
  defaultLocale: 'en',
  description: 'Dose log and reconstitution calculator — USA Peptide Depot.',
  themeColors: { dark: '#060f0a', light: '#fdfbf0' },
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

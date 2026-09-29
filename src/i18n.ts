import i18n, { type Resource } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { BRAND } from './brand'
import esCR from './locales/es-CR.json'
import en from './locales/en.json'
import type { Locale } from './lib/units'

/** The languages this build offers — see BrandConfig.locales. */
export const SUPPORTED_LOCALES: readonly Locale[] = BRAND.locales
export const DEFAULT_LOCALE: Locale = BRAND.defaultLocale

/** A stored locale (settings row, imported backup) this build can't show falls back to the default. */
export function toSupportedLocale(locale: string | undefined): Locale {
  return SUPPORTED_LOCALES.find((l) => l === locale) ?? DEFAULT_LOCALE
}

// Written as a literal VITE_BRAND check (not `BRAND.locales.includes`) so
// the bundler can see the Spanish strings are unused in an English-only
// build and leave es-CR.json out of it entirely.
const resources: Resource =
  import.meta.env.VITE_BRAND === 'pcr'
    ? { 'es-CR': { translation: esCR }, en: { translation: en } }
    : { en: { translation: en } }

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  // Every string names the app as {{appName}}, so one set of locale files
  // serves both brands.
  interpolation: { escapeValue: false, defaultVariables: { appName: BRAND.appName } },
  returnNull: false,
})

export default i18n

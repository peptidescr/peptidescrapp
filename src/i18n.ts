import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import esCR from './locales/es-CR.json'
import en from './locales/en.json'

export const SUPPORTED_LOCALES = ['es-CR', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es-CR'

void i18n.use(initReactI18next).init({
  resources: {
    'es-CR': { translation: esCR },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

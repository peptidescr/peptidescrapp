import { useTranslation } from 'react-i18next'

/**
 * The in-app Shop (Part B). Reached only when BRAND.features.store is on — with
 * it off there is no tab and src/lib/pages.ts sends the page to Home — so
 * production never shows this.
 *
 * TODO(Part B): the catalogue, cart and checkout, behind the StoreAdapter in
 * src/lib/store/.
 */
export function ShopScreen() {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6 pt-2">
      <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('nav.shop')}</h1>
    </div>
  )
}

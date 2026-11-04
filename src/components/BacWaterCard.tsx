import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BRAND } from '../brand'
import { Button } from '@/components/ui/button'
import { addToCart } from '../lib/shop/cart'
import { findBacWater, formatPrice, useShopCatalogue } from '../lib/shop/catalogue'
import type { Locale } from '../lib/units'

/**
 * "Need more BAC water? Add": the calculator's offer to put the diluent in the
 * customer's next store order (Part B). It sits under the preset rows and shows
 * only when BRAND.features.store is on and the store takes orders in the app;
 * with the flag off (the default) it renders nothing at all. "Add" puts the
 * store's own BAC water in the Shop's cart, where checkout picks it up.
 */
export function BacWaterCard() {
  if (!BRAND.features.store) return null
  return <BacWaterOffer />
}

function BacWaterOffer() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const catalogue = useShopCatalogue(BRAND.id)
  const product = catalogue.status === 'ready' && catalogue.checkout ? findBacWater(catalogue.products) : undefined
  if (!product?.orderRef) return null
  const ref = product.orderRef

  return (
    <div className="flex items-center gap-3 rounded-[1.125rem] bg-tint p-3.5">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold tracking-[0.04em] text-primary-foreground">
        {t('bacCard.badge')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14.5px] font-semibold leading-snug text-foreground">{t('bacCard.title')}</span>
        <span className="text-[12.5px] leading-snug text-muted-foreground">
          {product.price
            ? t('bacCard.line', { product: product.name, price: formatPrice(product.price, locale) })
            : t('bacCard.lineNoPrice', { product: product.name })}
        </span>
      </span>
      <Button
        size="compact"
        className="shrink-0"
        aria-label={t('bacCard.addLabel', { product: product.name })}
        onClick={() => {
          if (addToCart(ref)) toast.success(t('bacCard.added', { product: product.name }))
          else toast.error(t('checkout.cartFull'))
        }}
      >
        {t('bacCard.add')}
      </Button>
    </div>
  )
}

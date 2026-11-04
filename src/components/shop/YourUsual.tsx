import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND } from '@/brand'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/section-label'
import { Stepper } from '@/components/ui/stepper'
import { MAX_LINE_QTY, useLocalCart, viewCart } from '../../lib/shop/cart'
import { formatPrice, useShopCatalogue } from '../../lib/shop/catalogue'
import { loadPlacedOrder, type PlacedOrder } from '../../lib/shop/checkout'
import type { Locale } from '../../lib/units'
import { CheckoutSheet, Thumb } from './CheckoutSheet'

/**
 * "Your usual" on Home (Part B): the last order placed from this phone, with its
 * quantities adjustable and a one-tap Reorder that opens the confirmation sheet
 * (CheckoutSheet, 'reorder'). Quantities here are for this reorder only; the
 * Shop's cart is never touched. Prices are today's shelf prices, and the store
 * prices the order itself.
 *
 * Shown only where the site takes orders in the app and this phone has placed
 * one (the lines are kept from the order onward); until accounts exist, the
 * phone's own memory is the only "order history" there is.
 */
export function YourUsual() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const catalogue = useShopCatalogue(BRAND.id)
  const [usual, setUsual] = useState<PlacedOrder | null>(() => loadPlacedOrder())
  const cart = useLocalCart(usual?.lines ?? [])
  const [open, setOpen] = useState(false)
  // A new key gives the sheet a fresh start (its first step depends on what the phone remembers).
  const [session, setSession] = useState(0)

  const ready = catalogue.status === 'ready' && catalogue.checkout
  const products = catalogue.status === 'ready' ? catalogue.products : []
  const view = viewCart(cart.lines, products)
  const showCard = ready && usual !== null && view.lines.length > 0

  return (
    <>
      {showCard && (
        <section className="flex flex-col gap-2">
          <SectionLabel
            note={t('usual.lastOrdered', {
              date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(usual.placedAt)),
            })}
          >
            {t('usual.title')}
          </SectionLabel>
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
            <ul className="flex flex-col">
              {view.lines.map(({ line, product }) => (
                // On the narrowest phones the stepper drops under the name rather than squeezing it.
                <li key={line.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <Thumb product={product} className="size-14 rounded-2xl" />
                  <div className="min-w-24 flex-1">
                    <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{product.name}</div>
                    <div className="text-[13px] tabular-nums text-muted-foreground">
                      {t('usual.vials', { count: line.qty })}
                      {product.price &&
                        ` · ${formatPrice({ currency: product.price.currency, amount: Math.round(product.price.amount * line.qty * 100) / 100 }, locale)}`}
                    </div>
                  </div>
                  <Stepper
                    value={line.qty}
                    min={1}
                    max={Math.min(MAX_LINE_QTY, product.stock && product.stock > 0 ? product.stock : MAX_LINE_QTY)}
                    onChange={(qty) => cart.setQuantity(line.ref, qty)}
                    decrementLabel={t('checkout.fewer', { product: product.name })}
                    incrementLabel={t('checkout.more', { product: product.name })}
                    className="ml-auto"
                  />
                </li>
              ))}
            </ul>
            {view.unavailable.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{t('usual.someUnavailable', { count: view.unavailable.length })}</p>
            )}
            <Button
              fullWidth
              className="mt-3 h-14 rounded-2xl text-[1.0625rem]"
              onClick={() => {
                setSession((s) => s + 1)
                setOpen(true)
              }}
            >
              <RefreshCw aria-hidden />
              {view.subtotal ? t('usual.reorderPrice', { price: formatPrice(view.subtotal, locale) }) : t('usual.reorder')}
            </Button>
          </div>
        </section>
      )}
      {ready && (
        <CheckoutSheet
          key={session}
          open={open}
          onOpenChange={setOpen}
          products={products}
          locale={locale}
          cart={cart}
          variant="reorder"
          order={usual}
          onPlaced={(placed) => {
            setUsual(placed)
            // The order just placed becomes the new usual (the sheet emptied the cart on placing).
            cart.replace(placed.lines ?? [])
          }}
        />
      )}
    </>
  )
}

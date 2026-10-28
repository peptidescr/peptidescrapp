import { ChevronRight, ExternalLink, FileCheck2, FlaskConical, MessageCircle, Package, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BRAND } from '@/brand'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Stepper } from '@/components/ui/stepper'
import { EmptyState } from '../components/EmptyState'
import { CheckoutSheet, OrderResult } from '../components/shop/CheckoutSheet'
import { addToCart, MAX_LINE_QTY, useCart, viewCart } from '../lib/shop/cart'
import { loadPlacedOrder, type PlacedOrder } from '../lib/shop/checkout'
import { useOrderPaid } from '../lib/shop/useOrderPaid'
import {
  categoriesOf,
  descriptionFor,
  filterProducts,
  formatPrice,
  loadShopCatalogue,
  useShopCatalogue,
  type ShopProduct,
} from '../lib/shop/catalogue'
import type { Locale } from '../lib/units'

/** Below this many units, the card says how many are left. */
const LOW_STOCK = 5

/** The category list's "everything" entry; a Select item can't have an empty value. */
const ALL_CATEGORIES = '__all__'

/**
 * The in-app Shop (Part B). Reached only when BRAND.features.store is on; with
 * it off there is no tab and src/lib/pages.ts sends the page to Home, so a
 * production build shows none of this.
 *
 * The store's products with their images, prices and stock, a search and the
 * store's own categories (phase B0). A product opens a sheet whose button goes
 * to the product on the store's site (or WhatsApp, when the store gave no page).
 *
 * Guest checkout (phase B1): when the server says this site takes orders in
 * the app (catalogue.checkout), the sheet adds to a cart instead, and the cart
 * opens CheckoutSheet. The last order placed shows at the top until a day has passed.
 */
export function ShopScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const catalogue = useShopCatalogue(BRAND.id)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [open, setOpen] = useState<ShopProduct | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [lastOrder, setLastOrder] = useState<PlacedOrder | null>(() => recentOrder(loadPlacedOrder()))
  const cart = useCart()

  const products = useMemo(() => (catalogue.status === 'ready' ? catalogue.products : []), [catalogue])
  const categories = useMemo(() => categoriesOf(products), [products])
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return counts
  }, [products])
  const shown = useMemo(() => filterProducts(products, { query, category }), [products, query, category])
  const canOrder = catalogue.status === 'ready' && catalogue.checkout
  const cartView = useMemo(() => viewCart(cart, products), [cart, products])

  return (
    // Capped and centred so a desktop window gets more, smaller cards rather than two huge ones.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-6 pt-2">
      <header>
        <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('nav.shop')}</h1>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t('shop.subtitle', { store: BRAND.store.name })}</p>
      </header>

      {lastOrder && <LastOrderCard order={lastOrder} onOpen={() => setOrderOpen(true)} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block sm:flex-1">
          <span className="sr-only">{t('shop.search')}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shop.search')}
            className="pl-10"
            enterKeyHint="search"
          />
        </label>

        {categories.length > 1 && (
          // A list rather than a row of chips: the store's category names are long, and a sideways scroll hides most of them.
          <Select value={category ?? ALL_CATEGORIES} onValueChange={(v) => setCategory(v === ALL_CATEGORIES ? null : v)}>
            <SelectTrigger aria-label={t('shop.categories')} className="sm:w-80 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>
                {t('shop.all')} ({products.length})
              </SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c} ({categoryCounts.get(c) ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {catalogue.status === 'loading' && (
        <p aria-live="polite" className="py-10 text-center text-sm text-muted-foreground">
          {t('shop.loading')}
        </p>
      )}

      {catalogue.status === 'error' && (
        <EmptyState
          title={t('shop.loadErrorTitle')}
          body={t('shop.loadErrorBody')}
          action={
            <Button variant="secondary" onClick={() => void loadShopCatalogue(BRAND.id)}>
              {t('shop.retry')}
            </Button>
          }
        />
      )}

      {catalogue.status === 'ready' &&
        (shown.length === 0 ? (
          <EmptyState title={t('shop.noMatchesTitle')} body={t('shop.noMatchesBody')} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} locale={locale} onOpen={() => setOpen(p)} />
              </li>
            ))}
          </ul>
        ))}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t('shop.priceNote')}</p>

      {canOrder && cart.length > 0 && (
        // Above the tab bar (3.5rem), in the page's own gutters.
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-10">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-primary px-4 py-2.5 text-left text-primary-foreground shadow-card outline-none active:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ShoppingCart className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 font-semibold">{t('checkout.viewCart', { count: cartView.count })}</span>
            {cartView.subtotal && <span className="shrink-0 font-display font-bold tabular-nums">{formatPrice(cartView.subtotal, locale)}</span>}
          </button>
        </div>
      )}

      <ProductSheet product={open} locale={locale} canOrder={canOrder} onClose={() => setOpen(null)} />
      {canOrder && (
        <CheckoutSheet
          open={cartOpen}
          onOpenChange={setCartOpen}
          products={products}
          locale={locale}
          order={lastOrder}
          onPlaced={setLastOrder}
        />
      )}
      <Sheet open={orderOpen && lastOrder !== null} onOpenChange={setOrderOpen}>
        <SheetContent>
          <SheetHeader className="pr-14">
            <SheetTitle>{t('checkout.resultTitle')}</SheetTitle>
            <SheetDescription className="sr-only">{t('checkout.resultTitle')}</SheetDescription>
          </SheetHeader>
          {lastOrder && <OrderResult order={lastOrder} locale={locale} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** How long the last order stays at the top of the Shop. */
const RECENT_ORDER_MS = 24 * 60 * 60 * 1000

function recentOrder(order: PlacedOrder | null): PlacedOrder | null {
  return order && Date.now() - Date.parse(order.placedAt) < RECENT_ORDER_MS ? order : null
}

function LastOrderCard({ order, onOpen }: { order: PlacedOrder; onOpen: () => void }) {
  const { t } = useTranslation()
  const paid = useOrderPaid(order)
  const waiting = order.paymentMethod === 'card' && order.paymentUrl && !paid
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-card outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Package className="size-5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-foreground">{t('checkout.orderShort', { number: order.orderNumber })}</span>
        <span className={`text-xs ${waiting ? 'font-semibold text-brand-warn' : 'text-muted-foreground'}`}>
          {order.paymentMethod === 'whatsapp' ? t('checkout.statusWhatsapp') : paid ? t('checkout.statusPaid') : waiting ? t('checkout.statusWaiting') : t('checkout.statusPlaced')}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ProductImage({ product, className }: { product: ShopProduct; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = product.thumbnailUrl ?? product.imageUrl
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-secondary ${className ?? ''}`}>
      {src && !failed ? (
        // The store's own link, loaded from there (both stores ask that images aren't copied).
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-contain" />
      ) : (
        <FlaskConical aria-hidden className="size-8 text-muted-foreground" />
      )}
    </div>
  )
}

function PriceLine({ product, locale }: { product: ShopProduct; locale: Locale }) {
  const { t } = useTranslation()
  if (!product.price) return null
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-display font-bold tabular-nums text-foreground">{formatPrice(product.price, locale)}</span>
      {product.regularPrice && (
        <span className="text-xs text-muted-foreground line-through">
          <span className="sr-only">{t('shop.was')} </span>
          {formatPrice(product.regularPrice, locale)}
        </span>
      )}
    </p>
  )
}

function StockLine({ product }: { product: ShopProduct }) {
  const { t } = useTranslation()
  if (!product.inStock) return <Badge variant="outline">{t('shop.outOfStock')}</Badge>
  if (product.stock !== undefined && product.stock > 0 && product.stock <= LOW_STOCK) {
    return <span className="text-xs font-semibold text-brand-warn">{t('shop.lowStock', { count: product.stock })}</span>
  }
  return null
}

function ProductCard({ product, locale, onOpen }: { product: ShopProduct; locale: Locale; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card p-2.5 text-left shadow-card outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProductImage product={product} className={`aspect-square w-full ${product.inStock ? '' : 'opacity-60'}`} />
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{product.name}</span>
      <span className="mt-auto flex flex-col gap-1">
        <PriceLine product={product} locale={locale} />
        <StockLine product={product} />
      </span>
    </button>
  )
}

function ProductSheet({
  product,
  locale,
  canOrder,
  onClose,
}: {
  product: ShopProduct | null
  locale: Locale
  canOrder: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [qty, setQty] = useState(1)
  const description = product ? descriptionFor(product, locale) : undefined
  const whatsapp = BRAND.contact.whatsapp
  const orderable = canOrder && product?.orderRef !== undefined
  const maxQty = Math.min(MAX_LINE_QTY, product?.stock && product.stock > 0 ? product.stock : MAX_LINE_QTY)

  function add() {
    if (!product?.orderRef) return
    if (addToCart(product.orderRef, qty)) {
      toast.success(t('checkout.added', { count: qty, product: product.name }))
      onClose()
    } else {
      toast.error(t('checkout.cartFull'))
    }
  }

  return (
    <Sheet
      open={product !== null}
      onOpenChange={(isOpen) => {
        if (isOpen) return
        setQty(1)
        onClose()
      }}
    >
      <SheetContent>
        {product && (
          <>
            <SheetHeader className="pr-14">
              <SheetTitle>{product.name}</SheetTitle>
              {product.category ? <SheetDescription>{product.category}</SheetDescription> : <SheetDescription className="sr-only">{product.name}</SheetDescription>}
            </SheetHeader>
            <SheetBody className="flex flex-col gap-4">
              <ProductImage product={{ ...product, thumbnailUrl: undefined }} className="mx-auto aspect-square w-full max-w-64" />
              <div className="flex flex-col gap-1">
                <PriceLine product={product} locale={locale} />
                {product.inStock ? (
                  <span className="text-sm font-semibold text-positive">
                    {product.stock !== undefined && product.stock <= LOW_STOCK ? t('shop.lowStock', { count: product.stock }) : t('shop.inStock')}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">{t('shop.outOfStock')}</span>
                )}
              </div>
              {description && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{description}</p>}
              {product.coaUrl && (
                <a
                  href={product.coaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary"
                >
                  <FileCheck2 className="size-4" />
                  {t('shop.coa')}
                </a>
              )}
              <p className="text-xs text-muted-foreground">{t('shop.researchUse')}</p>
            </SheetBody>
            <div className="shrink-0 px-5 pb-5 pt-2">
              {orderable ? (
                product.inStock ? (
                  <div className="flex items-center gap-3">
                    <Stepper
                      value={qty}
                      min={1}
                      max={maxQty}
                      onChange={setQty}
                      decrementLabel={t('checkout.fewer', { product: product.name })}
                      incrementLabel={t('checkout.more', { product: product.name })}
                    />
                    <Button fullWidth onClick={add}>
                      <ShoppingCart />
                      {t('checkout.addToCart')}
                    </Button>
                  </div>
                ) : (
                  <Button fullWidth variant="locked" disabled>
                    {t('shop.outOfStock')}
                  </Button>
                )
              ) : product.url ? (
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ fullWidth: true })}
                >
                  <ExternalLink />
                  {t('shop.viewOnStore', { store: BRAND.store.name })}
                </a>
              ) : whatsapp ? (
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t('shop.whatsappText', { product: product.name }))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ fullWidth: true })}
                >
                  <MessageCircle />
                  {t('shop.askWhatsapp')}
                </a>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

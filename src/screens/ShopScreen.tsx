import { ExternalLink, FileCheck2, FlaskConical, MessageCircle, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND } from '@/brand'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '../components/EmptyState'
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

/**
 * The in-app Shop (Part B). Reached only when BRAND.features.store is on; with
 * it off there is no tab and src/lib/pages.ts sends the page to Home, so a
 * production build shows none of this.
 *
 * Browse only for now (phase B0): the store's products with their images,
 * prices and stock, a search and the store's own categories. A product opens a
 * sheet whose button goes to the product on the store's site (or WhatsApp, when
 * the store gave no page). Guest checkout replaces that button in B1.
 */
export function ShopScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const catalogue = useShopCatalogue(BRAND.id)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [open, setOpen] = useState<ShopProduct | null>(null)

  const products = useMemo(() => (catalogue.status === 'ready' ? catalogue.products : []), [catalogue])
  const categories = useMemo(() => categoriesOf(products), [products])
  const shown = useMemo(() => filterProducts(products, { query, category }), [products, query, category])

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
      <header>
        <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('nav.shop')}</h1>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t('shop.subtitle', { store: BRAND.store.name })}</p>
      </header>

      <label className="relative block">
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
        // Scrolls sideways inside the page's gutters; the page itself never does.
        <div role="group" aria-label={t('shop.categories')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip selected={category === null} onClick={() => setCategory(null)} className="shrink-0">
            {t('shop.all')}
          </Chip>
          {categories.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)} className="shrink-0 whitespace-nowrap">
              {c}
            </Chip>
          ))}
        </div>
      )}

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
          <ul className="grid grid-cols-2 gap-3">
            {shown.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} locale={locale} onOpen={() => setOpen(p)} />
              </li>
            ))}
          </ul>
        ))}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t('shop.priceNote')}</p>

      <ProductSheet product={open} locale={locale} onClose={() => setOpen(null)} />
    </div>
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

function ProductSheet({ product, locale, onClose }: { product: ShopProduct | null; locale: Locale; onClose: () => void }) {
  const { t } = useTranslation()
  const description = product ? descriptionFor(product, locale) : undefined
  const whatsapp = BRAND.contact.whatsapp
  return (
    <Sheet open={product !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
              {product.url ? (
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

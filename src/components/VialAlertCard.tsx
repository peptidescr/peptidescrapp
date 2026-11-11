import { FlaskConical, ShoppingCart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { NoticeRow } from '@/components/ui/notice-row'
import { BRAND } from '../brand'
import type { StoreProductRef } from '../content/compounds'
import { useCompound } from '../lib/customCompounds'
import { addToCart } from '../lib/shop/cart'
import { useShopCatalogue } from '../lib/shop/catalogue'
import { reorderProduct, shouldNudgeReorder } from '../lib/reorder'
import { describeVialAlert } from '../lib/vialText'
import type { VialAlert } from '../lib/vials'

/**
 * One vial alert (low, empty, discard-by or label expiry), as shown on Home,
 * in Today and in the bell panel, in the app's one notice shape (NoticeRow).
 * Tapping it opens the protocol, where the vial's own actions live. Amber like
 * the app's other plan-for-this notices: a vial running low is something to
 * handle, not a danger.
 *
 * A stock alert with no unopened vials left gets a Reorder link to the
 * product on the brand's store (src/lib/reorder.ts) beside it, unless the
 * caller fills that slot itself or the store doesn't sell it. On a phone the
 * link is just the cart icon, so the message keeps its width.
 */
export function VialAlertCard({
  alert,
  onOpenProtocol,
  action,
}: {
  alert: VialAlert
  onOpenProtocol?: (protocolId: string) => void
  action?: ReactNode
}) {
  const { t } = useTranslation()
  const protocolId = alert.protocol?.id
  const text = describeVialAlert(alert, t)
  // Subscribed, so the Reorder link appears as soon as a catalogue sync brings the store's links in.
  useCompound(alert.vial.compoundId)
  const product = shouldNudgeReorder(alert) ? reorderProduct(alert.vial.compoundId, alert.vial) : null
  const slot =
    action ??
    (product && BRAND.features.store ? (
      <AddToCartSlot product={product} />
    ) : product?.url ? (
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('reorder.aria', { product: product.label, appName: BRAND.appName })}
        className="flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary bg-card text-[13px] font-semibold text-primary outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3"
      >
        <ShoppingCart aria-hidden className="size-4" />
        {/* Phones get the icon alone, so the alert's message keeps its width; the link's aria-label names it. */}
        <span className="hidden sm:inline">{t('reorder.cta')}</span>
      </a>
    ) : null)

  return (
    <NoticeRow
      icon={FlaskConical}
      tone="warn"
      title={text}
      onClick={protocolId && onOpenProtocol ? () => onOpenProtocol(protocolId) : undefined}
      trailing={slot}
    />
  )
}

const slotClass =
  'flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary bg-card text-[13px] font-semibold text-primary outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3'

/**
 * With the store connection on (Part B) and the store taking orders in the
 * app, the low-vial alert puts the product straight into the Shop's cart (the
 * proposal's "low-vial alerts also add the product to the cart"). Matched to
 * the Shop's catalogue by the store's slug, then by name. Otherwise it is the
 * plain link to the product on the store's site, as before.
 */
function AddToCartSlot({ product }: { product: StoreProductRef }) {
  const { t } = useTranslation()
  const catalogue = useShopCatalogue(BRAND.id)
  const shopProduct =
    catalogue.status === 'ready' && catalogue.checkout
      ? (catalogue.products.find((p) => p.slug === product.slug) ?? catalogue.products.find((p) => p.name === product.label))
      : undefined
  if (shopProduct?.orderRef && shopProduct.inStock) {
    const ref = shopProduct.orderRef
    return (
      <button
        type="button"
        aria-label={t('reorder.addAria', { product: shopProduct.name })}
        className={slotClass}
        onClick={() => {
          if (addToCart(ref)) toast.success(t('reorder.added', { product: shopProduct.name }))
          else toast.error(t('checkout.cartFull'))
        }}
      >
        <ShoppingCart aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t('reorder.add')}</span>
      </button>
    )
  }
  if (!product.url) return null
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('reorder.aria', { product: product.label, appName: BRAND.appName })}
      className={slotClass}
    >
      <ShoppingCart aria-hidden className="size-4" />
      <span className="hidden sm:inline">{t('reorder.cta')}</span>
    </a>
  )
}

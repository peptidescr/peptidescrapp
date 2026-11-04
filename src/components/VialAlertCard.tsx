import { FlaskConical, ShoppingCart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NoticeRow } from '@/components/ui/notice-row'
import { BRAND } from '../brand'
import { useCompound } from '../lib/customCompounds'
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
    (product?.url ? (
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

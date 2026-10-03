import { ChevronRight, FlaskConical, ShoppingCart } from 'lucide-react'
import { BRAND } from '../brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompound } from '../lib/customCompounds'
import { reorderProduct, shouldNudgeReorder } from '../lib/reorder'
import { describeVialAlert } from '../lib/vialText'
import type { VialAlert } from '../lib/vials'

/**
 * One vial alert (low, empty, discard-by or label expiry), as shown on Home
 * and in the bell panel. Tapping it opens the protocol, where the vial's own
 * actions live. Styled with the same non-alarming amber as the app's other
 * notices — a vial running low is something to plan for, not a danger.
 *
 * A stock alert with no unopened vials left gets a Reorder link to the
 * product on the brand's store (src/lib/reorder.ts) in the action slot, unless
 * the caller fills that slot itself or the store doesn't sell it.
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
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        <ShoppingCart aria-hidden className="size-4" />
        {t('reorder.cta')}
      </a>
    ) : null)
  const content = (
    <>
      <FlaskConical className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      {protocolId && onOpenProtocol && <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-70" />}
    </>
  )
  const cardClass =
    'flex min-h-11 w-full items-start gap-2 rounded-2xl border border-brand-warn/60 bg-brand-warn-lt px-4 py-3 text-left text-sm text-brand-warn'

  return (
    <div className="flex items-stretch gap-2">
      {protocolId && onOpenProtocol ? (
        <button type="button" onClick={() => onOpenProtocol(protocolId)} className={cardClass}>
          {content}
        </button>
      ) : (
        <p className={cardClass}>{content}</p>
      )}
      {slot}
    </div>
  )
}

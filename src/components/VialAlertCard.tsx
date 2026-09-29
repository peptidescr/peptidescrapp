import { ChevronRight, FlaskConical } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { describeVialAlert } from '../lib/vialText'
import type { VialAlert } from '../lib/vials'

/**
 * One vial alert (low, empty, discard-by or label expiry), as shown on Home
 * and in the bell panel. Tapping it opens the protocol, where the vial's own
 * actions live. Styled with the same non-alarming amber as the app's other
 * notices — a vial running low is something to plan for, not a danger.
 *
 * `action` is an optional slot beside the text: nothing fills it yet. It's
 * where a reorder button can go later without reworking the card.
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
      {action}
    </div>
  )
}

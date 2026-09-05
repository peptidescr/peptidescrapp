import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The one header for the whole app.
 *
 * It replaces four separate patterns that had drifted apart: ScreenHeader
 * (brand icon + text-xl), Home's hero title (text-2xl), and the hand-rolled
 * "Cancel / title / invisible w-16 spacer" bars inside ProtocolForm and
 * HistoryEditForm (text-lg, and no brand mark at all — so entering a sub-view
 * used to drop the branding entirely).
 *
 * Two modes, chosen by whether `onBack` is passed:
 *   - top level  → brand icon + title, optional action on the right
 *   - sub-view   → back chevron + title, optional action on the right
 *
 * The sub-view title is left-aligned next to an icon-only back chevron
 * rather than centred. Centring was the original intent, but it cannot hold:
 * the old version used a fixed-width spacer to fake it, and a grid version
 * still drifted 26px at 320px because Spanish's "Cancelar" is wider than the
 * column it was allotted. A chevron plus a left-aligned title is the standard
 * mobile pattern, survives any label length in any language, and needs no
 * measuring. The cancel wording is kept as the button's accessible name.
 */
export function AppHeader({
  title,
  action,
  onBack,
  backLabel,
}: {
  title: string
  action?: ReactNode
  /** When provided, renders a back affordance instead of the brand mark. */
  onBack?: () => void
  /** Defaults to the shared "Cancel" string. */
  backLabel?: string
}) {
  const { t } = useTranslation()

  if (onBack) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel ?? t('common.cancel')}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-foreground">{title}</h1>
        {action}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <img src="/brand/icon-192.png" alt="" className="size-6 shrink-0 rounded-lg" />
        <h1 className="truncate font-display text-xl font-semibold text-foreground">{title}</h1>
      </div>
      {action}
    </div>
  )
}
